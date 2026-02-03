import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Hook to check support lesson registration status for a user+lesson in real-time
 * 
 * @param {string} branchId - Branch ID
 * @param {string} userId - User ID
 * @param {string} lessonId - Unique lesson identifier
 * @returns {{ status: 'none' | 'pending' | 'verified' | null, loading: boolean, registration: object | null }}
 * 
 * Usage:
 * const { status, loading, registration } = useSupportLessonRegistrationStatus(branchId, userId, subjectId);
 * 
 * Button logic:
 * - status === 'none' → Button enabled, text: "التسجيل"
 * - status === 'pending' → Button disabled, text: "في انتظار التأكيد"
 * - status === 'verified' → Button disabled, text: "مسجل"
 */
export function useSupportLessonRegistrationStatus(branchId, userId, lessonId) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    // Reset state if dependencies are missing
    if (!branchId || !userId || !lessonId) {
      setStatus('none');
      setLoading(false);
      setRegistration(null);
      return;
    }

    setLoading(true);

    // Query for existing registration from the global collection
    const registrationsRef = collection(db, 'supportLessonRegistrations');
    const constraints = [
      where('branchId', '==', branchId),
      where('userId', '==', userId),
      where('lessonId', '==', lessonId),
      orderBy('createdAt', 'desc')
    ];
    const q = query(registrationsRef, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const now = new Date();
        const registrations = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .sort((a, b) => {
            const aTime = a.endDate?.toDate
              ? a.endDate.toDate().getTime()
              : a.endDate
              ? new Date(a.endDate).getTime()
              : 0;
            const bTime = b.endDate?.toDate
              ? b.endDate.toDate().getTime()
              : b.endDate
              ? new Date(b.endDate).getTime()
              : 0;
            return (bTime || 0) - (aTime || 0);
          });

        const activeRegistration = registrations.find((reg) => {
          const regStatus = String(reg.status || '').toLowerCase();
          if (regStatus === 'pending') return true;
          if (regStatus === 'verified') {
            const end = reg.endDate?.toDate
              ? reg.endDate.toDate()
              : reg.endDate
              ? new Date(reg.endDate)
              : null;
            return Boolean(end && end >= now);
          }
          return false;
        });

        if (!activeRegistration) {
          setStatus('none');
          setRegistration(null);
        } else {
          const regStatus = String(activeRegistration.status || '').toLowerCase();
          setStatus(regStatus === 'verified' ? 'verified' : 'pending');
          setRegistration(activeRegistration);
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




