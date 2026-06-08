import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getComputedStatus } from '../utils/registrationUtils';

/**
 * Real-time hook: resolves the expiration-aware registration status for a
 * user+lesson combination.
 *
 * @returns {{ status: 'none'|'pending'|'active'|'expired'|'rejected', loading: boolean, registration: object|null }}
 *
 * - 'none'     → no document exists
 * - 'pending'  → submitted, waiting for admin
 * - 'active'   → verified AND endDate in the future
 * - 'expired'  → verified but endDate has passed → renewal allowed
 * - 'rejected' → rejected by admin
 */
export function useSupportLessonRegistrationStatus(branchId, userId, lessonId) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    if (!userId || !lessonId) {
      setStatus('none');
      setLoading(false);
      setRegistration(null);
      return;
    }

    setLoading(true);

    // Do NOT filter by status — we need to see the doc when admin updates it.
    const q = query(
      collection(db, 'supportLessonRegistrations'),
      where('userId', '==', userId),
      where('lessonId', '==', lessonId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((s) => ({ id: s.id, ...s.data() }));

        const forBranch = branchId ? docs.filter((d) => d.branchId === branchId) : docs;
        const sorted = [...forBranch].sort((a, b) => {
          const at = a.createdAt?.toDate?.()?.getTime() ?? a.createdAt ?? 0;
          const bt = b.createdAt?.toDate?.()?.getTime() ?? b.createdAt ?? 0;
          return bt - at;
        });
        const doc = sorted[0] ?? null;

        setRegistration(doc);
        setStatus(getComputedStatus(doc));
        setLoading(false);
      },
      (error) => {
        console.error('useSupportLessonRegistrationStatus error:', error);
        setStatus('none');
        setRegistration(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [branchId, userId, lessonId]);

  return { status, loading, registration };
}

export default useSupportLessonRegistrationStatus;
