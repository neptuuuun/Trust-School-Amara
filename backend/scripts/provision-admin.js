/**
 * Provision an individual admin (employee) account.
 *
 * Creates (or reuses) a Firebase Auth user and writes the canonical
 * admins/{uid} document. Multiple admins may share the same branch — each
 * employee gets their own account so every action can be attributed to them.
 *
 * Usage:
 *   cd backend
 *   node scripts/provision-admin.js --email a@b.com --name "Amira K." --branch boumerdes --password "secret123"
 *   node scripts/provision-admin.js --email a@b.com --name "Amira K." --branch bordj_menaiel   # reuse existing Auth user
 *
 * Flags:
 *   --email     (required) login email
 *   --name      (required) employee display name — the authoritative source for audit logs
 *   --branch    (required) boumerdes | bordj_menaiel
 *   --password  (optional) sets/initialises the password when creating the Auth user
 *   --inactive  (optional) provision the account as active:false
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { admin, db, auth } = require('../config/firebase');

const VALID_BRANCHES = ['boumerdes', 'bordj_menaiel'];
const BRANCH_NAMES = { boumerdes: 'بومرداس', bordj_menaiel: 'برج منايل' };

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email    = (arg('--email') || '').trim().toLowerCase();
  const name     = (arg('--name')  || '').trim();
  const branchId = (arg('--branch') || '').trim();
  const password = arg('--password');
  const active   = !process.argv.includes('--inactive');

  if (!email)  throw new Error('--email is required');
  if (!name)   throw new Error('--name is required');
  if (!VALID_BRANCHES.includes(branchId))
    throw new Error(`--branch must be one of: ${VALID_BRANCHES.join(', ')}`);

  // Reuse an existing Auth user or create one.
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`Found existing Auth user: ${userRecord.uid}`);
    if (password) {
      await auth.updateUser(userRecord.uid, { password });
      console.log('Password updated.');
    }
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    if (!password) throw new Error('Auth user does not exist — provide --password to create it.');
    userRecord = await auth.createUser({ email, password, displayName: name, emailVerified: true });
    console.log(`Created Auth user: ${userRecord.uid}`);
  }

  const uid = userRecord.uid;
  await db.collection('admins').doc(uid).set({
    uid,
    name,
    email,
    role: 'admin',
    branchId,
    branchName: BRANCH_NAMES[branchId] || branchId,
    active,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`\n✅ admins/${uid} provisioned — ${name} @ ${branchId} (active: ${active}).`);
}

main().catch((err) => { console.error('Provisioning failed:', err.message || err); process.exit(1); });
