const { admin, db, auth } = require('../config/firebase');
const ledger = require('../services/ledgerService');
const { writeAudit, resolveActor } = require('../services/auditService');
const academicYear = require('../services/academicYear');
const supportEligibility = require('../services/supportEligibility');
const { isValidSchool } = require('../constants');
// Support seats are recounted live (verified AND not expired) — reuse the single
// implementation instead of duplicating the expiry rule here.
const { recomputeSupportClassEnrollment } = require('./registrationController');
const { deleteUserFiles } = require('../services/supabaseStorage');
const { provisionStudent } = require('../services/studentProvisioning');
const { recordAnnualFeeForStudent } = require('../services/annualFeeService');
const fields = require('../services/studentFields');

const VALID_BRANCHES = ['boumerdes', 'bordj_menaiel'];

const BRANCH_NAMES = {
  boumerdes:     'بومرداس',
  bordj_menaiel: 'برج منايل',
};

/**
 * POST /api/admin/create-student
 *
 * Creates a Firebase Auth user and a pre-verified Firestore student profile.
 * Only reachable by admins (verifyToken + requireAdmin middleware).
 *
 * Body: { branchId, fullName, email, phone?, school, password, adminUid?,
 *         birthDate?, birthPlace?, address?, studyYear? }
 * The optional profile/academic fields are validated by the SAME parsers the
 * bulk importer uses (services/studentFields.js), so both paths accept and store
 * identical values. The educational level is saved on the profile at creation —
 * whether or not the annual fee is paid — so no later workflow asks for it again.
 * Response 201: { userId, academicYear, studyYear }
 */
