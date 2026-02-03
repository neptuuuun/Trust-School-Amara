import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

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
        if (snapshot.docs.length > 0) {
          const latestDoc = snapshot.docs[0];
          const latestPayment = latestDoc.data();
          const normalizedStatus = String(latestPayment.status || '').toLowerCase();
          const effectiveStatus = normalizedStatus || 'pending';
          setAnnualFeeStatus({
            paid: effectiveStatus === 'verified',
            status: effectiveStatus,
            verifiedAt: latestPayment.verifiedAt?.toDate?.() || null,
            createdAt: latestPayment.createdAt?.toDate?.() || null,
            paymentId: latestDoc.id,
            raw: latestPayment
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
