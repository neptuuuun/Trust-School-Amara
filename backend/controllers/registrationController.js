const { admin, db } = require('../config/firebase');

// ── Date helpers (ported from functions/index.js) ────────────────────────────

function parseDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function addMonthsKeepingDay(date, months) {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Compute the expiry date for a support lesson subscription starting at `startDate`.
 *
 * Production:   always 1 calendar month (default, no env var needed).
 * Testing only: set SUPPORT_LESSON_EXPIRY_MINUTES to a positive integer in the
 *               backend .env to shrink the window for rapid testing.
 *               Example: SUPPORT_LESSON_EXPIRY_MINUTES=2  →  expires in 2 minutes.
 *               Remove the variable (or set it to 0) to restore production behaviour.
 *
 * This variable is intentionally backend-only and never shipped to the client.
 */
function computeExpiryDate(startDate = new Date()) {
  const testMinutes = parseInt(process.env.SUPPORT_LESSON_EXPIRY_MINUTES || '', 10);
  if (Number.isFinite(testMinutes) && testMinutes > 0) {
    return new Date(startDate.getTime() + testMinutes * 60 * 1000);
  }
  const end = new Date(startDate);
  end.setMonth(end.getMonth() + 1);
  return end;
}


// ── Study-year helpers ────────────────────────────────────────────────────────

function normalizeSupportStudyYear(lessonData = {}) {
  return String(lessonData.studyYear || lessonData.year || lessonData.grade || '').trim() || null;
}

// CRITICAL: use studyYear only — schoolLevel is a different field (middle/high level, not mid1/sec2)
function normalizeUserStudyYear(profile = {}) {
  return String(profile.studyYear || '').trim() || null;
}

// ── Duplicate-check helper ────────────────────────────────────────────────────

async function hasActiveSupportRegistration(branchId, userId, lessonId) {
  const snap = await db
    .collection('supportLessonRegistrations')
    .where('branchId', '==', branchId)
    .where('userId',   '==', userId)
    .where('lessonId', '==', lessonId)
    .get();

  if (snap.empty) return false;
  const now = new Date();

  return snap.docs.some((docSnap) => {
    const data   = docSnap.data() || {};
    const status = String(data.status || 'pending').toLowerCase();
    if (status === 'pending') return true;
    if (status !== 'verified') return false;
    const end = data.endDate?.toDate
      ? data.endDate.toDate()
      : data.endDate
      ? new Date(data.endDate)
      : null;
    return Boolean(end && end >= now);
  });
}

// ── Capacity (approved-enrollment) accounting for support classes ─────────────
// Support is subscription-based, so "approved" == verified AND not expired.
// We recompute the class's enrollmentCount from a live count on every status
// change so it never drifts (no expiry event exists to hook into).

async function countActiveSupportForClass(branchId, classId) {
  if (!branchId || !classId) return 0;
  const now = new Date();
  const snap = await db
    .collection('supportLessonRegistrations')
    .where('lessonId', '==', classId)
    .get();
  return snap.docs.filter((d) => {
    const x = d.data() || {};
    if (x.branchId !== branchId) return false;
    if (String(x.status || '').toLowerCase() !== 'verified') return false;
    const end = x.endDate?.toDate ? x.endDate.toDate() : (x.endDate ? new Date(x.endDate) : null);
    return !end || end > now; // active = not yet expired
  }).length;
}

async function recomputeSupportClassEnrollment(branchId, classId) {
  if (!branchId || !classId) return;
  try {
    const count = await countActiveSupportForClass(branchId, classId);
    await db.collection('branches').doc(branchId).collection('classes').doc(classId)
      .update({ enrollmentCount: count });
  } catch (e) {
    console.warn('recomputeSupportClassEnrollment failed:', e.message);
  }
}

// ── Annual fee (academic-year aware) ──────────────────────────────────────────
// The annual fee is paid ONCE per academic year and is bundled into the FIRST
// support registration of that year. Academic year starts 1 September.

const ANNUAL_FEE_DZD = 1000;

function getCurrentAcademicYearInfo(now = new Date()) {
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    label: `${startYear}-${startYear + 1}`,
    startMs: new Date(startYear, 8, 1, 0, 0, 0, 0).getTime(),
  };
}

