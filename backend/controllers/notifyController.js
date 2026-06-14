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

module.exports = { userDecision, paymentEvent };
