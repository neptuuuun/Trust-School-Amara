import { useAuth } from '../contexts/AuthContext';
import { validateBranchAccess } from '../services/adminService';

/**
 * Hook to get the current branch ID for data fetching
 * For admins: returns their assigned branch
 * For students: returns their enrolled branch
 * @returns {string|null} Branch ID or null if not available
 */
export const useBranchId = () => {
  const { role, branch, adminData } = useAuth();
  
  if (role === 'admin' && adminData) {
    return adminData.branchId;
  }
  
  return branch;
};

/**
 * Hook to check if current user can access a specific branch
 * @param {string} branchId - Branch ID to check access for
 * @returns {boolean} Whether user can access the branch
 */
export const useBranchAccess = (branchId) => {
  const { role, adminData } = useAuth();
  
  if (!branchId) return false;
  
  if (role === 'admin' && adminData) {
    return validateBranchAccess(adminData.branchId, branchId);
  }
  
  // For non-admin users, we assume they can only access their own branch
  // This will be enforced by Firestore security rules
  return true;
};

/**
 * Hook to get branch-specific query constraints
 * @returns {Object} Query constraints for branch-based filtering
 */
export const useBranchQuery = () => {
  const branchId = useBranchId();
  
  return {
    branchId,
    canQuery: !!branchId,
    getBranchFilter: (field = 'branchId') => ({
      field,
      operator: '==',
      value: branchId
    })
  };
};

export default useBranchId;
