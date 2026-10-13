// Loop & Locket storefront. Products come from products.json; the cart lives in this browser.
// Checkout posts the cart to /api/checkout (functions/index.js), which sends the shopper to Stripe.

const $ = (sel, el = document) => el.querySelector(sel);
const app = $("#app");
const CART_KEY = "loopandlocket-cart";
const MAX_QTY = 20;

let shop;
let cart = loadCart(); // { productId: quantity }

// ---------- Helpers ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

let moneyFmt;
const money = (n) => moneyFmt.format(n);
const priceHTML = (n) => {
  const [whole, cents] = money(n).split(".");
  return cents ? `${whole}<small>${cents}</small>` : whole;
};

const byId = (id) => shop.products.find((p) => p.id === id);
const soldOut = (p) => p.stock === 0;

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
  const { flat, freeOver } = shop.shipping;
  const shipping = subtotal === 0 || subtotal >= freeOver ? 0 : flat;
  return { subtotal, shipping, total: subtotal + shipping };
}
function addToCart(id, qty = 1) {
  cart[id] = Math.min(MAX_QTY, (cart[id] || 0) + qty);
  saveCart();
}
function setQty(id, qty) {
  if (qty <= 0) delete cart[id];
  else cart[id] = Math.min(MAX_QTY, qty);
  saveCart();
}

let toastTimer;
function toast(html) {
  const el = $("#toast");
  el.innerHTML = html;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
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

// ---------- Product art (photo, or a pastel placeholder until photos are added) ----------

const MOTIFS = {
  yarn: '<circle cx="50" cy="50" r="30"/><path d="M24 40c16-8 36-6 52 4M21 55c18-9 40-6 56 6M36 23c10 12 14 34 8 55M60 21c-6 16-2 38 10 52" fill="none"/><path d="M76 68c10 4 12 14 4 20" fill="none"/>',
  locket: '<path d="M30 6 50 28 70 6" fill="none" stroke-dasharray="2 6"/><circle cx="50" cy="31" r="5" fill="none"/><path d="M50 88C20 70 18 42 36 39c7-1 12 3 14 9 2-6 7-10 14-9 18 3 16 31-14 49z"/><path d="M50 50v28" stroke-opacity=".5" fill="none"/>',
  charm: '<circle cx="38" cy="28" r="16" fill="none"/><path d="M48 40 54 50" fill="none"/><path d="M58 90C34 76 32 54 46 51c6-1 10 2 12 7 2-5 6-8 12-7 14 3 12 25-12 39z"/>',
  gift: '<rect x="20" y="44" width="60" height="42" rx="8"/><rect x="15" y="32" width="70" height="14" rx="6"/><path d="M50 32v54" fill="none"/><path d="M50 32c-6-12-22-16-22-6 0 6 12 6 22 6zM50 32c6-12 22-16 22-6 0 6-12 6-22 6z"/>',
};
function motifFor(p) {
  const c = p.category.toLowerCase();
  if (c.includes("locket")) return MOTIFS.locket;
  if (c.includes("charm") || c.includes("key")) return MOTIFS.charm;
  if (c.includes("gift")) return MOTIFS.gift;
  return MOTIFS.yarn;
}
function art(p, imageIndex = 0) {
  const tint = `tint-${p.tint || "pink"}`;
  const src = p.images?.[imageIndex];
  if (src) return `<div class="art ${tint}"><img src="${esc(src)}" alt="${esc(p.name)}" loading="lazy"></div>`;
  return `<div class="art ${tint}"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(p.name)}">${motifFor(p)}</svg></div>`;
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
  featured: (a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0),
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  name: (a, b) => a.name.localeCompare(b.name),
};

function viewHome(params) {
  const q = (params.get("q") || "").trim();
  const catSlug = params.get("c") || "";
  const category = shop.categories.find((c) => slug(c) === catSlug);
  const sort = SORTS[params.get("sort")] ? params.get("sort") : "featured";

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = shop.products
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

  const featured = shop.products.filter((p) => p.featured).slice(0, 3);
  const hero = !q && !category ? `
    <section class="hero">
      <div>
        <h1>Handmade little things, made with love</h1>
        <p>Cozy crochet, keepsake lockets, and sweet gifts, each one stitched or strung by hand.</p>
        <button class="btn btn-primary" id="shop-now">Shop everything</button>
      </div>
      <div class="hero-art" aria-hidden="true">${featured.map((p) => art(p)).join("")}</div>
    </section>` : "";

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
        <option value="price-asc">Price: Low to high</option>
        <option value="price-desc">Price: High to low</option>
        <option value="name">Name: A to Z</option>
      </select>
    </div>
    <div class="chips">
      <a class="chip ${!category ? "active" : ""}" href="${link({ c: "" })}">All</a>
      ${shop.categories.map((c) => `<a class="chip ${c === category ? "active" : ""}" href="${link({ c: slug(c) })}">${esc(c)}</a>`).join("")}
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
  const { flat, freeOver } = shop.shipping;

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
    const max = p.stock > 0 ? Math.min(p.stock, MAX_QTY) : MAX_QTY;
    qty = Math.max(1, Math.min(max, qty + Number(b.dataset.q)));
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
  const more = shop.products.filter((x) => x.id !== p.id && x.category === p.category).slice(0, 4);
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
  const { freeOver } = shop.shipping;
  const toFree = freeOver - subtotal;
  const freeShip = shop.shipping.flat > 0
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
        <p class="secure-note">Secure payment with Stripe. Tax, if any, is shown at checkout.</p>
      </aside>
    </div>
  `;

  app.querySelectorAll("[data-inc]").forEach((b) => b.addEventListener("click", () => {
    const p = byId(b.dataset.inc);
    const max = p.stock > 0 ? Math.min(p.stock, MAX_QTY) : MAX_QTY;
    setQty(p.id, Math.min(max, cart[p.id] + 1));
    viewCart();
  }));
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
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cartLines().map((l) => ({ id: l.product.id, qty: l.qty })) }),
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

// ---------- Navigation ----------

function renderSubnav() {
  $("#subnav").innerHTML = [
    `<a href="#/" data-nav="">All</a>`,
    ...shop.categories.map((c) => `<a href="#/?c=${slug(c)}" data-nav="${slug(c)}">${esc(c)}</a>`),
  ].join("");
}
function setActiveNav(key) {
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === key));
}

function route() {
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "p" && parts[1]) viewProduct(decodeURIComponent(parts[1]));
  else if (parts[0] === "cart") viewCart();
  else if (parts[0] === "thanks") viewThanks();
  else if (!parts.length) viewHome(new URLSearchParams(query));
  else viewNotFound();

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

$("#year").textContent = new Date().getFullYear();

try {
  const res = await fetch("products.json", { cache: "no-cache" });
  shop = await res.json();
  moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: shop.currency.toUpperCase() });
  for (const id of Object.keys(cart)) if (!byId(id)) delete cart[id];
  renderSubnav();
  renderCartCount();
  window.addEventListener("hashchange", route);
  route();
} catch (e) {
  console.error(e);
  viewError();
}
