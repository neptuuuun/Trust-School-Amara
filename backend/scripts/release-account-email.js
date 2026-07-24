/**
 * Release an email address that is held by an existing (non-owner) account, so
 * another account can take it. Firebase Auth enforces one account per address,
 * so a takeover is impossible while the incumbent holds it.
 *
 * This script is deliberately NON-DESTRUCTIVE and fully reversible:
 *   - the incumbent Auth user is DISABLED and its email is moved to a parked
 *     address derived from its uid (nothing is deleted),
 *   - its branch profile is stamped retired + previousEmail (kept intact),
 *   - documents in Supabase storage are untouched.
 * To undo, re-run auth.updateUser(uid, { email: previousEmail, disabled: false })
 * and clear the retired stamp.
 *
 * Permanent deletion, if wanted, is a separate deliberate step — do it from the
 * Firebase console once you are satisfied the record is genuinely disposable.
 *
 * Usage (from the backend/ directory):
 *   node scripts/release-account-email.js --email <address>            # dry run
 *   node scripts/release-account-email.js --email <address> --apply    # write
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { admin, db, auth } = require('../config/firebase');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || '').trim();
}
const APPLY = process.argv.includes('--apply');
const email = (arg('--email') || '').toLowerCase();

const parkedAddress = (uid) => `retired-${uid}@released.invalid`;

async function main() {
  console.log('\n=== Release email address ===\n');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: node scripts/release-account-email.js --email <address> [--apply]');
    process.exit(1);
  }

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      console.log(`No account holds ${email} — nothing to release.\n`);
      return;
    }
    throw e;
  }

  // Never silently retire a privileged account.
  const ownerDoc = await db.collection('owners').doc(user.uid).get();
  const adminDoc = await db.collection('admins').doc(user.uid).get();
  if (ownerDoc.exists || adminDoc.exists) {
    console.error(`uid ${user.uid} is an ${ownerDoc.exists ? 'owner' : 'admin'} account. Refusing to retire it.`);
    process.exit(1);
  }

  // Locate the branch profile, if any.
  const branchIds = (await db.collection('branches').get()).docs.map((d) => d.id);
  let profileRef = null;
  let profile = null;
  for (const b of branchIds) {
    const ref = db.collection('branches').doc(b).collection('users').doc(user.uid);
    const snap = await ref.get();
    if (snap.exists) { profileRef = ref; profile = snap.data(); break; }
  }

  const parked = parkedAddress(user.uid);
  console.log('Planned change:');
  console.log(`  uid            : ${user.uid}`);
  console.log(`  profile        : ${profile ? `${profile.fullName || profile.name || '(unnamed)'} — ${profileRef.path}` : '(no branch profile)'}`);
  console.log(`  auth email     : ${user.email}  ->  ${parked}`);
  console.log(`  auth disabled  : ${user.disabled}  ->  true`);
  if (profileRef) console.log(`  profile.email  : ${profile.email || '(none)'}  ->  ${parked}  (+ previousEmail, lifecycleStatus=retired)`);
  console.log(`\n  ${email} becomes free for another account.\n`);

  if (!APPLY) {
    console.log('DRY RUN — nothing written. Re-run with --apply to commit.\n');
    return;
  }

  await auth.updateUser(user.uid, { email: parked, emailVerified: false, disabled: true });
  console.log(`✔ Auth uid ${user.uid} moved to ${parked} and disabled.`);

  if (profileRef) {
    await profileRef.set({
      email: parked,
      previousEmail: email,
      status: 'retired',
      lifecycleStatus: 'retired',
      retiredAt: admin.firestore.FieldValue.serverTimestamp(),
      retiredReason: 'email released for owner account migration',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`✔ ${profileRef.path} stamped retired (record kept intact).`);
  }

  console.log(`\n✅ ${email} is now free.\n`);
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
