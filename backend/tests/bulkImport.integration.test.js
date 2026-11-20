/**
 * End-to-end tests for the complete bulk student import (Tests A–I of the spec).
 *
 * Runs the REAL Express middleware (verifyToken, requireAdmin), controllers
 * (bulk import, credentials recovery, create-student, record-annual-fee,
 * Student 360) and services (provisioning, annual-fee service, ledger, audit)
 * over HTTP, against the in-memory Firestore/Auth fake in ./fakeFirebase.js.
 *
 * Run: `node backend/tests/bulkImport.integration.test.js`
 * Exits non-zero on the first failure.
 */

const assert = require('assert');
const { installFakeFirebase } = require('./fakeFirebase');

const { db, auth } = installFakeFirebase();

// ── Capture every console line: Test I asserts no password is ever logged. ──
const logged = [];
const realOut = (s) => process.stdout.write(`${s}\n`);
['log', 'info', 'warn', 'error', 'debug'].forEach((m) => {
  console[m] = (...args) => logged.push(args.map((a) => (
    typeof a === 'string' ? a : a instanceof Error ? `${a.message} ${a.stack}` : JSON.stringify(a)
  )).join(' '));
});

const express = require('express');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { bulkImportStudents } = require('../controllers/adminBulkImportController');
const { issueCredentials } = require('../controllers/adminStudentAccountController');
const { createStudent, recordAnnualFee } = require('../controllers/adminController');
const { getStudentProfile } = require('../controllers/adminStudentController');
const errorHandler = require('../middleware/errorHandler');
const AY = require('../services/academicYear');

const BRANCH = 'boumerdes';
const CURRENT = AY.getAcademicYearLabel();
const START = AY.getAcademicYearStartYear();
const NEXT = `${START + 1}-${START + 2}`;
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const TODAY_DMY = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

// ── Seed: two branch admins, a non-admin, the fee config, existing accounts ──
db._seed('admins/admin-a', { role: 'admin', branchId: BRANCH, name: 'مشرف بومرداس', email: 'a@school.dz', active: true });
db._seed('admins/admin-b', { role: 'admin', branchId: 'bordj_menaiel', name: 'مشرف برج منايل', email: 'b@school.dz', active: true });
db._seed('config/finance', { annualFeeAmount: 1500 });
auth._addToken('tok-a', { uid: 'admin-a', email: 'a@school.dz' });
auth._addToken('tok-b', { uid: 'admin-b', email: 'b@school.dz' });
auth._addToken('tok-student', { uid: 'stu-x', email: 'x@student.dz' });
db._seed(`branches/${BRANCH}/users/self-1`, {
  uid: 'self-1', role: 'student', name: 'طالب مسجل ذاتياً', email: 'old@student.dz', phone: '0551111111',
  branchId: BRANCH, verificationStatus: 'verified',
});
auth._users.set('self-1', { uid: 'self-1', email: 'old@student.dz', password: 'his-own-pass', emailVerified: true });
auth._users.set('elsewhere', { uid: 'elsewhere', email: 'taken@elsewhere.dz', password: 'x', emailVerified: true });

// ── HTTP app with the real middleware/controllers ────────────────────────────
const app = express();
app.use(express.json({ limit: '10mb' }));
app.post('/api/admin/bulk-import-students', verifyToken, requireAdmin, bulkImportStudents);
app.post('/api/admin/students/:userId/credentials', verifyToken, requireAdmin, issueCredentials);
app.post('/api/admin/create-student', verifyToken, requireAdmin, createStudent);
app.post('/api/admin/record-annual-fee', verifyToken, requireAdmin, recordAnnualFee);
app.get('/api/admin/students/:userId/profile', verifyToken, requireAdmin, getStudentProfile);
app.use(errorHandler);

let base = '';
async function call(method, url, { token = 'tok-a', body } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json, headers: res.headers };
}
const importRows = (students, opts = {}) => call('POST', '/api/admin/bulk-import-students', {
  token: opts.token,
  body: { students, dryRun: Boolean(opts.dryRun), ...(opts.defaultAcademicYear ? { defaultAcademicYear: opts.defaultAcademicYear } : {}) },
});
const withRows = (rows) => rows.map((r, i) => ({ __row: i + 2, ...r }));
// Phone is a required column — every row that should import gets a unique one.
let phoneSeq = 0;
const ph = () => `0552${String((phoneSeq += 1)).padStart(6, '0')}`;

