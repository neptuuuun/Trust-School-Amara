import {
  normalizeTeacherName,
  groupByTeacher,
  deriveTeacherCategories,
  teacherCategorySet,
  teacherTeachesCategory,
  SERVICE_TYPES,
} from './teacherGroups';

describe('normalizeTeacherName', () => {
  test('trims, collapses whitespace, lowercases', () => {
    expect(normalizeTeacherName('  Ahmed   Ali ')).toBe('ahmed ali');
    expect(normalizeTeacherName('أحمد')).toBe('أحمد');
    expect(normalizeTeacherName(null)).toBe('');
    expect(normalizeTeacherName(undefined)).toBe('');
  });
});

describe('groupByTeacher', () => {
  test('collapses a teacher with multiple groups into one entry', () => {
    const items = [
      { id: 'a', teacherName: 'Ahmed', groupLabel: 'Group A' },
      { id: 'b', teacherName: 'Ahmed', groupLabel: 'Group B' },
      { id: 'c', teacherName: 'Ahmed', groupLabel: 'Group C' },
    ];
    const groups = groupByTeacher(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].teacherName).toBe('Ahmed');
    expect(groups[0].groups.map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });

  test('dedups teachers whose names differ only by case/spacing', () => {
    const items = [
      { id: 'a', teacherName: 'Ahmed Ali' },
      { id: 'b', teacherName: 'ahmed  ali ' },
    ];
    const groups = groupByTeacher(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].groups).toHaveLength(2);
    // Display name comes from the first occurrence.
    expect(groups[0].teacherName).toBe('Ahmed Ali');
  });

  test('keeps distinct teachers separate and sorts by name', () => {
    const items = [
      { id: '1', teacherName: 'زينب' },
      { id: '2', teacherName: 'أحمد' },
    ];
    const groups = groupByTeacher(items);
    expect(groups.map((g) => g.teacherName)).toEqual(['أحمد', 'زينب']);
  });

  test('a single-group teacher yields one group', () => {
    const groups = groupByTeacher([{ id: 'x', teacherName: 'Solo' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].groups).toHaveLength(1);
  });

  test('handles missing/empty teacher names without throwing', () => {
    const groups = groupByTeacher([{ id: 'x' }, { id: 'y', teacherName: '' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].teacherName).toBe('');
    expect(groups[0].groups).toHaveLength(2);
  });

  test('tolerates non-array input', () => {
    expect(groupByTeacher(undefined)).toEqual([]);
    expect(groupByTeacher(null)).toEqual([]);
  });
});

describe('deriveTeacherCategories', () => {
  test('maps each teacher to the set of serviceTypes they teach', () => {
    const classes = [
      { teacherName: 'Ahmed', serviceType: 'support' },
      { teacherName: 'Ahmed', serviceType: 'language' },
      { teacherName: 'Sara', serviceType: 'training' },
    ];
    const derived = deriveTeacherCategories(classes);
    expect([...derived.get('ahmed')].sort()).toEqual(['language', 'support']);
    expect([...derived.get('sara')]).toEqual(['training']);
  });

  test('ignores classes without a teacher or serviceType', () => {
    const derived = deriveTeacherCategories([
      { serviceType: 'support' },
      { teacherName: 'X' },
    ]);
    expect(derived.size).toBe(0);
  });
});

describe('teacherCategorySet', () => {
  test('unions explicit serviceTypes with derived ones', () => {
    const derived = deriveTeacherCategories([{ teacherName: 'Ahmed', serviceType: 'language' }]);
    const set = teacherCategorySet({ name: 'Ahmed', serviceTypes: ['support'] }, derived);
    expect([...set].sort()).toEqual(['language', 'support']);
  });

  test('explicit-only when no derived classes exist', () => {
    const set = teacherCategorySet({ name: 'New', serviceTypes: ['training'] }, new Map());
    expect([...set]).toEqual(['training']);
  });

  test('empty when teacher has neither explicit nor derived categories', () => {
    expect(teacherCategorySet({ name: 'Ghost' }, new Map()).size).toBe(0);
  });
});

describe('teacherTeachesCategory', () => {
  const derived = deriveTeacherCategories([
    { teacherName: 'LangTeacher', serviceType: 'language' },
    { teacherName: 'MultiTeacher', serviceType: 'language' },
    { teacherName: 'MultiTeacher', serviceType: 'support' },
  ]);

  test('a language-only teacher shows for language, not support/training', () => {
    const t = { name: 'LangTeacher' };
    expect(teacherTeachesCategory(t, 'language', derived)).toBe(true);
    expect(teacherTeachesCategory(t, 'support', derived)).toBe(false);
    expect(teacherTeachesCategory(t, 'training', derived)).toBe(false);
  });

  test('a multi-category teacher shows for each of their categories', () => {
    const t = { name: 'MultiTeacher' };
    expect(teacherTeachesCategory(t, 'language', derived)).toBe(true);
    expect(teacherTeachesCategory(t, 'support', derived)).toBe(true);
    expect(teacherTeachesCategory(t, 'training', derived)).toBe(false);
  });

  test('an unassigned teacher with no classes shows in every category', () => {
    const t = { name: 'Fresh' };
    SERVICE_TYPES.forEach((st) => {
      expect(teacherTeachesCategory(t, st, derived)).toBe(true);
    });
  });

  test('an explicit serviceTypes assignment scopes the teacher', () => {
    const t = { name: 'Fresh', serviceTypes: ['support'] };
    expect(teacherTeachesCategory(t, 'support', derived)).toBe(true);
    expect(teacherTeachesCategory(t, 'language', derived)).toBe(false);
  });
});
