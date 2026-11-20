/**
 * Tests for the single student-profile builder.
 *
 * Run: `node backend/services/studentProfile.test.js`
 * Exits non-zero on the first failure.
 */

const assert = require('assert');
const P = require('./studentProfile');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; }
  catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

const TS = { now: () => 'SERVER_TS' };
const ACTOR = { uid: 'admin1', name: 'مشرف', email: 'admin@x.com' };
const base = (over = {}) => P.buildStudentProfile({
  uid: 'u1', branchId: 'boumerdes', fullName: '  أمين بن علي ', registrationNumber: 'BOUM-202611-1234',
  callerActor: ACTOR, account: { status: P.AUTH_ACCOUNT.ACTIVE, mustChangePassword: true }, ...over,
}, TS);

test('canonical aliases are always present', () => {
  const d = base({ email: 'A@X.COM', phone: '0550123456' });
  assert.strictEqual(d.name, 'أمين بن علي');
  assert.strictEqual(d.fullName, 'أمين بن علي');
  assert.strictEqual(d.email, 'a@x.com');
  assert.strictEqual(d.phone, '0550123456');
  assert.strictEqual(d.phoneNumber, '0550123456');
  assert.strictEqual(d.branch, 'boumerdes');
  assert.strictEqual(d.branchId, 'boumerdes');
  assert.strictEqual(d.branchName, 'بومرداس');
  assert.strictEqual(d.role, 'student');
  assert.strictEqual(d.status, 'active');
  assert.strictEqual(d.verificationStatus, 'verified');
});
test('optional personal fields that were not provided stay null (nothing invented)', () => {
  const d = base({ email: 'a@x.com' });
  ['phone', 'phoneNumber', 'birthDate', 'birthPlace', 'address', 'studyYear', 'schoolLevel', 'academicYear']
    .forEach((k) => assert.strictEqual(d[k], null, k));
});
test('academic data is saved: level, derived school level, academic year', () => {
  const d = base({ email: 'a@x.com', studyYear: 'sec2', academicYear: '2026-2027' });
  assert.strictEqual(d.studyYear, 'sec2');
  assert.strictEqual(d.schoolLevel, 'high');
  assert.strictEqual(d.academicYear, '2026-2027');
});
test('payment flags always start false (only the fee service sets them)', () => {
  const d = base({ email: 'a@x.com' });
  assert.strictEqual(d.yearlyFeePaid, false);
  assert.strictEqual(d.paymentVerified, false);
  assert.strictEqual(d.annualFeePaid, undefined);
});
test('blank school → «حر» (platform rule: never empty)', () => assert.strictEqual(base({ email: 'a@x.com', school: '' }).school, 'حر'));
test('no-email student: no account, not email-verified, no forced password change', () => {
  const d = base({ email: null, phone: '0550123456', account: { status: P.AUTH_ACCOUNT.NONE } });
  assert.strictEqual(d.email, null);
  assert.strictEqual(d.emailVerified, false);
  assert.strictEqual(d.authAccountStatus, 'none');
  assert.strictEqual(d.authAccountError, null);
  assert.strictEqual(d.mustChangePassword, false);
  assert.strictEqual(d.temporaryPasswordIssuedAt, null);
});
test('failed account keeps the record and stores only the error code', () => {
  const d = base({ email: 'a@x.com', account: { status: P.AUTH_ACCOUNT.FAILED, error: 'auth/email-already-exists' } });
  assert.strictEqual(d.authAccountStatus, 'failed');
  assert.strictEqual(d.authAccountError, 'auth/email-already-exists');
  assert.strictEqual(d.mustChangePassword, false);
});
test('active account → temporary password must be changed at first login', () => {
  const d = base({ email: 'a@x.com' });
  assert.strictEqual(d.authAccountStatus, 'active');
  assert.strictEqual(d.mustChangePassword, true);
  assert.strictEqual(d.temporaryPasswordIssuedAt, 'SERVER_TS');
});
test('no key anywhere in the profile can hold a password', () => {
  const d = base({ email: 'a@x.com', password: 'Secret#123', temporaryPassword: 'Secret#123' });
  Object.keys(d).forEach((k) => assert.ok(!/password$/i.test(k) || k === 'mustChangePassword', `unexpected key ${k}`));
  assert.ok(!JSON.stringify(d).includes('Secret#123'));
});
test('support average/classification only written when provided', () => {
  assert.strictEqual('distinguishedSubjectsAverage' in base({ email: 'a@x.com' }), false);
  const d = base({ email: 'a@x.com', distinguishedSubjectsAverage: 9.5, supportClassification: 'support_level' });
  assert.strictEqual(d.distinguishedSubjectsAverage, 9.5);
  assert.strictEqual(d.supportClassification, 'support_level');
  assert.strictEqual(d.distinguishedAverageSource, 'admin');
});
test('registration number format matches self-registration', () =>
  assert.ok(/^BOUM-\d{6}-\d{4}$/.test(P.generateRegistrationNumber('boumerdes'))));

console.log(`✓ studentProfile: ${passed} assertions passed`);
