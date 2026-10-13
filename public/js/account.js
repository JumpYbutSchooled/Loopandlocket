// #/account: sign in / create an account, or (when signed in) your details and orders.
import {
  auth, db, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendEmailVerification, sendPasswordResetEmail, signOut,
  collection, query, where, getDocs,
} from "./fb.js";
import { state } from "./state.js";
import { $, esc, orderHTML, newestFirst } from "./util.js";

const AUTH_ERRORS = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-password": "Please enter your password.",
  "auth/email-already-in-use": "There's already an account with that email. Try signing in.",
  "auth/weak-password": "Please use a password with at least 6 characters.",
  "auth/too-many-requests": "Too many tries. Please wait a minute and try again.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Please allow pop-ups and try again.",
  "auth/network-request-failed": "Couldn't connect. Check your internet and try again.",
};
const QUIET = ["auth/popup-closed-by-user", "auth/cancelled-popup-request"];
const friendly = (e) => AUTH_ERRORS[e.code] || "Something went wrong. Please try again.";

export function viewAccount(app) {
  if (state.user) viewProfile(app);
  else viewSignIn(app);
}

function viewSignIn(app, mode = "signin") {
  document.title = "Sign in · Loop & Locket";
  const signup = mode === "signup";
  app.innerHTML = `
    <div class="auth-card">
      <h1>${signup ? "Create your account" : "Welcome back"}</h1>
      <p class="muted">${signup ? "Keep track of your orders and check out faster." : "Sign in to see your orders."}</p>

      <button class="btn btn-google btn-block" id="google">
        <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.1c-.3 2-1.6 4.9-4.6 6.9l7 5.4c4.2-3.9 6.6-9.6 6.6-16z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7-5.4c-1.9 1.3-4.4 2.2-7.5 2.2-5.8 0-10.6-3.8-12.4-9.1l-7.2 5.6C8 41.1 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.6 28.3c-.5-1.4-.7-2.8-.7-4.3s.3-3 .7-4.3l-7.2-5.6C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.9l7.2-5.6z"/><path fill="#EA4335" d="M24 10.6c4.1 0 6.9 1.8 8.4 3.3l6.2-6C34.9 4.4 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.2 5.6c1.8-5.3 6.6-9.1 12.4-9.1z"/></svg>
        Continue with Google
      </button>

      <div class="divider"><span>or</span></div>

      <form id="auth-form" class="form" novalidate>
        ${signup ? `<label class="field"><span>Your name</span><input name="name" autocomplete="name" required></label>` : ""}
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="6" required></label>
        ${signup ? "" : `<button type="button" class="link-btn" id="forgot">Forgot your password?</button>`}
        <p class="form-msg" id="auth-msg" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">${signup ? "Create account" : "Sign in"}</button>
      </form>

      <p class="auth-switch">
        ${signup ? "Already have an account?" : "New to Loop & Locket?"}
        <button class="link-btn" id="switch">${signup ? "Sign in" : "Create an account"}</button>
      </p>
    </div>`;

  const form = $("#auth-form");
  const msg = $("#auth-msg");
  const show = (text, ok = false) => { msg.textContent = text; msg.classList.toggle("ok", ok); msg.hidden = false; };

  $("#switch").addEventListener("click", () => viewSignIn(app, signup ? "signin" : "signup"));

  $("#google").addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      if (!QUIET.includes(e.code)) show(friendly(e));
    }
  });

  $("#forgot")?.addEventListener("click", async () => {
    const email = form.email.value.trim();
    if (!email) return show("Type your email above, then click “Forgot your password?” again.");
    try {
      await sendPasswordResetEmail(auth, email);
      show(`If there's an account for ${email}, a reset link is on its way.`, true);
    } catch (e) {
      show(friendly(e));
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]");
    const email = form.email.value.trim();
    const password = form.password.value;
    if (signup && !form.name.value.trim()) return show("Please enter your name.");
    btn.disabled = true;
    try {
      if (signup) {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(user, { displayName: form.name.value.trim() });
        sendEmailVerification(user).catch(() => {});
        window.dispatchEvent(new Event("user-changed")); // the name arrives after the sign-in event
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // app.js re-renders this page when the sign-in state changes
    } catch (e) {
      show(friendly(e));
      btn.disabled = false;
    }
  });
}

function viewProfile(app) {
  const u = state.user;
  const usesPassword = u.providerData.some((p) => p.providerId === "password");
  document.title = "Your account · Loop & Locket";
  app.innerHTML = `
    <div class="account">
      <section class="panel account-card">
        <div class="avatar">${esc((u.displayName || u.email || "?")[0].toUpperCase())}</div>
        <h1>${u.displayName ? `Hi, ${esc(u.displayName.split(" ")[0])}!` : "Your account"}</h1>
        <p class="muted">${esc(u.email || "")}</p>
        ${usesPassword && !u.emailVerified ? `
          <div class="notice">
            Please confirm your email. We sent a link to ${esc(u.email)}.
            <button class="link-btn" id="resend">Send it again</button>
          </div>` : ""}
        ${state.isOwner ? `<a class="btn btn-secondary btn-block" href="#/admin">Shop admin</a>` : ""}
        <button class="btn btn-ghost" id="signout">Sign out</button>
      </section>
      <section>
        <div class="section-head"><h2>Your orders</h2></div>
        <div id="orders"><p class="muted">Loading your orders…</p></div>
      </section>
    </div>`;

  $("#signout").addEventListener("click", () => signOut(auth));
  $("#resend")?.addEventListener("click", async (e) => {
    try {
      await sendEmailVerification(u);
      e.target.replaceWith("Sent! Check your inbox.");
    } catch {
      e.target.replaceWith("Couldn't send right now. Try again later.");
    }
  });
  loadOrders($("#orders"));
}

async function loadOrders(el) {
  try {
    const snap = await getDocs(query(collection(db, "orders"), where("uid", "==", state.user.uid)));
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((o) => o.status !== "pending").sort(newestFirst);
    el.innerHTML = orders.length
      ? orders.map((o) => orderHTML(o)).join("")
      : `<div class="empty"><h2>No orders yet</h2><p>When you buy something while signed in, it shows up here.</p><a class="btn btn-primary" href="#/">Go shopping</a></div>`;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<p class="muted">Couldn't load your orders right now.</p>`;
  }
}
