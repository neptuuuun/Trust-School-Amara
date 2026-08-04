/**
 * Tests for the bulk-import validation + duplicate-decision helpers. No jest on
 * the backend, so this is a standalone assertion script (import-safe: the module
 * only requires the pure constants helper, never the Admin SDK).
 *
 * Run: `node backend/services/bulkImportValidation.test.js`
 * Exits non-zero on the first failure.
 */

const assert = require('assert');
const V = require('./bulkImportValidation');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; }
  catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

const BRANCH = 'boumerdes';

// ── cleanPhone ───────────────────────────────────────────────────────────────
test('cleanPhone strips spaces, dashes, parentheses', () =>
  assert.strictEqual(V.cleanPhone(' (055) 12-34-567 '), '0551234567'));
test('cleanPhone of null → empty string', () =>
  assert.strictEqual(V.cleanPhone(null), ''));

// ── normalizeRow ─────────────────────────────────────────────────────────────
test('valid row → normalized candidate', () => {
  const { candidate, error } = V.normalizeRow({ fullName: '  محمد  ', email: 'A@B.COM', phone: '055 12' }, BRANCH);
  assert.strictEqual(error, undefined);
  assert.strictEqual(candidate.fullName, 'محمد');
  assert.strictEqual(candidate.email, 'a@b.com'); // lowercased
  assert.strictEqual(candidate.phone, '05512');
  assert.strictEqual(candidate.school, 'حر');     // blank → «حر»
});
test('accepts the `name` column alias', () => {
  const { candidate } = V.normalizeRow({ name: 'سارة', email: 's@x.io' }, BRANCH);
  assert.strictEqual(candidate.fullName, 'سارة');
});
test('missing name → error', () =>
  assert.ok(V.normalizeRow({ email: 'a@b.com' }, BRANCH).error));
test('missing email → error', () =>
  assert.ok(V.normalizeRow({ fullName: 'x' }, BRANCH).error));
test('malformed email → error', () =>
  assert.ok(V.normalizeRow({ fullName: 'x', email: 'not-an-email' }, BRANCH).error));
test('per-row branch mismatch → error', () =>
  assert.ok(V.normalizeRow({ fullName: 'x', email: 'a@b.com', branch: 'bordj_menaiel' }, BRANCH).error));
test('per-row branch that matches is accepted', () =>
  assert.ok(V.normalizeRow({ fullName: 'x', email: 'a@b.com', branch: BRANCH }, BRANCH).candidate));
test('explicit school is preserved', () =>
  assert.strictEqual(V.normalizeRow({ fullName: 'x', email: 'a@b.com', school: 'ثانوية الأمل' }, BRANCH).candidate.school, 'ثانوية الأمل'));

// ── duplicateReason ──────────────────────────────────────────────────────────
const sets = () => ({
  seenEmails: new Set(['dup@batch.com']),
  seenPhones: new Set(['0550000001']),
  existingEmails: new Set(['old@school.com']),
  existingPhones: new Set(['0559999999']),
});

test('unique candidate → null', () =>
  assert.strictEqual(V.duplicateReason({ email: 'new@x.com', phone: '0551112222' }, sets()), null));
test('email duplicated within the batch', () =>
  assert.ok(V.duplicateReason({ email: 'dup@batch.com', phone: '' }, sets())));
test('phone duplicated within the batch', () =>
  assert.ok(V.duplicateReason({ email: 'new@x.com', phone: '0550000001' }, sets())));
test('email already registered', () =>
  assert.ok(V.duplicateReason({ email: 'old@school.com', phone: '' }, sets())));
test('phone already registered', () =>
  assert.ok(V.duplicateReason({ email: 'new@x.com', phone: '0559999999' }, sets())));
test('empty phone never collides on phone', () =>
  assert.strictEqual(V.duplicateReason({ email: 'new@x.com', phone: '' }, sets()), null));

console.log(`✓ bulkImportValidation: ${passed} assertions passed`);
