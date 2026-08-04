/**
 * Tests for the reservation lifecycle engine (Group Start Month → reserved /
 * active). No jest on the backend, so this is a standalone assertion script.
 * The module is import-safe without Admin SDK credentials (firebase is only
 * lazy-required inside activateDueReservations, which these tests don't call).
 *
 * Run: `node backend/services/reservationService.test.js`
 * Exits non-zero on the first failure.
 */

const assert = require('assert');
const R = require('./reservationService');

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

// ── Month-key helpers ───────────────────────────────────────────────────────
test('normalizeMonthKey accepts YYYY-MM', () => assert.strictEqual(R.normalizeMonthKey('2026-09'), '2026-09'));
test('normalizeMonthKey trims', () => assert.strictEqual(R.normalizeMonthKey('  2026-09 '), '2026-09'));
test('normalizeMonthKey rejects single-digit month', () => assert.strictEqual(R.normalizeMonthKey('2026-9'), null));
test('normalizeMonthKey rejects junk', () => assert.strictEqual(R.normalizeMonthKey('soon'), null));
test('normalizeMonthKey rejects empty', () => assert.strictEqual(R.normalizeMonthKey(''), null));
test('currentMonthKey of Aug 2026', () => assert.strictEqual(R.currentMonthKey(d(2026, 8, 15)), '2026-08'));

test('monthKeyToStartDate → 1st 00:00', () => {
  const s = R.monthKeyToStartDate('2026-09');
  assert.strictEqual(s.getFullYear(), 2026);
  assert.strictEqual(s.getMonth(), 8);   // September (0-based)
  assert.strictEqual(s.getDate(), 1);
  assert.strictEqual(s.getHours(), 0);
});
test('monthKeyToEndDate → last day 23:59:59.999', () => {
  const e = R.monthKeyToEndDate('2026-09');
  assert.strictEqual(e.getMonth(), 8);
  assert.strictEqual(e.getDate(), 30);
  assert.strictEqual(e.getMilliseconds(), 999);
});
test('monthKeyToStartDate(null) → null', () => assert.strictEqual(R.monthKeyToStartDate('nope'), null));

// ── resolveSubscriptionWindow — RESERVED (future start month) ────────────────
test('July enrollment into a September group → reserved', () => {
  const w = R.resolveSubscriptionWindow({ startMonth: '2026-09' }, d(2026, 7, 21));
  assert.strictEqual(w.reserved, true);
  assert.strictEqual(w.groupStartMonth, '2026-09');
  assert.strictEqual(w.cycleMonthKey, '2026-09');            // billed for September, NOT July
  assert.strictEqual(w.startDate.getMonth(), 8);             // 1 Sep
  assert.strictEqual(w.startDate.getDate(), 1);
  assert.strictEqual(w.endDate.getMonth(), 8);               // 30 Sep
  assert.strictEqual(w.endDate.getDate(), 30);
  assert.strictEqual(w.nextPaymentDate.getMonth(), 9);       // 1 Oct
  assert.strictEqual(w.nextPaymentDate.getDate(), 1);
});

// ── resolveSubscriptionWindow — NOT reserved (current / past / legacy) ───────
test('enrollment in the current start month → not reserved, anchored to now', () => {
  const now = d(2026, 7, 21);
  const w = R.resolveSubscriptionWindow({ startMonth: '2026-07' }, now);
  assert.strictEqual(w.reserved, false);
  assert.strictEqual(w.cycleMonthKey, '2026-07');
  assert.strictEqual(w.startDate.getTime(), now.getTime());  // today's proration behaviour
});
test('past start month → not reserved', () => {
  const w = R.resolveSubscriptionWindow({ startMonth: '2026-05' }, d(2026, 7, 21));
  assert.strictEqual(w.reserved, false);
});
test('legacy group without startMonth → not reserved, current month', () => {
  const w = R.resolveSubscriptionWindow({}, d(2026, 7, 21));
  assert.strictEqual(w.reserved, false);
  assert.strictEqual(w.groupStartMonth, '2026-07');
  assert.strictEqual(w.cycleMonthKey, '2026-07');
});

// ── subscriptionPhase ───────────────────────────────────────────────────────
const now = d(2026, 7, 21);
test('verified with future startDate → reserved', () =>
  assert.strictEqual(R.subscriptionPhase({ status: 'verified', startDate: d(2026, 9, 1) }, now), 'reserved'));
test('verified, window begun, not expired → active', () =>
  assert.strictEqual(R.subscriptionPhase({ status: 'verified', startDate: d(2026, 7, 1), endDate: d(2026, 7, 31, 23, 59) }, now), 'active'));
test('verified, window ended → expired', () =>
  assert.strictEqual(R.subscriptionPhase({ status: 'verified', startDate: d(2026, 6, 1), endDate: d(2026, 6, 30, 23, 59) }, now), 'expired'));
test('pending → inactive', () =>
  assert.strictEqual(R.subscriptionPhase({ status: 'pending', startDate: d(2026, 9, 1) }, now), 'inactive'));
test('legacy verified, no startDate but reserved flag → reserved', () =>
  assert.strictEqual(R.subscriptionPhase({ status: 'verified', reserved: true }, now), 'reserved'));
test('phase coerces Firestore Timestamp startDate', () => {
  const reg = { status: 'verified', startDate: { toDate: () => d(2026, 9, 1) } };
  assert.strictEqual(R.subscriptionPhase(reg, now), 'reserved');
});
test('isReserved / isActive convenience', () => {
  assert.strictEqual(R.isReserved({ status: 'verified', startDate: d(2026, 9, 1) }, now), true);
  assert.strictEqual(R.isActive({ status: 'verified', startDate: d(2026, 7, 1), endDate: d(2026, 7, 31, 23, 59) }, now), true);
});

console.log(`✓ reservationService: ${passed} assertions passed`);
