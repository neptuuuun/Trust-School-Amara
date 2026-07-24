import React, { createContext, useContext, useState } from 'react';

/**
 * Shared owner-dashboard filters. The reporting MONTH ('YYYY-MM') is global —
 * set once in the top bar and consumed by every analytics page. Per-page filters
 * (e.g. the branch selector on the revenue page) stay local to those pages.
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
  return (
    <OwnerFiltersContext.Provider value={{ month, setMonth }}>
      {children}
    </OwnerFiltersContext.Provider>
  );
};
