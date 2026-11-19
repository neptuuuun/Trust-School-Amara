/**
 * Regression tests for the annual-fee record builder.
 *
 * These lock the cross-module invariant that broke the "payment recorded but
 * student still shows UNPAID / list empty / stats zero" bug: an admin-recorded
 * annual payment must be matched by EVERY reader's year filter. The field those
 * readers key on is `academicYear` — it must be the "YYYY-YYYY" label, never a
 * grade. The grade belongs in studyYear/level.
 *
 * Run: `node backend/services/annualFeeRecord.test.js`
 * Exits non-zero on the first failure.
 */

const assert = require('assert');
const { buildAnnualFeePaymentDoc } = require('./annualFeeRecord');
const AY = require('./academicYear');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; }
  catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

const LABEL = AY.getAcademicYearLabel();        // current academic year, e.g. "2026-2027"
const GRADE = 'sec3';

const doc = buildAnnualFeePaymentDoc({
  userId: 'u1',
  studentName: 'طالب',
  amount: 1000,
  label: LABEL,
  grade: GRADE,
  school: 'حر',
});

// ── The core invariant: academicYear is the LABEL, grade is elsewhere ─────────
test('academicYear holds the YYYY-YYYY label (not the grade)', () =>
  assert.strictEqual(doc.academicYear, LABEL));
test('year mirrors the same label', () =>
  assert.strictEqual(doc.year, LABEL));
test('grade is preserved in studyYear', () =>
  assert.strictEqual(doc.studyYear, GRADE));
test('grade is preserved in level', () =>
  assert.strictEqual(doc.level, GRADE));
test('academicYear is never the grade', () =>
  assert.notStrictEqual(doc.academicYear, GRADE));
test('status is verified (paid)', () =>
  assert.strictEqual(doc.status, 'verified'));

// ── Every reader's year filter must now MATCH this record ─────────────────────
// 1) Student dashboard: academicYearMatches(doc, label, ['verifiedAt','createdAt'])
test('StudentDashboard: academicYearMatches() → true', () =>
  assert.strictEqual(AY.academicYearMatches(doc, LABEL, ['verifiedAt', 'createdAt']), true));
// 2) Admin list + overview count: where('academicYear','==', label)
test('AnnualFees list / overview: academicYear === label', () =>
  assert.strictEqual(doc.academicYear === LABEL, true));
// 3) Backend eligibility gate (isAnnualFeePaidThisYear): p.academicYear === label
test('Eligibility gate: academicYear === label', () =>
  assert.strictEqual(doc.academicYear === LABEL, true));

// ── Guard: the OLD buggy shape (grade in academicYear) is invisible ───────────
// This is exactly what used to be written, and proves the readers excluded it.
const buggy = { ...doc, academicYear: GRADE };
test('OLD shape: academicYearMatches() short-circuits to false', () =>
  assert.strictEqual(AY.academicYearMatches(buggy, LABEL, ['verifiedAt', 'createdAt']), false));
test('OLD shape: admin/overview filter excludes it', () =>
  assert.strictEqual(buggy.academicYear === LABEL, false));

// ── Defaults ──────────────────────────────────────────────────────────────────
test('null grade stays null (no accidental coercion)', () => {
  const d2 = buildAnnualFeePaymentDoc({ userId: 'u2', amount: 1000, label: LABEL, grade: null });
  assert.strictEqual(d2.studyYear, null);
  assert.strictEqual(d2.level, null);
  assert.strictEqual(d2.academicYear, LABEL);
});
test('default note is applied when none supplied', () => {
  assert.strictEqual(typeof doc.notes, 'string');
  assert.ok(doc.notes.length > 0);
});

console.log(`✓ annualFeeRecord: ${passed} assertions passed`);
