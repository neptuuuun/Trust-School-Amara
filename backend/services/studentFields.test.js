/**
 * Tests for the shared student field parsers (used by BOTH individual
 * registration and the bulk importer).
 *
 * Run: `node backend/services/studentFields.test.js`
 * Exits non-zero on the first failure.
 */

const assert = require('assert');
const F = require('./studentFields');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; }
  catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

const NOW = new Date(2026, 10, 19, 10, 0, 0); // 19 Nov 2026 → AY 2026-2027

// ── Level (المستوى الدراسي) ──────────────────────────────────────────────────
const LEVEL_CASES = [
  ['sec2', 'sec2'], ['SEC2', 'sec2'], ['mid1', 'mid1'],
  ['2AS', 'sec2'], ['2 AS', 'sec2'], ['2as', 'sec2'], ['2.A.S', 'sec2'], ['2ème AS', 'sec2'], ['2eme AS', 'sec2'],
  ['1AM', 'mid1'], ['4AM', 'mid4'], ['3 AM', 'mid3'],
  ['ثانية ثانوي', 'sec2'], ['السنة الثانية ثانوي', 'sec2'], ['الثانية ثانوي', 'sec2'], ['ثانيه ثانوي', 'sec2'],
  ['أولى متوسط', 'mid1'], ['اولى متوسط', 'mid1'], ['السنة الأولى متوسط', 'mid1'], ['رابعة متوسط', 'mid4'],
  ['ثالثة ثانوي', 'sec3'], ['2 ثانوي', 'sec2'], ['٢ ثانوي', 'sec2'], ['3ثانوي', 'sec3'], ['4 متوسط', 'mid4'],
];
LEVEL_CASES.forEach(([input, expected]) =>
  test(`parseLevel("${input}") → ${expected}`, () => {
    const r = F.parseLevel(input);
    assert.strictEqual(r.error, undefined, r.error);
    assert.strictEqual(r.value, expected);
  }));
test('parseLevel blank → null, no error', () => assert.deepStrictEqual(F.parseLevel('  '), { value: null }));
test('parseLevel "4AS" (no 4th secondary year) → error', () => assert.ok(F.parseLevel('4AS').error));
test('parseLevel "5 متوسط" → error', () => assert.ok(F.parseLevel('5 متوسط').error));
test('parseLevel garbage → error with examples', () => assert.ok(/2AS/.test(F.parseLevel('banana').error)));
test('schoolLevelOf maps stage', () => {
  assert.strictEqual(F.schoolLevelOf('mid3'), 'middle');
  assert.strictEqual(F.schoolLevelOf('sec1'), 'high');
  assert.strictEqual(F.schoolLevelOf(null), null);
});
test('levelLabel gives the Arabic short label', () => assert.strictEqual(F.levelLabel('sec2'), 'ثانية ثانوي'));

// ── Academic year ────────────────────────────────────────────────────────────
test('parseAcademicYearValue accepts dash / slash / spaces', () => {
  assert.strictEqual(F.parseAcademicYearValue('2026-2027').value, '2026-2027');
  assert.strictEqual(F.parseAcademicYearValue('2026/2027').value, '2026-2027');
  assert.strictEqual(F.parseAcademicYearValue(' 2026 - 2027 ').value, '2026-2027');
  assert.strictEqual(F.parseAcademicYearValue('٢٠٢٦-٢٠٢٧').value, '2026-2027');
});
test('parseAcademicYearValue rejects non-consecutive years', () => assert.ok(F.parseAcademicYearValue('2026-2028').error));
test('parseAcademicYearValue blank → null', () => assert.strictEqual(F.parseAcademicYearValue('').value, null));
test('allowedAcademicYears = current + next', () =>
  assert.deepStrictEqual(F.allowedAcademicYears(NOW), { current: '2026-2027', next: '2027-2028' }));
test('allowedAcademicYears in May still belongs to the cycle that started last July', () =>
  assert.deepStrictEqual(F.allowedAcademicYears(new Date(2027, 4, 10)), { current: '2026-2027', next: '2027-2028' }));

// ── Annual fee status ────────────────────────────────────────────────────────
['مدفوع', 'مدفوعة', 'PAID', 'paid', 'نعم', 'yes', '1', 'TRUE', '✓'].forEach((v) =>
  test(`parseFeeStatus("${v}") → paid`, () => assert.strictEqual(F.parseFeeStatus(v).value, 'paid')));
