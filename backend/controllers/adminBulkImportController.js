/**
 * adminBulkImportController.js
 * ----------------------------
 * POST /api/admin/bulk-import-students — create many students at once from an
 * uploaded CSV/Excel (parsed client-side into rows).
 *
 * Guarantees:
 *   • Same creation rules as manual add — every row goes through the shared
 *     provisionStudent() service (identical schema, pre-verified profile).
 *   • Branch isolation — all rows are created in the caller's own branch
 *     (req.adminBranchId); a per-row branch that differs is rejected for that row.
 *   • Duplicate prevention — by email AND phone, both within the uploaded batch
 *     and against existing branch students (plus Auth-level email uniqueness).
 *   • Partial success — each row is independent; the response reports created /
 *     skipped (duplicate) / error with a reason per row.
 *   • Audit trail — every created student writes a `student.create` audit entry
 *     tagged `via: 'bulk-import'`.
 *   • dryRun — validate + detect duplicates and return the same per-row report
 *     WITHOUT creating anything (powers the preview step).
 */

const crypto = require('crypto');
const { db } = require('../config/firebase');
const { writeAudit, resolveActor } = require('../services/auditService');
const { provisionStudent, VALID_BRANCHES } = require('../services/studentProvisioning');
const { MAX_ROWS, cleanPhone, normalizeRow, duplicateReason } = require('../services/bulkImportValidation');

const genPassword = () => crypto.randomBytes(6).toString('hex'); // 12 hex chars, ≥6

const bulkImportStudents = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId;
    if (!branchId || !VALID_BRANCHES.includes(branchId)) {
      return res.status(403).json({ code: 'permission-denied', message: 'Admin access required.' });
    }

    const rows = Array.isArray(req.body?.students) ? req.body.students : null;
    const dryRun = req.body?.dryRun === true;
    if (!rows || rows.length === 0) {
      return res.status(400).json({ code: 'invalid-argument', message: 'students array is required.' });
    }
    if (rows.length > MAX_ROWS) {
      return res.status(400).json({ code: 'too-many', message: `الحد الأقصى ${MAX_ROWS} صفاً في الدفعة الواحدة.` });
    }

    // Existing students in this branch → email/phone dedup sets.
    const usersSnap = await db.collection('branches').doc(branchId).collection('users').get();
    const existingEmails = new Set();
    const existingPhones = new Set();
    usersSnap.docs.forEach((d) => {
      const u = d.data() || {};
      if (u.email) existingEmails.add(String(u.email).trim().toLowerCase());
      const p = cleanPhone(u.studentPhone || u.phone || u.phoneNumber);
      if (p) existingPhones.add(p);
    });

    const callerActor = await resolveActor(req.user.uid);

    const seenEmails = new Set();
    const seenPhones = new Set();
    const results = [];
    let created = 0, skipped = 0, failed = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const { candidate, error } = normalizeRow(rows[i], branchId);
      if (error) {
        failed += 1;
        results.push({ index: i, email: rows[i]?.email || '', status: 'error', reason: error });
        continue;
      }
      const { fullName, email, phone, school } = candidate;

      // Duplicate detection: within the batch, then against existing students.
      const dupReason = duplicateReason({ email, phone }, { seenEmails, seenPhones, existingEmails, existingPhones });
      if (dupReason) {
        skipped += 1;
        results.push({ index: i, email, status: 'skipped', reason: dupReason });
        continue;
      }

      seenEmails.add(email);
      if (phone) seenPhones.add(phone);

      if (dryRun) {
        created += 1; // "would create"
        results.push({ index: i, email, status: 'ready', name: fullName });
        continue;
      }

      // Create through the shared provisioning service (same rules as manual add).
      try {
        const provisioned = await provisionStudent({
          branchId, fullName, email, phone, school, password: genPassword(), callerActor,
        });
        created += 1;
        existingEmails.add(email);
        if (phone) existingPhones.add(phone);
        results.push({ index: i, email, status: 'created', uid: provisioned.uid, name: fullName });

        await writeAudit({
          branchId,
          actor: { uid: req.user.uid, email: req.user?.email || '', role: 'admin' },
          action: 'student.create',
          targetType: 'user',
          targetId: provisioned.uid,
          after: { name: fullName, email, branchId, school, via: 'bulk-import' },
        }).catch((e) => console.warn('[bulk-import] audit failed:', e.message));
      } catch (err) {
        if (err.code === 'auth/email-already-exists') {
          skipped += 1;
          results.push({ index: i, email, status: 'skipped', reason: 'البريد مسجل مسبقاً' });
        } else {
          failed += 1;
          console.error('[bulk-import] row failed:', err.message);
          results.push({ index: i, email, status: 'error', reason: 'فشل إنشاء الحساب' });
        }
      }
    }

    return res.json({
      branchId,
      dryRun,
      summary: { total: rows.length, created, skipped, failed },
      results,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { bulkImportStudents };
