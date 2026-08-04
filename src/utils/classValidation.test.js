import {
  timeToMinutes,
  validateSubject,
  validateClass,
  validateSchedules,
  sanitizeSchedules,
} from './classValidation';

describe('timeToMinutes', () => {
  test('parses valid HH:MM', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
  });
  test('rejects invalid values', () => {
    expect(timeToMinutes('24:00')).toBeNull();
    expect(timeToMinutes('9:60')).toBeNull();
    expect(timeToMinutes('abc')).toBeNull();
    expect(timeToMinutes(null)).toBeNull();
  });
});

describe('validateSubject', () => {
  test('requires a name', () => {
    expect(validateSubject({ name: 'الرياضيات' }).valid).toBe(true);
    expect(validateSubject({ name: '   ' }).valid).toBe(false);
    expect(validateSubject({}).valid).toBe(false);
  });
});

describe('validateClass', () => {
  test('requires teacher + group name', () => {
    expect(validateClass({ teacherName: 'أ. علي', groupName: 'مجموعة 1' }).valid).toBe(true);
    const r = validateClass({ teacherName: '', groupName: '' });
    expect(r.valid).toBe(false);
    expect(r.errors.teacherName).toBeTruthy();
    expect(r.errors.groupName).toBeTruthy();
  });

  test('support classes require groupType AND startMonth', () => {
    const opts = { requireGroupType: true, requireStartMonth: true };
    const bad = validateClass({ teacherName: 'A', groupName: 'G' }, opts);
    expect(bad.valid).toBe(false);
    expect(bad.errors.groupType).toBeTruthy();
    expect(bad.errors.startMonth).toBeTruthy();

    const good = validateClass(
      { teacherName: 'A', groupName: 'G', groupType: 'normal_support', startMonth: '2026-09' },
      opts
    );
    expect(good.valid).toBe(true);
  });

  test('rejects a negative price and a non-integer capacity', () => {
    expect(validateClass({ teacherName: 'A', groupName: 'G', price: -5 }).errors.price).toBeTruthy();
    expect(validateClass({ teacherName: 'A', groupName: 'G', capacity: 2.5 }).errors.capacity).toBeTruthy();
    expect(validateClass({ teacherName: 'A', groupName: 'G', price: 1200, capacity: 20 }).valid).toBe(true);
  });
});

describe('validateSchedules', () => {
  test('requires at least one slot', () => {
    expect(validateSchedules([]).valid).toBe(false);
  });
  test('flags start >= end', () => {
    const r = validateSchedules([{ day: 'السبت', start: '11:00', end: '10:00' }]);
    expect(r.valid).toBe(false);
    expect(r.rowErrors[0]).toBeTruthy();
  });
  test('detects same-day overlap', () => {
    const r = validateSchedules([
      { day: 'السبت', start: '09:00', end: '11:00' },
      { day: 'السبت', start: '10:00', end: '12:00' },
    ]);
    expect(r.valid).toBe(false);
    expect(r.rowErrors[1]).toContain('يتداخل');
  });
  test('detects exact duplicate', () => {
    const r = validateSchedules([
      { day: 'الأحد', start: '09:00', end: '11:00' },
      { day: 'الأحد', start: '09:00', end: '11:00' },
    ]);
    expect(r.valid).toBe(false);
    expect(r.rowErrors[1]).toContain('مكرر');
  });
  test('adjacent (touching) slots on the same day are valid', () => {
    const r = validateSchedules([
      { day: 'السبت', start: '09:00', end: '11:00' },
      { day: 'السبت', start: '11:00', end: '13:00' },
    ]);
    expect(r.valid).toBe(true);
  });
  test('same time on different days is valid', () => {
    const r = validateSchedules([
      { day: 'السبت', start: '09:00', end: '11:00' },
      { day: 'الأحد', start: '09:00', end: '11:00' },
    ]);
    expect(r.valid).toBe(true);
  });
});

describe('sanitizeSchedules', () => {
  test('drops incomplete rows and trims', () => {
    const out = sanitizeSchedules([
      { day: ' السبت ', start: ' 09:00 ', end: ' 11:00 ' },
      { day: 'الأحد', start: '', end: '10:00' },
      { day: '', start: '09:00', end: '11:00' },
    ]);
    expect(out).toEqual([{ day: 'السبت', start: '09:00', end: '11:00' }]);
  });
});