['غير مدفوع', 'NOT PAID', 'unpaid', 'لا', 'no', '0', 'FALSE', 'لم يدفع'].forEach((v) =>
  test(`parseFeeStatus("${v}") → unpaid`, () => assert.strictEqual(F.parseFeeStatus(v).value, 'unpaid')));
test('parseFeeStatus blank → null (caller decides default)', () => assert.deepStrictEqual(F.parseFeeStatus(''), { value: null }));
test('parseFeeStatus unknown → error', () => assert.ok(F.parseFeeStatus('ربما').error));

// ── Phone ────────────────────────────────────────────────────────────────────
test('parsePhone keeps a valid local number', () => assert.deepStrictEqual(F.parsePhone('0550 12 34 56'), { value: '0550123456' }));
test('parsePhone restores the leading 0 Excel dropped — and warns', () => {
  const r = F.parsePhone(550123456);
  assert.strictEqual(r.value, '0550123456');
  assert.ok(r.warning);
});
test('parsePhone accepts +213', () => assert.strictEqual(F.parsePhone('+213 550 12 34 56').value, '+213550123456'));
test('parsePhone rejects letters', () => assert.ok(F.parsePhone('05A0123456').error));
test('parsePhone rejects too-short numbers', () => assert.ok(F.parsePhone('05512').error));
test('phoneKey folds +213 / 00213 to the local 0', () => {
  assert.strictEqual(F.phoneKey('+213550123456'), '0550123456');
  assert.strictEqual(F.phoneKey('00213550123456'), '0550123456');
  assert.strictEqual(F.phoneKey('0550-12-34-56'), '0550123456');
});

// ── Dates ────────────────────────────────────────────────────────────────────
test('parseDateValue ISO', () => assert.strictEqual(F.parseDateValue('2008-05-14').value, '2008-05-14'));
test('parseDateValue day-first (Algerian convention)', () => assert.strictEqual(F.parseDateValue('14/05/2008').value, '2008-05-14'));
test('parseDateValue dotted', () => assert.strictEqual(F.parseDateValue('4.5.2008').value, '2008-05-04'));
test('parseDateValue ISO datetime', () => assert.strictEqual(F.parseDateValue('2008-05-14T00:00:00.000Z').value, '2008-05-14'));
test('parseDateValue Excel serial', () => assert.strictEqual(F.parseDateValue('39582').value, '2008-05-14'));
test('parseDateValue impossible date → error', () => assert.ok(F.parseDateValue('31/02/2008').error));
test('parseDateValue garbage → error', () => assert.ok(F.parseDateValue('next tuesday').error));
test('parseBirthDate rejects the future', () => assert.ok(F.parseBirthDate('2030-01-01', NOW).error));
test('parseBirthDate blank → null', () => assert.strictEqual(F.parseBirthDate('', NOW).value, null));

// ── Email / text / average ───────────────────────────────────────────────────
test('parseEmail lowercases + trims', () => assert.strictEqual(F.parseEmail('  A@B.COM ').value, 'a@b.com'));
test('parseEmail invalid → error', () => assert.ok(F.parseEmail('not-an-email').error));
test('parseEmail blank → null', () => assert.strictEqual(F.parseEmail('').value, null));
test('parseOptionalText collapses whitespace', () =>
  assert.strictEqual(F.parseOptionalText('  حي   النصر  ', { max: 50, label: 'العنوان' }).value, 'حي النصر'));
test('parseOptionalText too long → error', () =>
  assert.ok(F.parseOptionalText('x'.repeat(300), { max: 250, label: 'العنوان' }).error));
test('parseAverage reuses support classification (≥11 normal)', () => {
  assert.deepStrictEqual(F.parseAverage('12.5'), { value: 12.5, classification: 'normal' });
  assert.deepStrictEqual(F.parseAverage('9,75'), { value: 9.75, classification: 'support_level' });
});
test('parseAverage out of range → error', () => assert.ok(F.parseAverage('25').error));
test('parseAverage blank → null', () => assert.deepStrictEqual(F.parseAverage(''), { value: null, classification: null }));

console.log(`✓ studentFields: ${passed} assertions passed`);
