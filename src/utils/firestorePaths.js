/**
 * Firestore Path Helper Utility
 * Centralized helper for consistent branch-based Firestore paths
 */

/**
 * Get a collection path under a specific branch
 * @param {string} branchId - The branch ID
 * @param {string} collection - The collection name (e.g., 'users', 'registrations')
 * @param {string} subPath - Optional subcollection path
 * @returns {string} Full collection path
 * 
 * @example
 * getCollectionPath('branch1', 'users') // 'branches/branch1/users'
 * getCollectionPath('branch1', 'registrations', 'subcollection') // 'branches/branch1/registrations/subcollection'
 */
export const getCollectionPath = (branchId, collection, subPath = '') => {
  if (!branchId || !collection) {
    throw new Error('Branch ID and collection name are required');
  }
  const basePath = `branches/${branchId}/${collection}`;
  return subPath ? `${basePath}/${subPath}` : basePath;
};

/**
 * Get a document path under a specific branch
 * @param {string} branchId - The branch ID
 * @param {string} collection - The collection name
 * @param {string} docId - The document ID
 * @param {string} subCollection - Optional subcollection name
 * @param {string} subDocId - Optional subcollection document ID
 * @returns {string} Full document path
 * 
 * @example
 * getDocPath('branch1', 'users', 'user123') // 'branches/branch1/users/user123'
 * getDocPath('branch1', 'registrations', 'reg123', 'payments', 'pay456') // 'branches/branch1/registrations/reg123/payments/pay456'
 */
export const getDocPath = (branchId, collection, docId, subCollection = '', subDocId = '') => {
  if (!branchId || !collection || !docId) {
    throw new Error('Branch ID, collection name, and document ID are required');
  }
  const basePath = `branches/${branchId}/${collection}/${docId}`;
  if (subCollection && subDocId) {
    return `${basePath}/${subCollection}/${subDocId}`;
  }
  return basePath;
};

/**
 * Validate that a path follows the branch-based structure
 * @param {string} path - The Firestore path to validate
 * @returns {boolean} True if path is valid
 */
export const isValidBranchPath = (path) => {
  return path.startsWith('branches/') && path.split('/').length >= 4;
};

