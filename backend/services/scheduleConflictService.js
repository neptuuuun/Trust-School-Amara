/**
 * scheduleConflictService.js  (backend / Admin SDK)
 * -------------------------------------------------
 * Server-side mirror of src/utils/scheduleConflicts.js. The interval math is
 * IDENTICAL by design — this is the unbypassable enforcement point for every
 * write that flows through the Express backend (support registrations).
 *
 * In addition to the pure engine it exposes Firestore-querying helpers that load
 * an entity's existing schedules via the Admin SDK and assert there is no
 * conflict, throwing a structured error that the controllers translate to HTTP.
 *
 * Schedule row shape (canonical): { day: <Arabic weekday>, start: "HH:MM", end }
 */

const { db } = require('../config/firebase');

// ── Time parsing (mirror of classValidation.timeToMinutes) ────────────────────

function timeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

const normalizeDay = (day) => String(day == null ? '' : day).trim();
const normalizeName = (name) =>
  String(name == null ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase();

// ── Core interval math ────────────────────────────────────────────────────────

const intervalsOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

function rowsConflict(a, b) {
  if (!a || !b) return false;
  if (normalizeDay(a.day) === '' || normalizeDay(a.day) !== normalizeDay(b.day)) return false;
  const aS = timeToMinutes(a.start);
  const aE = timeToMinutes(a.end);
  const bS = timeToMinutes(b.start);
  const bE = timeToMinutes(b.end);
  if (aS == null || aE == null || bS == null || bE == null) return false;
  if (aS >= aE || bS >= bE) return false;
  return intervalsOverlap(aS, aE, bS, bE);
}

function findOverlappingRows(schedulesA, schedulesB) {
  const out = [];
  const A = Array.isArray(schedulesA) ? schedulesA : [];
  const B = Array.isArray(schedulesB) ? schedulesB : [];
  A.forEach((a) => B.forEach((b) => { if (rowsConflict(a, b)) out.push({ a, b }); }));
  return out;
}

function buildConflict(type, { entityName, existing, attemptedRow, existingRow }) {
  return {
    type,
    entityName,
    existingGroupName: existing.groupName || existing.subjectName || existing.lessonName || '—',
    existingClassId: existing.id || existing.classId || existing.lessonId || null,
    day: normalizeDay(existingRow.day),
    existingStart: existingRow.start,
    existingEnd: existingRow.end,
    attemptedStart: attemptedRow.start,
    attemptedEnd: attemptedRow.end,
  };
}

function findStudentConflicts(candidateSchedules, enrollments, opts = {}) {
  const { excludeClassId = null, studentName = '' } = opts;
  const conflicts = [];
  (enrollments || []).forEach((enr) => {
    if (!enr) return;
    const enrClassId = enr.classId || enr.lessonId || null;
    if (excludeClassId && enrClassId && enrClassId === excludeClassId) return;
    findOverlappingRows(candidateSchedules, enr.schedules).forEach(({ a, b }) => {
      conflicts.push(buildConflict('student', {
        entityName: studentName || enr.studentName || '—',
        existing: enr,
        attemptedRow: a,
        existingRow: b,
      }));
    });
  });
  return conflicts;
}

function findTeacherConflicts(candidate, existingClasses) {
  const candTeacher = normalizeName(candidate.teacherName);
  const conflicts = [];
  if (!candTeacher) return conflicts;
  (existingClasses || []).forEach((existing) => {
    if (!existing) return;
    if (candidate.classId && existing.id === candidate.classId) return;
    if ((existing.status || 'active') !== 'active') return;
    if (normalizeName(existing.teacherName) !== candTeacher) return;
    findOverlappingRows(candidate.schedules, existing.schedules).forEach(({ a, b }) => {
      conflicts.push(buildConflict('teacher', {
        entityName: existing.teacherName || candidate.teacherName,
        existing, attemptedRow: a, existingRow: b,
      }));
    });
  });
  return conflicts;
}

function findClassroomConflicts(candidate, existingClasses) {
  const candRoom = normalizeName(candidate.classroom);
  const conflicts = [];
  if (!candRoom) return conflicts;
  (existingClasses || []).forEach((existing) => {
    if (!existing) return;
    if (candidate.classId && existing.id === candidate.classId) return;
    if ((existing.status || 'active') !== 'active') return;
    if (normalizeName(existing.classroom) !== candRoom) return;
    findOverlappingRows(candidate.schedules, existing.schedules).forEach(({ a, b }) => {
      conflicts.push(buildConflict('classroom', {
        entityName: existing.classroom || candidate.classroom,
        existing, attemptedRow: a, existingRow: b,
      }));
    });
  });
  return conflicts;
}

function formatConflictMessage(c) {
  if (!c) return 'تعارض في الجدول الزمني';
  if (c.type === 'teacher') {
    return `تعارض في جدول الأستاذ: ${c.entityName} مشغول في "${c.existingGroupName}" يوم ${c.day} ${c.existingStart}-${c.existingEnd}.`;
  }
  if (c.type === 'classroom') {
    return `تعارض في القاعة: "${c.entityName}" محجوزة لـ "${c.existingGroupName}" يوم ${c.day} ${c.existingStart}-${c.existingEnd}.`;
  }
  return `تعارض في جدول الطالب: مسجّل بالفعل في "${c.existingGroupName}" يوم ${c.day} ${c.existingStart}-${c.existingEnd}.`;
}

/** HTTP-shaped conflict error (controllers map _status/_code/_msg → res). */
function scheduleConflictError(conflicts) {
  const list = Array.isArray(conflicts) ? conflicts : [conflicts];
  const e = new Error('schedule-conflict');
  e._status = 409;
  e._code = 'schedule-conflict';
  e._msg = formatConflictMessage(list[0]);
  e.conflicts = list;
  return e;
}

// ── Admin-SDK data gathering ──────────────────────────────────────────────────

/**
 * Collect the schedules a student currently occupies across ALL registration
 * stores, branch-scoped. Only "active" (seat-occupying) registrations count:
 *   - languagesRegistered / trainingsRegistered : status registered/approved/verified
 *   - supportLessonRegistrations               : status verified AND not expired
 * @returns {Promise<Array<{ classId, groupName, subjectName, schedules }>>}
 */
async function getStudentEnrollments(branchId, userId, { now = new Date() } = {}) {
  if (!branchId || !userId) return [];
  const out = [];

  const branchRef = db.collection('branches').doc(branchId);
  const pushFrom = (snap) => {
    snap.forEach((d) => {
      const x = d.data() || {};
      if (!Array.isArray(x.schedules) || x.schedules.length === 0) return;
      out.push({
        classId: x.classId || x.lessonId || null,
        groupName: x.groupName || x.subjectName || x.languageName || x.trainingName || '—',
        subjectName: x.subjectName || x.languageName || x.trainingName || '',
        schedules: x.schedules,
      });
    });
  };

  // Approved language + training archives (branch subcollections).
  const [langSnap, trainSnap] = await Promise.all([
    branchRef.collection('languagesRegistered').where('userId', '==', userId).get().catch(() => ({ forEach() {} })),
    branchRef.collection('trainingsRegistered').where('userId', '==', userId).get().catch(() => ({ forEach() {} })),
  ]);
  pushFrom(langSnap);
  pushFrom(trainSnap);

  // Support (global collection, filtered to active verified subscriptions).
  const supportSnap = await db.collection('supportLessonRegistrations')
    .where('userId', '==', userId).get().catch(() => ({ docs: [] }));
  (supportSnap.docs || []).forEach((d) => {
    const x = d.data() || {};
    if (x.branchId !== branchId) return;
    if (String(x.status || '').toLowerCase() !== 'verified') return;
    const end = x.endDate && x.endDate.toDate ? x.endDate.toDate() : (x.endDate ? new Date(x.endDate) : null);
    if (end && end <= now) return; // expired — frees the slot
    if (!Array.isArray(x.schedules) || x.schedules.length === 0) return;
    out.push({
      classId: x.classId || x.lessonId || null,
      groupName: x.groupName || x.subjectName || x.lessonName || '—',
      subjectName: x.subjectName || x.lessonName || '',
      schedules: x.schedules,
    });
  });

  return out;
}

/**
 * Throw a schedule-conflict error if enrolling `userId` into `candidateSchedules`
 * would overlap an existing enrolment. `excludeClassId` skips the target class
 * itself (renewals / re-verification of the same registration).
 */
async function assertNoStudentConflict(branchId, userId, candidateSchedules, opts = {}) {
  if (!Array.isArray(candidateSchedules) || candidateSchedules.length === 0) return;
  const enrollments = await getStudentEnrollments(branchId, userId, opts);
  const conflicts = findStudentConflicts(candidateSchedules, enrollments, opts);
  if (conflicts.length) throw scheduleConflictError(conflicts);
}

module.exports = {
  timeToMinutes,
  normalizeName,
  intervalsOverlap,
  rowsConflict,
  findOverlappingRows,
  findStudentConflicts,
  findTeacherConflicts,
  findClassroomConflicts,
  formatConflictMessage,
  scheduleConflictError,
  getStudentEnrollments,
  assertNoStudentConflict,
};
