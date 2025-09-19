import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD8mLBRnnuflkQ3lKTHVxxYji0ffPVE780",
  authDomain: "trust-school.firebaseapp.com",
  projectId: "trust-school",
  storageBucket: "trust-school.appspot.com",
  messagingSenderId: "488208060844",
  appId: "1:488208060844:web:a6b2e9e65d154b3cddaa09",
  measurementId: "G-BKGJLY224G",
};

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
