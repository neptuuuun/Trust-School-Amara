import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Fetches admin document from Firestore
 * @param {string} uid - User UID from Firebase Auth
 * @returns {Promise<Object|null>} Admin document or null if not found
 */
export const getAdminByUid = async (uid) => {
  try {
    const adminRef = doc(db, 'admins', uid);
    const adminSnap = await getDoc(adminRef);
    
    if (!adminSnap.exists()) {
      console.warn(`No admin document found for UID: ${uid}`);
      return null;
    }
    
    return {
      id: adminSnap.id,
      ...adminSnap.data()
    };
  } catch (error) {
    console.error('Error fetching admin document:', error);
    throw error;
  }
};

/**
 * Sets up a real-time listener for admin document changes
 * @param {string} uid - User UID from Firebase Auth
 * @param {Function} callback - Callback function called with admin data or null
 * @returns {Function} Unsubscribe function
 */
export const onAdminSnapshot = (uid, callback) => {
  if (!uid) {
    callback(null);
    return () => {};
  }

  const adminRef = doc(db, 'admins', uid);
  
  return onSnapshot(adminRef, (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    
    callback({
      id: snap.id,
      ...snap.data()
    });
  }, (error) => {
    console.error('Admin snapshot error:', error);
    callback(null);
  });
};

/**
 * Validates admin access to a specific branch
 * @param {string} adminBranchId - Admin's assigned branch ID
 * @param {string} requestedBranchId - Branch ID being accessed
 * @returns {boolean} Whether admin can access the requested branch
 */
export const validateBranchAccess = (adminBranchId, requestedBranchId) => {
  return adminBranchId === requestedBranchId;
};

/**
 * Creates initial admin documents for the specified branches
 * This should be run once to set up the admin accounts
 */
export const initializeAdminAccounts = async () => {
  const adminAccounts = [
    {
      uid: 'PLACEHOLDER_UID_BOUMERDES', // Will be replaced with actual UID after user creation
      email: 'trustschoolamarabmrds@gmail.com',
      branchId: 'boumerdes',
      role: 'admin'
    },
    {
      uid: 'PLACEHOLDER_UID_BORDJ_MENAIEL', // Will be replaced with actual UID after user creation
      email: 'trustschoolamara@gmail.com',
      branchId: 'bordj_menaiel',
      role: 'admin'
    }
  ];

  return adminAccounts;
};
