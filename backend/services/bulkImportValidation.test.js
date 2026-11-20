/**
 * Tests for the bulk-import validation + duplicate-decision helpers. No jest on
 * the backend, so this is a standalone assertion script (import-safe: the module
 * only requires pure helpers, never the Admin SDK).
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
const NOW = new Date(2026, 10, 19, 10, 0, 0); // AY 2026-2027
const CTX = V.buildContext({ now: NOW });
const row = (r) => V.normalizeRow(r, BRANCH, CTX);

// ── cleanPhone (legacy helper) ───────────────────────────────────────────────
test('cleanPhone strips spaces, dashes, parentheses', () =>
  assert.strictEqual(V.cleanPhone(' (055) 12-34-567 '), '0551234567'));
test('cleanPhone of null → empty string', () =>
  assert.strictEqual(V.cleanPhone(null), ''));

// ── Basic normalisation ──────────────────────────────────────────────────────
test('valid row → normalized candidate', () => {
  const { candidate, error } = row({ fullName: '  محمد  ', email: 'A@B.COM', phone: '0550 12 34 56' });
  assert.strictEqual(error, undefined);
  assert.strictEqual(candidate.fullName, 'محمد');
  assert.strictEqual(candidate.email, 'a@b.com');           // lowercased
  assert.strictEqual(candidate.phone, '0550123456');
  assert.strictEqual(candidate.school, 'حر');               // blank → «حر»
  assert.strictEqual(candidate.accountEligible, true);
});
test('accepts the `name` column alias', () => {
  const { candidate } = row({ name: 'سارة', email: 's@x.io', phone: '0661234567' });
  assert.strictEqual(candidate.fullName, 'سارة');
});
test('explicit school is preserved', () =>
  assert.strictEqual(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',school: 'ثانوية الأمل' }).candidate.school, 'ثانوية الأمل'));
test('blank school is reported as a warning (never silent)', () =>
  assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000' }).warnings.some((w) => /حر/.test(w))));

// ── Required vs optional (Test D) ────────────────────────────────────────────
test('missing name → error', () => assert.ok(row({ email: 'a@b.com', phone: '0550000000' }).error));
test('name + email + phone + level → valid', () =>
  assert.ok(row({ fullName: 'A', email: 'a@x.com', phone: '0550000001', studyYear: '2AS' }).candidate));
test('missing phone → the row fails with «رقم الهاتف مطلوب»', () => {
  const r = row({ fullName: 'B', email: 'b@x.com', studyYear: 'sec1' });
  assert.ok(r.error);
  assert.deepStrictEqual(r.errors, ['رقم الهاتف مطلوب']);
});
test('missing email → the row fails with «البريد الإلكتروني مطلوب»', () => {
  const r = row({ fullName: 'C', phone: '0550000003', studyYear: 'mid2' });
  assert.ok(r.error);
  assert.deepStrictEqual(r.errors, ['البريد الإلكتروني مطلوب']);
});
test('missing email AND phone → both are named', () => {
  const r = row({ fullName: 'x' });
  assert.ok(r.errors.includes('البريد الإلكتروني مطلوب'));
  assert.ok(r.errors.includes('رقم الهاتف مطلوب'));
});
test('whitespace-only email / phone count as missing', () => {
  const r = row({ fullName: 'x', email: '   ', phone: ' ' });
  assert.ok(r.errors.includes('البريد الإلكتروني مطلوب'));
  assert.ok(r.errors.includes('رقم الهاتف مطلوب'));
});
test('only the required fields → valid, every optional field empty', () => {
  const { candidate } = row({ fullName: 'D', email: 'd@x.com', phone: '0550000004' });
  ['birthDate', 'birthPlace', 'address', 'studyYear', 'distinguishedSubjectsAverage'].forEach((k) =>
    assert.strictEqual(candidate[k], null, k));
  assert.strictEqual(candidate.annualFee.status, 'unpaid');
  assert.strictEqual(candidate.annualFee.defaulted, true);
  assert.strictEqual(candidate.accountEligible, true);
});
test('missing optional COLUMNS entirely is fine (unknown keys ignored)', () =>
  assert.ok(row({ fullName: 'E', email: 'e@x.com', phone: '0550000005', someUnmappedColumn: 'zzz' }).candidate));
test('malformed email → error', () => assert.ok(row({ fullName: 'x', email: 'not-an-email' }).error));
test('malformed email is an error even when a phone exists (typos are never dropped)', () =>
  assert.ok(row({ fullName: 'x', email: 'bad@', phone: '0550000009' }).error));
test('every problem in a row is reported, not just the first', () => {
  const r = row({ fullName: '', email: 'bad', birthDate: '31/02/2008', studyYear: 'banana' });
  assert.ok(r.errors.length >= 4, JSON.stringify(r.errors));
});
test('per-row branch mismatch → error', () =>
  assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',branch: 'bordj_menaiel' }).error));
test('per-row branch that matches is accepted', () =>
  assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',branch: BRANCH }).candidate));

// ── Personal data ────────────────────────────────────────────────────────────
test('birth date / place / address are saved when provided', () => {
  const { candidate } = row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',birthDate: '14/05/2008', birthPlace: 'بومرداس', address: 'حي 500 مسكن' });
  assert.strictEqual(candidate.birthDate, '2008-05-14');
  assert.strictEqual(candidate.birthPlace, 'بومرداس');
  assert.strictEqual(candidate.address, 'حي 500 مسكن');
});
test('invalid birth date → error', () => assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',birthDate: '2008-13-40' }).error));

// ── Academic year + level (Test 3) ───────────────────────────────────────────
test('row academic year + level are preserved (2026-2027, 2AS)', () => {
  const { candidate } = row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',academicYear: '2026-2027', studyYear: '2AS' });
  assert.strictEqual(candidate.academicYear, '2026-2027');
  assert.strictEqual(candidate.studyYear, 'sec2');
  assert.strictEqual(candidate.schoolLevel, 'high');
  assert.strictEqual(candidate.studyYearLabel, 'ثانية ثانوي');
});
test('blank academic year → the admin-selected default', () => {
  const ctx = V.buildContext({ now: NOW, defaultAcademicYear: '2027-2028' });
  assert.strictEqual(V.normalizeRow({ fullName: 'x', email: 'a@b.com', phone: '0550000000' }, BRANCH, ctx).candidate.academicYear, '2027-2028');
});
test('a row academic year overrides the default (never discarded)', () => {
  const ctx = V.buildContext({ now: NOW, defaultAcademicYear: '2027-2028' });
  assert.strictEqual(V.normalizeRow({ fullName: 'x', email: 'a@b.com', phone: '0550000000',academicYear: '2026-2027' }, BRANCH, ctx).candidate.academicYear, '2026-2027');
});
test('a finished academic year → error', () => assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',academicYear: '2024-2025' }).error));
test('a year beyond next → error', () => assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',academicYear: '2029-2030' }).error));
test('next academic year is allowed (pre-registration) with a warning', () => {
  const r = row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',academicYear: '2027-2028' });
  assert.ok(r.candidate);
  assert.ok(r.warnings.some((w) => /القادمة/.test(w)));
});
test('unknown level → error', () => assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',studyYear: '7AS' }).error));
test('resolveDefaultAcademicYear: blank → current; past → error', () => {
  assert.deepStrictEqual(V.resolveDefaultAcademicYear('', NOW), { value: '2026-2027' });
  assert.ok(V.resolveDefaultAcademicYear('2023-2024', NOW).error);
  assert.deepStrictEqual(V.resolveDefaultAcademicYear('2027/2028', NOW), { value: '2027-2028' });
});

// ── Annual fee (Test 4) ──────────────────────────────────────────────────────
test('PAID + level → paid candidate', () => {
  const { candidate } = row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',studyYear: 'sec2', annualFeeStatus: 'مدفوع' });
  assert.strictEqual(candidate.annualFee.status, 'paid');
  assert.strictEqual(candidate.annualFee.defaulted, false);
});
test('NOT PAID keeps the academic data intact', () => {
  const { candidate } = row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',studyYear: 'sec2', academicYear: '2026-2027', annualFeeStatus: 'غير مدفوع' });
  assert.strictEqual(candidate.annualFee.status, 'unpaid');
  assert.strictEqual(candidate.studyYear, 'sec2');
  assert.strictEqual(candidate.academicYear, '2026-2027');
});
test('PAID without a level → error (same rule as the individual form)', () =>
  assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',annualFeeStatus: 'paid' }).errors.some((e) => /المستوى الدراسي/.test(e))));
test('PAID with an invalid level reports the level error once (no double message)', () => {
  const r = row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',studyYear: '9AS', annualFeeStatus: 'paid' });
  assert.strictEqual(r.errors.filter((e) => /المستوى|مستوى/.test(e)).length, 1, JSON.stringify(r.errors));
});
test('PAID for next year → error (fees cannot be prepaid for a year that has not started)', () =>
  assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',studyYear: 'sec2', academicYear: '2027-2028', annualFeeStatus: 'paid' }).error));
test('PAID with a payment date inside the year → kept', () => {
  const { candidate } = row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',studyYear: 'sec2', annualFeeStatus: 'paid', annualFeePaidAt: '05/09/2026' });
  assert.strictEqual(candidate.annualFee.paidAt, '2026-09-05');
});
test('PAID dated TODAY is valid at any hour (regression: was rejected before noon)', () => {
  const earlyMorning = V.buildContext({ now: new Date(2026, 10, 19, 0, 5, 0) });
  const r = V.normalizeRow({ fullName: 'x', email: 'a@b.com', phone: '0550000000',studyYear: 'sec2', annualFeeStatus: 'paid', annualFeePaidAt: '19/11/2026' }, BRANCH, earlyMorning);
  assert.strictEqual(r.error, undefined, r.error);
  assert.strictEqual(r.candidate.annualFee.paidAt, '2026-11-19');
});
test('PAID dated tomorrow is still rejected late in the evening', () => {
  const lateEvening = V.buildContext({ now: new Date(2026, 10, 19, 23, 55, 0) });
  assert.ok(V.normalizeRow({ fullName: 'x', email: 'a@b.com', phone: '0550000000',studyYear: 'sec2', annualFeeStatus: 'paid', annualFeePaidAt: '20/11/2026' }, BRANCH, lateEvening).error);
});
test('paymentInstant: today → now (never in the future); other days → local noon', () => {
  const now = new Date(2026, 10, 19, 8, 30, 0);
  assert.strictEqual(V.paymentInstant('2026-11-19', now), now.toISOString());
  const past = new Date(V.paymentInstant('2026-07-01', now));
  assert.strictEqual(past.getHours(), 12);
  assert.strictEqual(past.getDate(), 1);
  assert.strictEqual(past.getMonth(), 6);
  assert.strictEqual(V.paymentInstant(null, now), null);
});
test('PAID with a payment date in a previous academic year → error', () =>
  assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',studyYear: 'sec2', annualFeeStatus: 'paid', annualFeePaidAt: '2026-05-01' }).error));
test('PAID with a future payment date → error', () =>
  assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',studyYear: 'sec2', annualFeeStatus: 'paid', annualFeePaidAt: '2026-12-25' }).error));
test('a payment date without «مدفوع» → error (contradiction is never guessed)', () =>
  assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',studyYear: 'sec2', annualFeePaidAt: '2026-09-05' }).error));
test('unknown fee status → error', () =>
  assert.ok(row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',annualFeeStatus: 'ربما' }).error));

// ── Support average ──────────────────────────────────────────────────────────
test('distinguished average is classified with the support rule', () => {
  const { candidate } = row({ fullName: 'x', email: 'a@b.com', phone: '0550000000',distinguishedSubjectsAverage: '10.5' });
  assert.strictEqual(candidate.distinguishedSubjectsAverage, 10.5);
  assert.strictEqual(candidate.supportClassification, 'support_level');
});

// ── duplicateReason ──────────────────────────────────────────────────────────
const sets = () => ({
  seenEmails: new Set(['dup@batch.com']),
  seenPhones: new Set(['0550000001']),
  existingEmails: new Set(['old@school.com']),
  existingPhones: new Set(['0559999999']),
  authEmails: new Set(['owner@auth.com']),
});

test('unique candidate → null', () =>
  assert.strictEqual(V.duplicateReason({ email: 'new@x.com', phone: '0551112222' }, sets()), null));
test('email duplicated within the batch', () =>
  assert.ok(V.duplicateReason({ email: 'dup@batch.com', phone: '' }, sets())));
test('phone duplicated within the batch', () =>
  assert.ok(V.duplicateReason({ email: 'new@x.com', phone: '0550000001' }, sets())));
test('phone duplicate is detected across +213 / local formats', () =>
  assert.ok(V.duplicateReason({ email: null, phone: '+213559999999' }, sets())));
test('email already registered', () =>
  assert.ok(V.duplicateReason({ email: 'old@school.com', phone: '' }, sets())));
test('phone already registered', () =>
  assert.ok(V.duplicateReason({ email: 'new@x.com', phone: '0559999999' }, sets())));
test('email owned by an existing login account', () =>
  assert.ok(V.duplicateReason({ email: 'owner@auth.com', phone: '' }, sets())));
test('no-email candidate is compared by phone only', () =>
  assert.strictEqual(V.duplicateReason({ email: null, phone: '0551234567' }, sets()), null));
test('empty phone never collides on phone', () =>
  assert.strictEqual(V.duplicateReason({ email: 'new@x.com', phone: '' }, sets()), null));

console.log(`✓ bulkImportValidation: ${passed} assertions passed`);
