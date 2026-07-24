/**
 * Change the email address of the cross-branch OWNER account.
 *
 * The owner identity is NOT stored in the codebase — it lives in two places:
 *   1. the Firebase Auth user record (the login email), and
 *   2. the authoritative owners/{uid} Firestore document (the `email` field).
 * Both must move together, otherwise the Owner Dashboard shows a stale address.
 * Owner status itself is resolved by UID (owners/{uid} exists), never by email,
 * so changing the email never changes who has owner access.
 *
 * Usage (from the backend/ directory):
 *   node scripts/change-owner-email.js --list
 *   node scripts/change-owner-email.js --whois <email>
 *   node scripts/change-owner-email.js --to <new-email> [--uid <uid>]          # dry run
 *   node scripts/change-owner-email.js --to <new-email> [--uid <uid>] --apply  # write
 *   node scripts/change-owner-email.js --rekey <email> [--apply]
 *
 *   --list    print every owners/* doc and its Auth email, then exit.
 *   --whois   report which account (if any) already holds an address — run this
 *             first when the target email may already be taken.
 *   --uid     required only when more than one owner exists.
 *   --rekey   repoint the owner document at the Auth uid that currently holds
 *             <email>. Needed when an owner account is deleted and recreated in
 *             the Firebase console: the new account gets a NEW uid, and since
 *             owner access is resolved by uid the old owners/{uid} doc no longer
 *             matches anything — login fails with "الحساب غير مسجل". This copies
 *             the existing owner doc onto the live uid. It never creates an Auth
 *             user and never touches passwords.
 *   --apply   actually write. Without it the script reports the planned change
 *             and touches nothing.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { admin, db, auth } = require('../config/firebase');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || '').trim();
}
const has   = (name) => process.argv.includes(name);
const LIST  = has('--list');
const APPLY = has('--apply');
const toEmail = (arg('--to') || '').toLowerCase();
const wantUid = arg('--uid');
const WHOIS   = (arg('--whois') || '').toLowerCase();
const REKEY   = (arg('--rekey') || '').toLowerCase();

/**
 * Repoint the owner document at the Auth uid that currently holds `email`.
 *
 * Deleting and recreating an account in the Firebase console mints a NEW uid.
 * Owner access is `exists(owners/{request.auth.uid})`, so the recreated account
 * has no role at all until its uid gets a document. This copies the existing
 * owner doc (name, createdAt) onto the live uid. Orphaned docs are reported but
 * never deleted — removing them is a separate, deliberate act.
 */
async function rekey(email) {
  const user = await auth.getUserByEmail(email); // throws if the address is free
  const owners = await loadOwners();

  const already = owners.find((o) => o.uid === user.uid);
  if (already) {
    console.log(`owners/${user.uid} already exists — ${email} is correctly wired. Nothing to do.\n`);
    return;
  }

  // Prefer an orphan (Auth user deleted) carrying this email; fall back to a
  // lone orphan. Never silently steal a doc from a live owner account.
  const orphans = owners.filter((o) => o.authError === 'auth/user-not-found');
  const source =
    orphans.find((o) => (o.docEmail || '').toLowerCase() === email) ||
    (orphans.length === 1 ? orphans[0] : null);

  if (!source) {
    console.error(
      orphans.length
        ? 'Several orphaned owner docs — cannot infer which one to re-key. Resolve by hand.'
        : 'No orphaned owner doc to re-key from. Every owners/* doc has a live Auth user.'
    );
    process.exit(1);
  }

  console.log('Planned change:');
  console.log(`  email            : ${email}`);
  console.log(`  stale owner doc  : owners/${source.uid}  (Auth user deleted)`);
  console.log(`  live auth uid    : ${user.uid}`);
  console.log(`  action           : create owners/${user.uid} (name "${source.name || 'School Owner'}")`);
  console.log(`  orphan left in place: owners/${source.uid} — delete it yourself once login is confirmed\n`);

  if (!APPLY) {
    console.log('DRY RUN — nothing written. Re-run with --apply to commit.\n');
    return;
  }

  await db.collection('owners').doc(user.uid).set({
    uid: user.uid,
    email,
    role: 'owner',
    name: source.name || 'School Owner',
    rekeyedFrom: source.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`✔ owners/${user.uid} written. ${email} is the owner again.`);
  console.log(`  Sign in at /owner/login. owners/${source.uid} is still present — prune it when ready.\n`);
}

/** Read-only: report which account already holds `email`, and what role it has. */
async function whois(email) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      console.log(`No Firebase Auth user holds ${email} — the address is free.\n`);
      return;
    }
    throw e;
  }

  console.log(`${email} is held by Firebase Auth uid ${user.uid}:`);
  console.log(`  displayName  : ${user.displayName || '(none)'}`);
  console.log(`  emailVerified: ${user.emailVerified}`);
  console.log(`  disabled     : ${user.disabled}`);
  console.log(`  created      : ${user.metadata.creationTime}`);
  console.log(`  lastSignIn   : ${user.metadata.lastSignInTime || '(never)'}`);
  console.log(`  providers    : ${user.providerData.map((p) => p.providerId).join(', ') || '(none)'}`);

  console.log('\n  Role documents:');
  for (const col of ['owners', 'admins', 'users']) {
    try {
      const snap = await db.collection(col).doc(user.uid).get();
      if (!snap.exists) { console.log(`    ${col}/${user.uid}: (none)`); continue; }
      const d = snap.data() || {};
      console.log(`    ${col}/${user.uid}: role=${d.role || '?'} branchId=${d.branchId || '-'} name=${d.name || d.fullName || '-'} active=${d.active !== false}`);
    } catch (e) {
      console.log(`    ${col}: unreadable (${e.message})`);
    }
  }

  // Branch-scoped profile/registration data — a self-registered student's real
  // record lives under branches/{branchId}/..., not in a root collection.
  console.log('\n  Branch-scoped data:');
  let branchIds = [];
  try {
    branchIds = (await db.collection('branches').get()).docs.map((d) => d.id);
  } catch (e) {
    console.log(`    branches unreadable (${e.message})`);
  }
  for (const b of branchIds) {
    try {
      const snap = await db.collection('branches').doc(b).collection('users').doc(user.uid).get();
      console.log(`    branches/${b}/users/${user.uid}: ${snap.exists ? JSON.stringify(snap.data()) : '(none)'}`);
    } catch (e) {
      console.log(`    branches/${b}/users: unreadable (${e.message})`);
    }
  }

  // Any registration/payment record keyed by this uid or email.
  console.log('\n  Registration / payment records:');
  const collections = [
    'supportRegistered', 'languageRegistered', 'trainingRegistered',
    'supportForms', 'languageForms', 'trainingForms', 'paymentOrders',
  ];
  for (const col of collections) {
    for (const [field, value] of [['userId', user.uid], ['email', email]]) {
      try {
        const snap = await db.collection(col).where(field, '==', value).limit(5).get();
        if (!snap.empty) console.log(`    ${col} where ${field}==${value}: ${snap.size} doc(s) [${snap.docs.map((d) => d.id).join(', ')}]`);
      } catch { /* collection or field may not exist — ignore */ }
    }
  }
  console.log('');
}

