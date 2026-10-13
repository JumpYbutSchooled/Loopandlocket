// Loop & Locket storefront. Products and settings come from Firestore; the cart lives in this browser.
// Checkout posts the cart to /api/checkout (functions/index.js), which sends the shopper to Stripe.
import { auth, onAuthStateChanged } from "./fb.js";
import { state, byId, soldOut, loadShop, checkOwner } from "./state.js";
import { $, esc, slug, money, priceHTML, toast, art, millis } from "./util.js";
import { viewAccount } from "./account.js";
import { viewAdmin } from "./admin.js";

const app = $("#app");
const CART_KEY = "loopandlocket-cart";
const MAX_QTY = 20;

let cart = loadCart(); // { productId: quantity }

// ---------- Cart ----------

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; }
}
function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* storage blocked: cart lasts this visit */ }
  renderCartCount(true);
}
function cartLines() {
  return Object.entries(cart)
    .map(([id, qty]) => ({ product: byId(id), qty }))
    .filter((l) => l.product);
}
function cartTotals() {
  const subtotal = cartLines().reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const { flat, freeOver } = state.settings.shipping;
  const shipping = subtotal === 0 || subtotal >= freeOver ? 0 : flat;
  return { subtotal, shipping, total: subtotal + shipping };
}
const maxQty = (p) => (p.stock > 0 ? Math.min(p.stock, MAX_QTY) : MAX_QTY);
function addToCart(id, qty = 1) {
  cart[id] = Math.min(maxQty(byId(id)), (cart[id] || 0) + qty);
  saveCart();
}
function setQty(id, qty) {
  if (qty <= 0) delete cart[id];
  else cart[id] = Math.min(maxQty(byId(id)), qty);
  saveCart();
}

function renderCartCount(bump = false) {
  const el = $("#cart-count");
  el.textContent = Object.values(cart).reduce((a, b) => a + b, 0);
  if (bump) {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }
}

// ---------- Views ----------

function productCard(p) {
  const note = soldOut(p)
    ? '<p class="stock-note out">Sold out</p>'
    : p.stock > 0 && p.stock <= 5 ? `<p class="stock-note">Only ${p.stock} left</p>` : "";
  return `
    <article class="card">
      <a class="card-link" href="#/p/${esc(p.id)}">
        ${art(p)}
        <div class="card-body">
          <div class="card-cat">${esc(p.category)}</div>
          <h3>${esc(p.name)}</h3>
          <div class="price">${priceHTML(p.price)}</div>
          ${note}
        </div>
      </a>
      <div class="card-actions">
        <button class="btn btn-primary btn-block" data-add="${esc(p.id)}" ${soldOut(p) ? "disabled" : ""}>
          ${soldOut(p) ? "Sold out" : "Add to cart"}
        </button>
      </div>
    </article>`;
}