// True when the student has a verified annualPayments doc within the current
// academic year (also grandfathers legacy records via their verifiedAt window).
async function isAnnualFeePaidThisYear(branchId, userId) {
  if (!branchId || !userId) return false;
  const { label, startMs } = getCurrentAcademicYearInfo();
  const snap = await db.collection('branches').doc(branchId).collection('annualPayments')
    .where('userId', '==', userId).get();
  return snap.docs.some((d) => {
    const p = d.data() || {};
    if (String(p.status || '').toLowerCase() !== 'verified') return false;
    if (p.academicYear && p.academicYear === label) return true;
    const v = p.verifiedAt?.toDate ? p.verifiedAt.toDate() : (p.verifiedAt ? new Date(p.verifiedAt) : null);
    return Boolean(v && v.getTime() >= startMs);
  });
}

// True when the student already has a PENDING support registration that bundles
// the annual fee for the current academic year. Its approval will record the
// fee, so a concurrent second registration may proceed (monthly-only).
async function hasPendingAnnualFeeBundle(branchId, userId) {
  if (!branchId || !userId) return false;
  const { startMs } = getCurrentAcademicYearInfo();
  const snap = await db.collection('supportLessonRegistrations')
    .where('userId', '==', userId).get();
  return snap.docs.some((d) => {
    const r = d.data() || {};
    if (r.branchId !== branchId) return false;
    if (!r.includesAnnualFee) return false;
    if (String(r.status || '').toLowerCase() !== 'pending') return false;
    const c = r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt ? new Date(r.createdAt) : null);
    return !c || c.getTime() >= startMs;
  });
}

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * POST /api/registrations/support
 *
 * Authenticated student: register for a monthly support lesson.
 * Mirrors the logic of the `createSupportLessonRegistration` Cloud Function.
 *
 * Body: { branchId, lessonId, durationInMonths, startDate, endDate,
 *         academicYear, paymentProofUrl, monthlyPrice, totalPrice, source }
 * Response 201: { id }
 */
