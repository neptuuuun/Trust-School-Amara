import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Debug: Log environment variables
console.log('Environment variables:', {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? 'Set' : 'Missing',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? 'Set' : 'Missing',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? 'Set' : 'Missing',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? 'Set' : 'Missing',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? 'Set' : 'Missing',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? 'Set' : 'Missing',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ? 'Set' : 'Missing',
});

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD8mLBRnnuflkQ3lKTHVxxYji0ffPVE780",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "trust-school.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "trust-school",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "trust-school.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "488208060844",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:488208060844:web:a6b2e9e65d154b3cddaa09",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-BKGJLY224G",
};

// Validate that all required config values are present
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Missing required Firebase configuration. Please check your environment variables.');
  throw new Error('Firebase configuration is incomplete');
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

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

// Export auth and firestore so other files can import them
export const auth = getAuth(app);
export const db = getFirestore(app);
export { analytics };