const SORTS = {
  featured: (a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || millis(b.createdAt) - millis(a.createdAt),
  newest: (a, b) => millis(b.createdAt) - millis(a.createdAt),
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  name: (a, b) => a.name.localeCompare(b.name),
};

function viewHome(params) {
  const q = (params.get("q") || "").trim();
  const catSlug = params.get("c") || "";
  const category = state.settings.categories.find((c) => slug(c) === catSlug);
  const sort = SORTS[params.get("sort")] ? params.get("sort") : "featured";

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = state.products
    .filter((p) => !category || p.category === category)
    .filter((p) => {
      const hay = `${p.name} ${p.category} ${p.description} ${(p.details || []).join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort(SORTS[sort]);

  const link = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k);
    const s = next.toString();
    return `#/${s ? "?" + s : ""}`;
  };

  const featured = [...state.products].sort(SORTS.featured).slice(0, 3);
  const hero = !q && !category ? `
    <section class="hero">
      <div>
        <h1>Handmade little things, made with love</h1>
        <p>Cozy crochet, keepsake lockets, and sweet gifts, each one stitched or strung by hand.</p>
        ${state.products.length ? `<button class="btn btn-primary" id="shop-now">Shop everything</button>` : ""}
      </div>
      ${featured.length === 3 ? `<div class="hero-art" aria-hidden="true">${featured.map((p) => art(p)).join("")}</div>` : ""}
    </section>` : "";

  if (!state.products.length) {
    app.innerHTML = `${hero}
      <div class="empty"><h2>New handmade goodies are coming soon!</h2>
        <p>We're busy stitching. Check back in a little while.</p>
        ${state.isOwner ? `<a class="btn btn-primary" href="#/admin/new">Add your first product</a>` : ""}
      </div>`;
    setActiveNav("");
    document.title = "Loop & Locket";
    return;
  }

  const title = q ? `Results for “${esc(q)}”` : category ? esc(category) : "All products";

  app.innerHTML = `
    ${hero}
    <div class="section-head" id="shop">
      <div>
        <h2>${title}</h2>
        <p>${results.length} ${results.length === 1 ? "item" : "items"}</p>
      </div>
      <select class="sort" id="sort" aria-label="Sort by">
        <option value="featured">Sort: Featured</option>
        <option value="newest">Newest</option>
        <option value="price-asc">Price: Low to high</option>
        <option value="price-desc">Price: High to low</option>
        <option value="name">Name: A to Z</option>
      </select>
    </div>
    <div class="chips">
      <a class="chip ${!category ? "active" : ""}" href="${link({ c: "" })}">All</a>
      ${state.settings.categories.map((c) => `<a class="chip ${c === category ? "active" : ""}" href="${link({ c: slug(c) })}">${esc(c)}</a>`).join("")}
    </div>
    ${results.length
      ? `<div class="grid">${results.map(productCard).join("")}</div>`
      : `<div class="empty"><h2>Nothing here yet</h2><p>Try a different search or browse everything.</p><a class="btn btn-primary" href="#/">See all products</a></div>`}
  `;

  const sortEl = $("#sort");
  sortEl.value = sort;
  sortEl.addEventListener("change", () => { location.hash = link({ sort: sortEl.value === "featured" ? "" : sortEl.value }); });
  $("#shop-now")?.addEventListener("click", () => $("#shop").scrollIntoView({ behavior: "smooth" }));
  $("#search").q.value = q;
  setActiveNav(category ? slug(category) : q ? null : "");
  document.title = q ? `“${q}” · Loop & Locket` : category ? `${category} · Loop & Locket` : "Loop & Locket";
}

function viewProduct(id) {
  const p = byId(id);
  if (!p) return viewNotFound();
  let qty = 1;

  const stockLine = soldOut(p)
    ? '<p class="in-stock out">Sold out</p>'
    : p.stock > 0 && p.stock <= 5 ? `<p class="in-stock low">Only ${p.stock} left</p>` : '<p class="in-stock">In stock</p>';
  const { flat, freeOver } = state.settings.shipping;

  app.innerHTML = `
    <nav class="crumbs"><a href="#/">Shop</a> › <a href="#/?c=${slug(p.category)}">${esc(p.category)}</a> › ${esc(p.name)}</nav>
    <div class="product">
      <div class="gallery">
        <div id="main-art">${art(p)}</div>
        ${p.images?.length > 1 ? `<div class="thumbs">${p.images.map((_, i) => `<button data-img="${i}" class="${i === 0 ? "active" : ""}" aria-label="Photo ${i + 1}">${art(p, i)}</button>`).join("")}</div>` : ""}
      </div>
      <div class="product-info">
        <div class="card-cat">${esc(p.category)}</div>
        <h1>${esc(p.name)}</h1>
        <div class="price">${priceHTML(p.price)}</div>
        <p>${esc(p.description)}</p>
        ${p.details?.length ? `<ul class="details">${p.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
        ${state.isOwner ? `<a class="btn btn-secondary" href="#/admin/edit/${esc(p.id)}">Edit this product</a>` : ""}
      </div>
      <aside class="buy-box">
        <div class="price">${priceHTML(p.price)}</div>
        <p class="ship-note">${flat > 0 ? `Free shipping on orders over ${money(freeOver)}` : "Free shipping"}</p>
        ${stockLine}
        ${soldOut(p) ? "" : `
          <div class="qty-row">Qty
            <div class="qty"><button data-q="-1" aria-label="Less">−</button><span id="qty">1</span><button data-q="1" aria-label="More">+</button></div>
          </div>
          <button class="btn btn-primary btn-block" id="add">Add to cart</button>
          <button class="btn btn-secondary btn-block" id="buy">Buy now</button>`}
      </aside>
    </div>
    ${related(p)}
  `;

  app.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => {
    qty = Math.max(1, Math.min(maxQty(p), qty + Number(b.dataset.q)));
    $("#qty").textContent = qty;
  }));
  $("#add")?.addEventListener("click", () => {
    addToCart(p.id, qty);
    toast(`Added to cart <a href="#/cart">View cart</a>`);
  });
  $("#buy")?.addEventListener("click", () => {
    addToCart(p.id, qty);
    location.hash = "#/cart";
  });
  app.querySelectorAll("[data-img]").forEach((b) => b.addEventListener("click", () => {
    $("#main-art").innerHTML = art(p, Number(b.dataset.img));
    app.querySelectorAll("[data-img]").forEach((x) => x.classList.toggle("active", x === b));
  }));

  setActiveNav(slug(p.category));
  document.title = `${p.name} · Loop & Locket`;
}

function related(p) {
  const more = state.products.filter((x) => x.id !== p.id && x.category === p.category).slice(0, 4);
  if (!more.length) return "";
  return `
    <div class="section-head" style="margin-top:40px"><h2>More ${esc(p.category.toLowerCase())}</h2></div>
    <div class="grid">${more.map(productCard).join("")}</div>`;
}

function viewCart() {
  const lines = cartLines();
  setActiveNav(null);
  document.title = "Cart · Loop & Locket";

  if (!lines.length) {
    app.innerHTML = `<div class="empty"><h2>Your cart is empty</h2><p>Find something cute to fill it up.</p><a class="btn btn-primary" href="#/">Start shopping</a></div>`;
    return;
  }

  const { subtotal, shipping, total } = cartTotals();
  const { flat, freeOver } = state.settings.shipping;
  const toFree = freeOver - subtotal;
  const freeShip = flat > 0
    ? toFree > 0
      ? `<div class="free-ship">You're ${money(toFree)} away from free shipping!<div class="bar"><span style="width:${Math.min(100, (subtotal / freeOver) * 100)}%"></span></div></div>`
      : `<div class="free-ship">Your order ships free!</div>`
    : "";

  app.innerHTML = `
    <div class="section-head"><h2>Your cart</h2></div>
    <div class="cart">
      <div class="cart-list">
        ${lines.map(({ product: p, qty }) => `
          <div class="cart-item">
            <a href="#/p/${esc(p.id)}">${art(p)}</a>
            <div>
              <h3><a href="#/p/${esc(p.id)}">${esc(p.name)}</a></h3>
              <div>${money(p.price)} each</div>
              ${soldOut(p) ? '<p class="stock-note out">Sold out, please remove</p>' : ""}
              <div class="cart-item-controls">
                <div class="qty"><button data-dec="${esc(p.id)}" aria-label="Less">−</button><span>${qty}</span><button data-inc="${esc(p.id)}" aria-label="More">+</button></div>
                <button class="btn btn-ghost" data-remove="${esc(p.id)}">Remove</button>
              </div>
            </div>
            <div class="line-total">${money(p.price * qty)}</div>
          </div>`).join("")}
      </div>
      <aside class="summary">
        <h2>Order summary</h2>
        <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
        <div class="summary-row"><span>Shipping</span><span>${shipping ? money(shipping) : "Free"}</span></div>
        ${freeShip}
        <div class="summary-row total"><span>Total</span><span>${money(total)}</span></div>
        <button class="btn btn-primary btn-block" id="checkout">Checkout</button>
        <p class="checkout-error" id="checkout-error" hidden></p>
        ${state.user ? "" : `<p class="secure-note"><a href="#/account?next=cart">Sign in</a> to keep track of your order.</p>`}
        <p class="secure-note">Secure payment with Stripe. Tax, if any, is shown at checkout.</p>
      </aside>
    </div>
  `;

  app.querySelectorAll("[data-inc]").forEach((b) => b.addEventListener("click", () => { setQty(b.dataset.inc, cart[b.dataset.inc] + 1); viewCart(); }));
  app.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", () => { setQty(b.dataset.dec, cart[b.dataset.dec] - 1); viewCart(); }));
  app.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => { setQty(b.dataset.remove, 0); viewCart(); }));
  $("#checkout").addEventListener("click", checkout);
}

async function checkout() {
  const btn = $("#checkout");
  const err = $("#checkout-error");
  btn.disabled = true;
  btn.textContent = "Taking you to checkout…";
  err.hidden = true;
  try {
    const idToken = state.user ? await state.user.getIdToken() : null;
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, items: cartLines().map((l) => ({ id: l.product.id, qty: l.qty })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || "Checkout isn't available right now.");
    location.href = data.url;
  } catch (e) {
    err.textContent = e instanceof TypeError ? "Couldn't reach checkout. Check your connection and try again." : e.message;
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = "Checkout";
  }
}

function viewThanks() {
  cart = {};
  saveCart();
  setActiveNav(null);
  document.title = "Thank you · Loop & Locket";
  app.innerHTML = `
    <div class="empty">
      <h2>Thank you for your order! 💕</h2>
      <p>A receipt is on its way to your email. We'll start making your goodies soon.</p>
      ${state.user ? `<a class="btn btn-secondary" href="#/account">See your orders</a> ` : ""}
      <a class="btn btn-primary" href="#/">Keep shopping</a>
    </div>`;
}

function viewNotFound() {
  setActiveNav(null);
  app.innerHTML = `<div class="empty"><h2>We couldn't find that</h2><p>It may have sold out or moved.</p><a class="btn btn-primary" href="#/">Back to the shop</a></div>`;
}

function viewError() {
  app.innerHTML = `<div class="empty"><h2>The shop didn't load</h2><p>Please refresh the page.</p></div>`;
}

// ---------- Header ----------

function renderSubnav() {
  $("#subnav").innerHTML = [
    `<a href="#/" data-nav="">All</a>`,
    ...state.settings.categories.map((c) => `<a href="#/?c=${slug(c)}" data-nav="${slug(c)}">${esc(c)}</a>`),
  ].join("");
}
function setActiveNav(key) {
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === key));
}
function renderAccountLink() {
  const u = state.user;
  $("#account-label").textContent = u ? (u.displayName?.split(" ")[0] || "Account") : "Sign in";
  $("#admin-link").hidden = !state.isOwner;
}