const usersDocs = () => db._docsUnder(`branches/${BRANCH}/users`);
const userDoc = (uid) => db._store.get(`branches/${BRANCH}/users/${uid}`);
const named = (name) => usersDocs().filter((u) => u.name === name);
const paymentsOf = (uid) => db._docsUnder(`branches/${BRANCH}/annualPayments`).filter((p) => p.userId === uid);

const issued = []; // every temporary password the API ever returned
const state = {};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ═════════════════════════════════════════════════════════════════════════════
test('A — complete student, PAID: record + every field + account + password + fee + lists', async () => {
  const row = {
    fullName: 'أمين بن علي', email: 'Amine@Example.com', phone: '0550 10 20 30', school: 'ثانوية الأمل',
    birthDate: '14/05/2009', birthPlace: 'بومرداس', address: 'حي 500 مسكن', academicYear: CURRENT,
    studyYear: '2AS', annualFeeStatus: 'مدفوع', distinguishedSubjectsAverage: '13.25',
  };

  const dry = await importRows(withRows([row]), { dryRun: true });
  assert.strictEqual(dry.status, 200, JSON.stringify(dry.body));
  assert.strictEqual(dry.body.results[0].status, 'ready');
  assert.strictEqual(dry.body.results[0].preview.studyYear, 'sec2');
  assert.strictEqual(dry.body.results[0].preview.annualFeeStatus, 'paid');
  assert.strictEqual(dry.body.summary.accountsCreated, 1);
  assert.ok(!('credentials' in dry.body), 'a dry run never returns credentials');
  assert.strictEqual(named('أمين بن علي').length, 0, 'a dry run writes nothing');

  const res = await importRows(withRows([row]));
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const r = res.body.results[0];
  assert.strictEqual(r.status, 'created');
  assert.strictEqual(r.account.status, 'active');
  assert.strictEqual(r.annualFee.status, 'paid');
  assert.strictEqual(res.body.summary.feePaid, 1);
  assert.strictEqual(res.body.credentials.length, 1);
  const cred = res.body.credentials[0];
  issued.push(cred.temporaryPassword);
  assert.strictEqual(cred.uid, r.uid);
  assert.strictEqual(cred.email, 'amine@example.com');
  assert.strictEqual(cred.name, 'أمين بن علي');
  assert.ok(cred.temporaryPassword.length >= 12);

  const doc = userDoc(r.uid);
  assert.ok(doc, 'student record exists');
  const expect = {
    uid: r.uid, name: 'أمين بن علي', fullName: 'أمين بن علي', email: 'amine@example.com',
    phone: '0550102030', phoneNumber: '0550102030', school: 'ثانوية الأمل', birthDate: '2009-05-14',
    birthPlace: 'بومرداس', address: 'حي 500 مسكن', studyYear: 'sec2', schoolLevel: 'high',
    academicYear: CURRENT, role: 'student', status: 'active', verificationStatus: 'verified',
    branchId: BRANCH, createdByAdmin: true, authAccountStatus: 'active', mustChangePassword: true,
    distinguishedSubjectsAverage: 13.25, supportClassification: 'normal',
    yearlyFeePaid: true, paymentVerified: true, annualFeePaid: true, annualFeeYear: CURRENT,
  };
  Object.entries(expect).forEach(([k, v]) => assert.deepStrictEqual(doc[k], v, `profile.${k}`));

  const authUser = auth._users.get(r.uid);
  assert.ok(authUser, 'login account exists with uid = record id');
  assert.strictEqual(authUser.email, 'amine@example.com');
  assert.strictEqual(authUser.emailVerified, true);
  assert.strictEqual(auth._passwordOf(r.uid), cred.temporaryPassword, 'the exported password is the real one');

  const pays = paymentsOf(r.uid);
  assert.strictEqual(pays.length, 1);
  assert.strictEqual(pays[0].status, 'verified');
  assert.strictEqual(pays[0].academicYear, CURRENT);
  assert.strictEqual(pays[0].studyYear, 'sec2');
  assert.strictEqual(pays[0].amount, 1500, 'amount is the owner-configured fee, not client data');
  assert.ok(db._docsUnder('ledger').some((l) => l.studentId === r.uid && l.serviceType === 'annualFee' && l.period === CURRENT));
  assert.ok(db._docsUnder('auditLogs').some((a) => a.action === 'student.create' && a.targetId === r.uid && a.after.via === 'bulk-import'));
  assert.ok(db._docsUnder('auditLogs').some((a) => a.action === 'payment.record' && a.after.userId === r.uid));

  // Appears in the Annual Fees page query (academicYear == current, verified).
  const list = await db.collection('branches').doc(BRANCH).collection('annualPayments').where('academicYear', '==', CURRENT).get();
  assert.ok(list.docs.some((d) => d.data().userId === r.uid && d.data().status === 'verified'));

  // Student 360 profile.
  const s360 = await call('GET', `/api/admin/students/${r.uid}/profile`);
  assert.strictEqual(s360.status, 200);
  assert.strictEqual(s360.body.annualFee.paid, true);
  assert.strictEqual(s360.body.profile.studyYear, 'sec2');
  assert.strictEqual(s360.body.profile.academicYear, CURRENT);
  state.amineUid = r.uid;
  state.aminePassword = cred.temporaryPassword;
});

