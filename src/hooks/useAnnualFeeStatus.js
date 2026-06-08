import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { isAnnualPaymentForCurrentYear } from '../utils/registrationUtils';

const INITIAL_STATUS = {
  paid: false,
  status: 'unpaid',
  verifiedAt: null,
  createdAt: null,
  paymentId: null,
  raw: null
};

export default function useAnnualFeeStatus(userId, branchId) {
  const [annualFeeStatus, setAnnualFeeStatus] = useState(INITIAL_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId || !branchId) {
      setAnnualFeeStatus(INITIAL_STATUS);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const annualPaymentsQuery = query(
      collection(db, 'branches', branchId, 'annualPayments'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      annualPaymentsQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Academic-year-aware: a verified payment only counts for the CURRENT
        // academic year. A verified payment from a prior year no longer satisfies
        // the fee (resets each September); legacy records are grandfathered via
        // their verifiedAt window inside isAnnualPaymentForCurrentYear.
        const verifiedThisYear = docs.find((p) => isAnnualPaymentForCurrentYear(p));
        if (verifiedThisYear) {
          setAnnualFeeStatus({
            paid: true,
            status: 'verified',
            verifiedAt: verifiedThisYear.verifiedAt?.toDate?.() || null,
            createdAt: verifiedThisYear.createdAt?.toDate?.() || null,
            paymentId: verifiedThisYear.id,
            raw: verifiedThisYear,
          });
        } else if (docs.length > 0) {
          const latest = docs[0]; // ordered by createdAt desc
          const s = String(latest.status || '').toLowerCase();
          const status = s === 'verified' ? 'unpaid' : (s || 'unpaid');
          setAnnualFeeStatus({
            paid: false,
            status,
            verifiedAt: latest.verifiedAt?.toDate?.() || null,
            createdAt: latest.createdAt?.toDate?.() || null,
            paymentId: latest.id,
            raw: latest,
          });
        } else {
          setAnnualFeeStatus(INITIAL_STATUS);
        }
        setLoading(false);
      },
      (err) => {
        console.error('useAnnualFeeStatus error:', err);
        setAnnualFeeStatus(INITIAL_STATUS);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, branchId]);

  return {
    annualFeeStatus,
    loading,
    error
  };
}
