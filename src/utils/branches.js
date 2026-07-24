/**
 * branches.js — the single source of truth for branch display names.
 *
 * The `boumerdes → بومرداس / bordj_menaiel → برج منايل` mapping was previously
 * re-declared inline in ~10 components (admin shell, users page, and most owner
 * pages), each with its own fallback behaviour. One copy, one behaviour.
 *
 * Branch IDs themselves stay authoritative in Firestore (`/branches`); this file
 * only supplies the human label, plus a fallback for a branch that exists in
 * Firestore but has no translation here yet.
 */

export const BRANCH_LABELS = {
  boumerdes:     'بومرداس',
  bordj_menaiel: 'برج منايل',
};

/**
 * Human-readable branch name.
 *
 * @param {string|null|undefined} branchId
 * @param {Array<{id: string, name?: string}>} [branches] live list from BranchContext
 * @param {string} [fallback] shown when the id is empty/unknown
 */
export const branchLabel = (branchId, branches = [], fallback = '—') => {
  if (!branchId) return fallback;
  return (
    BRANCH_LABELS[branchId] ||
    branches.find((b) => b.id === branchId)?.name ||
    branchId
  );
};
