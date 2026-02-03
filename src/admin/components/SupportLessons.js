import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import { User, BookOpen, CreditCard, Calendar } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

const SupportLessonsAdmin = () => {
  const { selectedBranchId } = useBranch();
  const { t } = useI18n();
  const [students, setStudents] = useState([]);
  const [supportSignups, setSupportSignups] = useState([]);
  const [branchSettings, setBranchSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // FIXED: Guard for required dependency
    if (!selectedBranchId) {
      setStudents([]);
      setSupportSignups([]);
      setBranchSettings(null);
      setLoading(false);
      return;
    }

    // FIXED: Track all unsubscribes to prevent memory leaks
    const unsubscribes = [];

    // FIXED: Debounce branch switches to prevent rapid listener recreation
    const timeoutId = setTimeout(() => {
      try {
        const studentsQ = query(
          collection(db, `branches/${selectedBranchId}/students`),
          orderBy('createdAt', 'desc')
        );
        const unsubStudents = onSnapshot(
          studentsQ,
          (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setStudents(list);
            setLoading(false);
          },
          (error) => {
            console.error('Error fetching students:', error);
            setLoading(false);
          }
        );
        unsubscribes.push(unsubStudents);

        // Use registrations collection with type='support_lesson'
        const signupsQ = query(
          collection(db, 'branches', selectedBranchId, 'registrations'),
          where('type', '==', 'support_lesson'),
          orderBy('createdAt', 'desc')
        );
        const unsubSignups = onSnapshot(
          signupsQ,
          (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setSupportSignups(list);
          },
          (error) => {
            console.error('Error fetching signups:', error);
          }
        );
        unsubscribes.push(unsubSignups);

        const unsubBranch = onSnapshot(
          doc(db, 'branches', selectedBranchId),
          (snap) => {
            setBranchSettings(snap.exists() ? { id: snap.id, ...snap.data() } : null);
          },
          (error) => {
            console.error('Error fetching branch settings:', error);
          }
        );
        unsubscribes.push(unsubBranch);
      } catch (error) {
        console.error('Error setting up listeners:', error);
        setLoading(false);
      }
    }, 100); // 100ms debounce

    // FIXED: Proper cleanup that clears timeout and unsubscribes all listeners
    return () => {
      clearTimeout(timeoutId);
      unsubscribes.forEach(unsub => {
        if (unsub && typeof unsub === 'function') {
          unsub();
        }
      });
    };
  }, [selectedBranchId]);

  const verifiedSupport = useMemo(() => {
    const studentsByUserId = new Map(students.map(s => [s.userId, s]));
    return supportSignups
      .map(su => ({ signup: su, student: studentsByUserId.get(su.userId) }))
      .filter(({ student }) => student && student.verified && student.yearlyFeePaid);
  }, [students, supportSignups]);
  const recordMonthlyPayment = async ({ signup, student }) => {
    try {
      const amount = branchSettings?.supportMonthlyPrices?.[signup.courseId] || branchSettings?.supportMonthlyBasePrice || 0;
      await addDoc(collection(db, 'branches', selectedBranchId, 'payments'), {
        userId: student.userId,
        branchId: student.branchId,
        serviceName: signup.courseName || 'درس دعم',
        type: 'supportLesson',
        subjectId: signup.courseId || null,
        amount: Number(amount) || 0,
        status: 'approved',
        createdAt: new Date(),
        reviewedAt: new Date(),
      });
      alert('تم تسجيل دفعة الشهر بنجاح');
    } catch (e) {
      console.error(e);
      alert('فشل تسجيل الدفعة');
    }
  };

  const formatDate = (ts) => {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    return d ? d.toLocaleDateString('ar-DZ') : 'غير محدد';
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }
  if (!selectedBranchId) {
    return <div className="text-center py-12 text-gray-600">{t('admin.topbar.chooseBranch')}</div>;
  }
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-primary mb-2">{t('pages.supportLessons.title')}</h1>
          <p className="text-xl text-gray-600">{t('pages.supportLessons.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {verifiedSupport.map(({ signup, student }) => (
          <div key={signup.id} className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <User className="w-5 h-5 text-primary" />
              <div className="font-bold text-lg">{student.fullName}</div>
            </div>
            <div className="text-sm text-gray-700 flex items-center gap-2 mb-1">
              <BookOpen className="w-4 h-4" /> {signup.courseName}
            </div>
            <div className="text-sm text-gray-600 flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4" /> {formatDate(signup.createdAt)}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700 flex items-center gap-1">
                <CreditCard className="w-4 h-4 text-green-600" />
                <span>{t('pages.supportLessons.monthlyPay')}</span>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={() => recordMonthlyPayment({ signup, student })}>
                  {t('pages.supportLessons.recordThisMonth')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {verifiedSupport.length === 0 && (
        <div className="text-center py-12 text-gray-500">{t('pages.supportLessons.empty')}</div>
      )}
    </div>
  );
};

export default SupportLessonsAdmin;