const createSupportLessonRegistration = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const {
      branchId,
      lessonId,
      durationInMonths: durationRaw,
      startDate:        startDateRaw,
      endDate:          endDateRaw,
      academicYear:     academicYearRaw,
      paymentProofUrl:  paymentProofUrlRaw,
      paymentMethod:    paymentMethodRaw,
      monthlyPrice,
      totalPrice,
      source,
      studyYearLabel:   studyYearLabelRaw,
    } = req.body;

    const durationInMonths = Number.isInteger(Number(durationRaw)) ? Number(durationRaw) : 1;
    const paymentProofUrl  = String(paymentProofUrlRaw || '');
    const paymentMethod    = String(paymentMethodRaw   || '').trim();

    // ── Validate inputs ──────────────────────────────────────────────────────
    if (!branchId)
      return res.status(400).json({ code: 'missing-branch', message: 'branchId is required.' });
    if (!lessonId)
      return res.status(400).json({ code: 'missing-lesson', message: 'lessonId is required.' });
    if (!Number.isInteger(durationInMonths) || durationInMonths < 1 || durationInMonths > 3)
      return res.status(400).json({
        code: 'invalid-duration',
        message: 'durationInMonths must be between 1 and 3.',
      });

    // ── Load user profile ────────────────────────────────────────────────────
    const userRef  = db.collection('branches').doc(branchId).collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
      return res.status(412).json({ code: 'user-not-found', message: 'User profile not found.' });

    const userProfile        = userSnap.data() || {};
    const verificationStatus = String(userProfile.verificationStatus || '').trim().toLowerCase();
    const isAccountVerified  =
      userProfile.verified       === true ||
      userProfile.accountVerified === true ||
      verificationStatus          === 'verified';

    if (!isAccountVerified)
      return res.status(403).json({
        code:    'account-not-verified',
        message: 'Account must be verified before registering.',
      });

    // ── Load class (new Subject → Class catalog; lessonId == classId) ─────────
    const lessonRef  = db.collection('branches').doc(branchId).collection('classes').doc(lessonId);
    const lessonSnap = await lessonRef.get();
    if (!lessonSnap.exists)
      return res.status(404).json({ code: 'lesson-not-found', message: 'Support class not found.' });

    const lessonData      = lessonSnap.data() || {};
    const lessonStudyYear = normalizeSupportStudyYear(lessonData);
    if (!lessonStudyYear)
      return res.status(412).json({
        code:    'missing-lesson-study-year',
        message: 'Lesson studyYear is missing.',
      });

    // Study year: a brand-new student's FIRST registration adopts the class's
    // study year (locks them to it); an existing study year must match.
    const existingUserStudyYear = normalizeUserStudyYear(userProfile);
    const userStudyYear = existingUserStudyYear || lessonStudyYear;
    if (existingUserStudyYear && existingUserStudyYear !== lessonStudyYear)
      return res.status(403).json({
        code: 'study-year-mismatch',
        message: 'Study year mismatch.',
        userStudyYear: existingUserStudyYear,
        lessonStudyYear,
      });

    // ── Annual fee gate (academic-year aware) ────────────────────────────────
    // Paid ONCE per academic year, bundled into the FIRST support registration.
    // Allow when already paid this year OR when this request includes the fee.
    const includesAnnualFee = req.body.includesAnnualFee === true;
    const feePaidThisYear   = await isAnnualFeePaidThisYear(branchId, uid);

    if (!feePaidThisYear) {
      // Duplicate bundle guard: a pending registration already bundles the annual
      // fee for this year. A second registration that also includes the fee would
      // create a duplicate annual payment when the admin verifies it.
      const pendingBundleExists = await hasPendingAnnualFeeBundle(branchId, uid);

      if (includesAnnualFee && pendingBundleExists) {
        return res.status(409).json({
          code:    'duplicate-annual-fee-bundle',
          message: 'الرسوم السنوية قيد المراجعة بالفعل في طلب آخر. يرجى الانتظار حتى يتم اعتمادها.',
        });
      }

      // Monthly-only submission requires either a verified annual fee or a
      // pending bundle that will cover it once approved.
      if (!includesAnnualFee && !pendingBundleExists) {
        return res.status(403).json({
          code:    'yearly-fee-required',
          message: 'Yearly fee is required.',
        });
      }
    }

    // ── Capacity gate (server-enforced; approved registrations only) ─────────
    const capacity = Number(lessonData.capacity) || 0;
    if (capacity > 0) {
      const approvedCount = await countActiveSupportForClass(branchId, lessonId);
      if (approvedCount >= capacity)
        return res.status(409).json({ code: 'class-full', message: 'المجموعة مكتملة.' });
    }

    // ── Date / academic-year validation ──────────────────────────────────────
    const startDateObj = parseDateInput(startDateRaw) || new Date();

    const endDateObj   = parseDateInput(endDateRaw) || addMonthsKeepingDay(startDateObj, durationInMonths);
    const academicYear = String(academicYearRaw || '').trim() || null;

    // ── Duplicate check ──────────────────────────────────────────────────────
    if (await hasActiveSupportRegistration(branchId, uid, lessonId))
      return res.status(409).json({
        code:    'user-already-registered-support-lesson',
        message: 'User already has an active registration.',
      });

    // ── Server-derived pricing ───────────────────────────────────────────────
    // Prices are computed from the authoritative class document — NEVER trusted
    // from the client (prevents a student POSTing monthlyPrice:0 / totalAmount:0).
    const serverMonthlyPrice = Number(lessonData.price) || 0;
    const serverTotalPrice   = serverMonthlyPrice * durationInMonths;

    // ── Write registration ───────────────────────────────────────────────────
    const payload = {
      branchId,
      userId:         uid,
      studentId:      uid,
      userName:       String(userProfile.fullName || userProfile.name || '').trim(),
      userEmail:      String(userProfile.email || req.user.email || '').trim(),
      lessonId,
      lessonName:     String(lessonData.subjectName || lessonData.name || lessonData.subject || '').trim(),
      // New Subject → Class snapshot fields
      subjectId:      String(lessonData.subjectId || '').trim() || null,
      classId:        lessonId,
      groupName:      String(lessonData.groupName || '').trim() || null,
      schedules:      Array.isArray(lessonData.schedules) ? lessonData.schedules : [],
      subjectName:    String(
        lessonData.subjectName ||
        lessonData.subject ||
        (Array.isArray(lessonData.subjects) ? lessonData.subjects[0] : '') ||
        lessonData.name || ''
      ).trim(),
      yearName:       String(studyYearLabelRaw || lessonData.studyLevel || lessonData.year || lessonData.grade || lessonData.studyYear || '').trim() || null,
      teacherName:    String(lessonData.teacherName || lessonData.teacher || '').trim() || null,
      studyYear:      userStudyYear,
      studyYearId:    userStudyYear,
      studyYearLabel: String(studyYearLabelRaw || lessonData.studyLevel || '').trim(),
      studyLevelId:   String(lessonData.level      || '').trim() || null,
      durationInMonths,
      source:         String(source || 'manual'),
      status:         'pending',
      monthlyPrice:   serverMonthlyPrice || null,
      totalPrice:     serverTotalPrice   || null,
      // Annual fee bundling — first support registration of the academic year.
      includesAnnualFee,
      annualFeeAmount: includesAnnualFee ? ANNUAL_FEE_DZD : 0,
      totalAmount:    serverTotalPrice + (includesAnnualFee ? ANNUAL_FEE_DZD : 0),
      paymentMethod,
      paymentProofUrl,
      startDate:      admin.firestore.Timestamp.fromDate(startDateObj),
      endDate:        admin.firestore.Timestamp.fromDate(endDateObj),
      academicYear,
      createdAt:      admin.firestore.FieldValue.serverTimestamp(),
      verifiedAt:     null,
      verifiedBy:     null,
    };

    const ref = await db.collection('supportLessonRegistrations').add(payload);
    return res.status(201).json({ id: ref.id });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/support-lesson-registrations/admin-create
 *
 * Admin-only: manually enroll a student in a support lesson with verified status.
 * Uses Admin SDK — bypasses Firestore security rules intentionally.
 *
 * Body: { branchId, userId, lessonId, subjectName?, yearName?, studyYearId?,
 *         durationInMonths?, studentName?, studentPhone? }
 * Response 201: { id }
 */
