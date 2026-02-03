/*
Cleanup legacy top-level collections after migration verification.

Requirements:
- Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON with Firestore access
- Review COLLECTIONS list before running
- This script DELETES documents (irreversible). Backup first.
*/

const admin = require('firebase-admin');

const COLLECTIONS = [
  'users_bordj_menaiel',
  'users_boumerdes',
  'languages',
  'trainings',
  'support_lessons',
  'supportCourses',
  'trainer_requests',
  'trainingRequests',
  'signups',
  'payments',
  'studentSubjects',
];

(async () => {
  try {
    try { admin.initializeApp(); } catch (_) {}
    const db = admin.firestore();

    async function deleteCollection(collPath, batchSize = 300) {
      const collRef = db.collection(collPath);
      while (true) {
        const snap = await collRef.limit(batchSize).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        console.log(`Deleted ${snap.size} from ${collPath}`);
        if (snap.size < batchSize) break;
      }
    }

    for (const coll of COLLECTIONS) {
      console.log(`Cleaning ${coll} ...`);
      await deleteCollection(coll);
    }

    console.log('Cleanup complete.');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
