/*
Migration script: move existing top-level collections into per-branch structure

New structure
branches/{branchId}/
  users
  languages
  trainings
  support_courses
  trainer_requests
  training_requests
  signups
  studentSubjects
  payments

Usage:
1) npm install firebase-admin
2) Set GOOGLE_APPLICATION_CREDENTIALS env var to a service account JSON with Firestore access
3) node scripts/migrate-to-branches.js

Safety:
- This script only CREATES documents in the new paths. It does not delete any old data.
- It is idempotent-ish: it checks if a destination doc exists before creating (when possible).
*/

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    try {
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.resolve(process.cwd(), 'serviceAccountKey.json');
      const raw = fs.readFileSync(credPath, 'utf8');
      const sa = JSON.parse(raw);
      const projectId = process.env.GOOGLE_CLOUD_PROJECT || sa.project_id;
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId,
      });
    } catch (e) {
      console.error('Failed to initialize Firebase Admin. Check service account path and JSON.', e);
      process.exit(1);
    }
    const db = admin.firestore();

    const branches = ['bordj_menaiel', 'boumerdes']; // extend if you have more
    const DEFAULT_BRANCH = 'bordj_menaiel';

    async function ensureBranchDoc(id) {
      const ref = db.collection('branches').doc(id);
      const snap = await ref.get();
      const data = snap.exists ? snap.data() : {};
      const payload = {
        name: data?.name || id,
        address: data?.address || '',
        contactEmail: data?.contactEmail || '',
        phone: data?.phone || '',
        mapUrl: data?.mapUrl || '',
        description: data?.description || '',
        createdAt: data?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(payload, { merge: true });
      if (!snap.exists) console.log('Created branch doc:', id);
    }

    // 1) users_{branch} -> branches/{branch}/users/{uid}
    async function migrateUsersForBranch(branchId) {
      const src = db.collection(`users_${branchId}`);
      const snap = await src.get();
      console.log(`[users] ${branchId}: ${snap.size} docs`);
      for (const doc of snap.docs) {
        const destRef = db.collection('branches').doc(branchId).collection('users').doc(doc.id);
        const destSnap = await destRef.get();
        if (!destSnap.exists) {
          await destRef.set({ ...doc.data(), branchId }, { merge: true });
        }
      }
    }

    // 2) languages (global) -> branches/{branch}/languages (duplicate to all branches)
    async function migrateLanguages() {
      const src = db.collection('languages');
      const snap = await src.get();
      console.log(`[languages] total: ${snap.size}`);
      for (const doc of snap.docs) {
        for (const branchId of branches) {
          const destRef = db.collection('branches').doc(branchId).collection('languages').doc(doc.id);
          const destSnap = await destRef.get();
          if (!destSnap.exists) {
            await destRef.set({ ...doc.data(), branchId });
          }
        }
      }
    }

    // 3) trainings (global with branchId) -> branches/{branchId}/trainings
    async function migrateTrainings() {
      const src = db.collection('trainings');
      const snap = await src.get();
      console.log(`[trainings] total: ${snap.size}`);
      for (const doc of snap.docs) {
        const data = doc.data();
        const branchId = data.branchId || DEFAULT_BRANCH;
        const destRef = db.collection('branches').doc(branchId).collection('trainings').doc(doc.id);
        const destSnap = await destRef.get();
        if (!destSnap.exists) {
          await destRef.set(data, { merge: true });
        }
      }
    }

    // 4) supportCourses or support_lessons (global with branchId) -> branches/{branchId}/support_courses
    async function migrateSupportCourses() {
      const candidates = ['supportCourses', 'support_lessons'];
      for (const coll of candidates) {
        const src = db.collection(coll);
        const snap = await src.get().catch(() => null);
        if (!snap) continue;
        console.log(`[${coll}] total: ${snap.size}`);
        for (const doc of snap.docs) {
          const data = doc.data();
          const branchId = data.branchId || DEFAULT_BRANCH;
          const destRef = db.collection('branches').doc(branchId).collection('support_courses').doc(doc.id);
          const destSnap = await destRef.get();
          if (!destSnap.exists) {
            await destRef.set(data, { merge: true });
          }
        }
      }
    }

    // 5) trainer_requests / trainingRequests (global with branchId) -> branches/{branchId}/training_requests
    async function migrateTrainingRequests() {
      const candidates = ['trainingRequests', 'trainer_requests'];
      for (const coll of candidates) {
        const src = db.collection(coll);
        const snap = await src.get().catch(() => null);
        if (!snap) continue;
        console.log(`[${coll}] total: ${snap.size}`);
        for (const doc of snap.docs) {
          const data = doc.data();
          const branchId = data.branchId || DEFAULT_BRANCH;
          const destRef = db.collection('branches').doc(branchId).collection('training_requests').doc(doc.id);
          const destSnap = await destRef.get();
          if (!destSnap.exists) {
            await destRef.set(data, { merge: true });
          }
        }
      }
    }

    // 6) signups (global with branchId) -> branches/{branchId}/signups
    async function migrateSignups() {
      const src = db.collection('signups');
      const snap = await src.get().catch(() => null);
      if (!snap) { console.log('[signups] none'); return; }
      console.log(`[signups] total: ${snap.size}`);
      for (const doc of snap.docs) {
        const data = doc.data();
        const branchId = data.branchId || DEFAULT_BRANCH;
        const destRef = db.collection('branches').doc(branchId).collection('signups').doc(doc.id);
        const destSnap = await destRef.get();
        if (!destSnap.exists) {
          await destRef.set(data, { merge: true });
        }
      }
    }

    // 7) studentSubjects/payments (global with branchId) -> branches/{branchId}/studentSubjects|payments
    async function migrateByBranchId(collName) {
      const src = db.collection(collName);
      const snap = await src.get().catch(() => null);
      if (!snap) { console.log(`[${collName}] none`); return; }
      console.log(`[${collName}] total: ${snap.size}`);
      for (const doc of snap.docs) {
        const data = doc.data();
        const branchId = data.branchId || DEFAULT_BRANCH;
        const destRef = db.collection('branches').doc(branchId).collection(collName).doc(doc.id);
        const destSnap = await destRef.get();
        if (!destSnap.exists) {
          await destRef.set(data, { merge: true });
        }
      }
    }

    // Run
    for (const b of branches) {
      await ensureBranchDoc(b);
      await migrateUsersForBranch(b);
    }
    await migrateLanguages();
    await migrateTrainings();
    await migrateSupportCourses();
    await migrateTrainingRequests();
    await migrateSignups();
    await migrateByBranchId('studentSubjects');
    await migrateByBranchId('payments');

    console.log('Migration completed. Review logs and verify data.');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
