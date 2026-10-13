// Loop & Locket storefront. Products come from products.json. Each product's "Buy now" goes to its
// Stripe Payment Link; when someone is signed in, the link is tagged with their account and email.
import { auth, onAuthStateChanged } from "./fb.js";
import { $, esc, slug, priceHTML, setCurrency, art } from "./util.js";
import { viewAccount } from "./account.js";

const app = $("#app");
let shop;

const byId = (id) => shop.products.find((p) => p.id === id);

// ---------- Buying ----------

function buyButton(p, extraClass = "") {
  if (p.soldOut) return `<button class="btn btn-primary btn-block ${extraClass}" disabled>Sold out</button>`;
  if (!p.stripeLink) return `<button class="btn btn-primary btn-block ${extraClass}" disabled>Coming soon</button>`;
  return `<a class="btn btn-primary btn-block ${extraClass}" href="${esc(p.stripeLink)}" data-buy="${esc(p.id)}">Buy now</a>`;
}

// Stripe Payment Links accept these to fill in the email and tie the payment to the shopper's account.
function buyUrl(p) {
  const url = new URL(p.stripeLink);
  const user = auth.currentUser;
  if (user) url.searchParams.set("client_reference_id", user.uid);
  if (user?.email) url.searchParams.set("prefilled_email", user.email);
  return url.href;
}

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-buy]");
  if (!link) return;
  e.preventDefault();
  location.href = buyUrl(byId(link.dataset.buy));
});

// ---------- Views ----------

function productCard(p) {
  return `
    <article class="card">
      <a class="card-link" href="#/p/${esc(p.id)}">
        ${art(p)}
        <div class="card-body">
          <div class="card-cat">${esc(p.category)}</div>
          <h3>${esc(p.name)}</h3>
          <div class="price">${priceHTML(p.price)}</div>
          ${p.soldOut ? '<p class="stock-note out">Sold out</p>' : ""}
        </div>
      </a>
      <div class="card-actions">${buyButton(p)}</div>
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

  const featured = [...shop.products].sort(SORTS.featured).slice(0, 3);
  const hero = !q && !category ? `
    <section class="hero">
      <div>
        <h1>Handmade little things, made with love</h1>
        <p>Cozy crochet, keepsake lockets, and sweet gifts, each one stitched or strung by hand.</p>
        <button class="btn btn-primary" id="shop-now">Shop everything</button>
      </div>
      ${featured.length === 3 ? `<div class="hero-art" aria-hidden="true">${featured.map((p) => art(p)).join("")}</div>` : ""}
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
  const user = auth.currentUser;

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
        <p class="ship-note">Shipping is added at checkout</p>
        ${p.soldOut ? '<p class="in-stock out">Sold out</p>' : '<p class="in-stock">Handmade and ready for you</p>'}
        ${buyButton(p)}
        ${user || p.soldOut || !p.stripeLink ? "" : `<p class="secure-note"><a href="#/account?next=${encodeURIComponent(`p/${p.id}`)}">Sign in</a> and we'll fill in your email at checkout.</p>`}
        <p class="secure-note">Secure payment with Stripe.</p>
      </aside>
    </div>
    ${related(p)}
  `;

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

function viewThanks() {
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

// ---------- Header ----------

function renderSubnav() {
  $("#subnav").innerHTML = [
    `<a href="#/" data-nav="">All</a>`,
    ...shop.categories.map((c) => `<a href="#/?c=${slug(c)}" data-nav="${slug(c)}">${esc(c)}</a>`),
  ].join("");
}
function setActiveNav(key) {
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === key));
}
function renderAccountLink() {
  const u = auth.currentUser;
  $("#account-label").textContent = u ? (u.displayName?.split(" ")[0] || "Account") : "Sign in";
}

// ---------- Routing ----------

function route() {
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);

  if (parts[0] === "p" && parts[1]) viewProduct(parts[1]);
  else if (parts[0] === "thanks") viewThanks();
  else if (parts[0] === "account") { viewAccount(app); setActiveNav(null); }
  else if (!parts.length) viewHome(new URLSearchParams(query));
  else viewNotFound();

  if (!query.includes("sort")) window.scrollTo(0, 0);
}

$("#search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  location.hash = q ? `#/?q=${encodeURIComponent(q)}` : "#/";
});

// The account page changed the signed-in user's name.
window.addEventListener("user-changed", () => { renderAccountLink(); route(); });

$("#year").textContent = new Date().getFullYear();

let started = false;
const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
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
  const [res] = await Promise.all([fetch("products.json", { cache: "no-cache" }), authReady]);
  shop = await res.json();
  setCurrency(shop.currency);
  renderSubnav();
  started = true;
  window.addEventListener("hashchange", route);
  route();
} catch (e) {
  console.error(e);
  viewError();
}