const createStudent = async (req, res, next) => {
  try {
    const { branchId, fullName, email, phone, school, password, adminUid } = req.body;

    // --- Input validation -----------------------------------------------
    if (!branchId)
      return res.status(400).json({ code: 'invalid-argument', message: 'branchId is required.' });
    if (!VALID_BRANCHES.includes(branchId))
      return res.status(400).json({
        code: 'invalid-argument',
        message: `Invalid branchId. Must be one of: ${VALID_BRANCHES.join(', ')}`,
      });
    if (!fullName?.trim())
      return res.status(400).json({ code: 'invalid-argument', message: 'fullName is required.' });
    if (!email?.trim())
      return res.status(400).json({ code: 'invalid-argument', message: 'email is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return res.status(400).json({ code: 'invalid-argument', message: 'Invalid email format.' });
    // Educational institution / school is REQUIRED on every person record.
    // Admins must pass an explicit value («حر» for unaffiliated students).
    if (!isValidSchool(school))
      return res.status(400).json({ code: 'invalid-argument', message: 'school is required.' });
    if (!password || password.length < 6)
      return res.status(400).json({
        code: 'invalid-argument',
        message: 'password must be at least 6 characters.',
      });

    // Optional profile + academic fields — shared validators (see studentFields.js).
    const phoneR      = fields.parsePhone(phone);
    const birthDateR  = fields.parseBirthDate(req.body.birthDate);
    const birthPlaceR = fields.parseOptionalText(req.body.birthPlace, { max: 120, label: 'مكان الازدياد' });
    const addressR    = fields.parseOptionalText(req.body.address, { max: 250, label: 'العنوان' });
    const levelR      = fields.parseLevel(req.body.studyYear);
    const fieldError  = [phoneR, birthDateR, birthPlaceR, addressR, levelR].find((r) => r.error);
    if (fieldError)
      return res.status(400).json({ code: 'invalid-argument', message: fieldError.error });

    const callerUid = adminUid || req.user.uid;
    // Canonical actor {uid,name,email,role} so the student's createdBy carries the
    // enrolling admin's real NAME (OwnershipBadge / "Registered by …").
    const callerActor = await resolveActor(callerUid);
    // A student registered now belongs to the current academic year.
    const currentYear = academicYear.getAcademicYearLabel();

    // Creation goes through the shared provisioning service — the SINGLE source of
    // truth for the student schema, reused by the bulk importer so imported and
    // manually created students are identical.
    let provisioned;
    try {
      provisioned = await provisionStudent({
        branchId, fullName, email, password, callerActor,
        profile: {
          phone:        phoneR.value,
          school,
          birthDate:    birthDateR.value,
          birthPlace:   birthPlaceR.value,
          address:      addressR.value,
          studyYear:    levelR.value,
          academicYear: currentYear,
        },
      });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        return res.status(409).json({
          code:    'already-exists',
          message: 'البريد الإلكتروني مستخدم بالفعل.',
        });
      }
      throw err;
    }

    const { uid, normalizedEmail, trimmedName, normalizedSchool } = provisioned;

    await writeAudit({
      branchId, actor: { uid: callerUid, email: req.user?.email || '', role: 'admin' },
      action: 'student.create', targetType: 'user', targetId: uid,
      after: {
        name: trimmedName, email: normalizedEmail, branchId, school: normalizedSchool,
        studyYear: levelR.value, academicYear: currentYear,
      },
    });

    return res.status(201).json({ userId: uid, academicYear: currentYear, studyYear: levelR.value });
  } catch (err) {
    next(err);
  }
};

// NOTE: POST /api/admin/verify-annual-payment and /reject-annual-payment used to
// live here. They belonged to the deleted receipt-upload workflow, where a student
// uploaded a payment proof and an admin approved or rejected it. Chargily writes
// annualPayments already-verified (chargilyController._createAnnualFeeReg) and the
// admin-side equivalent is recordAnnualFee below, so both handlers had been
// unreachable since the Payments Verification page was removed — while still
// offering an admin-authenticated way to flip a paid record into a state nothing
// else in the system produces.


// ── Record an annual fee payment (standalone, ANY student) ────────────────────
/**
 * POST /api/admin/record-annual-fee
 *
 * Records a verified annual fee payment for ANY existing student — self-registered
 * OR admin-created. The annual fee is a standalone financial record linked to a
 * student, NOT a side effect of account creation. The amount is sourced from the
 * owner-controlled config (config/finance) and SNAPSHOTTED onto the record (never
 * trusted from the client). Prevents duplicate payments for the same student +
 * academic year. Writes the ledger + audit so revenue/reporting stay correct.
 *
 * Body: { branchId, userId, studyYear?, paidAt?, notes? }
 * Response 201: { paymentId, amount, academicYear, studyYear }
 */
const recordAnnualFee = async (req, res, next) => {
  try {
    const { branchId, userId, studyYear, paidAt, notes } = req.body;

    if (!branchId)
      return res.status(400).json({ code: 'missing-branch', message: 'branchId is required.' });
    if (!VALID_BRANCHES.includes(branchId))
      return res.status(400).json({ code: 'invalid-argument', message: `Invalid branchId. Must be one of: ${VALID_BRANCHES.join(', ')}` });
    if (!userId)
      return res.status(400).json({ code: 'missing-user', message: 'userId is required.' });

    // The whole financial write lives in the shared service (also used by the bulk
    // importer) — see services/annualFeeService.js. Same rules, same records.
    const out = await recordAnnualFeeForStudent({
      branchId, userId, studyYear, paidAt, notes,
      actor: { uid: req.user.uid, email: req.user.email || '' },
    });
    return res.status(201).json(out);
  } catch (err) {
    if (err.isAnnualFeeError) return res.status(err.status).json({ code: err.code, message: err.message });
    next(err);
  }
};

// ── Delete student ────────────────────────────────────────────────────────────

/**
 * Cascade a student deletion across every record that keeps them "alive" in the
 * owner's analytics.
 *
 * Deleting only the user profile used to leave the student's registrations, their
 * class seats and their ledger revenue fully intact — so the owner dashboard kept
 * counting a deleted student as enrolled and as paying, and the state-based
 * alerts derived from that never changed.
 *
 * For each registration this: appends a ledger REVERSAL (history preserved, net
 * revenue drops), deletes the archive doc, and marks the class for a recount.
 *
 * @returns {Promise<{registrations:number, reversals:number, classes:string[]}>}
 */
async function cascadeStudentRecords(branchId, userId, actor) {
  const summary = { registrations: 0, reversals: 0, classes: [] };
  const touchedClasses = new Set();

  const reverseAndDelete = async (ref, sourceCollection, sourceDocId) => {
    try {
      await ledger.recordReversal(
        ledger.ledgerId(sourceCollection, branchId, sourceDocId),
        { recordedBy: actor, reason: 'student deleted' }
      );
      summary.reversals += 1;
    } catch (e) {
      console.error('[deleteStudent] reversal error:', sourceDocId, e.message);
    }
    await ref.delete();
    summary.registrations += 1;
  };

  // Language + training archives (branch-scoped, one doc per enrollment).
  for (const col of ['languagesRegistered', 'trainingsRegistered']) {
    try {
      const snap = await db.collection('branches').doc(branchId).collection(col)
        .where('userId', '==', userId).get();
      for (const d of snap.docs) {
        const x = d.data() || {};
        if (x.classId) touchedClasses.add(`${col}:${x.classId}`);
        await reverseAndDelete(d.ref, col, d.id);
      }
    } catch (e) { console.error(`[deleteStudent] ${col} cascade error:`, e.message); }
  }

  // Annual fee payments (branch-scoped).
  try {
    const snap = await db.collection('branches').doc(branchId).collection('annualPayments')
      .where('userId', '==', userId).get();
    for (const d of snap.docs) await reverseAndDelete(d.ref, 'annualPayments', d.id);
  } catch (e) { console.error('[deleteStudent] annualPayments cascade error:', e.message); }

  // Support subscriptions (TOP-LEVEL collection; ledger ids carry a per-cycle
  // `_YYYY-MM` suffix, so reverse every cycle this registration ever billed).
  const supportClasses = [];
  try {
    const snap = await db.collection('supportLessonRegistrations')
      .where('userId', '==', userId).get();
    for (const d of snap.docs) {
      const x = d.data() || {};
      if ((x.branchId || null) !== branchId) continue;
      const classId = x.classId || x.lessonId || null;
      if (classId) supportClasses.push(classId);

      const cycles = new Set([x.cycleMonthKey].filter(Boolean));
      (Array.isArray(x.billedCycles) ? x.billedCycles : []).forEach((c) => c && cycles.add(c));
      for (const cycle of cycles) {
        try {
          await ledger.recordReversal(
            ledger.ledgerId('supportLessonRegistrations', branchId, `${d.id}_${cycle}`),
            { recordedBy: actor, reason: 'student deleted' }
          );
          summary.reversals += 1;
        } catch (e) { console.error('[deleteStudent] support reversal error:', e.message); }
      }
      await d.ref.delete();
      summary.registrations += 1;
    }
  } catch (e) { console.error('[deleteStudent] support cascade error:', e.message); }

  // Recount every freed seat from the live archive (never a blind decrement).
  for (const marker of touchedClasses) {
    const [col, classId] = marker.split(':');
    try {
      const snap = await db.collection('branches').doc(branchId).collection(col)
        .where('classId', '==', classId).get();
      await db.collection('branches').doc(branchId).collection('classes').doc(classId)
        .update({ enrollmentCount: snap.size, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      summary.classes.push(classId);
    } catch (e) { console.warn('[deleteStudent] recount failed:', classId, e.message); }
  }
  for (const classId of new Set(supportClasses)) {
    await recomputeSupportClassEnrollment(branchId, classId);
    summary.classes.push(classId);
  }

  return summary;
}

/**
 * POST /api/admin/delete-student
 *
 * Permanently removes a student from Firebase Auth AND Firestore, and cascades
 * the deletion through their registrations, class seats and ledger revenue (see
 * cascadeStudentRecords) so the owner dashboard stops counting them.
 *
 * Returns the student's Supabase file URLs so the caller can clean up
 * storage client-side (best-effort; does not block the response).
 *
 * Body: { branchId, userId }
 * Response 200: { success: true, photoUrl, idCardUrl, cascade }
 */
const deleteStudent = async (req, res, next) => {
  const { branchId, userId } = req.body;

  try {
    if (!branchId)
      return res.status(400).json({ code: 'invalid-argument', message: 'branchId is required.' });
    if (!userId)
      return res.status(400).json({ code: 'invalid-argument', message: 'userId is required.' });

    const userRef  = db.collection('branches').doc(branchId).collection('users').doc(userId);
    const userSnap = await userRef.get();

    // If the Firestore doc is already gone, still attempt to remove the Auth account.
    if (!userSnap.exists) {
      await auth.deleteUser(userId).catch((e) => {
        if (e.code !== 'auth/user-not-found') throw e;
      });
      // Idempotent sweep: even with the profile already gone, remove any storage
      // objects still sitting at this user's deterministic paths.
      const storageCleanup = await deleteUserFiles(userId);
      return res.status(200).json({
        success: true, photoUrl: null, idCardUrl: null,
        storageCleaned: storageCleanup.configured && storageCleanup.ok,
      });
    }

    const userData      = userSnap.data() || {};
    const studentBranch = userData.branchId || userData.branch;

    // Ownership guard: the student must belong to the admin's branch.
    if (studentBranch && studentBranch !== branchId) {
      return res.status(403).json({
        code:    'permission-denied',
        message: 'Student does not belong to your branch.',
      });
    }

    // 1. Delete Firebase Auth account — this is the core of the fix.
    //    If the Auth user no longer exists (e.g., the student deleted their own
    //    account) we still proceed to clean up the Firestore document.
    await auth.deleteUser(userId).catch((e) => {
      if (e.code !== 'auth/user-not-found') throw e;
    });

    // 2. Cascade registrations + revenue BEFORE dropping the profile, so a
    //    mid-way failure leaves the profile behind as a recovery handle rather
    //    than orphaning the registrations that reference it.
    const actor = { uid: req.user?.uid || '', email: req.user?.email || '', role: 'admin' };
    const cascade = await cascadeStudentRecords(branchId, userId, actor);

    // 2.5. Delete the student's Supabase Storage media (ID card + photo) BEFORE
    //      dropping the profile, so their identity documents never outlive the
    //      record. Server-authoritative, idempotent, best-effort (never throws),
    //      and keyed on the deterministic per-user paths so a missing/null stored
    //      reference cannot leave an orphan.
    //
    //      Deletion is NOT aborted when this fails: revoking access + removing the
    //      record are the security-critical operations and must not be held hostage
    //      by a best-effort side-system (a failed photo delete leaves a RECOVERABLE
    //      orphan at a known deterministic path; a refused deletion leaves the
    //      account fully live). Instead, a failure is recorded durably in the
    //      immutable audit log below so the orphan is traceable and reclaimable by
    //      re-running this endpoint (the idempotent sweep above).
    const storageCleanup = await deleteUserFiles(userId, [
      userData.photoUrl,
      userData.idCardUrl,
      ...(Array.isArray(userData.uploadedDocs) ? userData.uploadedDocs : []),
    ]);
    const storageCleanupFailed = storageCleanup.configured && !storageCleanup.ok;

    // 3. Delete the Firestore profile.
    await userRef.delete();

    await writeAudit({
      branchId, actor,
      action: 'student.delete', targetType: 'user', targetId: userId,
      before: { name: userData.name || userData.fullName || null, email: userData.email || null },
      after: { cascade, storageCleanupFailed },
    });

    // Return file URLs so the frontend can run its best-effort fallback cleanup
    // (idempotent — a no-op once the server-side sweep above has removed them).
    return res.status(200).json({
      success:   true,
      photoUrl:  userData.photoUrl   || null,
      idCardUrl: userData.idCardUrl  || null,
      storageCleaned: storageCleanup.configured && storageCleanup.ok,
      cascade,
    });
  } catch (err) {
    next(err);
  }
};

// ── Edit a student's distinguished-subjects average ───────────────────────────
/**
 * PATCH /api/admin/students/:userId/distinguished-average
 *
 * Admin-only: set/correct «معدل المواد المميزة» on a student and recompute the
 * support classification. Uses Admin SDK (the profile fields are locked against
 * client self-writes by Firestore rules). Branch-guarded + audited.
 *
 * Body: { branchId, distinguishedSubjectsAverage }
 * Response 200: { average, classification }
 */
const setStudentDistinguishedAverage = async (req, res, next) => {
  try {
    const adminUid   = req.user.uid;
    const adminEmail = req.user.email || '';
    const { userId } = req.params;
    const branchId   = req.adminBranchId || req.body.branchId;

    if (!branchId)
      return res.status(400).json({ code: 'missing-branch', message: 'branchId is required.' });
    if (!userId)
      return res.status(400).json({ code: 'missing-user', message: 'userId is required.' });

    const v = supportEligibility.validateAverage(req.body.distinguishedSubjectsAverage);
    if (!v.valid)
      return res.status(400).json({ code: 'invalid-average', message: v.error });

    const classification = supportEligibility.classify(v.value);

    const userRef  = db.collection('branches').doc(branchId).collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
      return res.status(404).json({ code: 'not-found', message: 'Student not found.' });

    // Ownership guard: the student must belong to the admin's branch.
    const data = userSnap.data() || {};
    const studentBranch = data.branchId || data.branch;
    if (studentBranch && studentBranch !== branchId)
      return res.status(403).json({ code: 'permission-denied', message: 'Student does not belong to your branch.' });

    await userRef.update({
      distinguishedSubjectsAverage:  v.value,
      supportClassification:         classification,
      distinguishedAverageUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      distinguishedAverageSource:    'admin',
    });

    await writeAudit({
      branchId, actor: { uid: adminUid, email: adminEmail, role: 'admin' },
      action: 'student.update', targetType: 'user', targetId: userId,
      before: { distinguishedSubjectsAverage: data.distinguishedSubjectsAverage ?? null, supportClassification: data.supportClassification ?? null },
      after:  { distinguishedSubjectsAverage: v.value, supportClassification: classification },
    });

    return res.status(200).json({ average: v.value, classification });
  } catch (err) {
    next(err);
  }
};

module.exports = { createStudent, recordAnnualFee, deleteStudent, setStudentDistinguishedAverage };