const adminCreateSupportLessonRegistration = async (req, res, next) => {
  try {
    const adminUid = req.user.uid;
    const {
      branchId,
      userId,
      lessonId,
      subjectName      = '',
      yearName         = null,
      studyYearId      = null,
      durationInMonths: durationRaw = 1,
      studentName      = '',
      studentPhone     = '',
      classId          = '',
      subjectId        = null,
      groupName        = '',
      teacherName      = '',
      schedules        = [],
      studyYearLabel   = null,
    } = req.body;

    const durationInMonths = Number.isInteger(Number(durationRaw)) ? Number(durationRaw) : 1;

    if (!branchId)
      return res.status(400).json({ code: 'missing-branch', message: 'branchId is required.' });
    if (!userId)
      return res.status(400).json({ code: 'missing-user',   message: 'userId is required.'   });
    if (!lessonId)
      return res.status(400).json({ code: 'missing-lesson', message: 'lessonId is required.' });
    if (!Number.isInteger(durationInMonths) || durationInMonths < 1 || durationInMonths > 3)
      return res.status(400).json({ code: 'invalid-duration', message: 'durationInMonths must be 1–3.' });

    // Duplicate guard + capacity gate + write are performed atomically below.
    const classKey = classId || lessonId;

    const startDate = new Date();
    const endDate   = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationInMonths);

    const payload = {
      branchId,
      userId,
      studentId:      userId,
      lessonId,
      classId:        classId || lessonId,
      subjectId:      subjectId ?? null,
      subjectName:    String(subjectName  || ''),
      groupName:      String(groupName || ''),
      teacherName:    String(teacherName || '') || null,
      schedules:      Array.isArray(schedules) ? schedules : [],
      yearName:       yearName   ?? null,
      studyYearId:    studyYearId ?? null,
      studyYearLabel: studyYearLabel ?? (yearName ?? null),
      durationInMonths,
      startDate:      admin.firestore.Timestamp.fromDate(startDate),
      endDate:        admin.firestore.Timestamp.fromDate(endDate),
      status:         'verified',
      source:         'admin',
      type:           'SUPPORT_REGISTRATION',
      paymentMethod:  'physical',
      paymentProofUrl: '',
      monthlyPrice:   null,
      totalPrice:     null,
      userName:       String(studentName  || ''),
      studentName:    String(studentName  || ''),
      studentPhone:   String(studentPhone || ''),
      createdAt:      admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
      createdBy:      adminUid,
      addedBy:        adminUid,
    };

    // ── Atomic: duplicate + capacity guard + write (admin-create occupies a seat) ──
    const newRef = db.collection('supportLessonRegistrations').doc();
    try {
      await db.runTransaction(async (t) => {
        const dupQs = await t.get(
          db.collection('supportLessonRegistrations')
            .where('userId',   '==', userId)
            .where('lessonId', '==', lessonId)
            .where('branchId', '==', branchId)
            .where('status', 'in', ['pending', 'verified'])
            .limit(1)
        );
        if (!dupQs.empty) {
          const e = new Error('duplicate'); e._status = 409;
          e._code = 'duplicate-registration'; e._msg = 'الطالب مسجل مسبقاً في هذا الدرس.';
          throw e;
        }

        const clsSnap  = await t.get(db.collection('branches').doc(branchId).collection('classes').doc(classKey));
        const capacity = clsSnap.exists ? (Number(clsSnap.data().capacity) || 0) : 0;
        if (capacity > 0) {
          const qs  = await t.get(db.collection('supportLessonRegistrations').where('lessonId', '==', classKey));
          const now = new Date();
          const activeCount = qs.docs.filter((d) => {
            const x = d.data() || {};
            if (x.branchId !== branchId) return false;
            if (String(x.status || '').toLowerCase() !== 'verified') return false;
            const end = x.endDate?.toDate ? x.endDate.toDate() : (x.endDate ? new Date(x.endDate) : null);
            return !end || end > now;
          }).length;
          if (activeCount >= capacity) {
            const e = new Error('class-full'); e._status = 409;
            e._code = 'class-full'; e._msg = 'اكتمل العدد في هذه المجموعة.';
            throw e;
          }
        }

        t.set(newRef, payload);
      });
    } catch (e) {
      if (e._status === 409) return res.status(409).json({ code: e._code, message: e._msg });
      throw e;
    }

    await recomputeSupportClassEnrollment(branchId, classId || lessonId);
    return res.status(201).json({ id: newRef.id });
  } catch (err) {
    next(err);
  }
};

