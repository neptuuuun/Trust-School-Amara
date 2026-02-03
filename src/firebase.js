import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Debug: Log environment variables (using REACT_APP_ prefix for Create React App)
console.log('Environment variables:', {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY ? 'Set' : 'Missing',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN ? 'Set' : 'Missing',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID ? 'Set' : 'Missing',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET ? 'Set' : 'Missing',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID ? 'Set' : 'Missing',
  appId: process.env.REACT_APP_FIREBASE_APP_ID ? 'Set' : 'Missing',
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID ? 'Set' : 'Missing',
});

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyD8mLBRnnuflkQ3lKTHVxxYji0ffPVE780",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "trust-school.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "trust-school",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "trust-school.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "488208060844",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:488208060844:web:a6b2e9e65d154b3cddaa09",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-BKGJLY224G",
};

// Validate that all required config values are present
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Missing required Firebase configuration. Please check your environment variables.');
  throw new Error('Firebase configuration is incomplete');
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
// Export auth, firestore, storage and functions so other files can import them
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export { analytics };

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