const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function getArgValue(prefix) {
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  if (!raw) return null;
  const parts = raw.split('=');
  return parts.length > 1 ? parts.slice(1).join('=') : null;
}

function getArgValues(prefix) {
  return process.argv
    .filter((arg) => arg.startsWith(prefix))
    .map((arg) => {
      const parts = arg.split('=');
      return parts.length > 1 ? parts.slice(1).join('=') : null;
    })
    .filter(Boolean);
}

async function initAdmin() {
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(process.cwd(), 'serviceAccountKey.json');

  const raw = fs.readFileSync(credPath, 'utf8');
  const sa = JSON.parse(raw);
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || sa.project_id;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId,
    });
  }

  return admin.firestore();
}

async function getBranchIds(db, overrideBranchIds) {
  if (overrideBranchIds.length) return overrideBranchIds;
  const snap = await db.collection('branches').get();
  return snap.docs.map((d) => d.id);
}

async function backfillBranchUsersStudyYear(db, branchId, { dryRun }) {
  const usersRef = db.collection('branches').doc(branchId).collection('users');
  const idField = admin.firestore.FieldPath.documentId();

  let processed = 0;
  let updated = 0;
  let missingBoth = 0;
  const missing = [];

  let last = null;

  while (true) {
    let q = usersRef.orderBy(idField).limit(400);
    if (last) q = q.startAfter(last);

    const snap = await q.get();
    if (snap.empty) break;

    let batch = db.batch();
    let batchOps = 0;

    for (const doc of snap.docs) {
      processed += 1;
      const data = doc.data() || {};

      const currentStudyYear = typeof data.studyYear === 'string' ? data.studyYear.trim() : data.studyYear;
      const schoolLevel = typeof data.schoolLevel === 'string' ? data.schoolLevel.trim() : data.schoolLevel;

      const hasStudyYear = Boolean(currentStudyYear);
      const hasSchoolLevel = Boolean(schoolLevel);

      if (!hasStudyYear && hasSchoolLevel) {
        updated += 1;
        if (!dryRun) {
          batch.set(
            doc.ref,
            {
              studyYear: schoolLevel,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          batchOps += 1;
        }
      } else if (!hasStudyYear && !hasSchoolLevel) {
        missingBoth += 1;
        missing.push({
          branchId,
          userId: doc.id,
          email: data.email || null,
          fullName: data.fullName || null,
        });
      }

      if (!dryRun && batchOps >= 450) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }

    if (!dryRun && batchOps > 0) {
      await batch.commit();
    }

    last = snap.docs[snap.docs.length - 1];
  }

  return { branchId, processed, updated, missingBoth, missing };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const reportPath = getArgValue('--report');
  const branchOverrides = getArgValues('--branch');

  const db = await initAdmin();
  const branchIds = await getBranchIds(db, branchOverrides);

  console.log('Starting backfillStudyYear...');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Branches: ${branchIds.length ? branchIds.join(', ') : '(none found)'}`);

  const results = [];
  const allMissing = [];

  for (const branchId of branchIds) {
    console.log(`\n[${branchId}] Processing users...`);
    const res = await backfillBranchUsersStudyYear(db, branchId, { dryRun });
    results.push(res);
    allMissing.push(...res.missing);
    console.log(`[${branchId}] processed=${res.processed} updated=${res.updated} missingBoth=${res.missingBoth}`);
  }

  const totals = results.reduce(
    (acc, r) => {
      acc.processed += r.processed;
      acc.updated += r.updated;
      acc.missingBoth += r.missingBoth;
      return acc;
    },
    { processed: 0, updated: 0, missingBoth: 0 }
  );

  console.log('\n==== Summary ====');
  console.log(`Total processed: ${totals.processed}`);
  console.log(`Total updated (studyYear <- schoolLevel): ${totals.updated}`);
  console.log(`Total missing both studyYear+schoolLevel: ${totals.missingBoth}`);

  if (allMissing.length) {
    console.log('\nUsers missing both fields (needs admin review):');
    allMissing.slice(0, 50).forEach((u) => {
      console.log(`- ${u.branchId}/${u.userId} ${u.email || ''} ${u.fullName || ''}`.trim());
    });
    if (allMissing.length > 50) {
      console.log(`... and ${allMissing.length - 50} more`);
    }
  }

  if (reportPath) {
    const abs = path.isAbsolute(reportPath) ? reportPath : path.resolve(process.cwd(), reportPath);
    fs.writeFileSync(abs, JSON.stringify({ totals, missing: allMissing }, null, 2), 'utf8');
    console.log(`\nReport written to: ${abs}`);
  }

  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('backfillStudyYear failed:', e);
    process.exit(1);
  });
}
