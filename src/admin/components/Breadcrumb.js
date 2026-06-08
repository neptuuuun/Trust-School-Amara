import React from 'react';
import { useBranch } from '../../contexts/BranchContext';

/**
 * Breadcrumb
 *
 * Reads branchId directly from BranchContext (set from Firestore after auth).
 * Displays: Branch name / ...trail items
 *
 * @param {string[]} trail - Additional path segments after the branch name
 */
const Breadcrumb = ({ trail = [] }) => {
  const { branchId } = useBranch();

  // branchId is the raw Firestore ID; if you want the display name,
  // pass it as the first trail item from the parent component instead.
  const items = [branchId ?? '—', ...trail];

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