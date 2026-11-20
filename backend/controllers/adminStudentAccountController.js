/**
 * adminStudentAccountController.js
 * --------------------------------
 * POST /api/admin/students/:userId/credentials
 *
 * The recovery path for admin-created student logins:
 *   • a student imported WITHOUT an email  → body { email } creates the account;
 *   • an account creation that FAILED      → retried with the SAME uid (no
 *     duplicate record, no second account);
 *   • temporary credentials that were lost → a NEW temporary password, allowed
 *     only while the student still has the admin-issued one (mustChangePassword).
 *
 * The temporary password is returned ONCE in this response (Cache-Control:
 * no-store). It is never stored in Firestore and never logged; the audit entry
 * records only that credentials were issued, to which email, by whom.
 *
 * Branch isolation: requireAdmin pins req.adminBranchId; the student must live in
 * that branch (404/403 otherwise).
 */

const { writeAudit } = require('../services/auditService');
const { issueStudentCredentials } = require('../services/studentProvisioning');

const issueCredentials = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId;
    const { userId } = req.params;
    if (!branchId) return res.status(403).json({ code: 'permission-denied', message: 'Admin access required.' });
    if (!userId)   return res.status(400).json({ code: 'invalid-argument', message: 'userId is required.' });

    const out = await issueStudentCredentials({ branchId, userId, email: req.body?.email });

    await writeAudit({
      branchId,
      actor: { uid: req.user.uid, email: req.user?.email || '', role: 'admin' },
      action: 'student.credentials',
      targetType: 'user',
      targetId: userId,
      after: { action: out.action, email: out.email },
    });

    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    return res.status(out.action === 'created' ? 201 : 200).json({
      action: out.action,
      uid: out.uid,
      name: out.name,
      email: out.email,
      temporaryPassword: out.temporaryPassword,
    });
  } catch (err) {
    if (err.isCredentialsError) return res.status(err.status).json({ code: err.code, message: err.message });
    next(err);
  }
};

module.exports = { issueCredentials };
