/**
 * User Service
 * Centralized service for user management with Supabase storage and Firebase Firestore
 */

import { db, auth } from '../firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { supabase } from '../supabase';
import { recordUserActivity, USER_STATUS } from './userLifecycleService';
import { validateImageFile, optimizeImage } from '../utils/imageOptimizer';
import { normalizeSchool } from '../utils/personData';

// ==================== Supabase Storage Functions ====================

/**
 * Upload a file to Supabase Storage
 * @param {File} file - The file to upload
 * @param {string} userId - User ID
 * @param {string} fileType - Type of file: 'userPhoto' or 'idPhoto'
 * @returns {Promise<{publicUrl: string, path: string}>}
 */
export const uploadToSupabase = async (file, userId, fileType) => {
  if (!supabase) {
    const errorMsg = 'Supabase not configured. Please check your environment variables.';
    console.error('❌', errorMsg);
    throw new Error(errorMsg);
  }

  if (!file) {
    const errorMsg = 'No file provided for upload';
    console.error('❌', errorMsg);
    throw new Error(errorMsg);
  }

  if (!userId) {
    const errorMsg = 'User ID is required for upload';
    console.error('❌', errorMsg);
    throw new Error(errorMsg);
  }

  // Strict validation (type + 5MB max) before doing any work.
  const { valid, error: validationError } = validateImageFile(file);
  if (!valid) {
    console.error('❌ Image validation failed:', validationError);
    const err = new Error(validationError);
    err.code = 'invalid-image';
    throw err;
  }

  // Automatic optimization: resize → WebP → compress. Falls back to the
  // original file on any failure so an upload is never blocked.
  const optimizedFile = await optimizeImage(file);

  try {
    let filePath;

    if (fileType === 'userPhoto') {
      filePath = `userPhotos/${userId}/userPhoto.webp`;
    } else {
      filePath = `${userId}/idPhoto.webp`;
    }

    const { error: uploadError } = await supabase.storage
      .from('user-uploads')
      .upload(filePath, optimizedFile, {
        upsert: true,
        cacheControl: '3600',
        contentType: optimizedFile.type || 'image/webp',
      });

    if (uploadError) {
      console.error(`❌ Upload failed for ${fileType}:`, uploadError);
      throw new Error(`Failed to upload ${fileType}: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('user-uploads')
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      throw new Error(`Failed to get public URL for ${fileType}`);
    }

    return {
      publicUrl: urlData.publicUrl,
      path: filePath
    };
  } catch (error) {
    console.error(`❌ Upload error in uploadToSupabase:`, {
      fileType,
      userId,
      error: error.message
    });
    throw error;
  }
};

// ==================== User Registration ====================

/**
 * Save user data to Firestore in the correct branch path
 */
export const saveUser = async (userData) => {
  const { uid, branchId } = userData;
  
  // CRITICAL: Validate required fields
  if (!uid) {
    throw new Error('User ID (uid) is required to save user');
  }
  
  if (!branchId) {
    console.error('❌ saveUser: branchId is missing for uid:', uid);
    throw new Error('branchId is required to save user. Cannot proceed without branch information.');
  }

  // Validate branchId is one of the expected values
  const validBranches = ['boumerdes', 'bordj_menaiel'];
  if (!validBranches.includes(branchId)) {
    console.error('❌ Invalid branchId:', branchId);
    throw new Error(`Invalid branchId: ${branchId}. Must be one of: ${validBranches.join(', ')}`);
  }

  const userPath = `branches/${branchId}/users/${uid}`;
  const userRef = doc(db, userPath);

  try {
    // Check if document exists to preserve createdAt
    const existingDoc = await getDoc(userRef);
    const existingData = existingDoc.exists() ? existingDoc.data() : null;
    
    // Ensure branchName is set
    const branchName = userData.branchName || 
      (branchId === 'boumerdes' ? 'بومرداس' : 
       branchId === 'bordj_menaiel' ? 'برج منايل' : branchId);
    
    const userDocument = {
      uid: uid,
      fullName: userData.fullName || null,
      email: userData.email || null,
      branchId: branchId,
      branchName: branchName,
      // CRITICAL: ONLY use studyYear as the source of truth. Do NOT fallback to schoolLevel.
      // schoolLevel is the level (middle/high), not the year (mid1/sec2).
      studyYear: userData.studyYear || existingData?.studyYear || null,
      accountVerified: userData.accountVerified !== undefined ? userData.accountVerified : false,
      paymentVerified: userData.paymentVerified !== undefined ? userData.paymentVerified : false,
      // Registration approval flow: new users start as pending until admin approves
      verificationStatus: userData.verificationStatus || existingData?.verificationStatus || 'pending',
      status: userData.status || existingData?.status || 'pending',
      verificationRequest: userData.verificationRequest || existingData?.verificationRequest || null,
      registrationNumber: userData.registrationNumber || null,
      photoUrl: userData.photoUrl || null,
      idCardUrl: userData.idCardUrl || null,
      birthDate: userData.birthDate || null,
      birthPlace: userData.birthPlace || null,
      address: userData.address || null,
      // Educational institution is REQUIRED — never empty/null. Defaults to «حر».
      school: normalizeSchool(userData.school),
      phoneNumber: userData.phoneNumber || userData.phone || null,
      phone: userData.phoneNumber || userData.phone || null,
      role: userData.role || 'student',
      verified: userData.accountVerified !== undefined ? userData.accountVerified : false,
      yearlyFeePaid: userData.paymentVerified !== undefined ? userData.paymentVerified : false,
      createdAt: existingData?.createdAt || userData.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Add lifecycle fields
      lifecycleStatus: USER_STATUS.ACTIVE,
      lifecycleStatusUpdatedAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
      lastActivityType: 'account_creation'
    };

    // Use setDoc with merge to preserve existing fields
    await setDoc(userRef, userDocument, { merge: true });

    // Verify the save by reading back
    const verifyDoc = await getDoc(userRef);
    if (!verifyDoc.exists()) {
      throw new Error('User document was not created successfully');
    }
  } catch (error) {
    console.error('❌ Error saving user to Firestore:', {
      path: userPath,
      error: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * Upload user files (photo and ID card) to Supabase Storage
 */
export const uploadUserFiles = async (uid, userPhoto = null, idCard = null) => {
  let photoUrl = '';
  let idCardUrl = '';

  if (userPhoto) {
    photoUrl = await uploadToSupabase(userPhoto, uid, 'userPhoto');
  }

  if (idCard) {
    idCardUrl = await uploadToSupabase(idCard, uid, 'idPhoto');
  }

  return { photoUrl, idCardUrl };
};

/**
 * Register a new user with photos uploaded to Supabase
 */
export const registerUser = async (userData, firebaseUserId, userPhoto = null, idPhoto = null) => {
  // CRITICAL: Validate required fields
  if (!firebaseUserId) {
    throw new Error('firebaseUserId is required');
  }

  if (!userData.branchId) {
    console.error('❌ registerUser: branchId is missing for uid:', firebaseUserId);
    throw new Error('branchId is required to register user. Please select a branch first.');
  }

  // Validate branchId is one of the expected values
  const validBranches = ['boumerdes', 'bordj_menaiel'];
  if (!validBranches.includes(userData.branchId)) {
    throw new Error(`Invalid branchId: ${userData.branchId}. Must be one of: ${validBranches.join(', ')}`);
  }

  // Ensure branchName is set
  const branchName = userData.branchName || 
    (userData.branchId === 'boumerdes' ? 'بومرداس' : 
     userData.branchId === 'bordj_menaiel' ? 'برج منايل' : userData.branchId);

  try {
    // Step 1: Upload files to Supabase FIRST
    const { photoUrl, idCardUrl } = await uploadUserFiles(firebaseUserId, userPhoto, idPhoto);

    // Step 2: Save user data to Firestore with URLs
    await saveUser({
      ...userData,
      uid: firebaseUserId,
      branchId: userData.branchId, // Ensure branchId is passed
      branchName: branchName, // Ensure branchName is passed
      photoUrl: photoUrl || null,
      idCardUrl: idCardUrl || null,
      accountVerified: false,
      paymentVerified: false,
    });

  } catch (error) {
    console.error('❌ Error in registerUser:', {
      error: error.message,
      code: error.code,
      branchId: userData.branchId
    });
    throw error;
  }
};

// ==================== User Retrieval ====================

/**
 * Get all users from all branch collections
 */
export const getAllUsers = async () => {
  const branches = ['boumerdes', 'bordj_menaiel'];
  const allUsers = [];

  for (const branchId of branches) {
    try {
      const usersRef = collection(db, `branches/${branchId}/users`);
      let qRef;
      
      try {
        qRef = query(usersRef, orderBy('createdAt', 'desc'));
      } catch (e) {
        console.warn(`OrderBy failed for branch ${branchId}, using unordered query:`, e);
        qRef = usersRef;
      }

      const snapshot = await getDocs(qRef);
      const branchUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        branchId: branchId,
        ...doc.data()
      }));
      // Include all students — admin should see all registrations including
      // those awaiting email verification (status: email_pending).
      allUsers.push(...branchUsers);
    } catch (error) {
      console.error(`Error fetching users from branch ${branchId}:`, error);
    }
  }

  return allUsers;
};

/**
 * Get a single user by ID from branch collection
 */
export const getUserById = async (userId, branchId) => {
  if (!branchId) {
    // Try both branches for backward compatibility
    const branches = ['boumerdes', 'bordj_menaiel'];
    for (const bid of branches) {
      try {
        const userRef = doc(db, `branches/${bid}/users`, userId);
        const snapshot = await getDoc(userRef);
        if (snapshot.exists()) {
          return {
            id: snapshot.id,
            branchId: bid,
            ...snapshot.data()
          };
        }
      } catch (error) {
        console.error(`Error fetching user from branch ${bid}:`, error);
      }
    }
    return null;
  }

  const userRef = doc(db, `branches/${branchId}/users`, userId);
  const snapshot = await getDoc(userRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return {
    id: snapshot.id,
    branchId: branchId,
    ...snapshot.data()
  };
};

// ==================== User Updates ====================

/**
 * Update user verification status
 */
export const updateVerificationStatus = async (userId, field, value, branchId) => {
  if (!branchId) {
    throw new Error('branchId is required to update user verification status');
  }

  const userRef = doc(db, `branches/${branchId}/users`, userId);
  const updateData = {
    [field]: value,
    updatedAt: serverTimestamp()
  };

  if (field === 'verified') {
    updateData.verified = value;
    updateData.accountVerified = value;
    updateData.verifiedAt = serverTimestamp();
  } else if (field === 'accountVerified') {
    updateData.accountVerified = value;
    updateData.verified = value;
    updateData.accountVerifiedAt = serverTimestamp();
  } else if (field === 'paymentVerified') {
    updateData.paymentVerified = value;
    updateData.yearlyFeePaid = value;
    updateData.paymentVerifiedAt = serverTimestamp();
  }

  await updateDoc(userRef, updateData);
  
  // Record activity for lifecycle tracking
  await recordUserActivity(userId, branchId, `verification_${field}`);
};

/**
 * Update user document
 */
export const updateUser = async (userId, updateData, branchId) => {
  if (!branchId) {
    throw new Error('branchId is required to update user');
  }

  const userRef = doc(db, `branches/${branchId}/users`, userId);
  await updateDoc(userRef, {
    ...updateData,
    updatedAt: serverTimestamp()
  });
  
  // Record activity for lifecycle tracking
  await recordUserActivity(userId, branchId, 'profile_update');
};

// ==================== Helper Functions ====================

/**
 * Check if a user exists in branch collection
 */
export const userExists = async (userId, branchId = null) => {
  if (branchId) {
    const userRef = doc(db, `branches/${branchId}/users`, userId);
    const snapshot = await getDoc(userRef);
    return snapshot.exists();
  }

  const branches = ['boumerdes', 'bordj_menaiel'];
  for (const bid of branches) {
    try {
      const userRef = doc(db, `branches/${bid}/users`, userId);
      const snapshot = await getDoc(userRef);
      if (snapshot.exists()) return true;
    } catch (error) {
      console.error(`Error checking user in branch ${bid}:`, error);
    }
  }
  return false;
};

/**
 * Get unverified users from all branches
 */
export const getUnverifiedUsers = async () => {
  const allUsers = await getAllUsers();
  return allUsers.filter(user => !user.verified && !user.accountVerified);
};

export const getPendingAdminUsersByBranch = async (branchId) => {
  if (!branchId) return [];

  try {
    const usersRef = collection(db, `branches/${branchId}/users`);
    const qRef = query(usersRef, where('verificationStatus', '==', 'pending'));
    const snapshot = await getDocs(qRef);
    const users = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        branchId,
        ...docSnap.data(),
      }))
      .filter((user) => user?.emailVerified !== false);

    // Stable sort newest-first if timestamps exist
    users.sort((a, b) => {
      const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : 0;
      const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : 0;
      return bDate - aDate;
    });

    return users;
  } catch (error) {
    console.error(`Error fetching pending admin users from branch ${branchId}:`, error);
    return [];
  }
};

export const submitVerificationRequest = async (branchId, userId, profilePicFile, idCardFile) => {
  if (!branchId) throw new Error('branchId is required');
  if (!userId) throw new Error('userId is required');
  if (!profilePicFile) throw new Error('profilePicFile is required');
  if (!idCardFile) throw new Error('idCardFile is required');

  // Force-refresh the ID token so Firestore rules see email_verified: true in the JWT.
  // currentUser.reload() updates local state only; without getIdToken(true) the JWT
  // claim can still be false for up to 1 hour after email verification.
  if (auth.currentUser) {
    await auth.currentUser.getIdToken(true);
  }

  const { photoUrl, idCardUrl } = await uploadUserFiles(userId, profilePicFile, idCardFile);

  const userRef = doc(db, `branches/${branchId}/users`, userId);
  await updateDoc(userRef, {
    verificationStatus: 'pending',
    verified: false,
    accountVerified: false,
    verificationRequest: {
      submittedAt: serverTimestamp(),
      photoPath: photoUrl?.path || null,
      idCardPath: idCardUrl?.path || null,
    },
    photoUrl: photoUrl || null,
    idCardUrl: idCardUrl || null,
    updatedAt: serverTimestamp(),
  });

  await recordUserActivity(userId, branchId, 'verification_resubmitted');
};

/**
 * Get users by branch
 */
export const getUsersByBranch = async (branchId) => {
  if (!branchId) {
    console.warn('getUsersByBranch: no branchId provided — returning []');
    return [];
  }

  const VALID_BRANCHES = ['boumerdes', 'bordj_menaiel'];
  if (!VALID_BRANCHES.includes(branchId)) {
    console.error(
      `getUsersByBranch called with INVALID branchId: "${branchId}".` +
      ` Valid values: ${VALID_BRANCHES.join(', ')}.` +
      ` This usually means the admins/{uid}.branchId field in Firestore has a typo.`
    );
  }

  try {
    const usersRef = collection(db, `branches/${branchId}/users`);
    let qRef;

    try {
      qRef = query(usersRef, orderBy('createdAt', 'desc'));
    } catch (e) {
      console.warn(`OrderBy failed for branch ${branchId}, using unordered query:`, e);
      qRef = usersRef;
    }

    const snapshot = await getDocs(qRef);
    // Return all students — admin sees every registration including those
    // awaiting email verification (status: email_pending).
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      branchId: branchId,
      ...doc.data()
    }));

    return users;
  } catch (error) {
    console.error(
      `getUsersByBranch FAILED for branch="${branchId}":`,
      error.code, error.message
    );
    if (error.code === 'permission-denied') {
      console.error(
        'permission-denied — this means isBranchAdmin() returned false in Firestore rules.' +
        ' The most likely cause: admins/{uid}.branchId in Firestore does NOT match the queried path "' + branchId + '".' +
        ' Check the Firestore admins collection and verify the branchId field.'
      );
    }
    return [];
  }
};

// Export lifecycle functions for convenience
export {
  recordUserActivity,
  USER_STATUS,
  ACTIVITY_THRESHOLDS,
  calculateUserStatus,
  updateUserLifecycleStatus,
  getUsersByLifecycleStatus,
  processAutomaticStatusTransitions,
  handleUserDeletion,
  cleanupUserMedia,
  archiveUserDataForStats,
  anonymizeUserDocument,
  getUsersForDeletionNotification,
  markDeletionNotificationSent
} from './userLifecycleService';