const { db, admin } = require('../config/firebase');

const BRANCHES = ['boumerdes', 'bordj_menaiel'];

const THRESHOLDS = {
  INACTIVE_MONTHS: 6,
  ARCHIVED_MONTHS: 12,
  DELETED_MONTHS:  36,
};

function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function calculateStatus(lastActivity) {
  const d = toDate(lastActivity);
  if (!d) return 'active';

  const months = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);

  if (months >= THRESHOLDS.DELETED_MONTHS)  return 'deleted';
  if (months >= THRESHOLDS.ARCHIVED_MONTHS) return 'archived';
  if (months >= THRESHOLDS.INACTIVE_MONTHS) return 'inactive';
  return 'active';
}

async function updateStatus(userId, branchId, status, extra = {}) {
  const ref = db.collection('branches').doc(branchId).collection('users').doc(userId);
  const update = {
    lifecycleStatus: status,
    lifecycleStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  };
  if (status === 'inactive') update.inactivatedAt = admin.firestore.FieldValue.serverTimestamp();
  if (status === 'archived') update.archivedAt    = admin.firestore.FieldValue.serverTimestamp();
  if (status === 'deleted')  update.deletedAt     = admin.firestore.FieldValue.serverTimestamp();
  await ref.update(update);
}

async function anonymizeUser(userId, branchId, user) {
  const ref = db.collection('branches').doc(branchId).collection('users').doc(userId);

  // Archive stats before anonymising
  await db.collection('userArchive').doc(userId).set({
    originalUserId:  userId,
    originalBranchId: branchId,
    registrationDate: user.createdAt || null,
    deletionDate: admin.firestore.FieldValue.serverTimestamp(),
    statusHistory: {
      verified:        user.verified        || false,
      paymentVerified: user.paymentVerified || false,
      lifecycleStatus: user.lifecycleStatus,
    },
  }, { merge: true });

  await ref.set({
    uid:              userId,
    branchId,
    lifecycleStatus:  'deleted',
    deletedAt:        admin.firestore.FieldValue.serverTimestamp(),
    anonymized:       true,
    anonymizedAt:     admin.firestore.FieldValue.serverTimestamp(),
    // wipe personal fields
    fullName:         null,
    email:            null,
    phone:            null,
    phoneNumber:      null,
    address:          null,
    birthDate:        null,
    birthPlace:       null,
    photoUrl:         null,
    idCardUrl:        null,
    registrationNumber: null,
    // preserve stats
    role:             user.role             || null,
    verified:         user.verified         || false,
    accountVerified:  user.accountVerified  || false,
    paymentVerified:  user.paymentVerified  || false,
    createdAt:        user.createdAt        || null,
  }, { merge: true });
}

async function processLifecycle(dryRun = false) {
  console.log(`[lifecycle] starting (${dryRun ? 'dry-run' : 'live'})`);
  const results = { processed: 0, inactive: 0, archived: 0, deleted: 0, errors: [] };

  for (const branchId of BRANCHES) {
    try {
      const snap = await db.collection('branches').doc(branchId).collection('users').get();

      for (const d of snap.docs) {
        const user    = { id: d.id, branchId, ...d.data() };
        const current = user.lifecycleStatus || 'active';

        if (current === 'deleted') continue;

        const lastActivity = user.lastActivityAt || user.createdAt;
        const next = calculateStatus(lastActivity);

        if (next === current) continue;

        results.processed++;
        if (results[next] !== undefined) results[next]++;

        if (!dryRun) {
          try {
            await updateStatus(user.id, branchId, next, {
              previousStatus: current,
              automaticTransition: true,
            });
            if (next === 'deleted') await anonymizeUser(user.id, branchId, user);
          } catch (err) {
            results.errors.push({ userId: user.id, branchId, error: err.message });
          }
        } else {
          console.log(`[lifecycle] dry-run: ${user.id} ${current} → ${next}`);
        }
      }
    } catch (err) {
      results.errors.push({ branchId, error: err.message });
    }
  }

  console.log('[lifecycle] done', results);
  return results;
}

module.exports = { processLifecycle, calculateStatus };
