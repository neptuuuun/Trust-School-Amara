require('dotenv').config();
const admin = require('firebase-admin');

if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    // Cloud/CI deployment: credentials stored as base64 env var
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(json);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Local dev: path to a downloaded service account JSON file
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  } else {
    throw new Error(
      'Firebase credentials not configured.\n' +
      'Set FIREBASE_SERVICE_ACCOUNT_BASE64 (base64 JSON) or ' +
      'GOOGLE_APPLICATION_CREDENTIALS (path to JSON file).'
    );
  }
}

const db   = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
