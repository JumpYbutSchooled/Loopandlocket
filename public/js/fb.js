// Firebase setup shared by every page module. The SDK is self-hosted in vendor/firebase.js
// (rebuild with `npm run build:firebase`).
import { initializeApp, getAuth, getFirestore, getStorage } from "./vendor/firebase.js";
import { firebaseConfig } from "./firebase-config.js";

export * from "./vendor/firebase.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