test('B — complete student, NOT PAID: academic data saved, no payment record', async () => {
  const res = await importRows(withRows([{
    fullName: 'سارة بلقاسم', email: 'sara@example.com', phone: '0661234567', studyYear: 'أولى ثانوي',
    academicYear: CURRENT, annualFeeStatus: 'غير مدفوع', birthDate: '2010-01-20',
  }]));
  assert.strictEqual(res.status, 200);
  const r = res.body.results[0];
  assert.strictEqual(r.status, 'created');
  assert.strictEqual(r.annualFee.status, 'unpaid');
  issued.push(res.body.credentials[0].temporaryPassword);
  const doc = userDoc(r.uid);
  assert.strictEqual(doc.studyYear, 'sec1');
  assert.strictEqual(doc.schoolLevel, 'high');
  assert.strictEqual(doc.academicYear, CURRENT);
  assert.strictEqual(doc.birthDate, '2010-01-20');
  assert.strictEqual(doc.yearlyFeePaid, false);
  assert.strictEqual(doc.annualFeePaid, undefined, 'never marked paid without a payment');
  assert.strictEqual(paymentsOf(r.uid).length, 0, 'NOT PAID writes no payment record');
  const s360 = await call('GET', `/api/admin/students/${r.uid}/profile`);
  assert.strictEqual(s360.body.annualFee.paid, false);
  assert.strictEqual(s360.body.profile.studyYear, 'sec1');
  state.saraUid = r.uid;
});

test('C — paying later reuses the saved level (no re-entry) and never duplicates', async () => {
  // Exactly what the Annual Fees modal sends when the admin does not touch the level.
  const first = await call('POST', '/api/admin/record-annual-fee', { body: { branchId: BRANCH, userId: state.saraUid } });
  assert.strictEqual(first.status, 201, JSON.stringify(first.body));
  assert.strictEqual(first.body.studyYear, 'sec1', 'level retrieved from the profile');
  assert.strictEqual(first.body.academicYear, CURRENT);
  const pays = paymentsOf(state.saraUid);
  assert.strictEqual(pays.length, 1);
  assert.strictEqual(pays[0].studyYear, 'sec1');
  assert.strictEqual(pays[0].level, 'sec1');
  const doc = userDoc(state.saraUid);
  assert.strictEqual(doc.yearlyFeePaid, true);
  assert.strictEqual(doc.studyYear, 'sec1', 'level unchanged by the payment');
  assert.strictEqual(doc.academicYear, CURRENT);

  const again = await call('POST', '/api/admin/record-annual-fee', { body: { branchId: BRANCH, userId: state.saraUid } });
  assert.strictEqual(again.status, 409);
  assert.strictEqual(again.body.code, 'already-paid');
  assert.strictEqual(again.body.message, 'هذا الطالب دفع الرسوم السنوية لهذه السنة الدراسية بالفعل.');
  assert.strictEqual(paymentsOf(state.saraUid).length, 1, 'no duplicate annual fee record');
});