// ---------- Routing ----------

function route() {
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);

  if (parts[0] === "p" && parts[1]) viewProduct(parts[1]);
  else if (parts[0] === "cart") viewCart();
  else if (parts[0] === "thanks") viewThanks();
  else if (parts[0] === "account") viewAccount(app);
  else if (parts[0] === "admin") viewAdmin(app, parts.slice(1));
  else if (!parts.length) viewHome(new URLSearchParams(query));
  else viewNotFound();

  if (parts[0] === "account" || parts[0] === "admin") setActiveNav(null);
  if (!query.includes("sort")) window.scrollTo(0, 0);
}

$("#search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  location.hash = q ? `#/?q=${encodeURIComponent(q)}` : "#/";
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  addToCart(btn.dataset.add);
  toast(`Added to cart <a href="#/cart">View cart</a>`);
});

// The admin page changed products or settings.
window.addEventListener("shop-changed", renderSubnav);
// The account page changed the signed-in user's name.
window.addEventListener("user-changed", () => { renderAccountLink(); route(); });

$("#year").textContent = new Date().getFullYear();

let started = false;
const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    state.isOwner = user ? await checkOwner() : false;
    renderAccountLink();
    if (!started) return resolve();

    // After signing in from a "Sign in" link, go back to where the shopper came from.
    const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
    const next = new URLSearchParams(query).get("next");
    if (user && path === "/account" && next) location.hash = `#/${next}`;
    else route();
  });
});

try {
  await Promise.all([loadShop(), authReady]);
  for (const id of Object.keys(cart)) if (!byId(id)) delete cart[id];
  renderSubnav();
  renderCartCount();
  started = true;
  window.addEventListener("hashchange", route);
  route();
} catch (e) {
  console.error(e);
  viewError();
}
