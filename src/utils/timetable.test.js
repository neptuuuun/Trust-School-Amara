import { buildWeeklyTimetable, toSlots, dayOrderIndex, todayLabel } from './timetable';

// Aug 1 2026 is a Saturday, so Aug 8 2026 10:00 is السبت 10:00 — a stable anchor.
const NOW = new Date(2026, 7, 8, 10, 0, 0);

const ENROLLMENTS = [
  { classId: 'c1', subjectName: 'الرياضيات', teacherName: 'أ. علي', classroom: 'C1', serviceType: 'support',
    schedules: [{ day: 'السبت', start: '11:00', end: '13:00' }] },
  { classId: 'c2', subjectName: 'الإنجليزية', teacherName: 'أ. سارة',
    schedules: [{ day: 'الأحد', start: '09:00', end: '10:30' }] },
  { classId: 'c3', subjectName: 'الفيزياء',
    schedules: [{ day: 'السبت', start: '09:00', end: '11:00' }] },
  // Duplicate of c1's Saturday row — must be de-duplicated.
  { classId: 'c1', subjectName: 'الرياضيات (نسخة)',
    schedules: [{ day: 'السبت', start: '11:00', end: '13:00' }] },
];

describe('timetable helpers', () => {
  test('dayOrderIndex uses Saturday-first order', () => {
    expect(dayOrderIndex('السبت')).toBe(0);
    expect(dayOrderIndex('الجمعة')).toBe(6);
    expect(dayOrderIndex('غير معروف')).toBe(-1);
  });

  test('todayLabel returns Arabic weekday for the given date', () => {
    expect(todayLabel(NOW)).toBe('السبت');
  });

  test('toSlots skips incomplete rows and de-duplicates identical class rows', () => {
    const slots = toSlots(ENROLLMENTS);
    // c1 (once, deduped), c2, c3 → 3 slots
    expect(slots).toHaveLength(3);
  });

  test('empty enrollments produce an empty-state model', () => {
    const model = buildWeeklyTimetable([], { now: NOW });
    expect(model.hasClasses).toBe(false);
    expect(model.days).toHaveLength(0);
    expect(model.nextSlot).toBeNull();
  });

  test('groups by day (Saturday first), sorts by time, marks today', () => {
    const model = buildWeeklyTimetable(ENROLLMENTS, { now: NOW });
    expect(model.hasClasses).toBe(true);
    expect(model.totalSlots).toBe(3);
    expect(model.days.map((d) => d.day)).toEqual(['السبت', 'الأحد']);

    const sat = model.days[0];
    expect(sat.isToday).toBe(true);
    // Sorted by start time: الفيزياء 09:00 before الرياضيات 11:00
    expect(sat.slots.map((s) => s.subject)).toEqual(['الفيزياء', 'الرياضيات']);
  });

  test('detects the ongoing class and the next upcoming class', () => {
    const model = buildWeeklyTimetable(ENROLLMENTS, { now: NOW });
    const sat = model.days[0];
    const physics = sat.slots.find((s) => s.subject === 'الفيزياء');
    const math = sat.slots.find((s) => s.subject === 'الرياضيات');

    // 09:00-11:00 contains 10:00 → ongoing
    expect(physics.isOngoing).toBe(true);
    // Next upcoming (soonest strictly-future start) is الرياضيات at 11:00
    expect(model.nextSlot.subject).toBe('الرياضيات');
    expect(math.isNext).toBe(true);
    expect(math.minutesUntil).toBe(60);
  });
});
