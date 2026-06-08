/**
 * Ownership Backfill Script
 * =========================
 * Adds `userId` to all existing student-owned documents that are missing it.
 *
 * Background
 * ----------
 * The project historically stored the student's Firebase Auth UID in either
 * `studentId` or `userId` depending on which function created the document.
 * The canonical standard going forward is `userId`.  This script backfills
 * the missing field wherever it can be safely derived.
 *
 * Run (dry-run first, always):
 *   node scripts/backfillOwnership.js --dry-run
 *   node scripts/backfillOwnership.js
 *
 * Collections processed
 * ---------------------
 *  1. branches/{b}/languagesForms/{uid}/languageFormEntries
 *       userId derivable: container document ID = Firebase UID
 *  2. branches/{b}/languagesRegistered
 *       userId derivable: studentId field = Firebase UID (approval-workflow docs)
 *       NOT derivable: docs with neither field (admin-UI docs) → reported
 *  3. branches/{b}/trainingsRegistered
 *       userId derivable: most docs already have userId
 *       NOT derivable: docs with neither field → reported
 *  4. branches/{b}/registrations  (support lesson summaries)
 *       userId derivable: studentId field = Firebase UID
 *  5. supportLessonRegistrations  (root collection)
 *       userId derivable: studentId field = Firebase UID (when it looks like a UID)
 *       NOT derivable: docs where studentId = registration number → reported
 *
 * Firebase UID heuristic
 * ----------------------
 * Firebase UIDs are 28-character alphanumeric strings.
 * Registration numbers match /^[A-Z]{2,8}-\d{6}-\d{4}$/.
 * Any value that does not match the reg-number pattern is treated as a UID.
 *
 * Credentials
 * -----------
 * Uses the same setup as backend/config/firebase.js.
 * Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_BASE64 in
 * backend/.env before running.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });

const admin = require('firebase-admin');

// ── Firebase init ─────────────────────────────────────────────────────────────
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  } else {
    console.error('❌  No Firebase credentials found.');
    process.exit(1);
  }
}

const db      = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');
const BRANCHES = ['boumerdes', 'bordj_menaiel'];

// Registration-number pattern: e.g. BOUM-202605-1234
const REG_NUMBER_RE = /^[A-Z]{2,8}-\d{6}-\d{4}$/;

const isRegNumber = (val) => typeof val === 'string' && REG_NUMBER_RE.test(val);

// ── Reporting ─────────────────────────────────────────────────────────────────
const report = {
  scanned:     0,
  patched:     0,
  alreadyOk:   0,
  unrepairable: [],
  errors:       [],
};

function logSection(title) {
  console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`);
}
function ok(msg)   { console.log(`  ✅  ${msg}`); }
function warn(msg) { console.log(`  ⚠️   ${msg}`); }
function err(msg)  { console.error(`  ❌  ${msg}`); }

// ── Patch helper ──────────────────────────────────────────────────────────────
async function applyPatch(ref, userId, context) {
  report.scanned++;
  if (!DRY_RUN) {
    try {
      await ref.update({ userId });
      report.patched++;
      ok(`Patched ${context}`);
    } catch (e) {
      report.errors.push({ path: ref.path, error: e.message });
      err(`Failed to patch ${context}: ${e.message}`);
    }
  } else {
    report.patched++;
    ok(`[DRY-RUN] Would patch ${context} → userId: ${userId}`);
  }
}

function recordUnrepairable(path, reason) {
  report.scanned++;
  report.unrepairable.push({ path, reason });
  warn(`Cannot repair: ${path} — ${reason}`);
}

// ── Collection 1: languageFormEntries ─────────────────────────────────────────
// The container document's ID is the student's Firebase UID (always).
async function backfillLanguageFormEntries(branchId) {
  logSection(`languagesForms → languageFormEntries  [branch: ${branchId}]`);
  const containersSnap = await db
    .collection('branches').doc(branchId).collection('languagesForms')
    .get();

  for (const containerDoc of containersSnap.docs) {
    const containerUserId = containerDoc.id; // this IS the Firebase UID
    const entriesSnap = await containerDoc.ref.collection('languageFormEntries').get();

    for (const entry of entriesSnap.docs) {
      const data = entry.data() || {};
      if (data.userId) {
        report.scanned++;
        report.alreadyOk++;
        continue;
      }
      // studentId in form entries = Firebase UID (written by createLanguageRegistration)
      const derivedUid = data.studentId || containerUserId;
      if (derivedUid && !isRegNumber(derivedUid)) {
        await applyPatch(entry.ref, derivedUid,
          `languagesForms/${containerUserId}/languageFormEntries/${entry.id}`);
      } else {
        recordUnrepairable(entry.ref.path, 'no identity field and container UID unavailable');
      }
    }
  }
}

// ── Collection 2: languagesRegistered ────────────────────────────────────────
async function backfillLanguagesRegistered(branchId) {
  logSection(`languagesRegistered  [branch: ${branchId}]`);
  const snap = await db
    .collection('branches').doc(branchId).collection('languagesRegistered')
    .get();

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (data.userId) {
      report.scanned++;
      report.alreadyOk++;
      continue;
    }
    if (data.studentId && !isRegNumber(data.studentId)) {
      await applyPatch(docSnap.ref, data.studentId, `languagesRegistered/${docSnap.id}`);
    } else {
      recordUnrepairable(
        docSnap.ref.path,
        data.studentId
          ? `studentId "${data.studentId}" looks like a registration number, not a UID`
          : 'no studentId or userId — created by adminAddLanguageRegistration without user selection'
      );
    }
  }
}

// ── Collection 3: trainingsRegistered ────────────────────────────────────────
async function backfillTrainingsRegistered(branchId) {
  logSection(`trainingsRegistered  [branch: ${branchId}]`);
  const snap = await db
    .collection('branches').doc(branchId).collection('trainingsRegistered')
    .get();

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (data.userId) {
      report.scanned++;
      report.alreadyOk++;
      continue;
    }
    if (data.studentId && !isRegNumber(data.studentId)) {
      await applyPatch(docSnap.ref, data.studentId, `trainingsRegistered/${docSnap.id}`);
    } else {
      recordUnrepairable(
        docSnap.ref.path,
        data.studentId
          ? `studentId "${data.studentId}" looks like a registration number`
          : 'no studentId or userId — created by adminAddTrainingRegistration without user selection'
      );
    }
  }
}

// ── Collection 4: branches/.../registrations (support lesson summaries) ───────
async function backfillSupportSummaries(branchId) {
  logSection(`registrations (support summaries)  [branch: ${branchId}]`);
  const snap = await db
    .collection('branches').doc(branchId).collection('registrations')
    .get();

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (data.userId) {
      report.scanned++;
      report.alreadyOk++;
      continue;
    }
    if (data.studentId && !isRegNumber(data.studentId)) {
      await applyPatch(docSnap.ref, data.studentId, `registrations/${docSnap.id}`);
    } else {
      recordUnrepairable(docSnap.ref.path,
        data.studentId
          ? `studentId "${data.studentId}" looks like a registration number`
          : 'no identity field');
    }
  }
}

// ── Collection 5: supportLessonRegistrations (root) ──────────────────────────
async function backfillSupportLessonRegistrations() {
  logSection('supportLessonRegistrations (root collection)');
  const snap = await db.collection('supportLessonRegistrations').get();

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (data.userId) {
      report.scanned++;
      report.alreadyOk++;
      continue;
    }
    if (data.studentId && !isRegNumber(data.studentId)) {
      await applyPatch(docSnap.ref, data.studentId, `supportLessonRegistrations/${docSnap.id}`);
    } else if (data.studentId && isRegNumber(data.studentId)) {
      recordUnrepairable(
        docSnap.ref.path,
        `studentId "${data.studentId}" is a registration number, not a Firebase UID`
      );
    } else {
      recordUnrepairable(docSnap.ref.path, 'no identity field');
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n🔧  Ownership Backfill');
  if (DRY_RUN) console.log('⚠️   DRY-RUN mode — no writes will be made.\n');

  for (const branchId of BRANCHES) {
    await backfillLanguageFormEntries(branchId);
    await backfillLanguagesRegistered(branchId);
    await backfillTrainingsRegistered(branchId);
    await backfillSupportSummaries(branchId);
  }
  await backfillSupportLessonRegistrations();

  logSection('Summary');
  console.log(`  Total documents scanned  : ${report.scanned}`);
  console.log(`  Documents ${DRY_RUN ? 'that would be ' : ''}patched: ${report.patched}`);
  console.log(`  Already had userId       : ${report.alreadyOk}`);
  console.log(`  Unrepairable             : ${report.unrepairable.length}`);
  console.log(`  Errors                   : ${report.errors.length}`);

  if (report.unrepairable.length > 0) {
    console.log('\n  Unrepairable documents (no UID can be derived):');
    report.unrepairable.forEach(({ path, reason }) =>
      console.log(`    • ${path}\n      Reason: ${reason}`)
    );
    console.log(
      '\n  These documents have no identity field and cannot be linked to a student.'
    );
    console.log(
      '  They are invisible on the student dashboard but remain visible to admins.'
    );
    console.log(
      '  Review them in the Firebase console and update manually if the student is known.'
    );
  }

  if (report.errors.length > 0) {
    console.log('\n  Write errors:');
    report.errors.forEach(({ path, error }) =>
      console.log(`    • ${path}: ${error}`)
    );
  }

  if (DRY_RUN) {
    console.log('\n⚠️   DRY RUN complete. No data was modified.');
    console.log('    Re-run without --dry-run to apply changes.\n');
  } else {
    console.log('\n✅  Backfill complete.\n');
  }
}

run().catch((e) => { console.error('Fatal:', e); process.exit(1); });
