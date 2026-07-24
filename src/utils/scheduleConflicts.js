/**
 * scheduleConflicts.js
 * --------------------
 * THE single source of truth for schedule-conflict detection across the whole
 * application. Pure, dependency-light, and deliberately mirrored 1:1 by the
 * backend (backend/services/scheduleConflictService.js) so the client and the
 * Admin-SDK server enforce *identical* math — there is no "frontend-only" path.
 *
 * A schedule row is the canonical shape used everywhere:
 *     { day: <Arabic weekday>, start: "HH:MM", end: "HH:MM" }
 *
 * OVERLAP RULE (half-open interval intersection):
 *     two rows conflict  ⇔  sameDay AND newStart < existingEnd AND newEnd > existingStart
 *
 *   14:00-16:00 vs 15:00-17:00 → CONFLICT (partial)
 *   14:00-16:00 vs 13:00-15:00 → CONFLICT (partial)
 *   14:00-16:00 vs 14:00-16:00 → CONFLICT (exact)
 *   14:00-16:00 vs 14:30-15:30 → CONFLICT (containment)
 *   14:00-16:00 vs 16:00-18:00 → VALID   (adjacent / touching edge)
 *   14:00-16:00 vs 10:00-14:00 → VALID   (adjacent / touching edge)
 */

import { timeToMinutes } from './classValidation';

// ── Normalisation ─────────────────────────────────────────────────────────────

/** Trim a weekday label (already canonical Arabic, but be defensive). */
export const normalizeDay = (day) => String(day == null ? '' : day).trim();

/**
 * Normalise an entity name (teacher / classroom) for comparison: trim, collapse
 * internal whitespace, lowercase. "Mr.  Ali " and "mr. ali" become equal.
 */
