// #/admin: the shop owner's page for adding products, shipping orders, and changing shop settings.
// Only the owner can open it, and firestore.rules / storage.rules enforce the same thing on the server.
import {
  db, storage, doc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, orderBy, limit,
  serverTimestamp, ref, uploadBytes, getDownloadURL, deleteObject,
} from "./fb.js";
import { state, byId, applySettings } from "./state.js";
import { $, esc, slug, money, toast, armed, art, TINTS, orderHTML, newestFirst } from "./util.js";

const shopChanged = () => window.dispatchEvent(new Event("shop-changed"));

export function viewAdmin(app, parts) {
  document.title = "Shop admin · Loop & Locket";
  if (!state.user) {
    app.innerHTML = `<div class="empty"><h2>Shop admin</h2><p>Sign in with the shop's account to manage products.</p><a class="btn btn-primary" href="#/account?next=admin">Sign in</a></div>`;
    return;
  }
  if (!state.isOwner) {
    app.innerHTML = `<div class="empty"><h2>This page is just for the shop owner</h2><p>You're signed in as ${esc(state.user.email)}.</p><a class="btn btn-primary" href="#/">Back to the shop</a></div>`;
    return;
  }

  const [tab = "products", id] = parts;
  const current = tab === "new" || tab === "edit" ? "products" : tab;
  app.innerHTML = `
    <div class="section-head"><h2>Shop admin</h2></div>
    <nav class="tabs">
      <a href="#/admin" class="${current === "products" ? "active" : ""}">Products</a>
      <a href="#/admin/orders" class="${current === "orders" ? "active" : ""}">Orders</a>
      <a href="#/admin/settings" class="${current === "settings" ? "active" : ""}">Settings</a>
    </nav>
    <div id="admin-body"></div>`;
  const el = $("#admin-body");

  if (tab === "new") productForm(el, null);
  else if (tab === "edit") byId(id) ? productForm(el, byId(id)) : (el.innerHTML = `<p class="muted">That product doesn't exist anymore.</p>`);
  else if (tab === "orders") ordersList(el);
  else if (tab === "settings") settingsForm(el);
  else productsList(el);
}

// ---------- Products ----------

function productsList(el) {
  const products = [...state.products].sort((a, b) => a.name.localeCompare(b.name));
  el.innerHTML = `
    <div class="admin-bar">
      <p class="muted">${products.length} ${products.length === 1 ? "product" : "products"}</p>
      <a class="btn btn-primary" href="#/admin/new">+ Add product</a>
    </div>
    ${products.length ? `
      <div class="panel admin-list">
        ${products.map((p) => `
          <div class="admin-row">
            <a href="#/p/${esc(p.id)}" class="admin-thumb">${art(p)}</a>
            <div class="admin-row-main">
              <strong>${esc(p.name)}</strong>
              <div class="muted">${esc(p.category)} · ${money(p.price)} · ${p.stock == null ? "Unlimited stock" : p.stock === 0 ? "Sold out" : `${p.stock} in stock`}${p.featured ? " · Featured" : ""}</div>
            </div>
            <div class="admin-row-actions">
              <a class="btn btn-secondary" href="#/admin/edit/${esc(p.id)}">Edit</a>
              <button class="btn btn-ghost" data-delete="${esc(p.id)}">Delete</button>
            </div>
          </div>`).join("")}
      </div>` : `
      <div class="empty"><h2>No products yet</h2><p>Add your first handmade goodie and it'll show up in the shop right away.</p><a class="btn btn-primary" href="#/admin/new">Add a product</a></div>`}`;

  el.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!armed(btn, "Click again to delete")) return;
    const p = byId(btn.dataset.delete);
    btn.disabled = true;
    try {
      await deleteDoc(doc(db, "products", p.id));
      for (const url of p.images || []) deleteObject(ref(storage, url)).catch(() => {});
      state.products = state.products.filter((x) => x.id !== p.id);
      shopChanged();
      toast(`Deleted ${esc(p.name)}`);
      productsList(el);
    } catch (e) {
      console.error(e);
      toast("Couldn't delete that. Try again.");
      btn.disabled = false;
    }
  }));
}

// Phone photos are huge; shrink to 1600px JPEGs before uploading.
async function shrink(file, max = 1600) {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}

function uniqueId(name) {
  const base = slug(name) || "product";
  let id = base;
  for (let n = 2; byId(id); n++) id = `${base}-${n}`;
  return id;
}

