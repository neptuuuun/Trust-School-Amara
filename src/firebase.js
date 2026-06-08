import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error('Firebase configuration is incomplete. Check your .env file for REACT_APP_FIREBASE_* variables.');
}

// Initialize Firebase (only once)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Analytics (only if supported, e.g. in browser)
let analytics;
isSupported().then((yes) => {
  if (yes) {
    analytics = getAnalytics(app);
    console.log("Firebase Analytics initialized");
  } else {
    console.log("Analytics not supported in this environment");
  }
});
// Export auth, firestore, and storage
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { analytics };

// Pre-configured Google provider — imported once, reused everywhere.
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Optional: helper to clear local persistence if a client-side cache becomes corrupted.
// Note: This is safe but should be invoked manually from a recovery flow if needed.
export async function resetFirestoreLocalCache() {
  try {
    // Best-effort clear known Firebase IndexedDB databases
    if (typeof indexedDB !== 'undefined') {
      // Auth local storage DB
      try { indexedDB.deleteDatabase('firebaseLocalStorageDb'); } catch (_) {}
      // Older Firestore databases (names are implementation-specific, do best effort)
      try { indexedDB.deleteDatabase(`firestore/[DEFAULT]/${firebaseConfig.projectId}/main`); } catch (_) {}
    }
    // Also clear localStorage items that may affect session
    try {
      localStorage.removeItem('branchId');
      localStorage.removeItem('selectedBranch');
    } catch (_) {}
    console.log('Requested local Firebase caches reset');
  } catch (e) {
    console.warn('Failed to reset local caches', e);
  }
}