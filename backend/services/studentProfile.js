/**
 * studentProfile.js  (backend / CommonJS, PURE — no firebase, no I/O)
 * ------------------------------------------------------------------
 * THE single builder of an admin-created student profile document
 * (branches/{branchId}/users/{uid}). Individual registration
 * (POST /api/admin/create-student) and the bulk importer both build the
 * document HERE, so given the same information they store byte-for-byte the
 * same shape — there is no second, drifting copy of the schema.
 *
 * Field rules:
 *   • Every field the platform reads is always present (legacy readers rely on
 *     `name`/`fullName`, `phone`/`phoneNumber`, `branch`/`branchId`, …).
 *   • Optional information that was not provided is stored as null — never an
 *     invented placeholder. The one exception is `school`, which the platform
 *     requires on every person record; blank is normalized to «حر» (see
 *     constants.js) and the importer reports that as a visible warning.
 *   • The support-level average/classification is written ONLY when provided,
 *     exactly like the existing admin "edit average" endpoint — absence means
 *     "unclassified" to every reader.
 *   • Passwords are never part of the profile. Only non-secret account metadata
 *     is stored (authAccountStatus, mustChangePassword, issue timestamp).
 *
 * Timestamps are produced by an injected `now()` (FieldValue.serverTimestamp in
 * production) so this stays pure and unit-testable.
 */

const { normalizeSchool } = require('../constants');
const { schoolLevelOf } = require('./studentFields');

const BRANCH_NAMES = {
  boumerdes:     'بومرداس',
  bordj_menaiel: 'برج منايل',
};

/** Login-account states recorded on the profile (the Auth user is the truth). */
const AUTH_ACCOUNT = Object.freeze({
  ACTIVE: 'active',   // Firebase Auth user exists for this uid
  NONE:   'none',     // no email yet → no account (admin can create it later)
  FAILED: 'failed',   // creation was attempted and failed → recoverable
});

/** Registration number identical in format to self-registration & manual create. */
function generateRegistrationNumber(branchId, now = new Date(), rand = Math.random) {
  const year   = now.getFullYear();
  const month  = String(now.getMonth() + 1).padStart(2, '0');
  const suffix = Math.floor(1000 + rand() * 9000);
  const prefix = String(branchId).slice(0, 4).toUpperCase();
  return `${prefix}-${year}${month}-${suffix}`;
}

const nullable = (v) => (v === undefined || v === '' ? null : v);

/**
 * @param {object} p
 * @param {string}  p.uid
 * @param {string}  p.branchId
 * @param {string}  p.fullName
 * @param {?string} [p.email]
 * @param {?string} [p.phone]
 * @param {?string} [p.school]
 * @param {?string} [p.birthDate]        "YYYY-MM-DD"
 * @param {?string} [p.birthPlace]
 * @param {?string} [p.address]
 * @param {?string} [p.studyYear]        canonical level id (mid1…sec3)
 * @param {?string} [p.academicYear]     "YYYY-YYYY" — the year the level refers to
 * @param {?number} [p.distinguishedSubjectsAverage]
 * @param {?string} [p.supportClassification]
 * @param {string}  p.registrationNumber
 * @param {{uid:string,name?:string,email?:string}} p.callerActor
 * @param {{status:string, error?:?string, mustChangePassword?:boolean}} p.account
 * @param {{ now: () => any }} ts
 * @returns {object} the Firestore document
 */
function buildStudentProfile(p, { now }) {
  const trimmedName = String(p.fullName || '').trim();
  const email = p.email ? String(p.email).trim().toLowerCase() : null;
  const phone = p.phone == null ? null : (String(p.phone).trim() || null);
  const studyYear = nullable(p.studyYear);
  const account = p.account || { status: AUTH_ACCOUNT.NONE };
  const accountActive = account.status === AUTH_ACCOUNT.ACTIVE;

  const doc = {
    uid:                p.uid,
    name:               trimmedName,
    fullName:           trimmedName,
    email,
    phoneNumber:        phone,
    phone,
    branch:             p.branchId,
    branchId:           p.branchId,
    branchName:         BRANCH_NAMES[p.branchId] || p.branchId,
    role:               'student',
    status:             'active',
    // Admin-created accounts are pre-verified: the admin vouches for the email.
    emailVerified:      Boolean(email),
    verified:           true,
    accountVerified:    true,
    verificationStatus: 'verified',
    // Payment flags start false; ONLY the annual-fee service flips them, after
    // it has written a verified payment record (never as a creation side effect).
    paymentVerified:    false,
    yearlyFeePaid:      false,
    // Academic data — saved once, reused by every later workflow.
    studyYear,
    schoolLevel:        schoolLevelOf(studyYear),
    academicYear:       nullable(p.academicYear),
    // Personal data (self-registration fields) — null when not provided.
    birthDate:          nullable(p.birthDate),
    birthPlace:         nullable(p.birthPlace),
    address:            nullable(p.address),
    school:             normalizeSchool(p.school),
    photoUrl:           null,
    idCardUrl:          null,
    verificationRequest: null,
    registrationNumber: p.registrationNumber,
    internalRulesAccepted: true,
    completedProfile:   true,
    createdByAdmin:     true,
    createdBy:          { uid: p.callerActor.uid, name: p.callerActor.name || '', email: p.callerActor.email || '' },
    // Login-account metadata — never the password itself.
    authAccountStatus:  account.status,
    authAccountError:   account.status === AUTH_ACCOUNT.FAILED ? (account.error || 'internal') : null,
    mustChangePassword: accountActive ? account.mustChangePassword !== false : false,
    temporaryPasswordIssuedAt: accountActive ? now() : null,
    lifecycleStatus:    'active',
    lifecycleStatusUpdatedAt: now(),
    lastActivityAt:     now(),
    lastActivityType:   'admin_account_creation',
    createdAt:          now(),
    updatedAt:          now(),
  };

  if (p.distinguishedSubjectsAverage !== null && p.distinguishedSubjectsAverage !== undefined) {
    doc.distinguishedSubjectsAverage  = p.distinguishedSubjectsAverage;
    doc.supportClassification         = p.supportClassification || null;
    doc.distinguishedAverageUpdatedAt = now();
    doc.distinguishedAverageSource    = 'admin';
  }

  return doc;
}

module.exports = { BRANCH_NAMES, AUTH_ACCOUNT, generateRegistrationNumber, buildStudentProfile };
