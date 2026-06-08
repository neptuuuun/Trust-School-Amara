const { db, admin } = require('../config/firebase');

async function createNotification(target, title, body, extra = {}) {
  return db.collection('notifications').add({
    target,
    title,
    body,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sent: false,
    ...extra,
  });
}

async function getBranchAdminUserIds(branchId) {
  const snap = await db
    .collection('branches')
    .doc(branchId)
    .collection('users')
    .where('role', '==', 'admin')
    .get();
  return snap.docs.map((d) => d.id);
}

module.exports = { createNotification, getBranchAdminUserIds };
