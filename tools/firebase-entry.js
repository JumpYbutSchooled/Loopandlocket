// Everything the site uses from Firebase, bundled into public/js/vendor/firebase.js by `npm run build:firebase`.
// Self-hosted instead of loaded from gstatic.com, because Safari's tracking protection
// can restrict scripts served from Google's domains (which breaks sign-in on iPhones).
export { initializeApp } from "firebase/app";
export {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
