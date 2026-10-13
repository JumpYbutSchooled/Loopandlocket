// Small helpers shared by the shop and account pages.

export const $ = (sel, el = document) => el.querySelector(sel);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

let moneyFmt;
export function setCurrency(currency) {
  moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() });
}
export const money = (n) => moneyFmt.format(n);
export function priceHTML(n) {
  const [whole, cents] = money(n).split(".");
  return cents ? `${whole}<small>${cents}</small>` : whole;
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
const TINTS = ["pink", "mint", "lavender", "butter", "sky", "peach"];

export function art(p, imageIndex = 0) {
  const tint = `tint-${TINTS.includes(p.tint) ? p.tint : "pink"}`;
  const src = p.images?.[imageIndex];
  if (src) return `<div class="art ${tint}"><img src="${esc(src)}" alt="${esc(p.name)}" loading="lazy"></div>`;
  return `<div class="art ${tint}"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(p.name)}">${motifFor(p.category)}</svg></div>`;
}
