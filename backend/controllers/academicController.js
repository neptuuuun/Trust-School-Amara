/**
 * academicController.js
 * ---------------------
 * Server-authoritative (Admin SDK) write surface for the academic catalog, the
 * "hard boundary" for schedule-conflict prevention:
 *
 *   • Class create / update run the teacher + classroom conflict check INSIDE a
 *     Firestore transaction (reads every sibling class, then writes), so two
 *     concurrent saves can never both land a conflicting schedule — the TOCTOU
 *     race is closed. Firestore rules forbid clients from creating a class or
 *     changing schedules/teacher/classroom directly, so this is the ONLY path.
 *
 *   • Language / training approval + class-based admin-add run the capacity gate
 *     and the student conflict gate before writing the approved record, so a
 *     student can never be enrolled into an overlapping slot.
 *
 * Payloads mirror the previous client-side firestoreService functions exactly so
 * the approved archive + student dashboard stay byte-compatible.
 */

const { admin, db } = require('../config/firebase');
const {
  findTeacherConflicts,
  findClassroomConflicts,
  scheduleConflictError,
  assertNoStudentConflict,
} = require('../services/scheduleConflictService');
const ledger = require('../services/ledgerService');
const { writeAudit, resolveActor } = require('../services/auditService');
const { normalizeGroupType } = require('../services/supportEligibility');
const { normalizeMonthKey } = require('../services/reservationService');
const { recordManualPaymentOrder } = require('../services/paymentOrderLog');
const academicYear = require('../services/academicYear');

const FieldValue = admin.firestore.FieldValue;

/**
 * Append an approved enrollment to the immutable financial ledger + audit log.
 * Best-effort: a logging failure must never break the approval transaction that
 * already committed. Class attribution (teacher/subject/group) is enriched from
 * the class doc when available so teacher analytics stay accurate.
 *
 * `manualPayment: true` additionally writes an operational paymentOrder receipt
 * (paymentMethod 'cash') so money collected at the desk shows up in the admin
 * payment log alongside online Chargily orders. The online path never sets it —
 * chargilyController has already created the real order. This does NOT create a
 * second ledger entry; the ledger write below remains the only revenue record.
 */
