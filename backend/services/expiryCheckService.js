const { db, admin } = require('../config/firebase');
const { createNotification } = require('./notificationService');

async function runDailyExpiryCheck() {
  const now   = admin.firestore.Timestamp.now();
  const soon  = admin.firestore.Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000);

  try {
    const branchesSnap = await db.collection('branches').get();
    const tasks = [];

    for (const b of branchesSnap.docs) {
      const branchId = b.id;
      const subjectsSnap = await db
        .collection('branches')
        .doc(branchId)
        .collection('studentSubjects')
        .where('expiresAt', '>=', now)
        .where('expiresAt', '<=', soon)
        .get();

      subjectsSnap.forEach((docSnap) => {
        const s = docSnap.data();
        const title = 'تذكير: اشتراكك ينتهي قريباً';
        const body  = `${s.subjectName || 'المادة'} (${s.month || ''}) سينتهي خلال 7 أيام.`;
        tasks.push(
          createNotification(s.studentId, title, body, { subjectId: docSnap.id, branchId })
        );
      });
    }

    await Promise.all(tasks);
    console.log(`[expiryCheck] Sent ${tasks.length} expiry notifications`);
    return { notified: tasks.length };
  } catch (err) {
    console.error('[expiryCheck] error:', err.message);
    throw err;
  }
}

module.exports = { runDailyExpiryCheck };