export const normalizeName = (name) =>
  String(name == null ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase();

// ── Core interval math ────────────────────────────────────────────────────────

/**
 * Half-open interval intersection on minutes-since-midnight.
 * @returns {boolean} true when [aStart,aEnd) and [bStart,bEnd) overlap.
 */
export const intervalsOverlap = (aStart, aEnd, bStart, bEnd) =>
  aStart < bEnd && bStart < aEnd;

/**
 * Do two schedule rows occupy overlapping time on the same day?
 * Invalid / incomplete rows (missing day or time, start>=end) NEVER occupy time
 * and therefore never conflict — they are surfaced by validateSchedules instead.
 */
export const rowsConflict = (a, b) => {
  if (!a || !b) return false;
  if (normalizeDay(a.day) === '' || normalizeDay(a.day) !== normalizeDay(b.day)) return false;
  const aS = timeToMinutes(a.start);
  const aE = timeToMinutes(a.end);
  const bS = timeToMinutes(b.start);
  const bE = timeToMinutes(b.end);
  if (aS == null || aE == null || bS == null || bE == null) return false;
  if (aS >= aE || bS >= bE) return false; // invalid range — ignore
  return intervalsOverlap(aS, aE, bS, bE);
};

/**
 * Return every overlapping (a, b) row pair between two schedule arrays. Handles
 * partial overlap, containment, exact match AND multiple overlapping rows
 * (cartesian scan, since a class may have many weekly slots).
 * @returns {Array<{ a, b }>}
 */
export const findOverlappingRows = (schedulesA, schedulesB) => {
  const out = [];
  const listA = Array.isArray(schedulesA) ? schedulesA : [];
  const listB = Array.isArray(schedulesB) ? schedulesB : [];
  listA.forEach((a) => {
    listB.forEach((b) => {
      if (rowsConflict(a, b)) out.push({ a, b });
    });
  });
  return out;
};

/** Convenience boolean wrapper over findOverlappingRows. */
export const schedulesOverlap = (schedulesA, schedulesB) =>
  findOverlappingRows(schedulesA, schedulesB).length > 0;

// ── Conflict descriptors ──────────────────────────────────────────────────────
// A conflict carries every field the UI needs to render an actionable message —
// no generic errors. Shapes intentionally match the spec's display blocks.

const buildConflict = (type, { entityName, existing, attemptedRow, existingRow }) => ({
  type, // 'teacher' | 'classroom' | 'student'
  entityName, // teacher / classroom / student name
  existingGroupName: existing.groupName || existing.subjectName || '—',
  existingSubjectName: existing.subjectName || '',
  existingClassId: existing.id || existing.classId || null,
  day: normalizeDay(existingRow.day),
  existingStart: existingRow.start,
  existingEnd: existingRow.end,
  attemptedDay: normalizeDay(attemptedRow.day),
  attemptedStart: attemptedRow.start,
  attemptedEnd: attemptedRow.end,
});

/**
 * Teacher conflicts: the candidate class's teacher already teaches an overlapping
 * slot in another (active) class of the same branch.
 *
 * @param {{ classId?, teacherName, schedules }} candidate
 * @param {Array} existingClasses  sibling class docs (same branch)
 * @returns {Array<conflict>}
 */
export const findTeacherConflicts = (candidate, existingClasses) => {
  const conflicts = [];
  const candTeacher = normalizeName(candidate.teacherName);
  if (!candTeacher) return conflicts; // no teacher to clash
  (existingClasses || []).forEach((existing) => {
    if (!existing) return;
    if (candidate.classId && existing.id === candidate.classId) return; // skip self
    if ((existing.status || 'active') !== 'active') return; // inactive groups free their time
    if (normalizeName(existing.teacherName) !== candTeacher) return;
    findOverlappingRows(candidate.schedules, existing.schedules).forEach(({ a, b }) => {
      conflicts.push(buildConflict('teacher', {
        entityName: existing.teacherName || candidate.teacherName,
        existing,
        attemptedRow: a,
        existingRow: b,
      }));
    });
  });
  return conflicts;
};

/**
 * Classroom conflicts: the candidate class's classroom is already occupied by an
 * overlapping slot in another (active) class. No-op when classroom is empty.
 *
 * @param {{ classId?, classroom, schedules }} candidate
 * @param {Array} existingClasses
 * @returns {Array<conflict>}
 */
export const findClassroomConflicts = (candidate, existingClasses) => {
  const conflicts = [];
  const candRoom = normalizeName(candidate.classroom);
  if (!candRoom) return conflicts; // classroom optional — nothing to clash
  (existingClasses || []).forEach((existing) => {
    if (!existing) return;
    if (candidate.classId && existing.id === candidate.classId) return;
    if ((existing.status || 'active') !== 'active') return;
    if (normalizeName(existing.classroom) !== candRoom) return;
    findOverlappingRows(candidate.schedules, existing.schedules).forEach(({ a, b }) => {
      conflicts.push(buildConflict('classroom', {
        entityName: existing.classroom || candidate.classroom,
        existing,
        attemptedRow: a,
        existingRow: b,
      }));
    });
  });
  return conflicts;
};

/**
 * Student conflicts: the schedule the student is about to enrol in overlaps a
 * schedule they are already enrolled in (a different class).
 *
 * @param {Array} candidateSchedules         schedule rows of the target class
 * @param {Array} enrollments                [{ classId, groupName, subjectName, schedules }]
 * @param {{ excludeClassId?, studentName? }} [opts]
 * @returns {Array<conflict>}
 */
export const findStudentConflicts = (candidateSchedules, enrollments, opts = {}) => {
  const conflicts = [];
  const { excludeClassId = null, studentName = '' } = opts;
  (enrollments || []).forEach((enr) => {
    if (!enr) return;
    const enrClassId = enr.classId || enr.lessonId || null;
    // Re-enrolling / renewing the SAME class is never a self-conflict.
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
};

// ── Error helpers ─────────────────────────────────────────────────────────────

/**
 * Build a structured Error for a detected conflict. `err.code` is always
 * 'schedule-conflict'; `err.conflict` is the first conflict; `err.conflicts`
 * is the full list — callers render the actionable panel from these.
 */
export const scheduleConflictError = (conflicts) => {
  const list = Array.isArray(conflicts) ? conflicts : [conflicts];
  const first = list[0];
  const err = new Error('schedule-conflict');
  err.code = 'schedule-conflict';
  err.conflict = first;
  err.conflicts = list;
  err.message = formatConflictMessage(first);
  return err;
};

/** Human-readable (Arabic) summary line for a single conflict — for toasts/logs. */
export const formatConflictMessage = (c) => {
  if (!c) return 'تعارض في الجدول الزمني';
  if (c.type === 'teacher') {
    return `تعارض في جدول الأستاذ: ${c.entityName} مشغول بالفعل في "${c.existingGroupName}" يوم ${c.day} ${c.existingStart}-${c.existingEnd}.`;
  }
  if (c.type === 'classroom') {
    return `تعارض في القاعة: القاعة "${c.entityName}" محجوزة بالفعل لـ "${c.existingGroupName}" يوم ${c.day} ${c.existingStart}-${c.existingEnd}.`;
  }
  return `تعارض في جدول الطالب: ${c.entityName} مسجل بالفعل في "${c.existingGroupName}" يوم ${c.day} ${c.existingStart}-${c.existingEnd}.`;
};
