const { db, admin } = require('../config/firebase');
const { sendEmail, templates } = require('../services/emailService');
const { createNotification, getBranchAdminUserIds } = require('../services/notificationService');

// ── POST /api/notify/user-decision ────────────────────────────────────────────
// Body: { userId, branchId, approved, studentName, studentEmail }
// Called fire-and-forget from UsersPage after updateUser() succeeds.
async function userDecision(req, res) {
  const { userId, branchId, approved, studentName, studentEmail } = req.body || {};

  if (!userId || !branchId) {
    return res.status(400).json({ code: 'invalid-argument', message: 'userId and branchId are required.' });
  }

  res.status(202).json({ queued: true });

  // ── Run side effects after responding ──────────────────────────────────────
  try {
    const name  = studentName  || 'الطالب';
    const email = studentEmail || null;

    if (approved) {
      // In-app notification to student
      await createNotification(userId, 'تم قبول حسابك', 'تهانينا! تم التحقق من حسابك ويمكنك الآن الوصول إلى الدورات.', { branchId });

      // Email to student
      if (email) {
        const { subject, html, text } = templates.accountApproved(name);
        await sendEmail(email, subject, html, text, { refId: `acct-approved:${userId}` });
      }

      // Notify branch admins (so other admins are aware)
      // Intentionally not sending notifications to admins for their own action.
    } else {
      // In-app notification to student
      await createNotification(userId, 'تحديث حول طلبك', 'نأسف، لم يتم قبول طلب التسجيل في هذا الوقت. يرجى التواصل معنا.', { branchId });

      // Email to student
      if (email) {
        const { subject, html, text } = templates.accountRejected(name);
        await sendEmail(email, subject, html, text, { refId: `acct-rejected:${userId}` });
      }
    }
  } catch (err) {
    console.error('[notify/user-decision] side-effect error:', err.message);
  }
}

// ── POST /api/notify/payment-event ───────────────────────────────────────────
// Body: { type, approved, studentId, studentName, studentEmail, courseName, branchId, paymentId }
// Called fire-and-forget from PaymentsVerification after verify/reject succeeds.
async function paymentEvent(req, res) {
  const {
    type, approved,
    studentId, studentName, studentEmail,
    courseName, branchId, paymentId,
  } = req.body || {};

  if (!studentId) {
    return res.status(400).json({ code: 'invalid-argument', message: 'studentId is required.' });
  }

  res.status(202).json({ queued: true });

  // ── Run side effects after responding ──────────────────────────────────────
  try {
    const name   = studentName  || 'الطالب';
    const email  = studentEmail || null;
    const course = courseName   || 'الدورة';

    if (approved) {
      const title = 'تم قبول طلبك';
      const body  = `تمت الموافقة على تسجيلك في ${course}.`;
      await createNotification(studentId, title, body, { branchId, paymentId, paymentType: type });

      if (email) {
        const { subject, html, text } = templates.courseApproved(name, course);
        await sendEmail(email, subject, html, text, { refId: `course-approved:${paymentId || studentId}` });
      }
    } else {
      const title = 'تحديث حول طلبك';
      const body  = `نأسف، لم يتم قبول طلب التسجيل في ${course}.`;
      await createNotification(studentId, title, body, { branchId, paymentId, paymentType: type });

      if (email && (type === 'language' || type === 'training')) {
        const { subject, html, text } = templates.courseRejected(name, course);
        await sendEmail(email, subject, html, text, { refId: `course-rejected:${paymentId || studentId}` });
      }
    }
  } catch (err) {
    console.error('[notify/payment-event] side-effect error:', err.message);
  }
}

// ── POST /api/notify/read ────────────────────────────────────────────────────
// Body: { notificationId }. Marks a single notification as read for the caller.
// Notifications are `write: if false` in Firestore rules, so read-tracking is
// server-only (Admin SDK). A `readBy` array records which users have read a doc,
// which correctly handles broadcast (`target: 'all'`) notifications too.
async function markRead(req, res) {
  const uid = req.user?.uid;
  const { notificationId } = req.body || {};

  if (!uid) {
    return res.status(401).json({ code: 'unauthenticated', message: 'Authentication required.' });
  }
  if (!notificationId) {
    return res.status(400).json({ code: 'invalid-argument', message: 'notificationId is required.' });
  }

  try {
    const ref = db.collection('notifications').doc(notificationId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ code: 'not-found', message: 'Notification not found.' });
    }
    const data = snap.data() || {};
    // A user can only mark their own (or broadcast) notifications.
    if (data.target !== 'all' && data.target !== uid) {
      return res.status(403).json({ code: 'permission-denied', message: 'Not your notification.' });
    }
    await ref.update({ readBy: admin.firestore.FieldValue.arrayUnion(uid) });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[notify/read] error:', err.message);
    return res.status(500).json({ code: 'internal', message: 'Failed to mark notification as read.' });
  }
}

// ── POST /api/notify/read-all ────────────────────────────────────────────────
// Marks every notification addressed to the caller (their uid + broadcasts) as
// read. Chunked into batched writes to stay under Firestore's 500-op batch cap.
async function markAllRead(req, res) {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(401).json({ code: 'unauthenticated', message: 'Authentication required.' });
  }

  try {
    const [mine, all] = await Promise.all([
      db.collection('notifications').where('target', '==', uid).get(),
      db.collection('notifications').where('target', '==', 'all').get(),
    ]);
    const unread = [...mine.docs, ...all.docs].filter((d) => {
      const readBy = d.data()?.readBy;
      return !Array.isArray(readBy) || !readBy.includes(uid);
    });

    for (let i = 0; i < unread.length; i += 400) {
      const batch = db.batch();
      unread.slice(i, i + 400).forEach((d) =>
        batch.update(d.ref, { readBy: admin.firestore.FieldValue.arrayUnion(uid) })
      );
      await batch.commit();
    }
    return res.json({ ok: true, count: unread.length });
  } catch (err) {
    console.error('[notify/read-all] error:', err.message);
    return res.status(500).json({ code: 'internal', message: 'Failed to mark notifications as read.' });
  }
}

module.exports = { userDecision, paymentEvent, markRead, markAllRead };
