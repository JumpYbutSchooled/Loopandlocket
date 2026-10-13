// Small helpers shared by the shop, account, and admin pages.
import { state } from "./state.js";

export const $ = (sel, el = document) => el.querySelector(sel);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

let moneyFmt, moneyCurrency;
export function money(n) {
  const currency = state.settings.currency.toUpperCase();
  if (currency !== moneyCurrency) {
    moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency });
    moneyCurrency = currency;
  }
  return moneyFmt.format(n);
}
export function priceHTML(n) {
  const [whole, cents] = money(n).split(".");
  return cents ? `${whole}<small>${cents}</small>` : whole;
}

// Firestore Timestamp, Date, or nothing -> milliseconds
export const millis = (t) => t?.toMillis?.() ?? t?.getTime?.() ?? 0;
export const newestFirst = (a, b) => millis(b.createdAt) - millis(a.createdAt);
export const formatDate = (t) => (millis(t) ? new Date(millis(t)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

let toastTimer;
export function toast(html) {
  const el = $("#toast");
  el.innerHTML = html;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// Two-click delete: the first click arms the button, a second click within 3s confirms.
export function armed(btn, label = "Click again to confirm") {
  if (btn.dataset.armed) return true;
  const original = btn.textContent;
  btn.dataset.armed = "1";
  btn.textContent = label;
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = original; }, 3000);
  return false;
}

// ---------- Product art: the first photo, or a pastel drawing until photos are added ----------

const MOTIFS = {
  yarn: '<circle cx="50" cy="50" r="30"/><path d="M24 40c16-8 36-6 52 4M21 55c18-9 40-6 56 6M36 23c10 12 14 34 8 55M60 21c-6 16-2 38 10 52" fill="none"/><path d="M76 68c10 4 12 14 4 20" fill="none"/>',
  locket: '<path d="M30 6 50 28 70 6" fill="none" stroke-dasharray="2 6"/><circle cx="50" cy="31" r="5" fill="none"/><path d="M50 88C20 70 18 42 36 39c7-1 12 3 14 9 2-6 7-10 14-9 18 3 16 31-14 49z"/><path d="M50 50v28" stroke-opacity=".5" fill="none"/>',
  charm: '<circle cx="38" cy="28" r="16" fill="none"/><path d="M48 40 54 50" fill="none"/><path d="M58 90C34 76 32 54 46 51c6-1 10 2 12 7 2-5 6-8 12-7 14 3 12 25-12 39z"/>',
  gift: '<rect x="20" y="44" width="60" height="42" rx="8"/><rect x="15" y="32" width="70" height="14" rx="6"/><path d="M50 32v54" fill="none"/><path d="M50 32c-6-12-22-16-22-6 0 6 12 6 22 6zM50 32c6-12 22-16 22-6 0 6-12 6-22 6z"/>',
};
function motifFor(category = "") {
  const c = category.toLowerCase();
  if (c.includes("locket")) return MOTIFS.locket;
  if (c.includes("charm") || c.includes("key")) return MOTIFS.charm;
  if (c.includes("gift")) return MOTIFS.gift;
  return MOTIFS.yarn;
}
export const TINTS = ["pink", "mint", "lavender", "butter", "sky", "peach"];

export function art(p, imageIndex = 0) {
  const tint = `tint-${TINTS.includes(p.tint) ? p.tint : "pink"}`;
  const src = p.images?.[imageIndex];
  if (src) return `<div class="art ${tint}"><img src="${esc(src)}" alt="${esc(p.name)}" loading="lazy"></div>`;
  return `<div class="art ${tint}"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(p.name)}">${motifFor(p.category)}</svg></div>`;
}

// ---------- Orders (shown on the account page and the admin page) ----------

const STATUS = { paid: "Being made", shipped: "Shipped" };

export function orderHTML(o, { admin = false } = {}) {
  const a = o.shippingAddress;
  const address = a ? [o.shippingName, a.line1, a.line2, `${a.city || ""}, ${a.state || ""} ${a.postal_code || ""}`].filter(Boolean).map(esc).join("<br>") : "";
  return `
    <article class="order">
      <header class="order-head">
        <div>
          <strong>${formatDate(o.createdAt)}</strong>
          ${admin ? `<div class="muted">${esc(o.name || "")} ${o.email ? `· <a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : ""}</div>` : ""}
        </div>
        <span class="badge badge-${esc(o.status)}">${STATUS[o.status] || esc(o.status)}</span>
      </header>
      <ul class="order-items">
        ${(o.items || []).map((i) => `<li><span>${i.qty} × ${esc(i.name)}</span><span>${money(i.price * i.qty)}</span></li>`).join("")}
      </ul>
      <div class="order-foot">
        ${admin && address ? `<div class="order-address"><div class="muted">Ship to</div>${address}</div>` : "<div></div>"}
        <div class="order-total">Total <strong>${money(o.total ?? 0)}</strong></div>
      </div>
      ${admin && o.status === "paid" ? `<button class="btn btn-primary" data-ship="${esc(o.id)}">Mark as shipped</button>` : ""}
    </article>`;
}
