/**
 * User Lifecycle Service
 * Manages automatic user status transitions and cleanup
 */

import { db } from '../firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  updateDoc, 
  query, 
  where, 
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { cleanupDeletedStudent } from './storageCleanupService';

// User status constants
export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive', 
  ARCHIVED: 'archived',
  DELETED: 'deleted'
};

// Activity thresholds (in months)
export const ACTIVITY_THRESHOLDS = {
  INACTIVE_AFTER: 6,      // 6 months of inactivity -> inactive
  ARCHIVED_AFTER: 12,     // 12 months of inactivity -> archived  
  DELETED_AFTER: 36      // 36 months of inactivity -> deleted
};

/**
 * Calculate user status based on last activity date
 * @param {Date|string|Timestamp} lastActivity - Last activity date
 * @returns {string} - User status
 */
export const calculateUserStatus = (lastActivity) => {
  if (!lastActivity) {
    return USER_STATUS.ACTIVE; // Default to active for new users
  }

  const now = new Date();
  let lastActivityDate;

  if (lastActivity.toDate) {
    lastActivityDate = lastActivity.toDate();
  } else if (typeof lastActivity === 'string') {
    lastActivityDate = new Date(lastActivity);
  } else if (lastActivity instanceof Date) {
    lastActivityDate = lastActivity;
  } else {
    return USER_STATUS.ACTIVE;
  }

  const monthsInactive = (now - lastActivityDate) / (1000 * 60 * 60 * 24 * 30);

  if (monthsInactive >= ACTIVITY_THRESHOLDS.DELETED_AFTER) {
    return USER_STATUS.DELETED;
  } else if (monthsInactive >= ACTIVITY_THRESHOLDS.ARCHIVED_AFTER) {
    return USER_STATUS.ARCHIVED;
  } else if (monthsInactive >= ACTIVITY_THRESHOLDS.INACTIVE_AFTER) {
    return USER_STATUS.INACTIVE;
  }

  return USER_STATUS.ACTIVE;
};

/**
 * Update user lifecycle status
 * @param {string} userId - User ID
 * @param {string} branchId - Branch ID  
 * @param {string} status - New status
 * @param {Object} metadata - Additional metadata
 */
export const updateUserLifecycleStatus = async (userId, branchId, status, metadata = {}) => {
  const userRef = doc(db, `branches/${branchId}/users`, userId);
  
  const updateData = {
    lifecycleStatus: status,
    lifecycleStatusUpdatedAt: serverTimestamp(),
    ...metadata
  };

  // Add status-specific timestamps
  if (status === USER_STATUS.INACTIVE) {
    updateData.inactivatedAt = serverTimestamp();
  } else if (status === USER_STATUS.ARCHIVED) {
    updateData.archivedAt = serverTimestamp();
  } else if (status === USER_STATUS.DELETED) {
    updateData.deletedAt = serverTimestamp();
  }

  await updateDoc(userRef, updateData);
  
  console.log(`🔄 Updated user ${userId} lifecycle status to: ${status}`);
};

/**
 * Record user activity (call this when users interact with the platform)
 * @param {string} userId - User ID
 * @param {string} branchId - Branch ID
 * @param {string} activityType - Type of activity (login, course_registration, payment, etc.)
 */
export const recordUserActivity = async (userId, branchId, activityType = 'general') => {
  const userRef = doc(db, `branches/${branchId}/users`, userId);
  
  const updateData = {
    lastActivityAt: serverTimestamp(),
    lastActivityType: activityType,
    lifecycleStatus: USER_STATUS.ACTIVE, // Reactivate on activity
    lifecycleStatusUpdatedAt: serverTimestamp()
  };

  await updateDoc(userRef, updateData);
  
  console.log(`📝 Recorded activity for user ${userId}: ${activityType}`);
};

/**
 * Get users by lifecycle status
 * @param {string} branchId - Branch ID (optional, null for all branches)
 * @param {string} status - Status to filter by
 * @returns {Promise<Array>} - Array of users
 */
