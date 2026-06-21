/**
 * Tests for the backend academic-year engine (CommonJS mirror of
 * src/utils/academicYear.js). No jest on the backend, so this is a standalone
 * assertion script.
 *
 * Run: `node backend/services/academicYear.test.js`
 * Exits non-zero on the first failure.
 */

const assert = require('assert');
const AY = require('./academicYear');

// Local date constructor — month is 1-based here for readability.
const d = (y, m, day, hh = 12, mm = 0, ss = 0, ms = 0) => new Date(y, m - 1, day, hh, mm, ss, ms);

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; }
  catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

// ── Spec boundary examples ──────────────────────────────────────────────────
test('15 Sep 2025 -> 2025-2026', () => assert.strictEqual(AY.getAcademicYearLabel(d(2025, 9, 15)), '2025-2026'));
test('10 Jan 2026 -> 2025-2026', () => assert.strictEqual(AY.getAcademicYearLabel(d(2026, 1, 10)), '2025-2026'));
test('25 Jun 2026 -> 2025-2026', () => assert.strictEqual(AY.getAcademicYearLabel(d(2026, 6, 25)), '2025-2026'));
test('1 Jul 2026 -> 2026-2027', () => assert.strictEqual(AY.getAcademicYearLabel(d(2026, 7, 1)), '2026-2027'));

// ── The four mandated boundary edges ────────────────────────────────────────
test('30 Jun 2026 23:59:59.999 -> 2025-2026', () => assert.strictEqual(AY.getAcademicYearLabel(d(2026, 6, 30, 23, 59, 59, 999)), '2025-2026'));
test('1 Jul 2025 00:00:00.000 -> 2025-2026', () => assert.strictEqual(AY.getAcademicYearLabel(d(2025, 7, 1, 0, 0, 0, 0)), '2025-2026'));
test('31 Dec 2025 -> 2025-2026', () => assert.strictEqual(AY.getAcademicYearLabel(d(2025, 12, 31, 23, 59, 59, 999)), '2025-2026'));
test('1 Jan 2026 00:00:00.000 -> 2025-2026', () => assert.strictEqual(AY.getAcademicYearLabel(d(2026, 1, 1, 0, 0, 0, 0)), '2025-2026'));

// ── Pivot month ─────────────────────────────────────────────────────────────
test('pivot month is July (6)', () => assert.strictEqual(AY.ACADEMIC_YEAR_START_MONTH, 6));
test('30 Jun -> previous start year', () => assert.strictEqual(AY.getAcademicYearStartYear(d(2026, 6, 30)), 2025));
test('1 Jul -> current start year', () => assert.strictEqual(AY.getAcademicYearStartYear(d(2026, 7, 1)), 2026));

// ── Descriptor bounds ───────────────────────────────────────────────────────
test('descriptor: starts 1 Jul, ends 30 Jun', () => {
  const ay = AY.getAcademicYear(d(2025, 9, 15));
  assert.strictEqual(ay.label, '2025-2026');
  assert.strictEqual(ay.start.getMonth(), 6);   // July
  assert.strictEqual(ay.start.getDate(), 1);
  assert.strictEqual(ay.end.getMonth(), 5);     // June
  assert.strictEqual(ay.end.getDate(), 30);
  assert.strictEqual(ay.end.getMilliseconds(), 999);
});
test('cycle is contiguous (1ms gap)', () => {
  const cur = AY.getAcademicYear(d(2025, 9, 15));
  const next = AY.getAcademicYear(d(2026, 7, 1));
  assert.strictEqual(next.startMs - cur.endMs, 1);
});

// ── parse / bounds / membership ─────────────────────────────────────────────
test('parse valid label', () => assert.deepStrictEqual(AY.parseAcademicYearLabel('2025-2026'), { startYear: 2025, endYear: 2026 }));
test('parse rejects non-contiguous', () => assert.strictEqual(AY.parseAcademicYearLabel('2025-2027'), null));
test('bounds by start year', () => assert.strictEqual(AY.academicYearBounds(2025).label, '2025-2026'));
test('30 Jun 2026 in 2025-2026', () => assert.strictEqual(AY.isDateInAcademicYear(d(2026, 6, 30, 23, 59), '2025-2026'), true));
test('1 Jul 2026 NOT in 2025-2026', () => assert.strictEqual(AY.isDateInAcademicYear(d(2026, 7, 1, 0, 0), '2025-2026'), false));

// ── Firestore Timestamp coercion ────────────────────────────────────────────
test('coerces a Firestore-style Timestamp', () => {
  const ts = { toDate: () => d(2025, 9, 1) };
  assert.strictEqual(AY.getAcademicYearLabel(ts), '2025-2026');
});

console.log(`✓ academicYear: ${passed} assertions passed`);
