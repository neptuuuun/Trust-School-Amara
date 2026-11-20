/**
 * adminBulkImportController.js
 * ----------------------------
 * POST /api/admin/bulk-import-students — create many students at once from an
 * uploaded Excel/CSV (parsed client-side into rows keyed by canonical field).
 *
 * A bulk-imported student is a full alternative to individual registration:
 *   • Same profile schema  — every row is built by buildStudentProfile(), the
 *     builder individual registration uses (studentProfile.js).
 *   • Same field rules     — parsed by studentFields.js, shared with create-student.
 *   • Academic year + level saved on the profile, whatever the fee status.
 *   • Annual fee «مدفوع»   — recorded through recordAnnualFeeForStudent(), the
 *     exact service behind the Annual Fees page (owner-configured amount, ledger,
 *     audit, duplicate guard). «غير مدفوع» writes no payment record at all.
 *   • Login accounts       — created automatically for every row (email and phone
 *     are required columns), each with its own crypto-random temporary password
 *     (studentProvisioning.js).
 *
 * Guarantees:
 *   • Branch isolation — every row is created in req.adminBranchId; a per-row
 *     branch that differs is rejected for that row.
 *   • Duplicate prevention — by email AND phone, within the file, against branch
 *     students, and against existing Firebase Auth accounts. Re-importing the
 *     same file therefore skips everyone already created (safe retries).
 *   • Partial success — rows are independent; every row reports its own outcome,
 *     and account / annual-fee failures are reported separately from the record.
 *   • Credentials — returned ONLY in this response (Cache-Control: no-store),
 *     never stored in Firestore, never logged, never retrievable again.
 *   • dryRun — same validation + duplicate decisions, nothing written (preview).
 *   • One import at a time per branch (in-process lock) — a double-submitted
 *     chunk cannot race itself into duplicate students.
 */

const { db, auth } = require('../config/firebase');
const { writeAudit, resolveActor } = require('../services/auditService');
const { provisionImportedStudent, VALID_BRANCHES } = require('../services/studentProvisioning');
const { recordAnnualFeeForStudent } = require('../services/annualFeeService');
const { createPasswordGenerator } = require('../services/temporaryPassword');
const {
  MAX_ROWS, phoneKey, buildContext, resolveDefaultAcademicYear, normalizeRow, duplicateReason, paymentInstant,
} = require('../services/bulkImportValidation');

const CONCURRENCY = 4;
const AUTH_LOOKUP_CHUNK = 100; // auth.getUsers() limit
const branchLocks = new Set();

/** Emails that already own a Firebase Auth account (batched, best-effort). */
async function lookupAuthEmails(emails) {
  const found = new Set();
  const list = [...new Set(emails.filter(Boolean))];
  for (let i = 0; i < list.length; i += AUTH_LOOKUP_CHUNK) {
    const slice = list.slice(i, i + AUTH_LOOKUP_CHUNK);
    try {
      const res = await auth.getUsers(slice.map((email) => ({ email })));
      (res.users || []).forEach((u) => { if (u.email) found.add(String(u.email).toLowerCase()); });
    } catch (e) {
      // Not fatal: createUser's own uniqueness check still protects the commit.
      console.warn('[bulk-import] auth lookup failed:', e.code || e.message);
    }
  }
  return found;
}

/** Run `worker` over `items` with at most `limit` in flight; results keep order. */
async function mapWithConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next; next += 1;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return out;
}

const previewOf = (c) => ({
  school: c.school,
  birthDate: c.birthDate,
  birthPlace: c.birthPlace,
  address: c.address,
  academicYear: c.academicYear,
  studyYear: c.studyYear,
  studyYearLabel: c.studyYearLabel,
  schoolLevel: c.schoolLevel,
  distinguishedSubjectsAverage: c.distinguishedSubjectsAverage,
  supportClassification: c.supportClassification,
  annualFeeStatus: c.annualFee.status,
  annualFeeDefaulted: c.annualFee.defaulted,
  annualFeePaidAt: c.annualFee.paidAt,
  accountEligible: c.accountEligible,
});

