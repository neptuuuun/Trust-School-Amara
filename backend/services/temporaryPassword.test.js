/**
 * Tests for the temporary-password generator.
 *
 * Run: `node backend/services/temporaryPassword.test.js`
 * Exits non-zero on the first failure.
 */

const assert = require('assert');
const crypto = require('crypto');
const T = require('./temporaryPassword');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; }
  catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

const SAMPLE = Array.from({ length: 5000 }, () => T.generateTemporaryPassword());

test('default length is 12', () => SAMPLE.forEach((p) => assert.strictEqual(p.length, 12)));
test('every password has upper, lower, digit and symbol', () => SAMPLE.forEach((p) => {
  assert.ok(/[A-Z]/.test(p), p);
  assert.ok(/[a-z]/.test(p), p);
  assert.ok(/[0-9]/.test(p), p);
  assert.ok(/[#%*!?]/.test(p), p);
}));
test('only alphabet characters are used', () => SAMPLE.forEach((p) =>
  [...p].forEach((ch) => assert.ok(T.ALPHABET.includes(ch), `${ch} in ${p}`))));
test('no visually ambiguous characters (0 O o 1 l I)', () => SAMPLE.forEach((p) => assert.ok(!/[0Oo1lI]/.test(p), p)));
test('no spreadsheet formula triggers (= + - @)', () => SAMPLE.forEach((p) => assert.ok(!/[=+\-@]/.test(p), p)));
test('5000 independent passwords are all distinct', () => assert.strictEqual(new Set(SAMPLE).size, SAMPLE.length));
test('the guaranteed classes are not pinned to fixed positions', () => {
  const firstIsUpper = SAMPLE.filter((p) => /[A-Z]/.test(p[0])).length;
  assert.ok(firstIsUpper < SAMPLE.length * 0.9, `first char upper in ${firstIsUpper}/${SAMPLE.length}`);
});
test('randomness comes from crypto.randomInt by default', () => {
  const original = crypto.randomInt;
  let calls = 0;
  crypto.randomInt = (...args) => { calls += 1; return original(...args); };
  try {
    // Re-require with a fresh cache so the default parameter binds the spy.
    delete require.cache[require.resolve('./temporaryPassword')];
    require('./temporaryPassword').generateTemporaryPassword();
  } finally {
    crypto.randomInt = original;
    delete require.cache[require.resolve('./temporaryPassword')];
  }
  assert.ok(calls >= 12, `crypto.randomInt called ${calls} times`);
});
test('Math.random is never used', () => {
  const original = Math.random;
  Math.random = () => { throw new Error('Math.random used'); };
  try { T.generateTemporaryPassword(); } finally { Math.random = original; }
});
test('rejects lengths below the minimum', () => assert.throws(() => T.generateTemporaryPassword({ length: 6 })));
test('createPasswordGenerator never repeats within a batch, even with a weak RNG', () => {
  // A deliberately terrible RNG that would repeat constantly: the batch guard
  // must still guarantee uniqueness (it regenerates on collision).
  let seq = 0;
  const weak = (max) => { seq = (seq + 7) % 997; return seq % max; };
  const gen = T.createPasswordGenerator({ randomInt: weak });
  const issued = Array.from({ length: 200 }, () => gen());
  assert.strictEqual(new Set(issued).size, issued.length);
});

console.log(`✓ temporaryPassword: ${passed} assertions passed`);
