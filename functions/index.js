// checkout:      POST /api/checkout { items: [{ id, qty }], idToken? } -> { url } (a Stripe Checkout page).
//                Prices come from Firestore, so a shopper can't change what they pay. Saves a "pending" order.
// stripeWebhook: Stripe calls this when a payment finishes. Marks the order paid, saves the shipping
//                address, and counts down stock.

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const Stripe = require("stripe");

initializeApp();
const db = getFirestore();

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const MAX_QTY = 20;

// Used until the owner saves settings in the admin page. Keep in sync with public/js/state.js.
const DEFAULT_SETTINGS = {
  currency: "usd",
  shipping: { flat: 5, freeOver: 40, countries: ["US"] },
};

const project = process.env.GCLOUD_PROJECT;
const ALLOWED_ORIGINS = [
  `https://${project}.web.app`,
  `https://${project}.firebaseapp.com`,
  "http://localhost:5000",
  "http://127.0.0.1:5000",
];

const cents = (dollars) => Math.round(dollars * 100);

async function shopSettings() {
  const data = (await db.doc("settings/shop").get()).data() || {};
  return { ...DEFAULT_SETTINGS, ...data, shipping: { ...DEFAULT_SETTINGS.shipping, ...data.shipping } };
}

exports.checkout = onRequest({ secrets: [STRIPE_SECRET_KEY], maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const origin = ALLOWED_ORIGINS.includes(req.get("origin")) ? req.get("origin") : ALLOWED_ORIGINS[0];
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
  const ids = items.map((i) => i?.id);
  if (!items.length) return res.status(400).json({ error: "Your cart is empty." });
  if (!ids.every((id) => typeof id === "string" && /^[a-z0-9-]{1,100}$/.test(id)) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: "Something in your cart isn't sold anymore. Please remove it and try again." });
  }

  const [settings, snaps] = await Promise.all([shopSettings(), db.getAll(...ids.map((id) => db.doc(`products/${id}`)))]);

  const lineItems = [];
  const orderItems = [];
  let subtotal = 0;
  for (const [n, item] of items.entries()) {
    const p = snaps[n].data();
    const qty = Math.floor(Number(item.qty));
    if (!p) return res.status(400).json({ error: "Something in your cart isn't sold anymore. Please remove it and try again." });
    if (p.stock === 0) return res.status(400).json({ error: `Sorry, ${p.name} is sold out. Please remove it to continue.` });
    if (!(qty >= 1 && qty <= MAX_QTY)) return res.status(400).json({ error: "Please check the quantities in your cart." });
    if (typeof p.stock === "number" && qty > p.stock) return res.status(400).json({ error: `Only ${p.stock} of ${p.name} left.` });

    subtotal += cents(p.price) * qty;
    orderItems.push({ id: item.id, name: p.name, price: p.price, qty });
    lineItems.push({
      quantity: qty,
      price_data: {
        currency: settings.currency,
        unit_amount: cents(p.price),
        product_data: {
          name: p.name,
          metadata: { productId: item.id },
          ...(p.images?.[0] && { images: [p.images[0]] }),
        },
      },
    });
  }

  let user = null;
  if (typeof req.body.idToken === "string") {
    try { user = await getAuth().verifyIdToken(req.body.idToken); } catch { /* checkout as a guest */ }
  }

  const { flat, freeOver, countries } = settings.shipping;
  const shippingCost = subtotal >= cents(freeOver) ? 0 : cents(flat);

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      ...(user && { client_reference_id: user.uid }),
      ...(user?.email && { customer_email: user.email }),
      shipping_address_collection: { allowed_countries: countries },
      shipping_options: [{
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: shippingCost ? "Standard shipping" : "Free shipping",
          fixed_amount: { amount: shippingCost, currency: settings.currency },
        },
      }],
      success_url: `${origin}/#/thanks`,
      cancel_url: `${origin}/#/cart`,
    });

    await db.doc(`orders/${session.id}`).set({
      status: "pending",
      uid: user?.uid || null,
      email: user?.email || null,
      items: orderItems,
      subtotal: subtotal / 100,
      shipping: shippingCost / 100,
      total: (subtotal + shippingCost) / 100,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error("Stripe checkout failed", e);
    res.status(500).json({ error: "Checkout isn't available right now. Please try again in a bit." });
  }
});

exports.stripeWebhook = onRequest({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  let event;
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    event = stripe.webhooks.constructEvent(req.rawBody, req.get("stripe-signature"), STRIPE_WEBHOOK_SECRET.value());
  } catch (e) {
    console.warn("Rejected webhook", e.message);
    return res.status(400).send("Bad signature");
  }

  const session = event.data.object;
  const orderRef = db.doc(`orders/${session.id}`);

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (session.payment_status !== "paid") return res.json({ received: true }); // a slow payment method; wait for async_payment_succeeded

    const ship = session.collected_information?.shipping_details || session.shipping_details;
    await db.runTransaction(async (tx) => {
      const order = await tx.get(orderRef);
      if (!order.exists || order.data().status !== "pending") return; // unknown, or already handled
      const items = order.data().items;
      const products = await tx.getAll(...items.map((i) => db.doc(`products/${i.id}`)));

      products.forEach((p, n) => {
        if (p.exists && typeof p.data().stock === "number") {
          tx.update(p.ref, { stock: Math.max(0, p.data().stock - items[n].qty) });
        }
      });
      tx.update(orderRef, {
        status: "paid",
        paidAt: FieldValue.serverTimestamp(),
        email: session.customer_details?.email || order.data().email,
        name: session.customer_details?.name || null,
        shippingName: ship?.name || null,
        shippingAddress: ship?.address || null,
        total: session.amount_total / 100,
      });
    });
  } else if (event.type === "checkout.session.expired") {
    const order = await orderRef.get();
    if (order.exists && order.data().status === "pending") await orderRef.delete();
  }

  res.json({ received: true });
});