test('D — partial information: optional gaps accepted, required gaps reported per row', async () => {
  const res = await importRows(withRows([
    { fullName: 'D1 كامل', email: 'd1@x.com', phone: '0550000101', studyYear: 'sec3', birthDate: '01/02/2010' },
    { fullName: 'D2 بلا مستوى', email: 'd2@x.com', phone: '0550000102', birthPlace: 'دلس' },
    { fullName: 'D3 مستوى فقط', email: 'd3@x.com', phone: '0550000103', studyYear: 'mid2' },
    { fullName: 'D4 الحد الأدنى', email: 'd4@x.com', phone: '0550000104' },
    { fullName: 'D5 بلا هاتف', email: 'd5@x.com', studyYear: 'mid4' },
    { fullName: 'D6 بلا بريد', phone: '0550000106', studyYear: 'mid2' },
    { fullName: 'D7 بلا تواصل' },
    { email: 'd8@x.com', phone: '0550000108' },
    { fullName: 'D9 بريد خاطئ', email: 'd9-at-x', phone: '0550000109' },
    { fullName: 'D10 مستوى خاطئ', email: 'd10@x.com', phone: '0550000110', studyYear: 'XYZ' },
  ]));
  assert.strictEqual(res.status, 200);
  const byRow = Object.fromEntries(res.body.results.map((r) => [r.row, r]));
  [2, 3, 4, 5].forEach((row) => assert.strictEqual(byRow[row].status, 'created', `row ${row}`));
  [6, 7, 8, 9, 10, 11].forEach((row) => {
    assert.strictEqual(byRow[row].status, 'error', `row ${row}`);
    assert.ok(byRow[row].reason && byRow[row].errors.length >= 1, `row ${row} explains why`);
  });
  assert.deepStrictEqual(byRow[6].errors, ['رقم الهاتف مطلوب']);
  assert.deepStrictEqual(byRow[7].errors, ['البريد الإلكتروني مطلوب']);
  assert.ok(byRow[8].errors.includes('البريد الإلكتروني مطلوب') && byRow[8].errors.includes('رقم الهاتف مطلوب'));
  assert.ok(/الاسم/.test(byRow[9].reason));
  assert.ok(/البريد/.test(byRow[10].reason));
  assert.ok(/مستوى/.test(byRow[11].reason));
  assert.strictEqual(res.body.summary.imported, 4);
  assert.strictEqual(res.body.summary.failed, 6);

  const minimal = userDoc(byRow[5].uid);
  ['birthDate', 'birthPlace', 'address', 'studyYear', 'schoolLevel'].forEach((k) =>
    assert.strictEqual(minimal[k], null, `empty optional ${k} stays empty`));
  assert.strictEqual(minimal.phone, '0550000104');
  assert.strictEqual(minimal.academicYear, CURRENT, 'admin-selected academic year still associated');
  assert.strictEqual(userDoc(byRow[3].uid).studyYear, null, 'missing level stays empty');
  res.body.credentials.forEach((c) => issued.push(c.temporaryPassword));
  assert.strictEqual(res.body.credentials.length, 4, 'every imported student gets an account');
  [6, 7, 8, 9, 10, 11].forEach((row) => assert.strictEqual(named(byRow[row].name).length, 0, 'failed rows wrote nothing'));
});

