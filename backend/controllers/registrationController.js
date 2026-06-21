const { admin, db } = require('../config/firebase');
const {
  computeCycleEnd,
  firstDayOfNextMonth,
  monthKeyOf,
  computeProration,
} = require('../services/sessionService');
const { assertNoStudentConflict } = require('../services/scheduleConflictService');
const ledger = require('../services/ledgerService');
const { writeAudit } = require('../services/auditService');
const academicYear = require('../services/academicYear');
const supportEligibility = require('../services/supportEligibility');
const financeSettings = require('../services/financeSettings');
const { normalizeSchool } = require('../constants');

/**
 * Append a support-lesson cycle to the immutable financial ledger.
 * One entry per (registration, month) — recurring renewals create distinct
 * entries. Deterministic + idempotent id matches the backfill scheme so live and
 * historical recording never double-count. Best-effort (never breaks the verify).
 */
async function recordSupportRevenue(registrationId, regData = {}, monthKey, actor, paidAt = new Date()) {
  try {
    await ledger.recordPayment({
      branchId:    regData.branchId,
      studentId:   regData.userId || regData.studentId || null,
      studentName: regData.userName || regData.studentName || null,
      serviceType: 'support',
      subjectId:   regData.subjectId || null,
      subjectName: regData.subjectName || regData.lessonName || null,
      classId:     regData.classId || regData.lessonId || null,
      className:   regData.groupName || null,
      teacherName: regData.teacherName || null,
      amount:      regData.totalPrice ?? regData.proratedAmount ?? regData.monthlyPrice ?? 0,
      period:      monthKey,
      sourceCollection: 'supportLessonRegistrations',
      sourceDocId: `${registrationId}_${monthKey}`,
      recordedBy:  actor,
      paidAt,
    });
  } catch (e) {
    console.error('[support] ledger error:', e.message);
  }
}

// ── Support-level classification + eligibility (UNBYPASSABLE GATE) ────────────
// «معدل المواد المميزة» (/20) classifies a student normal (>=11) vs support_level
// (<11). Support GROUPS carry a groupType (normal_support | low_level_support).
// This is the single server-side enforcement point for RULE A/B routing — every
// support enrollment path (student self-enroll, admin create, verify, edit) runs
// through it. The classification is ALWAYS recomputed from the numeric average;
// a client-sent classification is never trusted.
//
// Throws { _status, _code, _msg } on any violation:
//   400 average-required  — no stored average AND none provided
//   400 invalid-average   — provided average failed validation
//   409 normal-cannot-join-low-level / support-must-join-low-level
//
// @returns {Promise<{ classification, average, groupType }>}
async function resolveClassificationAndEnforce({
  branchId, userId, targetClass = {}, classId = null,
  providedAverage = undefined, averageSource = 'student', persist = true,
}) {
  const userRef = db.collection('branches').doc(branchId).collection('users').doc(userId);
  const userSnap = await userRef.get();
  const profile = userSnap.exists ? (userSnap.data() || {}) : {};

  let average = profile.distinguishedSubjectsAverage != null
    ? Number(profile.distinguishedSubjectsAverage) : null;
  let averageProvided = false;

  if (providedAverage !== undefined && providedAverage !== null && providedAverage !== '') {
    const v = supportEligibility.validateAverage(providedAverage);
    if (!v.valid) { const e = new Error('invalid-average'); e._status = 400; e._code = 'invalid-average'; e._msg = v.error; throw e; }
    average = v.value;
    averageProvided = true;
  }

  const classification = supportEligibility.classify(average);
  if (classification == null) {
    const code = supportEligibility.REASONS.AVERAGE_REQUIRED;
    const e = new Error(code); e._status = 400; e._code = code; e._msg = supportEligibility.REASON_MESSAGES[code]; throw e;
  }

  // Persist a freshly-provided average (+ recomputed classification), or self-heal
  // a stored classification that drifted from its stored average.
  if (persist && userSnap.exists) {
    if (averageProvided) {
      await userRef.update({
        distinguishedSubjectsAverage:  average,
        supportClassification:         classification,
        distinguishedAverageUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        distinguishedAverageSource:    averageSource,
      });
    } else if (profile.supportClassification !== classification) {
      await userRef.update({ supportClassification: classification });
    }
  }

  // Per-subject scope: load the target's sibling support classes (single-field,
  // index-free query) so RULE B can detect a low-level group in the same subject.
  let subjectClasses = [];
  const subjectId = targetClass.subjectId || null;
  if (subjectId) {
    const sibSnap = await db.collection('branches').doc(branchId).collection('classes')
      .where('subjectId', '==', subjectId).get();
    subjectClasses = sibSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => c.serviceType === 'support');
  }

  const verdict = supportEligibility.evaluateEligibility({
    classification,
    targetClass: { ...targetClass, id: targetClass.id || classId || null },
    subjectClasses,
  });
  if (!verdict.allowed) {
    const e = new Error(verdict.reason); e._status = 409; e._code = verdict.reason; e._msg = verdict.message; throw e;
  }

  // Snapshot the student's educational institution (REQUIRED, never empty) so the
  // registration record can be filtered/reported on without re-reading the profile.
  return {
    classification,
    average,
    groupType: supportEligibility.normalizeGroupType(targetClass.groupType),
    school: normalizeSchool(profile.school),
  };
}

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
 * Production:   end of the current CALENDAR month (the cycle resets on the 1st).
 * Testing only: set SUPPORT_LESSON_EXPIRY_MINUTES to a positive integer in the
 *               backend .env to shrink the window for rapid testing.
 *
 * Delegates to sessionService.computeCycleEnd so the cycle definition lives in
 * exactly one place (shared with session generation and proration).
 */
