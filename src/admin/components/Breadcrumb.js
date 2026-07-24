import React from 'react';
import { useBranch } from '../../contexts/BranchContext';
import { branchLabel } from '../../utils/branches';

/**
 * Breadcrumb
 *
 * Displays: Branch name / ...trail items
 *
 * NOTE: this used to destructure `branchId` from BranchContext, which never
 * existed on the context value (it exposes `selectedBranchId`), so the first
 * crumb silently rendered "—" on every page. It now reads the real key and
 * resolves the Arabic branch name instead of showing the raw Firestore id.
 *
 * @param {string[]} trail - Additional path segments after the branch name
 */
const Breadcrumb = ({ trail = [] }) => {
  const { selectedBranchId, branches } = useBranch();

  const items = [branchLabel(selectedBranchId, branches), ...trail];

  return (
    <nav className="text-sm text-gray-600 mb-2" dir="rtl" aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 flex-wrap">
        {items.map((label, idx) => (
          <li key={`${label}-${idx}`} className="flex items-center gap-2">
            <span className={idx === items.length - 1 ? 'font-semibold text-gray-900' : ''}>
              {label}
            </span>
            {idx < items.length - 1 && (
              <span className="text-gray-400" aria-hidden="true">/</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumb;