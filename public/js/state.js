// What the whole site knows: the shop's products and settings (from Firestore), and who is signed in.
import { db, doc, getDoc, getDocs, collection } from "./fb.js";

// Used until the owner saves settings in the admin page. Keep in sync with functions/index.js.
export const DEFAULT_SETTINGS = {
  currency: "usd",
  categories: ["Crochet", "Lockets", "Charms & Keychains", "Gift Sets"],
  shipping: { flat: 5, freeOver: 40, countries: ["US"] },
};

export const state = {
  products: [],
  settings: DEFAULT_SETTINGS,
  user: null,
  isOwner: false,
};

export const byId = (id) => state.products.find((p) => p.id === id);
export const soldOut = (p) => p.stock === 0;

export function applySettings(data = {}) {
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...data,
    shipping: { ...DEFAULT_SETTINGS.shipping, ...data.shipping },
  };
}

export async function loadShop() {
  const [settings, products] = await Promise.all([
    getDoc(doc(db, "settings", "shop")),
    getDocs(collection(db, "products")),
  ]);
  applySettings(settings.data());
  state.products = products.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Firestore only lets the owner read ownerCheck/*, so a successful read means "this is the owner".
// The owner's email lives in firestore.rules and storage.rules, nowhere else.
export async function checkOwner() {
  try {
    await getDoc(doc(db, "ownerCheck", "me"));
    return true;
  } catch {
    return false;
  }
}