function computeExpiryDate(startDate = new Date()) {
  return computeCycleEnd(startDate);
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
// support registration of that year. Academic year runs 1 July → 30 June
// (see services/academicYear.js — the single source of truth).

// The annual fee amount is owner-controlled (financeSettings.getAnnualFeeAmount)
// and snapshotted onto each registration at submission time.

function getCurrentAcademicYearInfo(now = new Date()) {
  const { label, startMs } = academicYear.getCurrentAcademicYear(now);
  return { label, startMs };
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
    // Snapshot the current owner-configured fee onto this registration so future
    // changes to the fee never alter an already-submitted amount.
    const annualFeeSnapshot = includesAnnualFee ? await financeSettings.getAnnualFeeAmount() : 0;

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

    // ── Schedule-conflict gate (server-enforced) ─────────────────────────────
    // Block a student registering for a class that overlaps one they already
    // attend. Unbypassable: the backend is the only writer of support regs.
    try {
      await assertNoStudentConflict(branchId, uid, lessonData.schedules, { excludeClassId: lessonId });
    } catch (e) {
      if (e._code === 'schedule-conflict')
        return res.status(409).json({ code: e._code, message: e._msg, conflicts: e.conflicts });
      throw e;
    }

    // ── Support-level eligibility gate (server-enforced; UNBYPASSABLE) ───────
    // Resolves the student's classification (from the provided/stored average),
    // persists a freshly-entered average, and enforces RULE A/B routing for the
    // target group's subject. Cannot be bypassed via the console/network.
    let supportGate;
    try {
      supportGate = await resolveClassificationAndEnforce({
        branchId, userId: uid,
        targetClass: { ...lessonData, id: lessonId },
        classId: lessonId,
        providedAverage: req.body.distinguishedSubjectsAverage,
        averageSource: 'student',
      });
    } catch (e) {
      if (e._status) return res.status(e._status).json({ code: e._code, message: e._msg });
      throw e;
    }

    // ── Date / academic-year validation ──────────────────────────────────────
    // Support is a CALENDAR-month subscription (cycle resets on the 1st). The
    // window always ends at end-of-month; the client-sent endDate is ignored.
    const startDateObj  = parseDateInput(startDateRaw) || new Date();
    const endDateObj     = computeExpiryDate(startDateObj);
    const nextPaymentObj = firstDayOfNextMonth(startDateObj);
    const academicYear   = String(academicYearRaw || '').trim() || null;

    // ── Duplicate check ──────────────────────────────────────────────────────
    if (await hasActiveSupportRegistration(branchId, uid, lessonId))
      return res.status(409).json({
        code:    'user-already-registered-support-lesson',
        message: 'User already has an active registration.',
      });

    // ── Server-derived PRORATED pricing ──────────────────────────────────────
    // Prices are computed from the authoritative class document + its recurring
    // schedule — NEVER trusted from the client. A student joining mid-cycle pays
    // only for the scheduled occurrences that have not yet started:
    //   amountDue = remainingSessions * (monthlyPrice / totalSessionsThisMonth)
    const cycleMonthKey      = monthKeyOf(startDateObj);
    const proration          = computeProration(lessonData, startDateObj);
    const serverMonthlyPrice = proration.monthlyPrice;            // full month reference
    const serverTotalPrice   = proration.amountDue;               // prorated amount owed now

    // ── Write registration ───────────────────────────────────────────────────
    const payload = {
      branchId,
      userId:         uid,
      studentId:      uid,
      userName:       String(userProfile.fullName || userProfile.name || '').trim(),
      userEmail:      String(userProfile.email || req.user.email || '').trim(),
      school:         normalizeSchool(userProfile.school),
      lessonId,
      lessonName:     String(lessonData.subjectName || lessonData.name || lessonData.subject || '').trim(),
      // New Subject → Class snapshot fields
      subjectId:      String(lessonData.subjectId || '').trim() || null,
      classId:        lessonId,
      groupName:      String(lessonData.groupName || '').trim() || null,
      // Support-level snapshot (reporting/archive parity).
      groupType:      supportEligibility.normalizeGroupType(lessonData.groupType),
      studentClassification:        supportGate.classification,
      distinguishedSubjectsAverage: supportGate.average,
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
      durationInMonths: 1, // support is strictly month-by-month (calendar cycle)
      source:         String(source || 'manual'),
      status:         'pending',
      monthlyPrice:   serverMonthlyPrice || null,
      totalPrice:     serverTotalPrice,
      // Schedule-derived prorated billing snapshot (locked at submission time).
      totalSessionsThisMonth:        proration.totalSessions,
      elapsedSessionsAtEnrollment:   proration.elapsedSessions,
      remainingSessionsAtEnrollment: proration.remainingSessions,
      pricePerSession:               proration.pricePerSession,
      proratedAmount:                proration.amountDue,
      cycleMonthKey,
      nextPaymentDate: admin.firestore.Timestamp.fromDate(nextPaymentObj),
      // Annual fee bundling — first support registration of the academic year.
      includesAnnualFee,
      annualFeeAmount: annualFeeSnapshot,
      totalAmount:    serverTotalPrice + annualFeeSnapshot,
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
      distinguishedSubjectsAverage = undefined, // optional admin override / first-time entry
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

    // ── Schedule-conflict gate (server-enforced) ─────────────────────────────
    // Prefer the live class schedule over the client-sent snapshot (never trust
    // the client for the comparison set).
    let conflictSchedules = Array.isArray(schedules) ? schedules : [];
    let targetClassData = null;
    try {
      const clsSnap = await db.collection('branches').doc(branchId).collection('classes').doc(classKey).get();
      if (clsSnap.exists) {
        targetClassData = { id: clsSnap.id, ...clsSnap.data() };
        if (Array.isArray(targetClassData.schedules)) conflictSchedules = targetClassData.schedules;
      }
    } catch { /* fall back to client snapshot */ }
    try {
      await assertNoStudentConflict(branchId, userId, conflictSchedules, { excludeClassId: classKey, studentName });
    } catch (e) {
      if (e._code === 'schedule-conflict')
        return res.status(409).json({ code: e._code, message: e._msg, conflicts: e.conflicts });
      throw e;
    }

    // ── Support-level eligibility gate (server-enforced) ─────────────────────
    // Admins may also supply/correct the average here; same RULE A/B enforcement.
    let supportGate;
    try {
      supportGate = await resolveClassificationAndEnforce({
        branchId, userId,
        targetClass: targetClassData || { subjectId, groupType: undefined, id: classKey },
        classId: classKey,
        providedAverage: distinguishedSubjectsAverage,
        averageSource: 'admin',
      });
    } catch (e) {
      if (e._status) return res.status(e._status).json({ code: e._code, message: e._msg });
      throw e;
    }

    // Calendar-month cycle (support is strictly month-by-month).
    const startDate     = new Date();
    const endDate       = computeExpiryDate(startDate);
    const cycleMonthKey = monthKeyOf(startDate);

    // Proration snapshot — the admin records the prorated amount owed even when
    // payment is collected physically, so reporting stays consistent.
    let proration = null;
    try {
      const clsSnap = await db.collection('branches').doc(branchId)
        .collection('classes').doc(classKey).get();
      if (clsSnap.exists) {
        proration = computeProration(clsSnap.data(), startDate);
      }
    } catch (e) {
      console.warn('admin-create proration failed:', e.message);
    }

    const payload = {
      branchId,
      userId,
      studentId:      userId,
      lessonId,
      classId:        classId || lessonId,
      subjectId:      subjectId ?? (targetClassData?.subjectId ?? null),
      subjectName:    String(subjectName  || ''),
      groupName:      String(groupName || ''),
      teacherName:    String(teacherName || '') || null,
      // Support-level snapshot.
      groupType:      supportEligibility.normalizeGroupType(targetClassData?.groupType),
      studentClassification:        supportGate.classification,
      distinguishedSubjectsAverage: supportGate.average,
      schedules:      Array.isArray(schedules) ? schedules : [],
      yearName:       yearName   ?? null,
      studyYearId:    studyYearId ?? null,
      studyYearLabel: studyYearLabel ?? (yearName ?? null),
      durationInMonths: 1, // support is strictly month-by-month (calendar cycle)
      startDate:      admin.firestore.Timestamp.fromDate(startDate),
      endDate:        admin.firestore.Timestamp.fromDate(endDate),
      nextPaymentDate: admin.firestore.Timestamp.fromDate(firstDayOfNextMonth(startDate)),
      cycleMonthKey,
      status:         'verified',
      source:         'admin',
      type:           'SUPPORT_REGISTRATION',
      paymentMethod:  'physical',
      paymentProofUrl: '',
      monthlyPrice:   proration ? proration.monthlyPrice : null,
      totalPrice:     proration ? proration.amountDue    : null,
      ...(proration ? {
        proratedAmount:                proration.amountDue,
        totalSessionsThisMonth:        proration.totalSessions,
        elapsedSessionsAtEnrollment:   proration.elapsedSessions,
        remainingSessionsAtEnrollment: proration.remainingSessions,
        pricePerSession:               proration.pricePerSession,
      } : {}),
      userName:       String(studentName  || ''),
      studentName:    String(studentName  || ''),
      studentPhone:   String(studentPhone || ''),
      // Educational institution snapshot (from the student's profile via supportGate).
      school:         supportGate.school,
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

    // Admin-create is immediately verified → record the cycle's revenue + audit.
    const acActor = { uid: adminUid, email: req.user.email || '', role: 'admin' };
    await recordSupportRevenue(newRef.id, { ...payload, branchId }, cycleMonthKey, acActor, startDate);
    await writeAudit({
      branchId, actor: acActor, action: 'payment.verify',
      targetType: 'supportLessonRegistration', targetId: newRef.id,
      after: { status: 'verified', source: 'admin', amount: payload.totalPrice ?? null, period: cycleMonthKey },
    });

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

    // Cross-branch guard: a by-id endpoint carries no branchId for requireAdmin to
    // bind, so verify the registration belongs to THIS admin's branch before acting.
    {
      const ownSnap = await regRef.get();
      if (!ownSnap.exists)
        return res.status(404).json({ code: 'not-found', message: 'Registration not found.' });
      if (req.adminBranchId && (ownSnap.data().branchId || null) !== req.adminBranchId)
        return res.status(403).json({ code: 'permission-denied', message: 'لا يمكنك إدارة تسجيل خارج فرعك.' });
    }

    const verifyDate  = new Date();
    const expiryDate  = computeExpiryDate(verifyDate);          // end of current calendar month
    const nextPayDate = firstDayOfNextMonth(verifyDate);        // next cycle starts on the 1st

    // ── Schedule-conflict gate (server-enforced) — pending→verified only ─────
    // Approving occupies the slot, so a clash with the student's other active
    // subscriptions must block here, mirroring the language/training approvals.
    try {
      const preSnap = await regRef.get();
      if (preSnap.exists) {
        const d = preSnap.data() || {};
        const already = String(d.status || '').toLowerCase() === 'verified';
        const bId = d.branchId || null;
        const cId = d.classId || d.lessonId || null;
        if (!already && bId && d.userId) {
          let sched = Array.isArray(d.schedules) ? d.schedules : [];
          try {
            const clsSnap = await db.collection('branches').doc(bId).collection('classes').doc(cId).get();
            if (clsSnap.exists && Array.isArray(clsSnap.data().schedules)) sched = clsSnap.data().schedules;
          } catch { /* fall back to the stored snapshot */ }
          await assertNoStudentConflict(bId, d.userId, sched, {
            excludeClassId: cId, studentName: d.userName || d.studentName || '',
          });
        }
      }
    } catch (e) {
      if (e._code === 'schedule-conflict')
        return res.status(409).json({ code: e._code, message: e._msg, conflicts: e.conflicts });
      throw e;
    }

    // ── Support-level eligibility re-check (verifying allocates the seat) ─────
    // Mirrors the schedule-conflict pre-gate: a pending support reg may only be
    // approved into a group its owner is eligible for (RULE A/B). persist:false —
    // verification never changes the student's average.
    try {
      const preSnap = await regRef.get();
      if (preSnap.exists) {
        const d = preSnap.data() || {};
        const already = String(d.status || '').toLowerCase() === 'verified';
        const bId = d.branchId || null;
        const cId = d.classId || d.lessonId || null;
        if (!already && bId && d.userId && cId) {
          let targetClass = { subjectId: d.subjectId || null, groupType: d.groupType, id: cId };
          try {
            const clsSnap = await db.collection('branches').doc(bId).collection('classes').doc(cId).get();
            if (clsSnap.exists) targetClass = { id: clsSnap.id, ...clsSnap.data() };
          } catch { /* fall back to the stored snapshot */ }
          await resolveClassificationAndEnforce({ branchId: bId, userId: d.userId, targetClass, classId: cId, persist: false });
        }
      }
    } catch (e) {
      if (e._status) return res.status(e._status).json({ code: e._code, message: e._msg });
      throw e;
    }

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
          status:          'verified',
          startDate:       admin.firestore.Timestamp.fromDate(verifyDate),
          endDate:         admin.firestore.Timestamp.fromDate(expiryDate),
          nextPaymentDate: admin.firestore.Timestamp.fromDate(nextPayDate),
          cycleMonthKey:   monthKeyOf(verifyDate),
          verifiedAt:      admin.firestore.FieldValue.serverTimestamp(),
          updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
          verifiedBy:      { uid: adminUid, email: adminEmail, name: '' },
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

        // The student profile flags reflect the bundle regardless (idempotent).
        const userPatch = {
          yearlyFeePaid:   true,
          paymentVerified: true,
          updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
        };
        if (studyYear)   userPatch.studyYear   = studyYear;
        if (schoolLevel) userPatch.schoolLevel = schoolLevel;
        await db.collection('branches').doc(branchId).collection('users').doc(userId)
          .set(userPatch, { merge: true });

        // ── Duplicate-fee guard (the annual fee is paid ONCE per academic year) ──
        // Skip recording revenue if a verified annual payment already exists for
        // this academic year — whether from the standalone Annual Fees page, a
        // Chargily order, or a concurrent support verify. Without this, two pending
        // bundles (possible via a non-transactional submit-time race) would each
        // record a separate annual payment + ledger entry for the same year.
        if (await isAnnualFeePaidThisYear(branchId, userId)) {
          console.info(`[support verify] annual fee already paid for ${label} — skipping duplicate record.`);
        } else {
          // Prefer the amount snapshotted at submission; fall back to current config.
          const annualFeeDue = regData.annualFeeAmount || await financeSettings.getAnnualFeeAmount();
          // Year-deterministic id: at most ONE annual payment + ONE ledger entry per
          // (student, academic year). Even simultaneous support verifies converge on
          // this same doc (merge), so the race can never double-count the fee. The
          // ledger's deterministic id derives from this, keeping the backfill safe.
          const annualDocId = `annual_${userId}_${label}`;

          await db.collection('branches').doc(branchId).collection('annualPayments')
            .doc(annualDocId)
            .set({
              userId,
              branchId,
              status:        'verified',
              academicYear:  label,
              year:          label,
              studyYear:     studyYear || null,
              annualFee:     annualFeeDue,
              amount:        annualFeeDue,
              source:        'supportRegistration',
              triggeredBySupportRegId: registrationId,
              receiptUrl:    regData.paymentProofUrl || '',
              createdAt:     admin.firestore.FieldValue.serverTimestamp(),
              verifiedAt:    admin.firestore.FieldValue.serverTimestamp(),
              verifiedBy:    { uid: adminUid, email: adminEmail, name: '' },
            }, { merge: true });

          // Ledger: the bundled annual fee IS revenue. Year-deterministic source id
          // keeps it idempotent across registrations, paths, and the backfill.
          await ledger.recordPayment({
            branchId, studentId: userId,
            studentName: regData.userName || regData.studentName || null,
            serviceType: 'annualFee',
            amount: annualFeeDue,
            period: label,
            sourceCollection: 'annualPayments',
            sourceDocId: annualDocId,
            recordedBy: { uid: adminUid, email: adminEmail, role: 'admin' },
            paidAt: verifyDate,
          });
        }
      } catch (e) {
        console.warn('annual-fee record on support verify failed:', e.message);
      }
    }

    // ── Ledger + audit for the support cycle (pending → verified only) ────────
    if (!wasVerified) {
      const actor = { uid: adminUid, email: adminEmail, role: 'admin' };
      await recordSupportRevenue(registrationId, { ...regData, branchId }, monthKeyOf(verifyDate), actor, verifyDate);
      await writeAudit({
        branchId, actor, action: 'payment.verify',
        targetType: 'supportLessonRegistration', targetId: registrationId,
        after: { status: 'verified', amount: regData.totalPrice ?? regData.proratedAmount ?? null, period: monthKeyOf(verifyDate) },
      });
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

    if (req.adminBranchId && (rejData.branchId || null) !== req.adminBranchId)
      return res.status(403).json({ code: 'permission-denied', message: 'لا يمكنك إدارة تسجيل خارج فرعك.' });

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

    if (req.adminBranchId && (renewData.branchId || null) !== req.adminBranchId)
      return res.status(403).json({ code: 'permission-denied', message: 'لا يمكنك إدارة تسجيل خارج فرعك.' });

    const renewBranchId = renewData.branchId || null;
    const renewClassId  = renewData.classId || renewData.lessonId || null;
    const startDate = new Date();
    const endDate   = computeExpiryDate(startDate);
    const monthKey  = monthKeyOf(startDate);

    // Re-price for the new cycle using the same proration rule (full price at the
    // start of a month, prorated if renewed after scheduled sessions have passed).
    let renewProration = null;
    if (renewBranchId && renewClassId) {
      const clsSnap = await db.collection('branches').doc(renewBranchId)
        .collection('classes').doc(renewClassId).get();
      if (clsSnap.exists) {
        renewProration = computeProration(clsSnap.data(), startDate);
      }
    }

    await regRef.update({
      startDate:       admin.firestore.Timestamp.fromDate(startDate),
      endDate:         admin.firestore.Timestamp.fromDate(endDate),
      nextPaymentDate: admin.firestore.Timestamp.fromDate(firstDayOfNextMonth(startDate)),
      cycleMonthKey:   monthKey,
      status:          'verified',
      renewedAt:       admin.firestore.FieldValue.serverTimestamp(),
      renewedBy:       adminUid,
      updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
      ...(renewProration ? {
        monthlyPrice:                  renewProration.monthlyPrice,
        totalPrice:                    renewProration.amountDue,
        proratedAmount:                renewProration.amountDue,
        totalSessionsThisMonth:        renewProration.totalSessions,
        elapsedSessionsAtEnrollment:   renewProration.elapsedSessions,
        remainingSessionsAtEnrollment: renewProration.remainingSessions,
        pricePerSession:               renewProration.pricePerSession,
      } : {}),
    });

    // Re-activating a (possibly expired) subscription re-occupies its seat.
    await recomputeSupportClassEnrollment(renewData.branchId || null, renewData.classId || renewData.lessonId || null);

    // A renewal is a fresh month of revenue → its own ledger entry (period = new
    // monthKey, so it never collides with a prior cycle's entry) + audit.
    const renewActor = { uid: adminUid, email: req.user.email || '', role: 'admin' };
    const renewMerged = {
      ...renewData, branchId: renewBranchId,
      ...(renewProration ? { totalPrice: renewProration.amountDue, monthlyPrice: renewProration.monthlyPrice, proratedAmount: renewProration.amountDue } : {}),
    };
    await recordSupportRevenue(registrationId, renewMerged, monthKey, renewActor, startDate);
    await writeAudit({
      branchId: renewBranchId, actor: renewActor, action: 'payment.verify',
      targetType: 'supportLessonRegistration', targetId: registrationId,
      after: { status: 'verified', event: 'renew', period: monthKey, amount: renewProration ? renewProration.amountDue : null },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── Admin: delete a support-lesson registration ───────────────────────────────

const adminDeleteSupportLessonRegistration = async (req, res, next) => {
  try {
    const adminUid   = req.user?.uid || '';
    const adminEmail = req.user?.email || '';
    const { id: registrationId } = req.params;
    const { reason = null } = req.body || {};

    if (!registrationId)
      return res.status(400).json({ code: 'missing-id', message: 'registrationId is required.' });

    const regRef  = db.collection('supportLessonRegistrations').doc(registrationId);
    const regSnap = await regRef.get();
    if (!regSnap.exists)
      return res.status(404).json({ code: 'not-found', message: 'Registration not found.' });

    const delData = regSnap.data() || {};

    if (req.adminBranchId && (delData.branchId || null) !== req.adminBranchId)
      return res.status(403).json({ code: 'permission-denied', message: 'لا يمكنك إدارة تسجيل خارج فرعك.' });

    await regRef.delete();

    // Free the seat after removal.
    await recomputeSupportClassEnrollment(delData.branchId || null, delData.classId || delData.lessonId || null);

    // Payment security (§11): reverse this cycle's revenue (append-only — the
    // original ledger entry is never edited) and write a permanent deletion log.
    const actor = { uid: adminUid, email: adminEmail, role: 'admin' };
    try {
      if (delData.cycleMonthKey && delData.branchId) {
        const origId = ledger.ledgerId('supportLessonRegistrations', delData.branchId, `${registrationId}_${delData.cycleMonthKey}`);
        await ledger.recordReversal(origId, { recordedBy: actor, reason: reason || 'registration deleted' });
      }
    } catch (e) { console.error('[support delete] reversal error:', e.message); }
    await writeAudit({
      branchId: delData.branchId || null, actor, action: 'payment.delete',
      targetType: 'supportLessonRegistration', targetId: registrationId,
      before: { status: delData.status || null, amount: delData.totalPrice ?? delData.proratedAmount ?? null, period: delData.cycleMonthKey || null },
      reason,
    });

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

    // ── Schedule-conflict gate on the pending→verified transition via edit ────
    // The edit endpoint can also activate a registration; guard it identically.
    const editData = regSnap.data() || {};

    if (req.adminBranchId && (editData.branchId || null) !== req.adminBranchId)
      return res.status(403).json({ code: 'permission-denied', message: 'لا يمكنك إدارة تسجيل خارج فرعك.' });

    const becomingVerified = safeUpdates.status === 'verified'
      && String(editData.status || '').toLowerCase() !== 'verified';
    if (becomingVerified && editData.branchId && editData.userId) {
      const cId = editData.classId || editData.lessonId || null;
      let sched = Array.isArray(editData.schedules) ? editData.schedules : [];
      let targetClass = { subjectId: editData.subjectId || null, groupType: editData.groupType, id: cId };
      try {
        const clsSnap = await db.collection('branches').doc(editData.branchId)
          .collection('classes').doc(cId).get();
        if (clsSnap.exists) {
          targetClass = { id: clsSnap.id, ...clsSnap.data() };
          if (Array.isArray(targetClass.schedules)) sched = targetClass.schedules;
        }
      } catch { /* fall back to stored snapshot */ }
      try {
        await assertNoStudentConflict(editData.branchId, editData.userId, sched, {
          excludeClassId: cId, studentName: editData.userName || editData.studentName || '',
        });
        // Support-level eligibility re-check on the pending→verified edit transition.
        await resolveClassificationAndEnforce({
          branchId: editData.branchId, userId: editData.userId, targetClass, classId: cId, persist: false,
        });
      } catch (e) {
        if (e._code === 'schedule-conflict')
          return res.status(409).json({ code: e._code, message: e._msg, conflicts: e.conflicts });
        if (e._status) return res.status(e._status).json({ code: e._code, message: e._msg });
        throw e;
      }
    }

    // ── Write via Admin SDK (bypasses the "allow update: if false" rule) ──────
    await regRef.update({
      ...safeUpdates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Payment security (§11): permanent edit log with before/after, and — when the
    // billed amount changed on an already-verified cycle — an append-only ledger
    // adjustment so net revenue reflects the correction without rewriting history.
    const actor = { uid: adminUid, email: adminEmail, role: 'admin' };
    const oldAmount = editData.totalPrice ?? editData.proratedAmount ?? null;
    const newAmount = safeUpdates.totalPrice != null ? safeUpdates.totalPrice : oldAmount;
    await writeAudit({
      branchId: editData.branchId || null, actor, action: 'payment.edit',
      targetType: 'supportLessonRegistration', targetId: registrationId,
      before: { status: editData.status || null, amount: oldAmount, monthlyPrice: editData.monthlyPrice ?? null },
      after:  { status: safeUpdates.status ?? editData.status ?? null, amount: newAmount, monthlyPrice: safeUpdates.monthlyPrice ?? editData.monthlyPrice ?? null },
      reason: body.reason || null,
    });
    try {
      const isVerified = String(safeUpdates.status ?? editData.status ?? '').toLowerCase() === 'verified';
      const delta = ledger.toNumber(newAmount) - ledger.toNumber(oldAmount);
      if (isVerified && delta !== 0 && editData.branchId && editData.cycleMonthKey) {
        await ledger.recordPayment({
          branchId: editData.branchId,
          studentId: editData.userId || null,
          studentName: editData.userName || editData.studentName || null,
          serviceType: 'support',
          subjectId: editData.subjectId || null,
          subjectName: editData.subjectName || null,
          classId: editData.classId || editData.lessonId || null,
          className: editData.groupName || null,
          teacherName: editData.teacherName || null,
          amount: delta,
          period: editData.cycleMonthKey,
          type: 'adjustment',
          sourceCollection: 'supportLessonRegistrations',
          sourceDocId: `${registrationId}_${editData.cycleMonthKey}_adj_${Date.now()}`,
          recordedBy: actor,
          paidAt: new Date(),
        });
      }
    } catch (e) { console.error('[support edit] ledger adjustment error:', e.message); }

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── Student self-classify (browse-time) ───────────────────────────────────────

/**
 * POST /api/registrations/support-average
 *
 * Authenticated student: save «معدل المواد المميزة» on their OWN profile and get
 * the resulting classification. Lets the support-lessons browse page filter
 * groups (RULE A/B) BEFORE the student picks one. Self-scoped (uid from token);
 * the profile fields are otherwise locked against client self-writes by rules.
 *
 * Body: { branchId, distinguishedSubjectsAverage }
 * Response 200: { average, classification }
 */
const setDistinguishedAverage = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { branchId, distinguishedSubjectsAverage } = req.body;

    if (!branchId)
      return res.status(400).json({ code: 'missing-branch', message: 'branchId is required.' });

    const v = supportEligibility.validateAverage(distinguishedSubjectsAverage);
    if (!v.valid)
      return res.status(400).json({ code: 'invalid-average', message: v.error });

    const classification = supportEligibility.classify(v.value);

    const userRef = db.collection('branches').doc(branchId).collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
      return res.status(404).json({ code: 'user-not-found', message: 'User profile not found.' });

    await userRef.update({
      distinguishedSubjectsAverage:  v.value,
      supportClassification:         classification,
      distinguishedAverageUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      distinguishedAverageSource:    'student',
    });

    return res.status(200).json({ average: v.value, classification });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createSupportLessonRegistration,
  setDistinguishedAverage,
  adminCreateSupportLessonRegistration,
  adminVerifySupportLessonRegistration,
  adminRejectSupportLessonRegistration,
  adminRenewSupportLessonRegistration,
  adminDeleteSupportLessonRegistration,
  adminEditSupportLessonRegistration,
  // Exported so the Chargily registration factory enforces the SAME support gates
  // (RULE A/B classification, capacity, duplicate) as the controller self-enroll path.
  resolveClassificationAndEnforce,
  isAnnualFeePaidThisYear,
  recomputeSupportClassEnrollment,
  countActiveSupportForClass,
  hasActiveSupportRegistration,
};
