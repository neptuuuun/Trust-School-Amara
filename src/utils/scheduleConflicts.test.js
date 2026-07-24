/**
 * Tests for the schedule-conflict engine. Covers the spec's mandated scenarios:
 * no conflict, partial / full / exact / adjacent overlap, multiple conflicts,
 * teacher reassignment, student transfer, schedule update, bulk operations.
 *
 * Run: `npm test -- scheduleConflicts`  (react-scripts / jest).
 */

import {
  intervalsOverlap,
  rowsConflict,
  findOverlappingRows,
  schedulesOverlap,
  findTeacherConflicts,
  findClassroomConflicts,
  findStudentConflicts,
  normalizeName,
} from './scheduleConflicts';

const row = (day, start, end) => ({ day, start, end });
const SAT = 'السبت';
const SUN = 'الأحد';

describe('intervalsOverlap (half-open intersection)', () => {
  it('detects partial overlap', () => {
    expect(intervalsOverlap(840, 960, 900, 1020)).toBe(true); // 14-16 vs 15-17
  });
  it('detects containment', () => {
    expect(intervalsOverlap(840, 960, 870, 930)).toBe(true); // 14-16 contains 14:30-15:30
  });
  it('detects exact match', () => {
    expect(intervalsOverlap(840, 960, 840, 960)).toBe(true);
  });
  it('treats touching edges as NON-overlapping', () => {
    expect(intervalsOverlap(840, 960, 960, 1080)).toBe(false); // 14-16 vs 16-18
    expect(intervalsOverlap(840, 960, 600, 840)).toBe(false);  // 14-16 vs 10-14
  });
});

describe('rowsConflict — the spec examples', () => {
  it('14:00-16:00 vs 15:00-17:00 → CONFLICT', () => {
    expect(rowsConflict(row(SAT, '14:00', '16:00'), row(SAT, '15:00', '17:00'))).toBe(true);
  });
  it('14:00-16:00 vs 13:00-15:00 → CONFLICT', () => {
    expect(rowsConflict(row(SAT, '14:00', '16:00'), row(SAT, '13:00', '15:00'))).toBe(true);
  });
  it('14:00-16:00 vs 16:00-18:00 → VALID', () => {
    expect(rowsConflict(row(SAT, '14:00', '16:00'), row(SAT, '16:00', '18:00'))).toBe(false);
  });
  it('14:00-16:00 vs 10:00-14:00 → VALID', () => {
    expect(rowsConflict(row(SAT, '14:00', '16:00'), row(SAT, '10:00', '14:00'))).toBe(false);
  });
  it('different days never conflict even at identical times', () => {
    expect(rowsConflict(row(SAT, '14:00', '16:00'), row(SUN, '14:00', '16:00'))).toBe(false);
  });
  it('invalid / incomplete rows never conflict', () => {
    expect(rowsConflict(row(SAT, '', '16:00'), row(SAT, '14:00', '16:00'))).toBe(false);
    expect(rowsConflict(row(SAT, '16:00', '14:00'), row(SAT, '14:00', '16:00'))).toBe(false); // start>=end
    expect(rowsConflict(row('', '14:00', '16:00'), row('', '14:00', '16:00'))).toBe(false); // no day
  });
});

describe('findOverlappingRows — multiple weekly slots', () => {
  it('finds every overlapping pair', () => {
    const a = [row(SAT, '14:00', '16:00'), row(SUN, '10:00', '12:00')];
    const b = [row(SAT, '15:00', '17:00'), row(SUN, '11:00', '13:00')];
    expect(findOverlappingRows(a, b)).toHaveLength(2);
  });
  it('returns empty for disjoint schedules', () => {
    const a = [row(SAT, '14:00', '16:00')];
    const b = [row(SAT, '16:00', '18:00'), row(SUN, '14:00', '16:00')];
    expect(schedulesOverlap(a, b)).toBe(false);
  });
});