test('E — row without email or phone is rejected; an existing record without a login is still recoverable', async () => {
  const res = await importRows(withRows([
    { fullName: 'يوسف بلا بريد', phone: '0770123456', studyYear: '4AM' },
    { fullName: 'يوسف بلا هاتف', email: 'youcef.nophone@x.com', studyYear: '4AM' },
  ]));
  assert.deepStrictEqual(res.body.results.map((r) => r.status), ['error', 'error']);
  assert.strictEqual(res.body.results[0].reason, 'البريد الإلكتروني مطلوب');
  assert.strictEqual(res.body.results[1].reason, 'رقم الهاتف مطلوب');
  assert.strictEqual(res.body.credentials.length, 0);
  assert.strictEqual(named('يوسف بلا بريد').length + named('يوسف بلا هاتف').length, 0, 'nothing written');

  // A record that has no login (e.g. created before this rule) can still get one.
  const uid = 'legacy-no-login';
  db._seed(`branches/${BRANCH}/users/${uid}`, {
    uid, role: 'student', name: 'يوسف بلا بريد', branchId: BRANCH, email: null,
    phone: '0770123456', createdByAdmin: true, authAccountStatus: 'none', studyYear: 'mid4',
  });
  const r = { uid };

  const noEmail = await call('POST', `/api/admin/students/${r.uid}/credentials`, { body: {} });
  assert.strictEqual(noEmail.status, 400);
  assert.strictEqual(noEmail.body.code, 'email-required');

  const taken = await call('POST', `/api/admin/students/${r.uid}/credentials`, { body: { email: 'amine@example.com' } });
  assert.strictEqual(taken.status, 409, 'cannot reuse another student\'s email');

  const ok = await call('POST', `/api/admin/students/${r.uid}/credentials`, { body: { email: 'Youcef@Example.com' } });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.action, 'created');
  assert.strictEqual(ok.body.uid, r.uid, 'same uid — every existing reference stays valid');
  assert.strictEqual(ok.headers.get('cache-control'), 'no-store');
  issued.push(ok.body.temporaryPassword);
  assert.strictEqual(auth._passwordOf(r.uid), ok.body.temporaryPassword);
  const after = userDoc(r.uid);
  assert.strictEqual(after.email, 'youcef@example.com');
  assert.strictEqual(after.authAccountStatus, 'active');
  assert.strictEqual(after.mustChangePassword, true);
  assert.strictEqual(named('يوسف بلا بريد').length, 1, 'no duplicate record');
});

test('F — several students: one account each, unique passwords, exact student↔password mapping', async () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ fullName: `طالب رقم ${i + 1}`, email: `multi${i + 1}@x.com`, phone: ph(), studyYear: 'sec1' }));
  const res = await importRows(withRows(rows));
  assert.strictEqual(res.status, 200);
  const creds = res.body.credentials;
  assert.strictEqual(creds.length, 6);
  assert.strictEqual(new Set(creds.map((c) => c.temporaryPassword)).size, 6, 'passwords are unique');
  assert.strictEqual(new Set(creds.map((c) => c.uid)).size, 6, 'one account per student');
  creds.forEach((c) => {
    issued.push(c.temporaryPassword);
    const authUser = auth._users.get(c.uid);
    assert.strictEqual(authUser.email, c.email, 'credential email = account email');
    assert.strictEqual(auth._passwordOf(c.uid), c.temporaryPassword, `password belongs to ${c.email}`);
    assert.strictEqual(userDoc(c.uid).name, c.name, 'credential name = record name');
    assert.strictEqual(userDoc(c.uid).email, c.email);
  });
  // Export order follows the file order.
  assert.deepStrictEqual(creds.map((c) => c.email), rows.map((r) => r.email));
});

test('G — login account creation fails: record kept, failure reported, recovery without duplicates', async () => {
  auth._failCreateFor('fail@x.com', 'auth/internal-error');
  const rows = withRows([
    { fullName: 'حساب يفشل', email: 'fail@x.com', phone: ph(), studyYear: 'sec2', annualFeeStatus: 'paid' },
    { fullName: 'حساب ينجح', email: 'okay@x.com', phone: ph(), studyYear: 'sec2' },
  ]);
  const res = await importRows(rows);
  assert.strictEqual(res.status, 200);
  const [failed, okay] = res.body.results;
  assert.strictEqual(failed.status, 'created', 'the student record is NOT lost');
  assert.strictEqual(failed.account.status, 'failed');
  assert.ok(failed.account.reason);
  assert.strictEqual(failed.annualFee.status, 'paid', 'the fee is independent of the login');
  assert.strictEqual(okay.account.status, 'active');
  assert.strictEqual(res.body.summary.accountsFailed, 1);
  assert.strictEqual(res.body.summary.accountsCreated, 1);
  assert.deepStrictEqual(res.body.credentials.map((c) => c.email), ['okay@x.com'], 'no password for a failed account');
  res.body.credentials.forEach((c) => issued.push(c.temporaryPassword));
  const doc = userDoc(failed.uid);
  assert.strictEqual(doc.authAccountStatus, 'failed');
  assert.strictEqual(doc.authAccountError, 'auth/internal-error');
  assert.strictEqual(auth._users.has(failed.uid), false);

  // Re-importing the same file (a retry) creates nothing new.
  const retry = await importRows(rows);
  assert.deepStrictEqual(retry.body.results.map((r) => r.status), ['skipped', 'skipped']);
  assert.strictEqual(retry.body.credentials.length, 0);
  assert.strictEqual(named('حساب يفشل').length, 1);
  assert.strictEqual(named('حساب ينجح').length, 1);

  // Recovery once the provider works again: same uid, no duplicate account.
  auth._clearFailures();
  const rec = await call('POST', `/api/admin/students/${failed.uid}/credentials`, { body: {} });
  assert.strictEqual(rec.status, 201, JSON.stringify(rec.body));
  assert.strictEqual(rec.body.uid, failed.uid);
  issued.push(rec.body.temporaryPassword);
  assert.strictEqual(userDoc(failed.uid).authAccountStatus, 'active');
  assert.strictEqual(userDoc(failed.uid).authAccountError, null);
  assert.strictEqual([...auth._users.values()].filter((u) => u.email === 'fail@x.com').length, 1);
});

