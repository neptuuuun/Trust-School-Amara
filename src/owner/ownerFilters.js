import React, { createContext, useContext, useState } from 'react';
import { getAcademicYearLabel } from '../utils/academicYear';

/**
 * Shared owner-dashboard filters, set once in the top bar and consumed by the
 * analytics pages:
 *  • `academicYear` ('YYYY-YYYY') — the PRIMARY reporting dimension. Defaults to
 *    the auto-detected current academic year (never created/switched manually).
 *    Headline pages (summary, revenue, branches) scope to it. Selecting another
 *    year is a read-only HISTORY view — it never changes the active year.
 *  • `month` ('YYYY-MM') — the monthly drill-down for the month-based analytics
 *    (groups, retention, teachers).
 * Per-page filters (e.g. the branch selector) stay local to those pages.
 */

const OwnerFiltersContext = createContext(null);

export const useOwnerFilters = () => {
  const ctx = useContext(OwnerFiltersContext);
  if (!ctx) throw new Error('useOwnerFilters must be used within OwnerFiltersProvider');
  return ctx;
};

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const OwnerFiltersProvider = ({ children }) => {
  const [month, setMonth] = useState(currentMonthKey());
  const [academicYear, setAcademicYear] = useState(getAcademicYearLabel());
  return (
    <OwnerFiltersContext.Provider value={{ month, setMonth, academicYear, setAcademicYear }}>
      {children}
    </OwnerFiltersContext.Provider>
  );
};