// ── Admin: verify a pending support-lesson registration ───────────────────────

const adminVerifySupportLessonRegistration = async (req, res, next) => {
  try {
    const adminUid   = req.user.uid;
    const adminEmail = req.user.email || '';
    const { id: registrationId } = req.params;

    if (!registrationId)
      return res.status(400).json({ code: 'missing-id', message: 'registrationId is required.' });

    const regRef = db.collection('supportLessonRegistrations').doc(registrationId);

    const verifyDate = new Date();
    const expiryDate = computeExpiryDate(verifyDate);

    // ── Atomic, capacity-gated verification ──────────────────────────────────
    // The seat is allocated here (pending → verified). Counting the verified
    // registrations AND writing the new status inside one transaction guarantees
    // the class can never exceed capacity even if two admins verify different
    // students simultaneously: the overlapping read of the class's registrations
    // forces one transaction to retry and re-evaluate the (now higher) count.
    let regData, classId, branchId, wasVerified;
    try {
      const result = await db.runTransaction(async (t) => {
        const regSnap = await t.get(regRef);
        if (!regSnap.exists) { const e = new Error('not-found'); e._status = 404; throw e; }

        const data    = regSnap.data() || {};
        const cId     = data.classId || data.lessonId || null;
        const bId     = data.branchId || null;
        const already = String(data.status || '').toLowerCase() === 'verified';

        if (!already && cId && bId) {
          const clsSnap  = await t.get(db.collection('branches').doc(bId).collection('classes').doc(cId));
          const capacity = clsSnap.exists ? (Number(clsSnap.data().capacity) || 0) : 0;
          if (capacity > 0) {
            const qs  = await t.get(db.collection('supportLessonRegistrations').where('lessonId', '==', cId));
            const now = new Date();
            const activeCount = qs.docs.filter((d) => {
              const x = d.data() || {};
              if (x.branchId !== bId) return false;
              if (String(x.status || '').toLowerCase() !== 'verified') return false;
              const end = x.endDate?.toDate ? x.endDate.toDate() : (x.endDate ? new Date(x.endDate) : null);
              return !end || end > now;
            }).length;
            if (activeCount >= capacity) { const e = new Error('class-full'); e._status = 409; throw e; }
          }
        }

        t.update(regRef, {
          status:     'verified',
          startDate:  admin.firestore.Timestamp.fromDate(verifyDate),
          endDate:    admin.firestore.Timestamp.fromDate(expiryDate),
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
          verifiedBy: { uid: adminUid, email: adminEmail, name: '' },
        });

        return { data, cId, bId, already };
      });
      regData = result.data; classId = result.cId; branchId = result.bId; wasVerified = result.already;
    } catch (e) {
      if (e._status === 404) return res.status(404).json({ code: 'not-found', message: 'Registration not found.' });
      if (e._status === 409) return res.status(409).json({ code: 'class-full', message: 'اكتمل العدد في هذه المجموعة.' });
      throw e;
    }

    await recomputeSupportClassEnrollment(branchId, classId);

    // ── CASE 2: this registration bundled the annual fee ─────────────────────
    // Record a verified annual payment for the academic year + flag the user,
    // so future support registrations this year skip the fee. Idempotent id.
    if (!wasVerified && regData.includesAnnualFee && branchId && regData.userId) {
      try {
        const { label } = getCurrentAcademicYearInfo();
        const userId = regData.userId;
        const studyYear = regData.studyYear || regData.studyYearId || null;
        const schoolLevel = studyYear
          ? (String(studyYear).startsWith('mid') ? 'middle'
            : String(studyYear).startsWith('sec') ? 'high' : null)
          : null;

        const userPatch = {
          yearlyFeePaid:   true,
          paymentVerified: true,
          updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
        };
        if (studyYear)   userPatch.studyYear   = studyYear;
        if (schoolLevel) userPatch.schoolLevel = schoolLevel;
        await db.collection('branches').doc(branchId).collection('users').doc(userId)
          .set(userPatch, { merge: true });

        await db.collection('branches').doc(branchId).collection('annualPayments')
          .doc(`support_${registrationId}`)
          .set({
            userId,
            branchId,
            status:        'verified',
            academicYear:  label,
            studyYear:     studyYear || null,
            annualFee:     regData.annualFeeAmount || ANNUAL_FEE_DZD,
            amount:        regData.annualFeeAmount || ANNUAL_FEE_DZD,
            source:        'supportRegistration',
            triggeredBySupportRegId: registrationId,
            receiptUrl:    regData.paymentProofUrl || '',
            createdAt:     admin.firestore.FieldValue.serverTimestamp(),
            verifiedAt:    admin.firestore.FieldValue.serverTimestamp(),
            verifiedBy:    { uid: adminUid, email: adminEmail, name: '' },
          }, { merge: true });
      } catch (e) {
        console.warn('annual-fee record on support verify failed:', e.message);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── Admin: reject a pending support-lesson registration ───────────────────────

const adminRejectSupportLessonRegistration = async (req, res, next) => {
  try {
    const { id: registrationId } = req.params;
    const { notes } = req.body || {};

    if (!registrationId)
      return res.status(400).json({ code: 'missing-id', message: 'registrationId is required.' });

    const regRef  = db.collection('supportLessonRegistrations').doc(registrationId);
    const regSnap = await regRef.get();
    if (!regSnap.exists)
      return res.status(404).json({ code: 'not-found', message: 'Registration not found.' });

    const rejData = regSnap.data() || {};

    await regRef.update({
      status:     'rejected',
      notes:      notes || null,
      verifiedAt: null,
      verifiedBy: null,
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    // Free the seat if this had been an active subscription.
    await recomputeSupportClassEnrollment(rejData.branchId || null, rejData.classId || rejData.lessonId || null);

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── Admin: renew a support-lesson registration (extend by 1 month) ────────────

const adminRenewSupportLessonRegistration = async (req, res, next) => {
  try {
    const adminUid = req.user.uid;
    const { id: registrationId } = req.params;

    if (!registrationId)
      return res.status(400).json({ code: 'missing-id', message: 'registrationId is required.' });

    const regRef  = db.collection('supportLessonRegistrations').doc(registrationId);
    const regSnap = await regRef.get();
    if (!regSnap.exists)
      return res.status(404).json({ code: 'not-found', message: 'Registration not found.' });

    const renewData = regSnap.data() || {};
    const startDate = new Date();
    const endDate   = computeExpiryDate(startDate);

    await regRef.update({
      startDate:  admin.firestore.Timestamp.fromDate(startDate),
      endDate:    admin.firestore.Timestamp.fromDate(endDate),
      status:     'verified',
      renewedAt:  admin.firestore.FieldValue.serverTimestamp(),
      renewedBy:  adminUid,
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    // Re-activating a (possibly expired) subscription re-occupies its seat.
    await recomputeSupportClassEnrollment(renewData.branchId || null, renewData.classId || renewData.lessonId || null);

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── Admin: delete a support-lesson registration ───────────────────────────────

const adminDeleteSupportLessonRegistration = async (req, res, next) => {
  try {
    const { id: registrationId } = req.params;

    if (!registrationId)
      return res.status(400).json({ code: 'missing-id', message: 'registrationId is required.' });

    const regRef  = db.collection('supportLessonRegistrations').doc(registrationId);
    const regSnap = await regRef.get();
    if (!regSnap.exists)
      return res.status(404).json({ code: 'not-found', message: 'Registration not found.' });

    const delData = regSnap.data() || {};

    await regRef.delete();

    // Free the seat after removal.
    await recomputeSupportClassEnrollment(delData.branchId || null, delData.classId || delData.lessonId || null);

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── Admin: edit mutable fields on a support-lesson registration ───────────────

/**
 * PATCH /api/support-lesson-registrations/:id/edit
 *
 * Admin-only: update mutable fields on an existing support lesson registration.
 * Uses Admin SDK — bypasses the client-write deny rule on supportLessonRegistrations.
 *
 * Identity fields (branchId, userId, lessonId, createdAt) are silently ignored
 * even if sent; the backend enforces its own allowlist.
 *
 * Allowed body fields:
 *   status          – 'pending' | 'verified' | 'rejected'
 *   subjectName     – string
 *   endDate         – ISO 8601 date string  (converted → Firestore Timestamp)
 *   startDate       – ISO 8601 date string  (converted → Firestore Timestamp)
 *   notes           – string | null
 *   teacherName     – string | null
 *   yearName        – string | null
 *   monthlyPrice    – non-negative number
 *   totalPrice      – non-negative number
 *   durationInMonths – integer 1–3
 */
const adminEditSupportLessonRegistration = async (req, res, next) => {
  try {
    const { id: registrationId } = req.params;
    const body = req.body || {};

    if (!registrationId)
      return res.status(400).json({ code: 'missing-id', message: 'registrationId is required.' });

    // ── Build sanitized payload ───────────────────────────────────────────────
    const safeUpdates = {};

    if (body.status !== undefined) {
      const validStatuses = ['pending', 'verified', 'rejected'];
      const s = String(body.status).toLowerCase();
      if (!validStatuses.includes(s))
        return res.status(400).json({
          code: 'invalid-status',
          message: `status must be one of: ${validStatuses.join(', ')}`,
        });
      safeUpdates.status = s;
    }

    if (body.subjectName !== undefined)
      safeUpdates.subjectName = String(body.subjectName || '').trim();

    if (body.endDate !== undefined && body.endDate !== null && body.endDate !== '') {
      const d = new Date(body.endDate);
      if (Number.isNaN(d.getTime()))
        return res.status(400).json({ code: 'invalid-date', message: 'endDate is not a valid date.' });
      safeUpdates.endDate = admin.firestore.Timestamp.fromDate(d);
    }

    if (body.startDate !== undefined && body.startDate !== null && body.startDate !== '') {
      const d = new Date(body.startDate);
      if (Number.isNaN(d.getTime()))
        return res.status(400).json({ code: 'invalid-date', message: 'startDate is not a valid date.' });
      safeUpdates.startDate = admin.firestore.Timestamp.fromDate(d);
    }

    if (body.notes       !== undefined) safeUpdates.notes       = body.notes || null;
    if (body.teacherName !== undefined) safeUpdates.teacherName = String(body.teacherName || '').trim() || null;
    if (body.yearName    !== undefined) safeUpdates.yearName    = String(body.yearName    || '').trim() || null;

    if (body.monthlyPrice != null) {
      const p = Number(body.monthlyPrice);
      if (Number.isFinite(p) && p >= 0) safeUpdates.monthlyPrice = p;
    }
    if (body.totalPrice != null) {
      const p = Number(body.totalPrice);
      if (Number.isFinite(p) && p >= 0) safeUpdates.totalPrice = p;
    }
    if (body.durationInMonths != null) {
      const n = Number(body.durationInMonths);
      if (Number.isInteger(n) && n >= 1 && n <= 3) safeUpdates.durationInMonths = n;
    }

    if (Object.keys(safeUpdates).length === 0)
      return res.status(400).json({ code: 'no-updates', message: 'No valid fields to update.' });

    // ── Verify document exists before writing ─────────────────────────────────
    const regRef  = db.collection('supportLessonRegistrations').doc(registrationId);
    const regSnap = await regRef.get();
    if (!regSnap.exists)
      return res.status(404).json({ code: 'not-found', message: 'Registration not found.' });

    // ── Write via Admin SDK (bypasses the "allow update: if false" rule) ──────
    await regRef.update({
      ...safeUpdates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createSupportLessonRegistration,
  adminCreateSupportLessonRegistration,
  adminVerifySupportLessonRegistration,
  adminRejectSupportLessonRegistration,
  adminRenewSupportLessonRegistration,
  adminDeleteSupportLessonRegistration,
  adminEditSupportLessonRegistration,
};