function productForm(el, p) {
  const s = state.settings;
  const categories = p && !s.categories.includes(p.category) ? [...s.categories, p.category] : s.categories;
  // Each photo is either already uploaded ({url}) or picked but not uploaded yet ({file, preview}).
  let photos = (p?.images || []).map((url) => ({ url }));
  const removedUrls = [];

  el.innerHTML = `
    <form class="panel form product-form" id="product-form" novalidate>
      <h3>${p ? `Edit ${esc(p.name)}` : "Add a product"}</h3>
      <label class="field"><span>Name</span><input name="name" required maxlength="80" value="${esc(p?.name)}"></label>
      <div class="field-row">
        <label class="field"><span>Price ($)</span><input name="price" type="number" min="0.5" step="0.01" required value="${p ? p.price : ""}"></label>
        <label class="field"><span>Stock</span><input name="stock" type="number" min="0" step="1" placeholder="Unlimited" value="${p?.stock ?? ""}"></label>
      </div>
      <p class="hint">Leave stock empty if you make things to order. Stock goes down automatically when something sells; 0 means sold out.</p>
      <div class="field-row">
        <label class="field"><span>Category</span>
          <select name="category">${categories.map((c) => `<option ${c === p?.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        </label>
        <label class="field"><span>Card color</span>
          <select name="tint">${TINTS.map((t) => `<option value="${t}" ${t === (p?.tint || "pink") ? "selected" : ""}>${t[0].toUpperCase() + t.slice(1)}</option>`).join("")}</select>
        </label>
      </div>
      <label class="field"><span>Description</span><textarea name="description" rows="3" maxlength="2000">${esc(p?.description)}</textarea></label>
      <label class="field"><span>Details <em>(one per line)</em></span><textarea name="details" rows="4" placeholder="About 6 in tall&#10;Soft chenille yarn">${esc((p?.details || []).join("\n"))}</textarea></label>
      <label class="check"><input type="checkbox" name="featured" ${p?.featured ? "checked" : ""}> Featured (shows first and in the banner)</label>

      <div class="field">
        <span>Photos <em>(the first one is the main photo)</em></span>
        <div class="photo-grid" id="photo-grid"></div>
        <label class="btn btn-secondary photo-add">+ Add photos<input type="file" accept="image/*" multiple hidden id="photo-input"></label>
      </div>

      <p class="form-msg" id="form-msg" role="alert" hidden></p>
      <div class="form-actions">
        <a class="btn btn-ghost" href="#/admin">Cancel</a>
        <button class="btn btn-primary" type="submit">${p ? "Save changes" : "Add product"}</button>
      </div>
    </form>`;

  const form = $("#product-form");
  const grid = $("#photo-grid");
  const msg = $("#form-msg");

  function renderPhotos() {
    grid.innerHTML = photos.map((ph, i) => `
      <div class="photo">
        <img src="${esc(ph.url || ph.preview)}" alt="">
        <div class="photo-actions">
          ${i > 0 ? `<button type="button" data-main="${i}">Make main</button>` : `<span class="photo-main">Main</span>`}
          <button type="button" data-remove="${i}" aria-label="Remove photo">✕</button>
        </div>
      </div>`).join("") || `<p class="muted">No photos yet. Products without photos get a pastel drawing.</p>`;
  }
  renderPhotos();

  grid.addEventListener("click", (e) => {
    const main = e.target.closest("[data-main]");
    const remove = e.target.closest("[data-remove]");
    if (main) {
      const [ph] = photos.splice(Number(main.dataset.main), 1);
      photos.unshift(ph);
    } else if (remove) {
      const [ph] = photos.splice(Number(remove.dataset.remove), 1);
      if (ph.url) removedUrls.push(ph.url);
      if (ph.preview) URL.revokeObjectURL(ph.preview);
    } else return;
    renderPhotos();
  });

  $("#photo-input").addEventListener("change", (e) => {
    for (const file of e.target.files) {
      if (file.type.startsWith("image/")) photos.push({ file, preview: URL.createObjectURL(file) });
    }
    e.target.value = "";
    renderPhotos();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const price = Math.round(Number(form.price.value) * 100) / 100;
    const stockRaw = form.stock.value.trim();
    const stock = stockRaw === "" ? null : Math.max(0, Math.floor(Number(stockRaw)));
    if (!name) return showMsg("Please give it a name.");
    if (!(price >= 0.5)) return showMsg("Please enter a price of at least $0.50.");
    if (stockRaw !== "" && Number.isNaN(stock)) return showMsg("Stock should be a number, or empty for unlimited.");

    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    msg.hidden = true;
    const id = p?.id || uniqueId(name);

    try {
      const images = [];
      for (const [i, ph] of photos.entries()) {
        if (ph.url) { images.push(ph.url); continue; }
        btn.textContent = `Uploading photo ${i + 1} of ${photos.length}…`;
        const blob = await shrink(ph.file);
        const file = ref(storage, `products/${id}/${Date.now()}-${i}.jpg`);
        await uploadBytes(file, blob, { contentType: blob.type || "image/jpeg", cacheControl: "public, max-age=31536000" });
        images.push(await getDownloadURL(file));
      }
      btn.textContent = "Saving…";

      const data = {
        name,
        price,
        stock,
        category: form.category.value,
        tint: form.tint.value,
        description: form.description.value.trim(),
        details: form.details.value.split("\n").map((d) => d.trim()).filter(Boolean),
        featured: form.featured.checked,
        images,
        createdAt: p?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, "products", id), data);
      for (const url of removedUrls) deleteObject(ref(storage, url)).catch(() => {});

      const local = { ...data, id, createdAt: p?.createdAt || new Date(), updatedAt: new Date() };
      state.products = [...state.products.filter((x) => x.id !== id), local];
      shopChanged();
      toast(p ? "Saved!" : `Added ${esc(name)} <a href="#/p/${esc(id)}">View</a>`);
      location.hash = "#/admin";
    } catch (err) {
      console.error(err);
      showMsg(err.code === "storage/unauthorized" || err.code === "permission-denied"
        ? "You don't have permission to do that. Make sure you're signed in with the shop's account."
        : "Couldn't save. Check your connection and try again.");
      btn.disabled = false;
      btn.textContent = p ? "Save changes" : "Add product";
    }
  });

  function showMsg(text) {
    msg.textContent = text;
    msg.hidden = false;
  }
}

// ---------- Orders ----------

async function ordersList(el) {
  el.innerHTML = `<p class="muted">Loading orders…</p>`;
  let orders;
  try {
    const snap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200)));
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((o) => o.status !== "pending").sort(newestFirst);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<p class="muted">Couldn't load orders right now.</p>`;
    return;
  }
  const toShip = orders.filter((o) => o.status === "paid");
  const shipped = orders.filter((o) => o.status === "shipped");

  el.innerHTML = orders.length ? `
    <h3 class="admin-sub">To ship (${toShip.length})</h3>
    ${toShip.length ? toShip.map((o) => orderHTML(o, { admin: true })).join("") : `<p class="muted">You're all caught up!</p>`}
    ${shipped.length ? `<h3 class="admin-sub">Shipped (${shipped.length})</h3>${shipped.map((o) => orderHTML(o, { admin: true })).join("")}` : ""}
    <p class="hint">Payments, refunds, and receipts are in your Stripe dashboard.</p>` : `
    <div class="empty"><h2>No orders yet</h2><p>Paid orders will show up here with the shipping address.</p></div>`;

  el.querySelectorAll("[data-ship]").forEach((btn) => btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "orders", btn.dataset.ship), { status: "shipped", shippedAt: serverTimestamp() });
      toast("Marked as shipped");
      ordersList(el);
    } catch (e) {
      console.error(e);
      toast("Couldn't update that order.");
      btn.disabled = false;
    }
  }));
}

// ---------- Settings ----------

function settingsForm(el) {
  const s = state.settings;
  el.innerHTML = `
    <form class="panel form" id="settings-form" novalidate>
      <h3>Shop settings</h3>
      <label class="field"><span>Categories <em>(one per line, in the order they show)</em></span>
        <textarea name="categories" rows="5">${esc(s.categories.join("\n"))}</textarea>
      </label>
      <p class="hint">Products in a removed category still show under “All”. Edit them to move them.</p>
      <div class="field-row">
        <label class="field"><span>Shipping cost ($)</span><input name="flat" type="number" min="0" step="0.01" value="${s.shipping.flat}"></label>
        <label class="field"><span>Free shipping over ($)</span><input name="freeOver" type="number" min="0" step="0.01" value="${s.shipping.freeOver}"></label>
      </div>
      <p class="hint">Set shipping cost to 0 for free shipping on everything.</p>
      <p class="form-msg" id="settings-msg" role="alert" hidden></p>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Save settings</button></div>
    </form>`;

  const form = $("#settings-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#settings-msg");
    const categories = [...new Set(form.categories.value.split("\n").map((c) => c.trim()).filter(Boolean))];
    const flat = Number(form.flat.value);
    const freeOver = Number(form.freeOver.value);
    if (!categories.length) { msg.textContent = "Add at least one category."; msg.hidden = false; return; }
    if (!(flat >= 0) || !(freeOver >= 0)) { msg.textContent = "Shipping amounts should be numbers."; msg.hidden = false; return; }

    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const data = { categories, shipping: { ...s.shipping, flat, freeOver } };
      await setDoc(doc(db, "settings", "shop"), data, { merge: true });
      applySettings({ ...state.settings, ...data });
      shopChanged();
      toast("Settings saved");
      msg.hidden = true;
    } catch (err) {
      console.error(err);
      msg.textContent = "Couldn't save. Try again.";
      msg.hidden = false;
    }
    btn.disabled = false;
  });
}
