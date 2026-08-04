/**
 * Tests for expected SUPPORT revenue derivation — the fix that makes owner/admin
 * financial reporting use each student's stored PRORATED payable amount instead
 * of `enrollmentCount × full monthly price`.
 *
 * No jest on the backend, so this is a standalone assertion script. Both modules
 * are import-safe without Admin SDK credentials (their Firestore use is lazy), so
 * the pure money math is exercised directly.
 *
 * Run: `node backend/services/expectedRevenueService.test.js`
 * Exits non-zero on the first failure.
 */

const assert = require('assert');
const { registrationPayable } = require('./sessionService');
const { isActiveSubscription, aggregateExpectedSupport } = require('./expectedRevenueService');

const NOW = new Date(2026, 7, 15, 12, 0, 0); // 15 Aug 2026, noon
const future = () => new Date(2026, 7, 31, 23, 59, 59, 999); // end of Aug 2026 (> NOW)
const past = () => new Date(2026, 6, 31, 23, 59, 59, 999);   // end of Jul 2026 (< NOW)

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; }
  catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

// ── registrationPayable — the single stored-amount reader ────────────────────
test('registrationPayable prefers totalPrice', () =>
  assert.strictEqual(registrationPayable({ totalPrice: 2000, proratedAmount: 3000, monthlyPrice: 8000 }), 2000));
test('registrationPayable falls back to proratedAmount', () =>
  assert.strictEqual(registrationPayable({ proratedAmount: 3000, monthlyPrice: 8000 }), 3000));
test('registrationPayable falls back to monthlyPrice (legacy rows)', () =>
  assert.strictEqual(registrationPayable({ monthlyPrice: 8000 }), 8000));
test('registrationPayable of empty → 0', () =>
  assert.strictEqual(registrationPayable({}), 0));
test('registrationPayable of a zero prorated amount stays 0 (not the full price)', () =>
  assert.strictEqual(registrationPayable({ totalPrice: 0, monthlyPrice: 8000 }), 0));
test('registrationPayable coerces non-finite → 0', () =>
  assert.strictEqual(registrationPayable({ totalPrice: 'x' }), 0));

// ── isActiveSubscription — who counts toward expected revenue ────────────────
const base = { status: 'verified', endDate: future() };
test('verified + future endDate → active', () =>
  assert.strictEqual(isActiveSubscription(base, NOW), true));
test('verified + no endDate → active (cannot have lapsed)', () =>
  assert.strictEqual(isActiveSubscription({ status: 'verified' }, NOW), true));
test('RESERVED subscription → NOT active (billing has not begun)', () =>
  assert.strictEqual(isActiveSubscription({ ...base, reserved: true }, NOW), false));
test('expired (endDate ≤ now) → NOT active', () =>
  assert.strictEqual(isActiveSubscription({ status: 'verified', endDate: past() }, NOW), false));
test('pending status → NOT active', () =>
  assert.strictEqual(isActiveSubscription({ status: 'pending', endDate: future() }, NOW), false));
test('status is case-insensitive', () =>
  assert.strictEqual(isActiveSubscription({ status: 'Verified', endDate: future() }, NOW), true));

// ── aggregateExpectedSupport — the core money math ───────────────────────────

test('expected = SUM of payable amounts, NOT price × student count', () => {
  // Group full price 8000. One full-month student (8000) + one late joiner who
  // only owed the remaining sessions (2000). Old logic: 2 × 8000 = 16000. Correct:
  const regs = [
    { classId: 'c1', status: 'verified', endDate: future(), totalPrice: 8000, monthlyPrice: 8000 },
    { classId: 'c1', status: 'verified', endDate: future(), totalPrice: 2000, monthlyPrice: 8000 },
  ];
  const { total, students, byClass } = aggregateExpectedSupport(regs, NOW);
  assert.strictEqual(total, 10000);
  assert.strictEqual(students, 2);
  assert.strictEqual(byClass.get('c1').expected, 10000);
  assert.strictEqual(byClass.get('c1').students, 2);
});

test('a fully-paid PRORATED student is never a deficit (expected == actual)', () => {
  // Late joiner owed & paid 2000. Expected for the group must equal 2000, so
  // difference = expected - actual = 0.
  const regs = [{ classId: 'c1', status: 'verified', endDate: future(), totalPrice: 2000, monthlyPrice: 8000 }];
  const { byClass } = aggregateExpectedSupport(regs, NOW);
  const expected = byClass.get('c1').expected;
  const actualPaid = 2000; // what the ledger recorded for the same cycle
  assert.strictEqual(expected, 2000);
  assert.strictEqual(expected - actualPaid, 0);
});

test('RESERVED subscriptions do not inflate expected revenue', () => {
  const regs = [
    { classId: 'c1', status: 'verified', endDate: future(), totalPrice: 8000 },
    { classId: 'c1', status: 'verified', endDate: future(), reserved: true, totalPrice: 8000 },
  ];
  const { total, students } = aggregateExpectedSupport(regs, NOW);
  assert.strictEqual(total, 8000); // reserved one excluded
  assert.strictEqual(students, 1);
});

test('expired and pending subscriptions are excluded', () => {
  const regs = [
    { classId: 'c1', status: 'verified', endDate: future(), totalPrice: 8000 },
    { classId: 'c1', status: 'verified', endDate: past(), totalPrice: 8000 },     // expired
    { classId: 'c1', status: 'pending', endDate: future(), totalPrice: 8000 },    // not yet paid
  ];
  const { total, students } = aggregateExpectedSupport(regs, NOW);
  assert.strictEqual(total, 8000);
  assert.strictEqual(students, 1);
});

test('per-class breakdown groups by classId (lessonId fallback)', () => {
  const regs = [
    { classId: 'c1', status: 'verified', endDate: future(), totalPrice: 3000 },
    { lessonId: 'c2', status: 'verified', endDate: future(), totalPrice: 5000 }, // legacy: only lessonId
    { classId: 'c2', status: 'verified', endDate: future(), totalPrice: 1000 },
  ];
  const { total, byClass } = aggregateExpectedSupport(regs, NOW);
  assert.strictEqual(total, 9000);
  assert.strictEqual(byClass.get('c1').expected, 3000);
  assert.strictEqual(byClass.get('c2').expected, 6000);
  assert.strictEqual(byClass.get('c2').students, 2);
});

test('empty input → zeroed result, no classes', () => {
  const { total, students, byClass } = aggregateExpectedSupport([], NOW);
  assert.strictEqual(total, 0);
  assert.strictEqual(students, 0);
  assert.strictEqual(byClass.size, 0);
});

console.log(`✓ expectedRevenueService: ${passed} passed`);
