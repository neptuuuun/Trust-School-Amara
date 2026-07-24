/**
 * AdminOverviewContext — one shared fetch of GET /api/admin/overview.
 *
 * Two consumers need the same snapshot: the sidebar (queue badges, visible on
 * every page) and the Overview page (the full console). Fetching it in both
 * meant landing on /admin fired the endpoint twice, and the two copies could
 * disagree — the sidebar could show a payment alert the page below it didn't.
 *
 * One provider owns the data, polls it, and pauses while the tab is hidden so a
 * dashboard left open overnight doesn't keep hitting the backend.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAdminOverview } from '../services/adminOpsService';

// Long enough to be free, short enough that a failed payment surfaces while the
// admin is still at the desk.
const POLL_MS = 60_000;

const EMPTY_QUEUES = { documentVerification: 0, stuckPayments: 0, trainingRequests: 0, total: 0 };

const AdminOverviewContext = createContext(null);

export const useAdminOverview = () => {
  const ctx = useContext(AdminOverviewContext);
  if (!ctx) throw new Error('useAdminOverview must be used within an AdminOverviewProvider');
  return ctx;
};

export const AdminOverviewProvider = ({ branchId, children }) => {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');

  // Guards against a slow response from a previous branch overwriting the new one.
  const requestSeq = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    const seq = ++requestSeq.current;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const res = await getAdminOverview();
      if (seq !== requestSeq.current) return;
      setData(res);
      setError('');
    } catch (err) {
      if (seq !== requestSeq.current) return;
      // Keep the last good snapshot on a transient failure — a blank dashboard is
      // worse than a slightly stale one. The banner tells the admin it is stale.
      setError(
        err.code === 'permission-denied'
          ? 'ليس لديك صلاحية الوصول إلى بيانات هذا الفرع.'
          : `تعذّر تحديث البيانات: ${err.message || ''}`
      );
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!branchId) { setLoading(false); return undefined; }

    load();

    const tick = () => { if (document.visibilityState === 'visible') load({ silent: true }); };
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [branchId, load]);

  const value = useMemo(() => ({
    data,
    queues: data?.actionRequired || EMPTY_QUEUES,
    loading,
    refreshing,
    error,
    refresh: () => load({ silent: true }),
  }), [data, loading, refreshing, error, load]);

  return (
    <AdminOverviewContext.Provider value={value}>
      {children}
    </AdminOverviewContext.Provider>
  );
};
