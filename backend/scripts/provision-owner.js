/**
 * Provision the cross-branch OWNER account.
 *
 * Creates (or reuses) a Firebase Auth user and writes the authoritative
 * owners/{uid} document. The owner can READ every branch's business data via the
 * Owner Dashboard; they are never branch-bound. Owner docs are writable ONLY by
 * this script / the Admin SDK — Firestore rules deny all client writes.
 *
 * Usage:
 *   cd backend
 *   node scripts/provision-owner.js <email> [name] [password]
 *
 *   - If the Auth user already exists, it is reused (password ignored).
 *   - If it does not exist, it is created. A password may be supplied; otherwise
 *     a strong random one is generated and PRINTED ONCE (set a real one after).
 *
 * Examples:
 *   node scripts/provision-owner.js owner@trust-school.dz "School Owner"
 *   node scripts/provision-owner.js owner@trust-school.dz "School Owner" 'S3curePass!'
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { admin, db, auth } = require('../config/firebase');

const email    = (process.argv[2] || '').trim().toLowerCase();
const name     = (process.argv[3] || 'School Owner').trim();
const password = process.argv[4] || null;

function randomPassword() {
  // 20 chars, mixed — only used when creating a brand-new account.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 20; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function main() {
  console.log('\n=== Provision owner ===\n');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('❌ Usage: node scripts/provision-owner.js <email> [name] [password]');
    process.exit(1);
  }

  // 1. Find or create the Firebase Auth user.
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`✔ Reusing existing Auth user: ${email} (uid ${userRecord.uid})`);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    const pwd = password || randomPassword();
    userRecord = await auth.createUser({ email, password: pwd, displayName: name, emailVerified: true });
    console.log(`✔ Created Auth user: ${email} (uid ${userRecord.uid})`);
    if (!password) {
      console.log(`\n🔑 Generated temporary password (set a real one in Firebase Console / change it):`);
      console.log(`   ${pwd}\n`);
    }
  }

  const uid = userRecord.uid;

  // 2. Write the authoritative owners/{uid} document.
  await db.collection('owners').doc(uid).set({
    uid,
    email,
    role: 'owner',
    name,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`✅ owners/${uid} written. ${email} is now the school owner.`);
  console.log('   Log in at /owner/login to access the Owner Dashboard.\n');
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
