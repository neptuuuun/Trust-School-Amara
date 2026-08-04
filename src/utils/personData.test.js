import { normalizeSchool, isValidSchool, DEFAULT_SCHOOL } from './personData';

// The educational-institution («المؤسسة التعليمية») field is MANDATORY on every
// person record and must never be stored empty — blank falls back to «حر».
describe('school field rule (personData)', () => {
  test('DEFAULT_SCHOOL is «حر»', () => {
    expect(DEFAULT_SCHOOL).toBe('حر');
  });

  test('normalizeSchool trims and falls back to «حر» when blank/null', () => {
    expect(normalizeSchool('  ثانوية الأمل ')).toBe('ثانوية الأمل');
    expect(normalizeSchool('')).toBe('حر');
    expect(normalizeSchool('   ')).toBe('حر');
    expect(normalizeSchool(null)).toBe('حر');
    expect(normalizeSchool(undefined)).toBe('حر');
  });

  test('normalizeSchool never returns an empty string', () => {
    [null, undefined, '', '   ', 0, false].forEach((v) => {
      expect(normalizeSchool(v).length).toBeGreaterThan(0);
    });
  });

  test('isValidSchool requires a non-empty value (including «حر»)', () => {
    expect(isValidSchool('حر')).toBe(true);
    expect(isValidSchool('مدرسة')).toBe(true);
    expect(isValidSchool('')).toBe(false);
    expect(isValidSchool('   ')).toBe(false);
    expect(isValidSchool(null)).toBe(false);
  });
});
