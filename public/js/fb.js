// Firebase setup. Only Authentication is used; the SDK is self-hosted in vendor/firebase.js
// (rebuild with `npm run build:firebase`).
import { initializeApp, getAuth } from "./vendor/firebase.js";
import { firebaseConfig } from "./firebase-config.js";

export * from "./vendor/firebase.js";

export const auth = getAuth(initializeApp(firebaseConfig));
