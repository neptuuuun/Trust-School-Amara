import React from 'react';
import { useBranch } from '../../contexts/BranchContext';

const Breadcrumb = ({ trail = [] }) => {
  const { branches, selectedBranchId } = useBranch();
  const branchName = branches.find(b => b.id === selectedBranchId)?.name || selectedBranchId || '—';
  const items = ['الفروع', branchName, ...trail];
  return (
    <nav className="text-sm text-gray-600 mb-2" aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 flex-wrap">
        {items.map((label, idx) => (
          <li key={`${label}-${idx}`} className="flex items-center gap-2">
            <span className={idx === items.length - 1 ? 'font-semibold text-gray-900' : ''}>{label}</span>
            {idx < items.length - 1 && <span className="text-gray-400">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumb;




















