import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../contexts/BranchContext';

/**
 * Small button to allow switching the selected branch.
 * - Visible only when a branch is selected
 * - Clears branch from localStorage/context and navigates to /select-branch
 */
const ChangeBranchButton = ({ className = '' }) => {
  const navigate = useNavigate();
  const { isSelected, clearBranch } = useBranch();

  if (!isSelected) return null;

  const handleChangeBranch = () => {
    // Clear from context and localStorage
    try {
      clearBranch?.();
    } catch (e) {
      // Fallback: ensure branchId is removed
      try { localStorage.removeItem('branchId'); } catch (_) {}
      try { localStorage.removeItem('selectedBranch'); } catch (_) {}
    }
    // Redirect to branch selector
    navigate('/select-branch');
  };

  return (
    <button
      onClick={handleChangeBranch}
      aria-label="Change Branch"
      title="Change Branch"
      className={`px-3 py-1 text-sm border border-amber-500 text-white md:text-white rounded-lg hover:bg-red-100 hover:text-primary transition ${className}`}
    >
      {/* Arabic label with English fallback for screen readers/title */}
      تغيير الفرع
    </button>
  );
};

export default ChangeBranchButton;