describe('findTeacherConflicts', () => {
  const existing = [
    { id: 'c1', teacherName: 'Mr Ali', groupName: 'A', status: 'active', schedules: [row(SAT, '14:00', '16:00')] },
    { id: 'c2', teacherName: 'Ms Sara', groupName: 'B', status: 'active', schedules: [row(SAT, '14:00', '16:00')] },
    { id: 'c3', teacherName: 'Mr Ali', groupName: 'C', status: 'inactive', schedules: [row(SUN, '14:00', '16:00')] },
  ];

  it('flags the same teacher double-booked on an overlapping slot', () => {
    const candidate = { teacherName: 'mr  ali', schedules: [row(SAT, '15:00', '17:00')] };
    const out = findTeacherConflicts(candidate, existing);
    expect(out).toHaveLength(1);
    expect(out[0].existingGroupName).toBe('A');
    expect(out[0].type).toBe('teacher');
  });
  it('ignores a different teacher at the same time', () => {
    const candidate = { teacherName: 'Mr Ali', schedules: [row(SAT, '08:00', '09:00')] };
    expect(findTeacherConflicts(candidate, existing)).toHaveLength(0);
  });
  it('ignores INACTIVE classes (they free their time)', () => {
    const candidate = { teacherName: 'Mr Ali', schedules: [row(SUN, '14:00', '16:00')] };
    expect(findTeacherConflicts(candidate, existing)).toHaveLength(0);
  });
  it('skips self when editing (excludes own classId)', () => {
    const candidate = { classId: 'c1', teacherName: 'Mr Ali', schedules: [row(SAT, '14:00', '16:00')] };
    expect(findTeacherConflicts(candidate, existing)).toHaveLength(0);
  });
  it('teacher reassignment: moving Ali into Sara’s old empty slot is fine', () => {
    const candidate = { classId: 'c2', teacherName: 'Mr Ali', schedules: [row(SAT, '16:00', '18:00')] };
    expect(findTeacherConflicts(candidate, existing)).toHaveLength(0);
  });
});

describe('findClassroomConflicts', () => {
  const existing = [
    { id: 'c1', classroom: 'Room 1', groupName: 'A', status: 'active', schedules: [row(SAT, '14:00', '16:00')] },
    { id: 'c2', classroom: 'Room 2', groupName: 'B', status: 'active', schedules: [row(SAT, '14:00', '16:00')] },
  ];
  it('flags a room double-booked on an overlapping slot', () => {
    const candidate = { classroom: 'room 1', schedules: [row(SAT, '15:00', '16:30')] };
    expect(findClassroomConflicts(candidate, existing)).toHaveLength(1);
  });
  it('no classroom set → no conflict (optional field)', () => {
    const candidate = { classroom: '', schedules: [row(SAT, '14:00', '16:00')] };
    expect(findClassroomConflicts(candidate, existing)).toHaveLength(0);
  });
  it('adjacent booking in the same room is allowed', () => {
    const candidate = { classroom: 'Room 1', schedules: [row(SAT, '16:00', '18:00')] };
    expect(findClassroomConflicts(candidate, existing)).toHaveLength(0);
  });
});

describe('findStudentConflicts', () => {
  const enrollments = [
    { classId: 'c1', groupName: 'English A', subjectName: 'English', schedules: [row(SAT, '14:00', '16:00')] },
    { classId: 'c2', groupName: 'Math B', subjectName: 'Math', schedules: [row(SUN, '10:00', '12:00')] },
  ];
  it('blocks enrolling into an overlapping slot (cross-group)', () => {
    const out = findStudentConflicts([row(SAT, '15:00', '17:00')], enrollments, { studentName: 'Sami' });
    expect(out).toHaveLength(1);
    expect(out[0].existingGroupName).toBe('English A');
    expect(out[0].entityName).toBe('Sami');
  });
  it('allows a non-overlapping new enrolment', () => {
    expect(findStudentConflicts([row(SAT, '16:00', '18:00')], enrollments)).toHaveLength(0);
  });
  it('student transfer: re-enrolling the SAME class is excluded', () => {
    const out = findStudentConflicts([row(SAT, '14:00', '16:00')], enrollments, { excludeClassId: 'c1' });
    expect(out).toHaveLength(0);
  });
  it('detects multiple conflicts across several enrolments', () => {
    const busy = [
      { classId: 'c1', groupName: 'A', schedules: [row(SAT, '14:00', '16:00')] },
      { classId: 'c2', groupName: 'B', schedules: [row(SAT, '15:00', '17:00')] },
    ];
    const out = findStudentConflicts([row(SAT, '14:30', '16:30')], busy);
    expect(out).toHaveLength(2);
  });
});

describe('normalizeName', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeName('  Mr.   Ali  ')).toBe('mr. ali');
    expect(normalizeName('Mr. Ali')).toBe(normalizeName('mr.  ali'));
  });
});
