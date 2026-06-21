/**
 * Tests for the backend support-eligibility engine (CommonJS mirror of
 * src/utils/supportClassification.js). No jest on the backend, so this is a
 * standalone assertion script.
 *
 * Run: `node backend/services/supportEligibility.test.js`
 * Exits non-zero on the first failure.
 */

const assert = require('assert');
const E = require('./supportEligibility');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; }
  catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

// ── Threshold ───────────────────────────────────────────────────────────────
test('11.0 -> normal', () => assert.strictEqual(E.classify(11), 'normal'));
test('10.9 -> support_level', () => assert.strictEqual(E.classify(10.9), 'support_level'));
test('9.8 -> support_level', () => assert.strictEqual(E.classify(9.8), 'support_level'));
test('20 -> normal', () => assert.strictEqual(E.classify(20), 'normal'));
test('0 -> support_level', () => assert.strictEqual(E.classify(0), 'support_level'));
test('null -> null (unclassified)', () => assert.strictEqual(E.classify(null), null));
test('undefined -> null', () => assert.strictEqual(E.classify(undefined), null));

// ── Validation (0..20, decimals) ──────────────────────────────────────────────
test('valid 9.8', () => assert.deepStrictEqual(E.validateAverage('9.8'), { valid: true, value: 9.8, error: null }));
test('valid comma decimal 9,8', () => assert.strictEqual(E.validateAverage('9,8').value, 9.8));
test('reject empty', () => assert.strictEqual(E.validateAverage('').valid, false));
test('reject non-numeric', () => assert.strictEqual(E.validateAverage('abc').valid, false));
test('reject > 20', () => assert.strictEqual(E.validateAverage('20.1').valid, false));
test('reject < 0', () => assert.strictEqual(E.validateAverage('-1').valid, false));
test('accept boundary 20', () => assert.strictEqual(E.validateAverage('20').valid, true));
test('accept boundary 0', () => assert.strictEqual(E.validateAverage('0').valid, true));

// ── Fixtures ──────────────────────────────────────────────────────────────────
const normalGroup = { id: 'n1', groupType: 'normal_support', subjectId: 'math', studyYear: 'sec3', status: 'active' };
const lowGroup    = { id: 'l1', groupType: 'low_level_support', subjectId: 'math', studyYear: 'sec3', status: 'active' };
const lowInactive = { id: 'l2', groupType: 'low_level_support', subjectId: 'math', studyYear: 'sec3', status: 'inactive' };
const lowOtherSub = { id: 'l3', groupType: 'low_level_support', subjectId: 'phys', studyYear: 'sec3', status: 'active' };

// ── Missing average ─────────────────────────────────────────────────────────
test('null classification denied (average-required)', () => {
  const r = E.evaluateEligibility({ classification: null, targetClass: normalGroup, subjectClasses: [normalGroup] });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, E.REASONS.AVERAGE_REQUIRED);
});

// ── RULE A — normal student cannot join a low-level group ─────────────────────
test('RULE A: normal -> low_level denied', () => {
  const r = E.evaluateEligibility({ classification: 'normal', targetClass: lowGroup, subjectClasses: [normalGroup, lowGroup] });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, E.REASONS.NORMAL_CANNOT_JOIN_LOW);
});
test('normal -> normal allowed', () => {
  const r = E.evaluateEligibility({ classification: 'normal', targetClass: normalGroup, subjectClasses: [normalGroup, lowGroup] });
  assert.strictEqual(r.allowed, true);
});

// ── RULE B — support student must join low-level when one exists ──────────────
test('RULE B: support -> normal denied when low-level exists in subject', () => {
  const r = E.evaluateEligibility({ classification: 'support_level', targetClass: normalGroup, subjectClasses: [normalGroup, lowGroup] });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, E.REASONS.SUPPORT_MUST_JOIN_LOW);
});
test('support -> low_level allowed', () => {
  const r = E.evaluateEligibility({ classification: 'support_level', targetClass: lowGroup, subjectClasses: [normalGroup, lowGroup] });
  assert.strictEqual(r.allowed, true);
});
test('support -> normal allowed when NO low-level exists in subject', () => {
  const r = E.evaluateEligibility({ classification: 'support_level', targetClass: normalGroup, subjectClasses: [normalGroup] });
  assert.strictEqual(r.allowed, true);
});
test('inactive low-level does NOT trigger RULE B', () => {
  const r = E.evaluateEligibility({ classification: 'support_level', targetClass: normalGroup, subjectClasses: [normalGroup, lowInactive] });
  assert.strictEqual(r.allowed, true);
});
test('low-level in a DIFFERENT subject does NOT trigger RULE B (per-subject scope)', () => {
  const r = E.evaluateEligibility({ classification: 'support_level', targetClass: normalGroup, subjectClasses: [normalGroup, lowOtherSub] });
  assert.strictEqual(r.allowed, true);
});

// ── normalizeGroupType ────────────────────────────────────────────────────────
test('unknown groupType defaults to normal_support', () => assert.strictEqual(E.normalizeGroupType('weird'), 'normal_support'));
test('missing groupType defaults to normal_support', () => assert.strictEqual(E.normalizeGroupType(undefined), 'normal_support'));

console.log(`✓ supportEligibility: ${passed} assertions passed`);