const bulkImportStudents = async (req, res, next) => {
  const branchId = req.adminBranchId;
  let locked = false;
  try {
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

    const now = new Date();
    const defaultYear = resolveDefaultAcademicYear(req.body?.defaultAcademicYear, now);
    if (defaultYear.error) {
      return res.status(400).json({ code: 'invalid-academic-year', message: defaultYear.error });
    }
    const ctx = buildContext({ now, defaultAcademicYear: defaultYear.value });

    if (!dryRun) {
      if (branchLocks.has(branchId)) {
        return res.status(409).json({ code: 'import-in-progress', message: 'يوجد استيراد قيد التنفيذ لهذا الفرع. انتظر حتى ينتهي.' });
      }
      branchLocks.add(branchId);
      locked = true;
    }

    // Existing students in this branch → email/phone dedup sets.
    const usersSnap = await db.collection('branches').doc(branchId).collection('users').get();
    const existingEmails = new Set();
    const existingPhones = new Set();
    usersSnap.docs.forEach((d) => {
      const u = d.data() || {};
      if (u.email) existingEmails.add(String(u.email).trim().toLowerCase());
      [u.studentPhone, u.phone, u.phoneNumber].forEach((p) => {
        const k = phoneKey(p);
        if (k) existingPhones.add(k);
      });
    });

    // 1) Validate every row.
    const normalized = rows.map((raw, i) => ({
      index: i,
      row: Number(raw?.__row) || i + 2, // spreadsheet line (header = 1)
      raw: raw || {},
      ...normalizeRow(raw || {}, branchId, ctx),
    }));

    // 2) Existing login accounts (one batched lookup for the whole request).
    const authEmails = await lookupAuthEmails(
      normalized.filter((n) => n.candidate && n.candidate.email).map((n) => n.candidate.email),
    );

    // 3) Duplicate decisions, in file order (first occurrence wins).
    const seenEmails = new Set();
    const seenPhones = new Set();
    const results = normalized.map((n) => {
      const base = {
        index: n.index,
        row: n.row,
        name: n.candidate?.fullName || String(n.raw.fullName || n.raw.name || '').trim(),
        email: n.candidate?.email || String(n.raw.email || '').trim(),
        phone: n.candidate?.phone || String(n.raw.phone || '').trim(),
        warnings: n.warnings || [],
      };
      if (n.error) return { ...base, status: 'error', reason: n.error, errors: n.errors };
      const c = n.candidate;
      const dup = duplicateReason({ email: c.email, phone: c.phone }, { seenEmails, seenPhones, existingEmails, existingPhones, authEmails });
      if (dup) return { ...base, status: 'skipped', reason: dup, preview: previewOf(c) };
      if (c.email) seenEmails.add(c.email);
      if (c.phoneKey) seenPhones.add(c.phoneKey);
      return { ...base, status: 'ready', preview: previewOf(c), _candidate: c };
    });

    const summary = {
      total: rows.length,
      imported: 0,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'error').length,
      accountsCreated: 0,
      accountsFailed: 0,
      withoutEmail: 0,
      feePaid: 0,
      feeUnpaid: 0,
      feeFailed: 0,
      withWarnings: results.filter((r) => r.warnings.length > 0).length,
    };

    const ready = results.filter((r) => r.status === 'ready');

    if (dryRun) {
      ready.forEach((r) => {
        summary.imported += 1;
        if (r._candidate.email) summary.accountsCreated += 1; else summary.withoutEmail += 1;
        if (r._candidate.annualFee.status === 'paid') summary.feePaid += 1; else summary.feeUnpaid += 1;
      });
      results.forEach((r) => { delete r._candidate; });
      res.set('Cache-Control', 'no-store');
      return res.json({ branchId, dryRun: true, academicYear: ctx.defaultAcademicYear, summary, results });
    }

    // 4) Commit — every ready row independently.
    const callerActor = await resolveActor(req.user.uid);
    const actor = { uid: req.user.uid, email: req.user?.email || '', role: 'admin' };
    const generatePassword = createPasswordGenerator();
    const credentials = [];

    await mapWithConcurrency(ready, CONCURRENCY, async (r) => {
      const c = r._candidate;
      let provisioned;
      try {
        provisioned = await provisionImportedStudent({ branchId, candidate: c, callerActor, generatePassword });
      } catch (err) {
        r.status = 'error';
        r.reason = 'تعذّر حفظ سجل الطالب';
        console.error('[bulk-import] record write failed (row %d): %s', r.row, err.code || err.message);
        return;
      }

      r.status = 'created';
      r.uid = provisioned.uid;
      r.registrationNumber = provisioned.registrationNumber;
      r.account = {
        status: provisioned.account.status,
        ...(provisioned.account.code ? { code: provisioned.account.code, reason: provisioned.account.reason } : {}),
      };
      if (provisioned.password) {
        credentials.push({
          index: r.index, row: r.row, uid: provisioned.uid,
          name: c.fullName, email: c.email, temporaryPassword: provisioned.password,
        });
      }

      await writeAudit({
        branchId, actor,
        action: 'student.create', targetType: 'user', targetId: provisioned.uid,
        after: {
          name: c.fullName, email: c.email, branchId, school: c.school,
          studyYear: c.studyYear, academicYear: c.academicYear,
          authAccountStatus: provisioned.account.status, via: 'bulk-import',
        },
      }).catch((e) => console.warn('[bulk-import] audit failed:', e.message));

      // Annual fee — only «مدفوع» writes anything, through the shared service.
      if (c.annualFee.status === 'paid') {
        try {
          const fee = await recordAnnualFeeForStudent({
            branchId,
            userId: provisioned.uid,
            studyYear: c.studyYear,
            paidAt: paymentInstant(c.annualFee.paidAt, now),
            notes: 'تم تسجيل الرسوم السنوية عند الاستيراد بالجملة',
            actor,
            via: 'bulk-import',
          });
          r.annualFee = { status: 'paid', paymentId: fee.paymentId, amount: fee.amount, academicYear: fee.academicYear };
        } catch (err) {
          r.annualFee = {
            status: 'failed',
            code: err.code || 'internal',
            reason: err.isAnnualFeeError ? err.message : 'تعذّر تسجيل الرسوم السنوية — سجّلها من صفحة الرسوم السنوية',
          };
        }
      } else {
        r.annualFee = { status: 'unpaid' };
      }
    });

    results.forEach((r) => {
      delete r._candidate;
      if (r.status !== 'created') return;
      summary.imported += 1;
      if (r.account.status === 'active') summary.accountsCreated += 1;
      else if (r.account.status === 'failed') summary.accountsFailed += 1;
      else summary.withoutEmail += 1;
      if (r.annualFee.status === 'paid') summary.feePaid += 1;
      else if (r.annualFee.status === 'failed') summary.feeFailed += 1;
      else summary.feeUnpaid += 1;
    });
    summary.failed = results.filter((r) => r.status === 'error').length;

    credentials.sort((a, b) => a.index - b.index);
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    return res.json({ branchId, dryRun: false, academicYear: ctx.defaultAcademicYear, summary, results, credentials });
  } catch (err) {
    next(err);
  } finally {
    if (locked) branchLocks.delete(branchId);
  }
};

module.exports = { bulkImportStudents, _test: { mapWithConcurrency } };
