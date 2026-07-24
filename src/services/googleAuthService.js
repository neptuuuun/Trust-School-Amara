/**
 * Google Authentication Service
 *
 * Handles the Firestore side of Google sign-in / sign-up:
 *  – searching all branches for an existing user document
 *  – creating a STUB document for first-time Google users (profile incomplete)
 *  – completing the profile after the user fills in the required fields
 *
 * Branch-isolation guarantee: every user belongs to exactly one
 * branches/{branchId}/users/{uid} document.
 */

import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const VALID_BRANCHES = ['boumerdes', 'bordj_menaiel'];

const branchDisplayName = (branchId) =>
  branchId === 'boumerdes'      ? 'بومرداس'    :
  branchId === 'bordj_menaiel'  ? 'برج منايل'  : branchId;

// ---------------------------------------------------------------------------
// findUserAcrossBranches
// ---------------------------------------------------------------------------

/**
 * Search every branch for an existing user document with the given UID.
 * Returns the FIRST match, or null if not found in any branch.
 *
 * @param {string} uid
 * @returns {Promise<{ branchId: string, data: object } | null>}
 */
export const findUserAcrossBranches = async (uid) => {
  if (!uid) return null;
  for (const branchId of VALID_BRANCHES) {
    const ref = doc(db, 'branches', branchId, 'users', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return { branchId, data: snap.data() };
  }
  return null;
};

// ---------------------------------------------------------------------------
// createGoogleUserStub
// ---------------------------------------------------------------------------

/**
 * Create a minimal "stub" Firestore document for a first-time Google sign-in.
 *
 * The stub only stores identity data Google provides. The student MUST visit
 * /complete-registration to supply the mandatory school fields before they can
 * access any protected page.
 *
 * Key flags:
 *   completedProfile: false   ← route guard redirects to /complete-registration
 *   emailVerified:    true    ← Google already verified the address
 *   status:           'incomplete' ← not yet sent for admin review
 *
 * @param {string} branchId
 * @param {{ uid, email, displayName, photoURL }} googleUser
 * @returns {Promise<object>} The written payload
 */
export const createGoogleUserStub = async (branchId, googleUser) => {
  if (!VALID_BRANCHES.includes(branchId)) {
    throw new Error(
      `Invalid branchId "${branchId}". Must be one of: ${VALID_BRANCHES.join(', ')}`
    );
  }

  const payload = {
    uid:               googleUser.uid,
    email:             googleUser.email || '',
    fullName:          googleUser.displayName || '',
    name:              googleUser.displayName || '',
    photoUrl:          googleUser.photoURL  || null,
    idCardUrl:         null,
    role:              'student',
    branchId,
    branchName:        branchDisplayName(branchId),
    authProvider:      'google',
    emailVerified:     true,
    status:            'incomplete',
    verified:          false,
    accountVerified:   false,
    verificationStatus:'unverified',
    paymentVerified:   false,
    yearlyFeePaid:     false,
    birthDate:         null,
    birthPlace:        null,
    address:           null,
    // Educational institution — REQUIRED, but collected later at
    // /complete-registration (this is an incomplete stub: completedProfile=false).
    school:            null,
    phoneNumber:       null,
    phone:             null,
    registrationNumber:null,
    internalRulesAccepted: false,
    completedProfile:  false,
    createdAt:         serverTimestamp(),
    updatedAt:         serverTimestamp(),
  };

  const ref = doc(db, 'branches', branchId, 'users', googleUser.uid);
  await setDoc(ref, payload, { merge: false });
  return payload;
};

// ---------------------------------------------------------------------------
// completeGoogleProfile
// ---------------------------------------------------------------------------

/**
 * Merge completed profile fields into an existing stub document and flip
 * completedProfile → true.  This triggers the admin approval flow.
 *
 * Called from CompleteRegistrationPage after all photos are uploaded.
 *
 * @param {string} branchId
 * @param {string} uid
 * @param {object} profileData  All required school fields + photo URLs
 * @returns {Promise<void>}
 */
export const completeGoogleProfile = async (branchId, uid, profileData) => {
  if (!VALID_BRANCHES.includes(branchId)) {
    throw new Error(`Invalid branchId "${branchId}"`);
  }

  const ref = doc(db, 'branches', branchId, 'users', uid);
  await setDoc(
    ref,
    {
      ...profileData,
      completedProfile:  true,
      status:            'pending',
      verificationStatus:'pending',
      verified:          false,
      accountVerified:   false,
      updatedAt:         serverTimestamp(),
    },
    { merge: true }
  );
};