test('G2 — annual fee write fails: record kept, fee failure reported, student NOT marked paid', async () => {
  db._failWritesMatching(/annualPayments\//);
  try {
    const res = await importRows(withRows([{ fullName: 'رسوم تفشل', email: 'feefail@x.com', phone: ph(), studyYear: 'mid1', annualFeeStatus: 'مدفوع' }]));
    const r = res.body.results[0];
    assert.strictEqual(r.status, 'created');
    assert.strictEqual(r.annualFee.status, 'failed');
    assert.ok(r.annualFee.reason);
    assert.strictEqual(res.body.summary.feeFailed, 1);
    res.body.credentials.forEach((c) => issued.push(c.temporaryPassword));
    const doc = userDoc(r.uid);
    assert.strictEqual(doc.yearlyFeePaid, false, 'never paid without a payment record');
    assert.strictEqual(doc.studyYear, 'mid1', 'academic level kept although the fee failed');
    assert.strictEqual(paymentsOf(r.uid).length, 0);
  } finally {
    db._clearWriteFailures();
  }
});

test('H — individually registered vs bulk-imported student with identical information', async () => {
  const shared = {
    fullName: 'طالب مطابق', school: 'متوسطة النجاح', birthDate: '2011-03-09', birthPlace: 'دلس', address: 'شارع الحرية',
  };
  const manual = await call('POST', '/api/admin/create-student', {
    body: { branchId: BRANCH, ...shared, email: 'manual@x.com', phone: '0550990001', password: 'Temp#2026x', studyYear: 'mid3' },
  });
  assert.strictEqual(manual.status, 201, JSON.stringify(manual.body));
  const bulk = await importRows(withRows([{ ...shared, email: 'bulk@x.com', phone: '0550990002', studyYear: 'ثالثة متوسط' }]));
  assert.strictEqual(bulk.body.results[0].status, 'created');
  issued.push('Temp#2026x', bulk.body.credentials[0].temporaryPassword);

  const a = userDoc(manual.body.userId);
  const b = userDoc(bulk.body.results[0].uid);
  assert.deepStrictEqual(Object.keys(a).sort(), Object.keys(b).sort(), 'identical schema');
  const differ = new Set(['uid', 'email', 'phone', 'phoneNumber', 'registrationNumber', 'createdAt', 'updatedAt',
    'lifecycleStatusUpdatedAt', 'lastActivityAt', 'temporaryPasswordIssuedAt']);
  Object.keys(a).filter((k) => !differ.has(k)).forEach((k) => assert.deepStrictEqual(a[k], b[k], `field ${k}`));
  assert.strictEqual(a.studyYear, 'mid3');
  assert.strictEqual(a.academicYear, CURRENT);
  assert.strictEqual(a.mustChangePassword, true, 'individual registration also forces the first-login change');
});

test('Duplicates — inside the file, across chunks, and against existing login accounts', async () => {
  const sameFile = await importRows(withRows([
    { fullName: 'مكرر 1', email: 'twice@x.com', phone: ph() },
    { fullName: 'مكرر 2', email: 'TWICE@x.com', phone: ph() },
    { fullName: 'هاتف مكرر', email: 'phonedup@x.com', phone: '+213 661 23 45 67' }, // same phone as Sara (0661234567)
    { fullName: 'حساب خارجي', email: 'taken@elsewhere.dz', phone: ph() },
    { fullName: 'طالب قديم', email: 'old@student.dz', phone: ph() },
  ]));
  const s = sameFile.body.results;
  assert.strictEqual(s[0].status, 'created');
  assert.strictEqual(s[1].status, 'skipped');
  assert.ok(/داخل الملف/.test(s[1].reason));
  assert.strictEqual(s[2].status, 'skipped');
  assert.ok(/الهاتف/.test(s[2].reason));
  assert.strictEqual(s[3].status, 'skipped');
  assert.ok(/حساب دخول/.test(s[3].reason));
  assert.strictEqual(s[4].status, 'skipped');
  sameFile.body.credentials.forEach((c) => issued.push(c.temporaryPassword));

  // The next chunk of the same file sees chunk 1's students as existing.
  const chunk2 = await importRows([{ __row: 40, fullName: 'مكرر 3', email: 'twice@x.com', phone: ph() }, { __row: 41, fullName: 'جديد', email: 'fresh@x.com', phone: ph() }]);
  assert.strictEqual(chunk2.body.results[0].status, 'skipped');
  assert.strictEqual(chunk2.body.results[0].row, 40, 'spreadsheet row numbers are preserved');
  assert.strictEqual(chunk2.body.results[1].status, 'created');
  chunk2.body.credentials.forEach((c) => issued.push(c.temporaryPassword));
  assert.strictEqual(usersDocs().filter((u) => u.email === 'twice@x.com').length, 1);
});

test('Concurrent double-submit of an import cannot create duplicates', async () => {
  auth._setLatency(60);
  try {
    const rows = withRows([{ fullName: 'نقرة مزدوجة', email: 'double@x.com', phone: ph() }]);
    const [r1, r2] = await Promise.all([importRows(rows), importRows(rows)]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepStrictEqual(statuses, [200, 409]);
    [r1, r2].forEach((r) => (r.body.credentials || []).forEach((c) => issued.push(c.temporaryPassword)));
    assert.strictEqual(named('نقرة مزدوجة').length, 1);
  } finally {
    auth._setLatency(0);
  }
});

test('Academic year: admin default applies, row value wins, past year rejected, prepaid next year rejected', async () => {
  const res = await importRows(withRows([
    { fullName: 'سنة قادمة افتراضية', email: 'next1@x.com', phone: ph(), studyYear: 'sec1' },
    { fullName: 'سنة من الملف', email: 'next2@x.com', phone: ph(), studyYear: 'sec1', academicYear: CURRENT },
    { fullName: 'سنة منتهية', email: 'past@x.com', phone: ph(), academicYear: `${START - 2}-${START - 1}` },
    { fullName: 'رسوم مسبقة', email: 'prepay@x.com', phone: ph(), studyYear: 'sec1', annualFeeStatus: 'paid' },
  ]), { defaultAcademicYear: NEXT });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const [a, b, c, d] = res.body.results;
  assert.strictEqual(userDoc(a.uid).academicYear, NEXT);
  assert.strictEqual(userDoc(b.uid).academicYear, CURRENT);
  assert.strictEqual(c.status, 'error');
  assert.strictEqual(d.status, 'error');
  res.body.credentials.forEach((x) => issued.push(x.temporaryPassword));

  const bad = await importRows(withRows([{ fullName: 'x', email: 'x@x.com', phone: ph() }]), { defaultAcademicYear: '2001-2002' });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.body.code, 'invalid-academic-year');
});

test('PAID with a payment date inside the current year is recorded on that date', async () => {
  const res = await importRows(withRows([{ fullName: 'دفع بتاريخ', email: 'dated@x.com', phone: ph(), studyYear: 'sec3', annualFeeStatus: 'مدفوع', annualFeePaidAt: TODAY_DMY }]));
  const r = res.body.results[0];
  assert.strictEqual(r.annualFee.status, 'paid', JSON.stringify(r));
  assert.strictEqual(r.annualFee.academicYear, CURRENT);
  res.body.credentials.forEach((c) => issued.push(c.temporaryPassword));
});

test('I — security: authorization, no-store, no plaintext at rest, scoped recovery', async () => {
  const rows = withRows([{ fullName: 'غير مخول', email: 'unauth@x.com', phone: ph() }]);
  assert.strictEqual((await importRows(rows, { token: null })).status, 401, 'no token');
  assert.strictEqual((await importRows(rows, { token: 'tok-student' })).status, 403, 'non-admin');
  const cross = await call('POST', '/api/admin/bulk-import-students', { token: 'tok-b', body: { branchId: BRANCH, students: rows } });
  assert.strictEqual(cross.status, 403, 'admin of another branch');
  const crossCred = await call('POST', `/api/admin/students/${state.amineUid}/credentials`, { token: 'tok-b', body: {} });
  assert.strictEqual(crossCred.status, 404, 'another branch cannot touch this student');
  assert.strictEqual((await call('POST', `/api/admin/students/${state.amineUid}/credentials`, { token: 'tok-student', body: {} })).status, 403);
  assert.strictEqual(named('غير مخول').length, 0);

  const commit = await importRows(withRows([{ fullName: 'ترويسة', email: 'headers@x.com', phone: ph() }]));
  assert.strictEqual(commit.headers.get('cache-control'), 'no-store');
  commit.body.credentials.forEach((c) => issued.push(c.temporaryPassword));

  // New temporary password while the admin-issued one is still in place.
  const reset = await call('POST', `/api/admin/students/${state.amineUid}/credentials`, { body: {} });
  assert.strictEqual(reset.status, 200, JSON.stringify(reset.body));
  assert.strictEqual(reset.body.action, 'reset');
  assert.notStrictEqual(reset.body.temporaryPassword, state.aminePassword);
  assert.strictEqual(auth._passwordOf(state.amineUid), reset.body.temporaryPassword);
  assert.ok(auth._revoked.includes(state.amineUid), 'old sessions revoked');
  issued.push(reset.body.temporaryPassword);

  // Once the student has set their own password, the admin can no longer overwrite it.
  await db.collection('branches').doc(BRANCH).collection('users').doc(state.amineUid).update({ mustChangePassword: false });
  const refused = await call('POST', `/api/admin/students/${state.amineUid}/credentials`, { body: {} });
  assert.strictEqual(refused.status, 409);
  assert.strictEqual(refused.body.code, 'password-already-set');
  // …and a self-registered student's password is never resettable by an admin.
  const self = await call('POST', '/api/admin/students/self-1/credentials', { body: {} });
  assert.strictEqual(self.status, 409);
  assert.strictEqual(auth._passwordOf('self-1'), 'his-own-pass');

  // Ordinary read endpoints never expose credentials.
  const s360 = await call('GET', `/api/admin/students/${state.amineUid}/profile`);
  issued.forEach((p) => assert.ok(!JSON.stringify(s360.body).includes(p), 'Student 360 leaks no password'));
});

// ═════════════════════════════════════════════════════════════════════════════
(async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  let passed = 0;
  try {
    for (const t of tests) {
      try {
        await t.fn();
        passed += 1;
      } catch (e) {
        realOut(`✗ ${t.name}`);
        realOut(`  ${e.stack || e.message}`);
        realOut('--- captured console ---');
        logged.slice(-15).forEach((l) => realOut(`  ${l}`));
        process.exitCode = 1;
        return;
      }
    }

    // Test I (continued) — at-rest and in-logs scan over EVERYTHING the run produced.
    const everything = JSON.stringify([...db._store.entries()]);
    const allLogs = logged.join('\n');
    assert.ok(issued.length >= 20, `collected ${issued.length} passwords`);
    issued.forEach((p) => {
      assert.ok(!everything.includes(p), 'a plaintext password was found in Firestore');
      assert.ok(!allLogs.includes(p), 'a plaintext password was found in the logs');
    });
    passed += 1;
    realOut(`✓ bulkImport.integration: ${passed} scenarios passed (${issued.length} passwords verified absent from Firestore and logs)`);
  } finally {
    server.close();
  }
})().catch((e) => {
  realOut(`✗ harness error: ${e.stack || e.message}`);
  process.exitCode = 1;
});