export const getUsersByLifecycleStatus = async (branchId = null, status = null) => {
  const branches = branchId ? [branchId] : ['boumerdes', 'bordj_menaiel'];
  const allUsers = [];

  for (const bid of branches) {
    try {
      const usersRef = collection(db, `branches/${bid}/users`);
      let qRef;

      if (status) {
        qRef = query(usersRef, where('lifecycleStatus', '==', status));
      } else {
        qRef = usersRef;
      }

      const snapshot = await getDocs(qRef);
      const branchUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        branchId: bid,
        ...doc.data()
      }));
      allUsers.push(
        ...branchUsers.filter((user) => user?.emailVerified !== false && user?.status !== 'email_pending')
      );
    } catch (error) {
      console.error(`Error fetching users from branch ${bid}:`, error);
    }
  }

  return allUsers;
};

/**
 * Process automatic status transitions for all users
 * @param {boolean} dryRun - If true, only report what would be changed
 * @returns {Promise<Object>} - Results of the processing
 */
export const processAutomaticStatusTransitions = async (dryRun = false) => {
  console.log(`🔄 Starting automatic status transition processing (${dryRun ? 'DRY RUN' : 'LIVE'})`);
  
  const results = {
    processed: 0,
    transitions: {
      [USER_STATUS.INACTIVE]: 0,
      [USER_STATUS.ARCHIVED]: 0,
      [USER_STATUS.DELETED]: 0
    },
    errors: []
  };

  const branches = ['boumerdes', 'bordj_menaiel'];

  for (const branchId of branches) {
    try {
      const usersRef = collection(db, `branches/${branchId}/users`);
      const snapshot = await getDocs(usersRef);

      for (const userDoc of snapshot.docs) {
        const user = { id: userDoc.id, branchId, ...userDoc.data() };
        
        // Skip already deleted users
        if (user.lifecycleStatus === USER_STATUS.DELETED) {
          continue;
        }

        const lastActivity = user.lastActivityAt || user.createdAt;
        const newStatus = calculateUserStatus(lastActivity);
        const currentStatus = user.lifecycleStatus || USER_STATUS.ACTIVE;

        if (newStatus !== currentStatus) {
          results.processed++;
          
          if (!dryRun) {
            try {
              await updateUserLifecycleStatus(user.id, user.branchId, newStatus, {
                previousStatus: currentStatus,
                automaticTransition: true
              });
              
              results.transitions[newStatus]++;
              
              // If transitioning to deleted, handle cleanup
              if (newStatus === USER_STATUS.DELETED) {
                await handleUserDeletion(user);
              }
            } catch (error) {
              results.errors.push({
                userId: user.id,
                branchId: user.branchId,
                error: error.message
              });
            }
          } else {
            results.transitions[newStatus]++;
            console.log(`📋 DRY RUN: Would transition user ${user.id} from ${currentStatus} to ${newStatus}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error processing branch ${branchId}:`, error);
      results.errors.push({
        branchId,
        error: error.message
      });
    }
  }

  console.log(`✅ Status transition processing complete:`, results);
  return results;
};

/**
 * Handle user deletion (cleanup personal data, keep statistics)
 * @param {Object} user - User object
 */
export const handleUserDeletion = async (user) => {
  console.log(`🗑️ Handling deletion for user ${user.id} from branch ${user.branchId}`);
  
  try {
    // 1. Archive user data for statistics before deletion
    await archiveUserDataForStats(user);
    
    // 2. Clean up media files — pass any known Firestore refs so the cleanup
    //    service can delete them directly without needing a storage list call.
    await cleanupUserMedia(user.id, {
      photoUrl:  user.photoUrl  || null,
      idCardUrl: user.idCardUrl || null,
    });
    
    // 3. Anonymize user document (keep only statistical data)
    await anonymizeUserDocument(user);
    
    console.log(`✅ Successfully handled deletion for user ${user.id}`);
  } catch (error) {
    console.error(`❌ Error handling deletion for user ${user.id}:`, error);
    throw error;
  }
};

/**
 * Archive user data for statistical purposes
 * @param {Object} user - User object
 */
export const archiveUserDataForStats = async (user) => {
  const archiveRef = doc(db, 'userArchive', user.id);
  
  const archiveData = {
    originalUserId: user.id,
    originalBranchId: user.branchId,
    originalEmail: user.email,
    registrationDate: user.createdAt,
    deletionDate: serverTimestamp(),
    statusHistory: {
      verified: user.verified || false,
      paymentVerified: user.paymentVerified || false,
      lifecycleStatus: user.lifecycleStatus
    },
    // Keep course registration history (anonymized)
    courseRegistrations: user.courseRegistrations || [],
    paymentHistory: user.paymentHistory || [],
    // Keep only statistical data, no personal info
    statistics: {
      totalCoursesRegistered: (user.courseRegistrations || []).length,
      totalPaymentsMade: (user.paymentHistory || []).length,
      accountAge: user.createdAt ? calculateAccountAge(user.createdAt) : null
    }
  };

  await setDoc(archiveRef, archiveData);
  console.log(`📦 Archived user data for statistics: ${user.id}`);
};

/**
 * Clean up user media files from Supabase storage (spec §6 — account deletion).
 * Delegates to the centralized storageCleanupService which handles all buckets,
 * graceful missing-file handling, and logging.
 *
 * @param {string} userId - User ID
 * @param {object} [knownRefs] - Any known photoUrl / idCardUrl refs from Firestore
 */
export const cleanupUserMedia = async (userId, knownRefs = {}) => {
  await cleanupDeletedStudent({
    userId,
    photoUrl:   knownRefs.photoUrl  || null,
    idCardUrl:  knownRefs.idCardUrl || null,
    extraRefs:  knownRefs.extraRefs || [],
  });
};

/**
 * Anonymize user document (remove personal data, keep statistics)
 * @param {Object} user - User object
 */
export const anonymizeUserDocument = async (user) => {
  const userRef = doc(db, `branches/${user.branchId}/users`, user.id);
  
  const anonymizedData = {
    // Remove personal information
    fullName: null,
    email: null,
    phoneNumber: null,
    phone: null,
    address: null,
    birthDate: null,
    birthPlace: null,
    photoUrl: null,
    idCardUrl: null,
    registrationNumber: null,
    
    // Keep statistical and system data
    uid: user.id,
    branchId: user.branchId,
    branchName: user.branchName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: serverTimestamp(),
    lifecycleStatus: USER_STATUS.DELETED,
    deletedAt: serverTimestamp(),
    
    // Keep verification status for statistics
    verified: user.verified,
    accountVerified: user.accountVerified,
    paymentVerified: user.paymentVerified,
    
    // Keep course/payment history for statistics
    courseRegistrations: user.courseRegistrations || [],
    paymentHistory: user.paymentHistory || [],
    
    // Mark as anonymized
    anonymized: true,
    anonymizedAt: serverTimestamp()
  };

  await updateDoc(userRef, anonymizedData);
  console.log(`🔒 Anonymized user document: ${user.id}`);
};

/**
 * Calculate account age in months
 * @param {Date|string|Timestamp} createdAt - Creation date
 * @returns {number} - Age in months
 */
const calculateAccountAge = (createdAt) => {
  if (!createdAt) return null;
  
  let createdDate;
  if (createdAt.toDate) {
    createdDate = createdAt.toDate();
  } else if (typeof createdAt === 'string') {
    createdDate = new Date(createdAt);
  } else if (createdAt instanceof Date) {
    createdDate = createdAt;
  } else {
    return null;
  }

  const now = new Date();
  return (now - createdDate) / (1000 * 60 * 60 * 24 * 30);
};

/**
 * Get users eligible for deletion notifications
 * @returns {Promise<Array>} - Users who should be notified about pending deletion
 */
export const getUsersForDeletionNotification = async () => {
  const twoYearsAgo = new Date();
  twoYearsAgo.setMonth(twoYearsAgo.getMonth() - 24);

  const branches = ['boumerdes', 'bordj_menaiel'];
  const eligibleUsers = [];

  for (const branchId of branches) {
    try {
      const usersRef = collection(db, `branches/${branchId}/users`);
      const q = query(
        usersRef,
        where('lifecycleStatus', '==', USER_STATUS.ARCHIVED),
        where('archivedAt', '<=', twoYearsAgo),
        where('deletionNotificationSent', '!=', true)
      );
      
      const snapshot = await getDocs(q);
      const branchUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        branchId,
        ...doc.data()
      }));
      
      eligibleUsers.push(...branchUsers);
    } catch (error) {
      console.error(`Error fetching users for deletion notification from branch ${branchId}:`, error);
    }
  }

  return eligibleUsers;
};

/**
 * Mark deletion notification as sent
 * @param {string} userId - User ID
 * @param {string} branchId - Branch ID
 */
export const markDeletionNotificationSent = async (userId, branchId) => {
  const userRef = doc(db, `branches/${branchId}/users`, userId);
  await updateDoc(userRef, {
    deletionNotificationSent: true,
    deletionNotificationSentAt: serverTimestamp()
  });
};
