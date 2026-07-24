const { admin, db, auth } = require('../config/firebase');
const ledger = require('../services/ledgerService');
const { writeAudit, resolveActor } = require('../services/auditService');
const academicYear = require('../services/academicYear');
const supportEligibility = require('../services/supportEligibility');
const financeSettings = require('../services/financeSettings');
const { recordManualPaymentOrder } = require('../services/paymentOrderLog');
const { normalizeSchool, isValidSchool } = require('../constants');
// Support seats are recounted live (verified AND not expired) — reuse the single
// implementation instead of duplicating the expiry rule here.
const { recomputeSupportClassEnrollment } = require('./registrationController');

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
 * Body: { branchId, fullName, email, phone?, password, adminUid? }
 * Response 201: { userId }
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

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName     = fullName.trim();
    const normalizedSchool = normalizeSchool(school);

    // --- Create Firebase Auth user --------------------------------------
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email:         normalizedEmail,
        password,
        displayName:   trimmedName,
        emailVerified: true,
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

    const uid        = userRecord.uid;
    const branchName = BRANCH_NAMES[branchId] || branchId;
    const callerUid  = adminUid || req.user.uid;
    // Canonical actor {uid,name,email,role} so the student's createdBy carries the
    // enrolling admin's real NAME (OwnershipBadge / "Registered by …").
    const callerActor = await resolveActor(callerUid);

    // Auto-generate registration number identical to the self-registration format.
    const now    = new Date();
    const year   = now.getFullYear();
    const month  = String(now.getMonth() + 1).padStart(2, '0');
    const rand   = Math.floor(1000 + Math.random() * 9000);
    const prefix = branchId.slice(0, 4).toUpperCase();
    const registrationNumber = `${prefix}-${year}${month}-${rand}`;

    const trimmedPhone = phone?.trim() || null;

    // --- Write Firestore profile ----------------------------------------
    // Admin-created accounts use the exact same schema as self-registered students.
    // They are pre-verified and immediately active — no email confirmation needed.
    await db.collection('branches').doc(branchId).collection('users').doc(uid).set({
      uid,
      // Canonical name field + legacy alias — both set to avoid any field mismatch.
      name:               trimmedName,
      fullName:           trimmedName,
      email:              normalizedEmail,
      phoneNumber:        trimmedPhone,
      phone:              trimmedPhone,
      // Branch info stored in both forms (same as AuthContext.signup).
      branch:             branchId,
      branchId,
      branchName,
      role:               'student',
      // status: 'active' is required by AuthContext.login and profile listeners.
      status:             'active',
      emailVerified:      true,
      // Pre-verified — admin enrolled this student in person.
      verified:           true,
      accountVerified:    true,
      verificationStatus: 'verified',
      paymentVerified:    false,
      yearlyFeePaid:      false,
      studyYear:          null,
      // Optional personal fields — not collected by admin; default to null.
      birthDate:          null,
      birthPlace:         null,
      address:            null,
      // Educational institution — REQUIRED on every person record (never empty/null).
      school:             normalizedSchool,
      // Photo fields — not collected at admin enrollment; null until student uploads.
      photoUrl:           null,
      idCardUrl:          null,
      verificationRequest: null,
      // Registration number generated the same way as self-registration.
      registrationNumber,
      // Admin agreed to rules on behalf of the student during enrollment.
      internalRulesAccepted: true,
      // Not a Google OAuth stub — profile is immediately complete.
      completedProfile:   true,
      createdByAdmin:     true,
      createdBy:          { uid: callerActor.uid, name: callerActor.name || '', email: callerActor.email || '' },
      lifecycleStatus:    'active',
      lifecycleStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActivityAt:     admin.firestore.FieldValue.serverTimestamp(),
      lastActivityType:   'admin_account_creation',
      createdAt:          admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
    });

    await writeAudit({
      branchId, actor: { uid: callerUid, email: req.user?.email || '', role: 'admin' },
      action: 'student.create', targetType: 'user', targetId: uid,
      after: { name: trimmedName, email: normalizedEmail, branchId, school: normalizedSchool },
    });

    return res.status(201).json({ userId: uid });
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
    const adminUid   = req.user.uid;
    const adminEmail = req.user.email || '';
    const { branchId, userId, studyYear, paidAt, notes } = req.body;

    if (!branchId)
      return res.status(400).json({ code: 'missing-branch', message: 'branchId is required.' });
    if (!VALID_BRANCHES.includes(branchId))
      return res.status(400).json({ code: 'invalid-argument', message: `Invalid branchId. Must be one of: ${VALID_BRANCHES.join(', ')}` });
    if (!userId)
      return res.status(400).json({ code: 'missing-user', message: 'userId is required.' });

    // Load the student profile — existence + branch guard + denormalization source.
    const userRef  = db.collection('branches').doc(branchId).collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
      return res.status(404).json({ code: 'not-found', message: 'Student not found.' });

    const userData      = userSnap.data() || {};
    const studentBranch = userData.branchId || userData.branch;
    if (studentBranch && studentBranch !== branchId)
      return res.status(403).json({ code: 'permission-denied', message: 'Student does not belong to your branch.' });

    // Academic-year context. paidAt may be a backdated ISO date; default to now.
    const paidDate  = paidAt ? new Date(paidAt) : new Date();
    const validPaid = Number.isNaN(paidDate.getTime()) ? new Date() : paidDate;
    const ay        = academicYear.getAcademicYear(validPaid);
    const label     = ay.label;

    // Grade/level: explicit param wins, else the stored profile value.
    const grade       = String(studyYear || userData.studyYear || '').trim() || null;
    const schoolLevel = grade
      ? (grade.startsWith('mid') ? 'middle' : grade.startsWith('sec') ? 'high' : (userData.schoolLevel || null))
      : (userData.schoolLevel || null);

    // ── Duplicate guard — one verified annual fee per student per academic year.
    // Single-field query (no composite index) + in-memory academic-year check.
    const paymentsRef  = db.collection('branches').doc(branchId).collection('annualPayments');
    const existingSnap = await paymentsRef.where('userId', '==', userId).get();
    const dupe = existingSnap.docs.map((d) => d.data() || {}).some((p) => {
      if (String(p.status || '').toLowerCase() !== 'verified') return false;
      if (p.year === label || p.academicYear === label) return true;
      const d = academicYear.toJsDate(p.verifiedAt || p.createdAt);
      return Boolean(d && d.getTime() >= ay.startMs && d.getTime() <= ay.endMs);
    });
    if (dupe)
      return res.status(409).json({ code: 'already-paid', message: 'هذا الطالب دفع الرسوم السنوية لهذه السنة الدراسية بالفعل.' });

    // ── Snapshot the configured amount (never trust a client-supplied amount) ──
    const amount = await financeSettings.getAnnualFeeAmount();

    const studentName  = userData.name || userData.fullName || '';
    const studentEmail = userData.email || '';
    const studentPhone = userData.phoneNumber || userData.phone || '';
    const school       = normalizeSchool(userData.school);
    const nowTs        = admin.firestore.FieldValue.serverTimestamp();
    const paidTs       = admin.firestore.Timestamp.fromDate(validPaid);

    // ── Canonical annualPayments doc (mirrors the Chargily/cash schema) ───────
    const payRef = paymentsRef.doc();
    await payRef.set({
      userId,
      userName:     studentName,
      studentName,
      userEmail:    studentEmail,
      studentPhone,
      amount,
      year:         label,   // academic-year label '2025-2026' (archive display + ledger period)
      academicYear: grade,   // grade id 'sec3' (kept for support-eligibility readers)
      studyYear:    grade,
      level:        grade,
      school,
      paymentMethod: 'physical',
      source:        'admin_manual',
      status:        'verified',
      paymentStatus: 'verified',
      notes:         notes || 'تم تسجيل الرسوم السنوية يدوياً من قبل الإدارة',
      createdAt:     paidTs,
      verifiedAt:    nowTs,
      verifiedBy:    { uid: adminUid, email: adminEmail, name: '' },
      recordedBy:    { uid: adminUid, email: adminEmail, role: 'admin' },
    });

    // ── Student profile: union of every flag readers depend on ────────────────
    const userPatch = {
      yearlyFeePaid:      true,
      paymentVerified:    true,
      annualFeePaid:      true,
      annualFeeYear:      label,
      annualFeePaymentId: payRef.id,
      updatedAt:          nowTs,
      'registrations.annualFee': label,
      'registrations.annualFeeHistory': admin.firestore.FieldValue.arrayUnion({
        registrationId: payRef.id,
        year:           label,
        registeredAt:   Date.now(),
        source:         'admin_manual',
        academicYear:   grade || null,
      }),
    };
    if (grade)       userPatch.studyYear   = grade;
    if (schoolLevel) userPatch.schoolLevel = schoolLevel;
    await userRef.update(userPatch);

    // ── Ledger + audit (best-effort; never fail the request on a log error) ───
    try {
      await ledger.recordPayment({
        branchId,
        studentId:   userId,
        studentName,
        serviceType: 'annualFee',
        amount,
        period:      label,
        sourceCollection: 'annualPayments',
        sourceDocId: payRef.id,
        recordedBy:  { uid: adminUid, email: adminEmail, role: 'admin' },
        paidAt:      validPaid,
      });
      await writeAudit({
        branchId,
        actor: { uid: adminUid, email: adminEmail, role: 'admin' },
        action: 'payment.record',
        targetType: 'annualPayment',
        targetId: payRef.id,
        after: { status: 'verified', amount, userId, academicYear: label },
      });
      // Operational receipt in the branch payment log (the ledger above stays the
      // single revenue record — this is only so an admin can find/reconcile the
      // cash they took at the desk in سجل المدفوعات).
      await recordManualPaymentOrder({
        branchId, serviceType: 'annualFee',
        sourceCollection: 'annualPayments', sourceDocId: payRef.id,
        regData: { userId, studentName, subjectName: `الرسوم السنوية ${label}` },
        amount,
        actor: { uid: adminUid, email: adminEmail },
      });
    } catch (logErr) {
      console.error('[recordAnnualFee] ledger/audit error:', logErr.message);
    }

    return res.status(201).json({ paymentId: payRef.id, amount, academicYear: label, studyYear: grade });
  } catch (err) {
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
      return res.status(200).json({ success: true, photoUrl: null, idCardUrl: null });
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

    // 3. Delete the Firestore profile.
    await userRef.delete();

    await writeAudit({
      branchId, actor,
      action: 'student.delete', targetType: 'user', targetId: userId,
      before: { name: userData.name || userData.fullName || null, email: userData.email || null },
      after: { cascade },
    });

    // Return file URLs so the frontend can clean up Supabase storage.
    return res.status(200).json({
      success:   true,
      photoUrl:  userData.photoUrl   || null,
      idCardUrl: userData.idCardUrl  || null,
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
