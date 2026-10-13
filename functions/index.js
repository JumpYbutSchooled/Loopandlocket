// POST /api/checkout  { items: [{ id, qty }] }  ->  { url }  (a Stripe Checkout page)
// Prices come from products.json on the server, so a shopper can't change what they pay.
// products.json is copied here from public/ before every deploy (see copy-products.js).

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const Stripe = require("stripe");
const shop = require("./products.json");

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const MAX_QTY = 20;

const project = process.env.GCLOUD_PROJECT;
const ALLOWED_ORIGINS = [
  `https://${project}.web.app`,
  `https://${project}.firebaseapp.com`,
  ...(shop.siteUrls || []),
  "http://localhost:5000",
  "http://127.0.0.1:5000",
];

const cents = (dollars) => Math.round(dollars * 100);

exports.checkout = onRequest({ secrets: [STRIPE_SECRET_KEY], maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const origin = ALLOWED_ORIGINS.includes(req.get("origin")) ? req.get("origin") : ALLOWED_ORIGINS[0];
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];

  const lineItems = [];
  let subtotal = 0;
  for (const item of items) {
    const p = shop.products.find((x) => x.id === item?.id);
    const qty = Math.floor(Number(item?.qty));
    if (!p) return res.status(400).json({ error: "Something in your cart isn't sold anymore. Please remove it and try again." });
    if (p.stock === 0) return res.status(400).json({ error: `Sorry, ${p.name} is sold out. Please remove it to continue.` });
    if (!(qty >= 1 && qty <= MAX_QTY)) return res.status(400).json({ error: "Please check the quantities in your cart." });
    if (p.stock > 0 && qty > p.stock) return res.status(400).json({ error: `Only ${p.stock} of ${p.name} left.` });

    subtotal += cents(p.price) * qty;
    lineItems.push({
      quantity: qty,
      price_data: {
        currency: shop.currency,
        unit_amount: cents(p.price),
        product_data: {
          name: p.name,
          metadata: { productId: p.id },
          ...(p.images?.[0] && { images: [new URL(p.images[0], origin + "/").href] }),
        },
      },
    });
  }
  if (!lineItems.length) return res.status(400).json({ error: "Your cart is empty." });

  const { flat, freeOver, countries } = shop.shipping;
  const shippingCost = subtotal >= cents(freeOver) ? 0 : cents(flat);

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: countries },
      shipping_options: [{
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: shippingCost ? "Standard shipping" : "Free shipping",
          fixed_amount: { amount: shippingCost, currency: shop.currency },
        },
      }],
      success_url: `${origin}/#/thanks`,
      cancel_url: `${origin}/#/cart`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error("Stripe checkout failed", e);
    res.status(500).json({ error: "Checkout isn't available right now. Please try again in a bit." });
  }
});
