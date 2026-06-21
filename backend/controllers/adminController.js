const { admin, db, auth } = require('../config/firebase');
const ledger = require('../services/ledgerService');
const { writeAudit, resolveActor } = require('../services/auditService');
const academicYear = require('../services/academicYear');
const supportEligibility = require('../services/supportEligibility');
const financeSettings = require('../services/financeSettings');
const { normalizeSchool, isValidSchool } = require('../constants');

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

// ── Verify annual payment (atomically) ────────────────────────────────────────
/**
 * POST /api/admin/verify-annual-payment
 *
 * Atomically verifies an annual payment and all linked support-lesson
 * registrations. Uses Admin SDK so it can write to the otherwise
 * client-write-protected supportLessonRegistrations collection.
 *
 * Body: { branchId, paymentId }
 */
const verifyAnnualPayment = async (req, res, next) => {
  try {
    const adminUid   = req.user.uid;
    const adminEmail = req.user.email || '';
    const { branchId, paymentId } = req.body;

    if (!branchId)
      return res.status(400).json({ code: 'missing-branch',  message: 'branchId is required.' });
    if (!paymentId)
      return res.status(400).json({ code: 'missing-payment', message: 'paymentId is required.' });

    // ── Load the payment document ─────────────────────────────────────────────
    const paymentRef  = db.collection('branches').doc(branchId).collection('annualPayments').doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists)
      return res.status(404).json({ code: 'not-found', message: 'Annual payment not found.' });

    const paymentData = paymentSnap.data() || {};
    if (paymentData.status === 'verified')
      return res.status(409).json({ code: 'already-verified', message: 'Payment already verified.' });

    const adminInfo    = { uid: adminUid, email: adminEmail };
    const nextPayDate  = new Date();
    nextPayDate.setFullYear(nextPayDate.getFullYear() + 1);

    // ── Load linked registrations from branches/{branchId}/registrations ──────
    const regsRef  = db.collection('branches').doc(branchId).collection('registrations');
    const regsSnap = await regsRef.where('paymentId', '==', paymentId).get();

    // ── Compute studyYear patch for the user doc ──────────────────────────────
    const userId = paymentData.userId || null;
    let userStudyYearPatch = {};
    if (userId) {
      const userSnap = await db.collection('branches').doc(branchId).collection('users').doc(userId).get();
      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        const existingLevel = String(userData.schoolLevel || '').trim();
        const payYearId     = String(paymentData.academicYear || '').trim();
        const payLevel      = payYearId.startsWith('mid') ? 'middle'
                            : payYearId.startsWith('sec') ? 'high'
                            : null;
        if (payYearId)              userStudyYearPatch.studyYear   = payYearId;
        if (!existingLevel && payLevel) userStudyYearPatch.schoolLevel = payLevel;
      }
    }

    // ── Build the atomic batch ────────────────────────────────────────────────
    const batch = db.batch();

    // 1. Update payment status
    batch.update(paymentRef, {
      status:          'verified',
      verifiedAt:      admin.firestore.FieldValue.serverTimestamp(),
      verifiedBy:      adminInfo,
      nextPaymentDate: admin.firestore.Timestamp.fromDate(nextPayDate),
    });

    // 2. Update branch-scoped registration summaries + global enrollment records.
    //    Annual-fee access lasts until the END of the current academic year
    //    (30 June), per services/academicYear.js — the single source of truth.
    const now           = new Date();
    const endBoundary   = admin.firestore.Timestamp.fromDate(academicYear.getAcademicYear(now).end);

    regsSnap.docs.forEach((docSnap) => {
      const regData   = docSnap.data() || {};
      const studentId = regData.userId   || '';
      const subjectId = regData.subjectId || '';
      const yearId    = regData.year || regData.yearId || regData.yearLabel || regData.metadata?.year || 'unknown';
      const subjectName = regData.subjectName || regData.courseName || '';

      // Update the branch-scoped summary record
      batch.update(docSnap.ref, {
        status:        'verified',
        paymentStatus: 'verified',
        updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
      });

      // Write global enrollment record (Admin SDK bypasses the deny rule)
      if (studentId && subjectId) {
        const enrollId  = ['annualFee', branchId, studentId, subjectId, yearId].join('_');
        const enrollRef = db.collection('supportLessonRegistrations').doc(enrollId);
        batch.set(enrollRef, {
          branchId,
          userId:       studentId,
          lessonId:     subjectId,
          subjectName,
          lessonName:   subjectName || 'درس دعم',
          source:       'annualFee',
          status:       'verified',
          paymentId,
          yearId,
          academicYear: yearId,
          startDate:    admin.firestore.Timestamp.fromDate(now),
          endDate:      endBoundary,
          createdAt:    regData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          verifiedAt:   admin.firestore.FieldValue.serverTimestamp(),
          verifiedBy:   adminInfo,
          updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });

    // 3. Update user profile
    if (userId) {
      const userRef = db.collection('branches').doc(branchId).collection('users').doc(userId);
      batch.update(userRef, {
        isVerified:      true,
        yearlyFeePaid:   true,
        paymentVerified: true,
        nextPaymentDate: admin.firestore.Timestamp.fromDate(nextPayDate),
        updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
        ...userStudyYearPatch,
        'registrations.annualFee': paymentData.year || paymentData.level || new Date().getFullYear(),
        'registrations.annualFeeHistory': admin.firestore.FieldValue.arrayUnion({
          registrationId: paymentId,
          year:           paymentData.year || paymentData.level || null,
          registeredAt:   Date.now(),
        }),
      });
    }

    // 4. Write annualFeeRegistered archive entry
    const archivedRef = db.collection('branches').doc(branchId).collection('annualFeeRegistered').doc(paymentId);
    batch.set(archivedRef, {
      ...paymentData,
      branchId,
      userId,
      registrationId: paymentId,
      status:         'registered',
      registeredAt:   admin.firestore.FieldValue.serverTimestamp(),
      verifiedAt:     admin.firestore.FieldValue.serverTimestamp(),
      verifiedBy:     adminInfo,
    });

    // ── Commit everything atomically ──────────────────────────────────────────
    await batch.commit();

    // ── Append to the immutable financial ledger + audit log ──────────────────
    // One ledger entry per annual payment (the annual fee IS the revenue; the
    // bundled support enrollments are free access, not separate revenue, so we do
    // not double-count them). Best-effort: never fail the request on a log error.
    try {
      await ledger.recordPayment({
        branchId,
        studentId:   userId,
        studentName: paymentData.userName || paymentData.studentName || null,
        serviceType: 'annualFee',
        amount:      paymentData.amount ?? paymentData.price,
        period:      ledger.academicYearLabel(),
        sourceCollection: 'annualPayments',
        sourceDocId: paymentId,
        recordedBy:  { uid: adminUid, email: adminEmail, role: 'admin' },
        paidAt:      new Date(),
      });
      await writeAudit({
        branchId,
        actor: { uid: adminUid, email: adminEmail, role: 'admin' },
        action: 'payment.verify',
        targetType: 'annualPayment',
        targetId: paymentId,
        after: { status: 'verified', amount: paymentData.amount ?? null, userId },
      });
    } catch (logErr) {
      console.error('[verifyAnnualPayment] ledger/audit error:', logErr.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── Reject annual payment (atomically) ────────────────────────────────────────
/**
 * POST /api/admin/reject-annual-payment
 *
 * Body: { branchId, paymentId, notes? }
 */
const rejectAnnualPayment = async (req, res, next) => {
  try {
    const adminUid   = req.user?.uid || '';
    const adminEmail = req.user?.email || '';
    const { branchId, paymentId, notes } = req.body;

    if (!branchId)
      return res.status(400).json({ code: 'missing-branch',  message: 'branchId is required.' });
    if (!paymentId)
      return res.status(400).json({ code: 'missing-payment', message: 'paymentId is required.' });

    const paymentRef  = db.collection('branches').doc(branchId).collection('annualPayments').doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists)
      return res.status(404).json({ code: 'not-found', message: 'Annual payment not found.' });

    // Do not reject an already-verified payment — that would leave the student's
    // yearlyFeePaid / paymentVerified flags inconsistent. Block instead.
    const paymentData = paymentSnap.data() || {};
    if (String(paymentData.status || '').toLowerCase() === 'verified')
      return res.status(409).json({ code: 'already-verified', message: 'Cannot reject an already-verified payment.' });

    // ── Load linked registrations ─────────────────────────────────────────────
    const regsRef  = db.collection('branches').doc(branchId).collection('registrations');
    const regsSnap = await regsRef.where('paymentId', '==', paymentId).get();

    const batch = db.batch();

    batch.update(paymentRef, {
      status:    'rejected',
      notes:     notes || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    regsSnap.docs.forEach((docSnap) => {
      const regData   = docSnap.data() || {};
      const studentId = regData.userId    || '';
      const subjectId = regData.subjectId || '';
      const yearId    = regData.year || regData.yearId || regData.yearLabel || regData.metadata?.year || 'unknown';

      batch.update(docSnap.ref, {
        status:        'rejected',
        feePaid:       false,
        paymentStatus: 'rejected',
        updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
      });

      if (studentId && subjectId) {
        const enrollId  = ['annualFee', branchId, studentId, subjectId, yearId].join('_');
        const enrollRef = db.collection('supportLessonRegistrations').doc(enrollId);
        batch.set(enrollRef, {
          branchId,
          userId:       studentId,
          lessonId:     subjectId,
          source:       'annualFee',
          status:       'rejected',
          paymentId,
          notes:        notes || null,
          updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
          verifiedAt:   null,
          verifiedBy:   null,
        }, { merge: true });
      }
    });

    await batch.commit();

    // Audit the rejection (no ledger entry — a rejected payment was never recorded
    // as revenue; verified payments are blocked from rejection above).
    try {
      await writeAudit({
        branchId,
        actor: { uid: adminUid, email: adminEmail, role: 'admin' },
        action: 'payment.reject',
        targetType: 'annualPayment',
        targetId: paymentId,
        reason: notes || null,
        after: { status: 'rejected' },
      });
    } catch (logErr) {
      console.error('[rejectAnnualPayment] audit error:', logErr.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

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
      receiptUrl:    null,
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
 * POST /api/admin/delete-student
 *
 * Permanently removes a student from Firebase Auth AND Firestore.
 * Returns the student's Supabase file URLs so the caller can clean up
 * storage client-side (best-effort; does not block the response).
 *
 * Body: { branchId, userId }
 * Response 200: { success: true, photoUrl, idCardUrl }
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

    // 2. Delete the Firestore profile.
    await userRef.delete();

    await writeAudit({
      branchId, actor: { uid: req.user?.uid || '', email: req.user?.email || '', role: 'admin' },
      action: 'student.delete', targetType: 'user', targetId: userId,
      before: { name: userData.name || userData.fullName || null, email: userData.email || null },
    });

    // Return file URLs so the frontend can clean up Supabase storage.
    return res.status(200).json({
      success:   true,
      photoUrl:  userData.photoUrl   || null,
      idCardUrl: userData.idCardUrl  || null,
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

module.exports = { createStudent, verifyAnnualPayment, rejectAnnualPayment, recordAnnualFee, deleteStudent, setStudentDistinguishedAverage };
