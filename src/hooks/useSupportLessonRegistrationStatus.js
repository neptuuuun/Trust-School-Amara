import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Hook to check support lesson registration status for a user+lesson in real-time.
 * Query does NOT filter by status so the listener always sees the document when admin updates it.
 *
 * @param {string} branchId - Branch ID (used only to pick the right doc in memory when multiple exist)
 * @param {string} userId - User ID
 * @param {string} lessonId - Lesson ID
 * @returns {{ status: 'none' | 'pending' | 'verified' | null, loading: boolean, registration: object | null }}
 *
 * Button state from document status only:
 * - No document → "التسجيل" (blue)
 * - status === "pending" → "قيد الانتظار" (yellow)
 * - status in ["approved","verified","registered"] → "مسجل" (green)
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

    // Query must NOT filter by status so we always detect the doc when admin approves/updates
    const registrationsRef = collection(db, 'supportLessonRegistrations');
    const q = query(
      registrationsRef,
      where('userId', '==', userId),
      where('lessonId', '==', lessonId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

        // Optional: same user+lesson might exist for different branches; use branchId to pick one
        const forBranch = branchId
          ? docs.filter((d) => d.branchId === branchId)
          : docs;
        const sorted = [...forBranch].sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime() ?? a.createdAt ?? 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() ?? b.createdAt ?? 0;
          return bTime - aTime;
        });
        const doc = sorted[0];

        if (!doc) {
          setStatus('none');
          setRegistration(null);
        } else {
          const statusStr = String(doc.status || '').toLowerCase();
          if (statusStr === 'pending') {
            setStatus('pending');
            setRegistration(doc);
          } else if (['approved', 'verified', 'registered'].includes(statusStr)) {
            setStatus('verified');
            setRegistration(doc);
          } else {
            setStatus('none');
            setRegistration(null);
          }
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error checking support lesson registration status:', error);
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