async function loadOwners() {
  const snap = await db.collection('owners').get();
  const rows = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    let authEmail = null;
    let authError = null;
    try {
      authEmail = (await auth.getUser(doc.id)).email || null;
    } catch (e) {
      authError = e.code || e.message;
    }
    rows.push({ uid: doc.id, docEmail: data.email || null, name: data.name || null, authEmail, authError });
  }
  return rows;
}

async function main() {
  console.log('\n=== Owner email migration ===\n');

  if (WHOIS) { await whois(WHOIS); return; }
  if (REKEY) { await rekey(REKEY); return; }

  // Raw dump: every owners/* document ID and its full field set. The DOCUMENT ID
  // is what grants access (rules do exists(owners/$(request.auth.uid))); the
  // `uid` FIELD is descriptive only and is never read by any auth check.
  if (has('--dump')) {
    const snap = await db.collection('owners').get();
    console.log(`owners collection: ${snap.size} document(s)\n`);
    snap.docs.forEach((d) => {
      const data = d.data() || {};
      console.log(`  DOCUMENT ID : ${d.id}      <-- this is what authorizes`);
      console.log(`  uid FIELD   : ${data.uid}      <-- descriptive only`);
      console.log(`  id === uid  : ${d.id === data.uid}`);
      console.log(`  role        : ${JSON.stringify(data.role)} (typeof ${typeof data.role})`);
      console.log(`  fields      : ${JSON.stringify(data, null, 2).split('\n').join('\n                ')}`);
      console.log('');
    });
    return;
  }

  const owners = await loadOwners();
  if (!owners.length) {
    console.error('No documents in the owners collection. Nothing to change.');
    process.exit(1);
  }

  console.log(`Found ${owners.length} owner account(s):`);
  for (const o of owners) {
    console.log(`  uid=${o.uid}`);
    console.log(`     name        : ${o.name || '(none)'}`);
    console.log(`     firestore   : ${o.docEmail || '(none)'}`);
    console.log(`     firebase auth: ${o.authEmail || `(unreadable: ${o.authError})`}`);
  }
  console.log('');

  if (LIST) return;

  if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    console.error('Usage: node scripts/change-owner-email.js --to <new-email> [--uid <uid>] [--apply]');
    process.exit(1);
  }

  let target;
  if (wantUid) {
    target = owners.find((o) => o.uid === wantUid);
    if (!target) {
      console.error(`No owners/${wantUid} document exists.`);
      process.exit(1);
    }
  } else if (owners.length === 1) {
    target = owners[0];
  } else {
    console.error('More than one owner exists — rerun with --uid <uid> to pick one.');
    process.exit(1);
  }

  // Refuse to collide with an unrelated Auth user already holding the new address.
  try {
    const existing = await auth.getUserByEmail(toEmail);
    if (existing.uid !== target.uid) {
      console.error(`Another Firebase Auth user (uid ${existing.uid}) already uses ${toEmail}. Aborting.`);
      process.exit(1);
    }
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }

  console.log('Planned change:');
  console.log(`  uid            : ${target.uid}`);
  console.log(`  auth email     : ${target.authEmail || '(none)'}  ->  ${toEmail}`);
  console.log(`  owners/${target.uid}.email : ${target.docEmail || '(none)'}  ->  ${toEmail}\n`);

  if (!APPLY) {
    console.log('DRY RUN — nothing written. Re-run with --apply to commit.\n');
    return;
  }

  await auth.updateUser(target.uid, { email: toEmail, emailVerified: true });
  console.log('✔ Firebase Auth email updated.');

  await db.collection('owners').doc(target.uid).set({
    email: toEmail,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`✔ owners/${target.uid}.email updated.`);

  console.log(`\n✅ Owner email is now ${toEmail}. Sign in at /owner/login with the new address.`);
  console.log('   The password is unchanged. Owner access is UID-based, so nothing else moves.\n');
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
