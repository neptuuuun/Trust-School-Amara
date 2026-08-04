/**
 * studentProvisioning.js
 * ----------------------
 * The SINGLE source of truth for creating a student (Firebase Auth user + the
 * canonical pre-verified Firestore profile). Both the manual "create student"
 * endpoint and the bulk importer call provisionStudent(), so an imported student
 * is byte-for-byte identical in schema and rules to a manually added one — there
 * is no second, drifting copy of the profile shape.
 *
 * Inputs are assumed already validated by the caller (createStudent validates a
 * single body; bulkImport validates each row). Auth/creation failures throw with
 * a `.code` (e.g. 'auth/email-already-exists') for the caller to translate.
 */

const { admin, db, auth } = require('../config/firebase');
const { normalizeSchool } = require('../constants');

const VALID_BRANCHES = ['boumerdes', 'bordj_menaiel'];

const BRANCH_NAMES = {
  boumerdes:     'بومرداس',
  bordj_menaiel: 'برج منايل',
};

/** Registration number identical in format to self-registration & manual create. */
function generateRegistrationNumber(branchId) {
  const now    = new Date();
  const year   = now.getFullYear();
  const month  = String(now.getMonth() + 1).padStart(2, '0');
  const rand   = Math.floor(1000 + Math.random() * 9000);
  const prefix = branchId.slice(0, 4).toUpperCase();
  return `${prefix}-${year}${month}-${rand}`;
}

/**
 * Create the Auth user + canonical student profile document.
 *
 * @param {object} p
 * @param {string} p.branchId
 * @param {string} p.fullName
 * @param {string} p.email
 * @param {string} [p.phone]
 * @param {string} [p.school]  blank → «حر» (standardized unaffiliated value)
 * @param {string} p.password
 * @param {{uid:string,name?:string,email?:string}} p.callerActor  enrolling admin
 * @returns {Promise<{uid, registrationNumber, normalizedEmail, trimmedName, normalizedSchool}>}
 */
async function provisionStudent({ branchId, fullName, email, phone, school, password, callerActor }) {
  const normalizedEmail  = email.trim().toLowerCase();
  const trimmedName      = fullName.trim();
  const normalizedSchool = normalizeSchool(school);
  const trimmedPhone     = phone == null ? null : (String(phone).trim() || null);

  const userRecord = await auth.createUser({
    email:         normalizedEmail,
    password,
    displayName:   trimmedName,
    emailVerified: true,
  });

  const uid                = userRecord.uid;
  const branchName         = BRANCH_NAMES[branchId] || branchId;
  const registrationNumber = generateRegistrationNumber(branchId);

  // Admin-created accounts use the exact same schema as self-registered students.
  // Pre-verified and immediately active — no email confirmation needed.
  await db.collection('branches').doc(branchId).collection('users').doc(uid).set({
    uid,
    name:               trimmedName,
    fullName:           trimmedName,
    email:              normalizedEmail,
    phoneNumber:        trimmedPhone,
    phone:              trimmedPhone,
    branch:             branchId,
    branchId,
    branchName,
    role:               'student',
    status:             'active',
    emailVerified:      true,
    verified:           true,
    accountVerified:    true,
    verificationStatus: 'verified',
    paymentVerified:    false,
    yearlyFeePaid:      false,
    studyYear:          null,
    birthDate:          null,
    birthPlace:         null,
    address:            null,
    school:             normalizedSchool,
    photoUrl:           null,
    idCardUrl:          null,
    verificationRequest: null,
    registrationNumber,
    internalRulesAccepted: true,
    completedProfile:   true,
    createdByAdmin:     true,
    createdBy:          { uid: callerActor.uid, name: callerActor.name || '', email: callerActor.email || '' },
    lifecycleStatus:    'active',
    lifecycleStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastActivityAt:     admin.firestore.FieldValue.serverTimestamp(),
    lastActivityType:   'admin_account_creation',
    createdAt:          admin.firestore.FieldValue.serverTimestamp(),
    updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
  });

  return { uid, registrationNumber, normalizedEmail, trimmedName, normalizedSchool };
}

module.exports = { provisionStudent, generateRegistrationNumber, VALID_BRANCHES, BRANCH_NAMES };