async function recordRegistrationRevenue({ branchId, serviceType, sourceCollection, sourceDocId, regData = {}, classId, actor, amount, manualPayment = false }) {
  try {
    let subjectId = regData.subjectId || null;
    let subjectName = regData.subjectName || regData.languageName || regData.trainingTitle || regData.trainingName || null;
    let className = regData.groupName || regData.levelLabel || regData.className || null;
    let teacherId = regData.teacherId || null;
    let teacherName = regData.teacherName || null;
    // Explicit override → fields on the registration → (below) the class price.
    let resolvedAmount = amount != null
      ? amount
      : (regData.languagePrice ?? regData.trainingPrice ?? regData.price ?? regData.levelPrice ?? regData.amount ?? null);

    if (classId) {
      try {
        const clsSnap = await db.collection('branches').doc(branchId).collection('classes').doc(classId).get();
        if (clsSnap.exists) {
          const cls = clsSnap.data() || {};
          subjectId   = subjectId   || cls.subjectId   || null;
          subjectName = subjectName || cls.subjectName  || null;
          className   = className   || cls.groupName || cls.name || null;
          teacherId   = teacherId   || cls.teacherId   || null;
          teacherName = teacherName || cls.teacherName  || null;
          if (resolvedAmount == null) resolvedAmount = cls.price ?? cls.monthlyPrice ?? null;
        }
      } catch { /* enrichment is best-effort */ }
    }

    await ledger.recordPayment({
      branchId,
      studentId:   regData.userId || regData.studentId || null,
      studentName: regData.studentName || regData.userName || null,
      serviceType,
      subjectId, subjectName, classId: classId || null, className, teacherId, teacherName,
      amount:      ledger.toNumber(resolvedAmount),
      period:      ledger.academicYearLabel(),
      sourceCollection,
      sourceDocId,
      recordedBy:  actor,
      paidAt:      new Date(),
    });
    await writeAudit({
      branchId,
      actor,
      action: 'payment.verify',
      targetType: serviceType,
      targetId: sourceDocId,
      after: { status: 'approved', studentId: regData.userId || regData.studentId || null, classId: classId || null },
    });

    if (manualPayment) {
      await recordManualPaymentOrder({
        branchId, serviceType, sourceCollection, sourceDocId,
        regData: { ...regData, subjectName, groupName: className },
        amount: ledger.toNumber(resolvedAmount),
        actor,
      });
    }
  } catch (logErr) {
    console.error(`[${serviceType}] ledger/audit error:`, logErr.message);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const sanitizeSchedules = (schedules) =>
  (Array.isArray(schedules) ? schedules : [])
    .map((s) => ({
      day: s && s.day ? String(s.day).trim() : '',
      start: s && s.start ? String(s.start).trim() : '',
      end: s && s.end ? String(s.end).trim() : '',
    }))
    .filter((s) => s.day && s.start && s.end);

const toNonNegativeNumber = (value, fallback = 0) => {
  if (value === '' || value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const conflict409 = (res, e) =>
  res.status(409).json({ code: e._code || 'schedule-conflict', message: e._msg, conflicts: e.conflicts });

const classesRef = (branchId) => db.collection('branches').doc(branchId).collection('classes');

// ── Classes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/academic/classes
 * Body: { branchId, serviceType, data:{ subjectId, subjectName, teacherName,
 *         groupName, classroom, capacity, price, schedules, level?, studyYear? } }
 */
const createClass = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId || req.body.branchId;
    const { serviceType, data = {} } = req.body;
    if (!serviceType) return res.status(400).json({ code: 'missing-service', message: 'serviceType is required.' });
    if (!data.subjectId) return res.status(400).json({ code: 'missing-subject', message: 'subjectId is required.' });

    // Resolve the acting admin's identity (name) so the createdBy stamp + audit
    // entry are name-attributed, not just a uid.
    const actor = await resolveActor(req.user.uid);

    const schedules = sanitizeSchedules(data.schedules);
    const classroom = String(data.classroom || '').trim();
    const teacherName = String(data.teacherName || '').trim();

    // Start Month ('YYYY-MM') — the month the group officially begins. REQUIRED
    // for support (its subscription/reservation logic anchors to it); optional
    // and merely stored for language/training. Reservations are derived at
    // enrollment time in reservationService, so a class always carries this.
    const startMonth = normalizeMonthKey(data.startMonth);
    if (serviceType === 'support' && !startMonth)
      return res.status(400).json({ code: 'missing-start-month', message: 'شهر بدء المجموعة مطلوب (YYYY-MM).' });

    const payload = {
      subjectId: data.subjectId,
      subjectName: String(data.subjectName || '').trim(),
      serviceType,
      teacherName,
      groupName: String(data.groupName || '').trim(),
      classroom,
      schedules,
      capacity: toNonNegativeNumber(data.capacity, 0),
      price: toNonNegativeNumber(data.price, 0),
      priceType: data.priceType || (serviceType === 'support' ? 'monthly' : 'oneTime'),
      status: data.status || 'active',
      branchId,
      enrollmentCount: 0,
      // Support groups carry a groupType (normal vs low-level support). It is
      // meaningless for language/training, so we only persist it for support.
      ...(serviceType === 'support' ? { groupType: normalizeGroupType(data.groupType) } : {}),
      // Start Month — the group's official begin month (drives reservations).
      ...(startMonth ? { startMonth } : {}),
      ...(data.level ? { level: String(data.level).trim() } : {}),
      ...(data.studyYear ? { studyYear: data.studyYear } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: { uid: actor.uid, name: actor.name || '', email: actor.email || '' },
    };

    const newRef = classesRef(branchId).doc();
    try {
      await db.runTransaction(async (t) => {
        const snap = await t.get(classesRef(branchId)); // all reads before writes
        const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const conflicts = [
          ...findTeacherConflicts({ teacherName, classroom, schedules }, existing),
          ...findClassroomConflicts({ teacherName, classroom, schedules }, existing),
        ];
        if (conflicts.length) throw scheduleConflictError(conflicts);
        // Stamp the academic year the group belongs to (derived from now — the
        // group is created for the CURRENT academic year; no manual year picker).
        t.set(newRef, academicYear.withAcademicYear(payload));
      });
    } catch (e) {
      if (e._code === 'schedule-conflict') return conflict409(res, e);
      throw e;
    }

    await writeAudit({
      branchId,
      actor,
      action: 'group.create',
      targetType: 'class',
      targetId: newRef.id,
      after: {
        subjectId: payload.subjectId, subjectName: payload.subjectName,
        groupName: payload.groupName, teacherName: payload.teacherName,
        classroom: payload.classroom, serviceType,
        ...(payload.groupType ? { groupType: payload.groupType } : {}),
        ...(payload.startMonth ? { startMonth: payload.startMonth } : {}),
      },
    });

    return res.status(201).json({ id: newRef.id });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/academic/classes/:id
 * Body: { branchId, updates:{ teacherName?, groupName?, level?, subjectName?,
 *         classroom?, schedules?, capacity?, price?, status? } }
 */
const updateClass = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId || req.body.branchId;
    const classId = req.params.id;
    const updates = req.body.updates || {};
    if (!classId) return res.status(400).json({ code: 'missing-id', message: 'classId is required.' });

    const actor = await resolveActor(req.user.uid);
    const clean = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: { uid: actor.uid, name: actor.name || '', email: actor.email || '' },
    };
    ['teacherName', 'groupName', 'level', 'subjectName', 'classroom'].forEach((k) => {
      if (updates[k] != null) clean[k] = String(updates[k]).trim();
    });
    if (updates.schedules != null) clean.schedules = sanitizeSchedules(updates.schedules);
    if (updates.capacity != null) clean.capacity = toNonNegativeNumber(updates.capacity, 0);
    if (updates.price != null) clean.price = toNonNegativeNumber(updates.price, 0);
    if (updates.status != null) clean.status = updates.status;
    // groupType (support only) — not a schedule-defining field, so it never
    // triggers the conflict re-check below.
    if (updates.groupType != null) clean.groupType = normalizeGroupType(updates.groupType);
    // Start Month — validated 'YYYY-MM'. Changing it affects only FUTURE
    // enrollments; existing registrations keep their snapshotted window.
    if (updates.startMonth != null) {
      const mk = normalizeMonthKey(updates.startMonth);
      if (!mk) return res.status(400).json({ code: 'invalid-start-month', message: 'شهر البدء غير صالح (YYYY-MM).' });
      clean.startMonth = mk;
    }

    const docRef = classesRef(branchId).doc(classId);
    const touchesSchedule =
      updates.schedules != null || updates.teacherName != null ||
      updates.classroom != null || updates.status === 'active';

    let beforeData = null;
    try {
      await db.runTransaction(async (t) => {
        const curSnap = await t.get(docRef);
        if (!curSnap.exists) { const e = new Error('not-found'); e._status = 404; throw e; }
        const current = curSnap.data() || {};
        beforeData = current;

        if (touchesSchedule && (clean.status != null ? clean.status : (current.status || 'active')) === 'active') {
          const allSnap = await t.get(classesRef(branchId));
          const existing = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const candidate = {
            classId,
            teacherName: clean.teacherName != null ? clean.teacherName : current.teacherName,
            classroom: clean.classroom != null ? clean.classroom : current.classroom,
            schedules: clean.schedules != null ? clean.schedules : current.schedules,
          };
          const conflicts = [
            ...findTeacherConflicts(candidate, existing),
            ...findClassroomConflicts(candidate, existing),
          ];
          if (conflicts.length) throw scheduleConflictError(conflicts);
        }
        t.update(docRef, clean);
      });
    } catch (e) {
      if (e._status === 404) return res.status(404).json({ code: 'not-found', message: 'Class not found.' });
      if (e._code === 'schedule-conflict') return conflict409(res, e);
      throw e;
    }

    // Mirror the updated keys into `before` (from the pre-update snapshot) so the
    // history/feed can show exact field changes (e.g. classroom: 02 → 03).
    const before = {};
    if (beforeData) Object.keys(updates).forEach((k) => { before[k] = beforeData[k] ?? null; });
    await writeAudit({
      branchId,
      actor,
      action: 'group.update',
      targetType: 'class',
      targetId: classId,
      before,
      after: updates,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/academic/classes/:id?branchId=&force=
 * Safe-delete guard: blocked when the class still has approved enrollments
 * (enrollmentCount > 0) unless force=true — deactivate instead so enrolled
 * students' registration references stay valid. Audited as `group.delete`.
 */
const deleteClass = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId || req.body.branchId || req.query.branchId;
    const classId = req.params.id;
    const force = req.query.force === 'true' || req.body?.force === true;
    if (!classId) return res.status(400).json({ code: 'missing-id', message: 'classId is required.' });

    const docRef = classesRef(branchId).doc(classId);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ code: 'not-found', message: 'Class not found.' });
    const data = snap.data() || {};

    const enrolled = Number(data.enrollmentCount) || 0;
    if (!force && enrolled > 0) {
      return res.status(409).json({ code: 'class-has-registrations', count: enrolled, message: 'Class has approved registrations.' });
    }

    await docRef.delete();

    await writeAudit({
      branchId,
      actor: await resolveActor(req.user.uid),
      action: 'group.delete',
      targetType: 'class',
      targetId: classId,
      before: {
        subjectId: data.subjectId || null, subjectName: data.subjectName || null,
        groupName: data.groupName || null, teacherName: data.teacherName || null,
        classroom: data.classroom || null, serviceType: data.serviceType || null,
      },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── Registration removal (language / training) ────────────────────────────────

/**
 * Remove an approved language/training registration, server-side.
 *
 * This used to be a client-side `deleteDoc` + an enrollmentCount decrement. That
 * left the ledger untouched (Firestore rules deny client ledger writes anyway),
 * so the revenue this registration produced stayed on the books forever and the
 * owner's state-based alerts never moved after a deletion.
 *
 * Every removal now, in order:
 *   1. deletes the archive doc,
 *   2. re-counts enrollmentCount from the live archive (never a blind -1, which
 *      drifts on double-clicks and races),
 *   3. appends a ledger REVERSAL — history is preserved, net revenue drops,
 *   4. writes a `payment.delete` audit entry (the permanent event record).
 *
 * Steps 3–4 are best-effort: a logging failure must not resurrect a deleted row.
 */
async function removeRegistration(req, res, next, { collectionName, serviceType, targetType }) {
  try {
    const branchId = req.adminBranchId || req.body?.branchId || req.query.branchId;
    const docId = req.params.id;
    const reason = req.body?.reason || null;

    if (!branchId) return res.status(400).json({ code: 'missing-branch', message: 'branchId is required.' });
    if (!docId) return res.status(400).json({ code: 'missing-id', message: 'registrationId is required.' });

    const ref = db.collection('branches').doc(branchId).collection(collectionName).doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ code: 'not-found', message: 'Registration not found.' });

    const data = snap.data() || {};
    // Branch guard: an admin may never reach outside their own branch.
    if (req.adminBranchId && (data.branchId || branchId) !== req.adminBranchId)
      return res.status(403).json({ code: 'permission-denied', message: 'لا يمكنك إدارة تسجيل خارج فرعك.' });

    const classId = data.classId || null;
    await ref.delete();

    // Free the seat by RE-COUNTING, so the counter can't drift out of step with
    // the archive the alert engine now reads.
    if (classId) await recountClassEnrollment(branchId, classId, collectionName);

    const actor = { uid: req.user?.uid || '', email: req.user?.email || '', role: 'admin' };
    try {
      await ledger.recordReversal(
        ledger.ledgerId(collectionName, branchId, docId),
        { recordedBy: actor, reason: reason || 'registration deleted' }
      );
    } catch (e) {
      console.error(`[${collectionName} delete] reversal error:`, e.message);
    }
    await writeAudit({
      branchId, actor, action: 'payment.delete',
      targetType, targetId: docId,
      before: {
        status: data.status || null,
        studentId: data.userId || data.studentId || null,
        classId,
        amount: ledger.deriveAmount(serviceType, data),
      },
      reason,
    }).catch((e) => console.error(`[${collectionName} delete] audit error:`, e.message));

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * Recount a class's enrollmentCount from the live archives. Language/training
 * seats are one-doc-per-enrollment, so a plain size count is exact.
 */
async function recountClassEnrollment(branchId, classId, collectionName) {
  try {
    const snap = await db.collection('branches').doc(branchId).collection(collectionName)
      .where('classId', '==', classId).get();
    await classesRef(branchId).doc(classId).update({
      enrollmentCount: snap.size,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('recountClassEnrollment failed:', e.message);
  }
}

const deleteLanguageRegistration = (req, res, next) => removeRegistration(req, res, next, {
  collectionName: 'languagesRegistered', serviceType: 'language', targetType: 'languageRegistration',
});

const deleteTrainingRegistration = (req, res, next) => removeRegistration(req, res, next, {
  collectionName: 'trainingsRegistered', serviceType: 'training', targetType: 'trainingRegistration',
});

// ── Capacity helper (transactional read) ──────────────────────────────────────

function assertCapacityInTx(classSnap) {
  if (!classSnap.exists) return;
  const data = classSnap.data() || {};
  const capacity = Number(data.capacity) || 0;
  const enrolled = Number(data.enrollmentCount) || 0;
  if (capacity > 0 && enrolled >= capacity) {
    const e = new Error('class-full'); e._status = 409; e._code = 'class-full';
    e._msg = 'اكتمل العدد في هذه المجموعة.'; throw e;
  }
}

// ── Language approval ──────────────────────────────────────────────────────────

/**
 * POST /api/academic/registrations/language/verify
 * Body: { branchId, studentId, formId, adminName? }
 * Returns { success }.
 */
const verifyLanguage = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId || req.body.branchId;
    const { studentId, formId, adminName = '' } = req.body;
    if (!studentId || !formId)
      return res.status(400).json({ code: 'missing-params', message: 'studentId and formId are required.' });

    const verifiedBy = { uid: req.user.uid, email: req.user.email || '', name: adminName };
    const regRef = db.collection('branches').doc(branchId)
      .collection('languagesForms').doc(studentId)
      .collection('languageFormEntries').doc(formId);

    const preSnap = await regRef.get();
    if (!preSnap.exists) return res.status(404).json({ code: 'not-found', message: 'Language registration not found.' });
    const regData = preSnap.data() || {};

    // Student-conflict gate (non-transactional reads, fail fast).
    try {
      await assertNoStudentConflict(branchId, studentId, regData.schedules, {
        excludeClassId: regData.classId || null, studentName: regData.studentName || '',
      });
    } catch (e) {
      if (e._code === 'schedule-conflict') return conflict409(res, e);
      throw e;
    }

    const registeredRef = db.collection('branches').doc(branchId).collection('languagesRegistered').doc(formId);
    const userRef = db.collection('branches').doc(branchId).collection('users').doc(studentId);
    const classRef = regData.classId
      ? db.collection('branches').doc(branchId).collection('classes').doc(regData.classId) : null;

    const languageSummary = {
      formId,
      languageName: regData.languageName || '',
      levelLabel: regData.levelLabel || '',
      registeredAt: Date.now(),
      verifiedBy: adminName || req.user.email || null,
    };

    try {
      await db.runTransaction(async (t) => {
        if (classRef) assertCapacityInTx(await t.get(classRef)); // read before writes

        const yearLabel = academicYear.getAcademicYearLabel();
        t.update(regRef, {
          status: 'approved', verified: true, visibility: 'approved',
          verifiedAt: FieldValue.serverTimestamp(), verifiedBy,
          academicYear: yearLabel,
          updatedAt: FieldValue.serverTimestamp(),
        });
        t.set(registeredRef, {
          ...regData, formId, userId: studentId, branchId,
          status: 'registered',
          academicYear: yearLabel,
          registeredAt: FieldValue.serverTimestamp(),
          verifiedAt: FieldValue.serverTimestamp(), verifiedBy,
        });
        t.update(userRef, {
          'registrations.language': true,
          'registrations.languages': FieldValue.arrayUnion(languageSummary),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (classRef) t.update(classRef, { enrollmentCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      });
    } catch (e) {
      if (e._status === 409) return res.status(409).json({ code: e._code, message: e._msg });
      throw e;
    }

    await recordRegistrationRevenue({
      branchId, serviceType: 'language',
      sourceCollection: 'languagesRegistered', sourceDocId: formId,
      regData, classId: regData.classId,
      actor: { uid: req.user.uid, email: req.user.email || '', role: 'admin' },
      // Admin-side enrollment = money collected in person -> log a cash receipt.
      manualPayment: true,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── Training approval ──────────────────────────────────────────────────────────

/**
 * POST /api/academic/registrations/training/verify
 * Body: { branchId, studentId, entryId, adminName? }
 * Returns { success }.
 */
const verifyTraining = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId || req.body.branchId;
    const { studentId, entryId, adminName = '' } = req.body;
    if (!studentId || !entryId)
      return res.status(400).json({ code: 'missing-params', message: 'studentId and entryId are required.' });

    const verifiedBy = { uid: req.user.uid, email: req.user.email || '', name: adminName };
    const regRef = db.collection('branches').doc(branchId)
      .collection('trainingsForms').doc(studentId)
      .collection('trainingFormEntries').doc(entryId);

    const preSnap = await regRef.get();
    if (!preSnap.exists) return res.status(404).json({ code: 'not-found', message: 'Training registration not found.' });
    const regData = preSnap.data() || {};

    // Student-conflict gate.
    try {
      await assertNoStudentConflict(branchId, regData.userId || studentId, regData.schedules, {
        excludeClassId: regData.classId || null, studentName: regData.studentName || '',
      });
    } catch (e) {
      if (e._code === 'schedule-conflict') return conflict409(res, e);
      throw e;
    }

    // Training + user meta (mirror the previous client logic).
    let trainingMeta = null;
    if (regData.trainingId) {
      try {
        const tSnap = await db.collection('branches').doc(branchId).collection('trainings').doc(regData.trainingId).get();
        if (tSnap.exists) trainingMeta = tSnap.data();
      } catch { /* non-fatal */ }
    }
    let userProfile = null;
    if (regData.userId) {
      try {
        const uSnap = await db.collection('branches').doc(branchId).collection('users').doc(regData.userId).get();
        if (uSnap.exists) userProfile = uSnap.data();
      } catch { /* non-fatal */ }
    }

    const trainingTitle = regData.trainingTitle || (trainingMeta && trainingMeta.title) || '';
    const trainingPrice = regData.trainingPrice || (trainingMeta && trainingMeta.price) || null;
    const summaryRegisteredAt = Date.now();

    const registeredRef = db.collection('branches').doc(branchId).collection('trainingsRegistered').doc(entryId);
    const userRef = regData.userId
      ? db.collection('branches').doc(branchId).collection('users').doc(regData.userId) : null;
    const classRef = regData.classId
      ? db.collection('branches').doc(branchId).collection('classes').doc(regData.classId) : null;

    try {
      await db.runTransaction(async (t) => {
        if (classRef) assertCapacityInTx(await t.get(classRef));

        const yearLabel = academicYear.getAcademicYearLabel();
        t.update(regRef, {
          verified: true, status: 'approved',
          academicYear: yearLabel,
          verifiedAt: FieldValue.serverTimestamp(), verifiedBy,
        });
        t.set(registeredRef, {
          ...regData, registrationId: entryId, formId: entryId, branchId,
          trainingTitle, name: trainingTitle, trainingPrice,
          studentName: regData.studentName || (userProfile && (userProfile.name || userProfile.fullName)) || '',
          studentPhone: regData.studentPhone || (userProfile && userProfile.phoneNumber) || '',
          status: 'approved',
          academicYear: yearLabel,
          registeredAt: FieldValue.serverTimestamp(),
          verifiedAt: FieldValue.serverTimestamp(), verifiedBy,
        });
        if (userRef) {
          t.update(userRef, {
            'registrations.trainings': FieldValue.arrayUnion({
              registrationId: entryId, formId: entryId,
              trainingId: regData.trainingId || entryId,
              name: trainingTitle, title: trainingTitle,
              price: (trainingMeta && trainingMeta.price) || regData.trainingPrice || null,
              status: 'approved', registeredAt: summaryRegisteredAt, verifiedAt: summaryRegisteredAt,
            }),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        if (classRef) t.update(classRef, { enrollmentCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      });
    } catch (e) {
      if (e._status === 409) return res.status(409).json({ code: e._code, message: e._msg });
      throw e;
    }

    await recordRegistrationRevenue({
      branchId, serviceType: 'training',
      sourceCollection: 'trainingsRegistered', sourceDocId: entryId,
      regData: { ...regData, trainingTitle }, classId: regData.classId,
      amount: trainingPrice,
      actor: { uid: req.user.uid, email: req.user.email || '', role: 'admin' },
      // Admin-side enrollment = money collected in person -> log a cash receipt.
      manualPayment: true,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── Class-based admin direct-add ───────────────────────────────────────────────

/**
 * POST /api/academic/registrations/language/admin-add
 * Body: { branchId, data:{ userId, classId?, languageId?, levelId?, schedules?, … } }
 */
const adminAddLanguage = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId || req.body.branchId;
    const data = req.body.data || {};
    if (!data.userId) return res.status(400).json({ code: 'missing-user', message: 'userId is required.' });

    // Student-conflict gate.
    try {
      await assertNoStudentConflict(branchId, data.userId, data.schedules, {
        excludeClassId: data.classId || null, studentName: data.studentName || data.userName || '',
      });
    } catch (e) {
      if (e._code === 'schedule-conflict') return conflict409(res, e);
      throw e;
    }

    const col = db.collection('branches').doc(branchId).collection('languagesRegistered');
    const newRef = col.doc();
    const classRef = data.classId
      ? db.collection('branches').doc(branchId).collection('classes').doc(data.classId) : null;

    try {
      await db.runTransaction(async (t) => {
        // Duplicate guard (same student + language + level).
        if (data.languageId && data.levelId) {
          const dup = await t.get(col
            .where('userId', '==', data.userId)
            .where('languageId', '==', data.languageId)
            .where('levelId', '==', data.levelId).limit(1));
          if (!dup.empty) { const e = new Error('dup'); e._status = 409; e._code = 'duplicate-registration'; e._msg = 'الطالب مسجل مسبقاً في هذا المستوى من هذه اللغة.'; throw e; }
        }
        if (classRef) assertCapacityInTx(await t.get(classRef));
        t.set(newRef, {
          ...data, userId: data.userId, branchId,
          academicYear: academicYear.getAcademicYearLabel(),
          registeredAt: FieldValue.serverTimestamp(), verifiedAt: FieldValue.serverTimestamp(), source: 'admin',
        });
        if (classRef) t.update(classRef, { enrollmentCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      });
    } catch (e) {
      if (e._status === 409) return res.status(409).json({ code: e._code, message: e._msg });
      throw e;
    }
    await recordRegistrationRevenue({
      branchId, serviceType: 'language',
      sourceCollection: 'languagesRegistered', sourceDocId: newRef.id,
      regData: data, classId: data.classId,
      actor: { uid: req.user.uid, email: req.user.email || '', role: 'admin' },
      // Admin-side enrollment = money collected in person -> log a cash receipt.
      manualPayment: true,
    });
    return res.status(201).json({ id: newRef.id });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/academic/registrations/training/admin-add
 * Body: { branchId, data:{ userId, classId?, trainingId?, schedules?, … } }
 */
const adminAddTraining = async (req, res, next) => {
  try {
    const branchId = req.adminBranchId || req.body.branchId;
    const data = req.body.data || {};
    if (!data.userId) return res.status(400).json({ code: 'missing-user', message: 'userId is required.' });

    try {
      await assertNoStudentConflict(branchId, data.userId, data.schedules, {
        excludeClassId: data.classId || null, studentName: data.studentName || data.userName || '',
      });
    } catch (e) {
      if (e._code === 'schedule-conflict') return conflict409(res, e);
      throw e;
    }

    const col = db.collection('branches').doc(branchId).collection('trainingsRegistered');
    const newRef = col.doc();
    const classRef = data.classId
      ? db.collection('branches').doc(branchId).collection('classes').doc(data.classId) : null;

    try {
      await db.runTransaction(async (t) => {
        if (data.trainingId) {
          const dup = await t.get(col
            .where('userId', '==', data.userId)
            .where('trainingId', '==', data.trainingId).limit(1));
          if (!dup.empty) { const e = new Error('dup'); e._status = 409; e._code = 'duplicate-registration'; e._msg = 'الطالب مسجل مسبقاً في هذه الدورة التكوينية.'; throw e; }
        }
        if (classRef) assertCapacityInTx(await t.get(classRef));
        t.set(newRef, {
          ...data, userId: data.userId, branchId,
          academicYear: academicYear.getAcademicYearLabel(),
          registeredAt: FieldValue.serverTimestamp(), verifiedAt: FieldValue.serverTimestamp(), source: 'admin',
        });
        if (classRef) t.update(classRef, { enrollmentCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      });
    } catch (e) {
      if (e._status === 409) return res.status(409).json({ code: e._code, message: e._msg });
      throw e;
    }
    await recordRegistrationRevenue({
      branchId, serviceType: 'training',
      sourceCollection: 'trainingsRegistered', sourceDocId: newRef.id,
      regData: data, classId: data.classId,
      actor: { uid: req.user.uid, email: req.user.email || '', role: 'admin' },
      // Admin-side enrollment = money collected in person -> log a cash receipt.
      manualPayment: true,
    });
    return res.status(201).json({ id: newRef.id });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createClass,
  updateClass,
  deleteClass,
  verifyLanguage,
  verifyTraining,
  adminAddLanguage,
  adminAddTraining,
  deleteLanguageRegistration,
  deleteTrainingRegistration,
  // Exported for reuse by the Chargily registration factory so the live
  // (online-payment) enrollment path enforces the SAME capacity gate and records
  // the SAME ledger+audit as the admin approval paths.
  assertCapacityInTx,
  recordRegistrationRevenue,
};
