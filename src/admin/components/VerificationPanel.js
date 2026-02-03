import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import { CheckCircle, XCircle, User, Badge, CreditCard, Calendar } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

// Shows students who applied for Support lessons, with their uploaded photos.
// Admin can Approve (sets verified:true and yearlyFeePaid:true) or Reject (sets verified:false)
// Creates a payment record for yearly verification fee when approving.
const VerificationPanel = () => {
  const { selectedBranchId } = useBranch();
  const { t } = useI18n();
  const [students, setStudents] = useState([]);
  const [supportSignups, setSupportSignups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branchSettings, setBranchSettings] = useState(null);

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
        // Listen students in this branch (scoped under branches/{branchId}/students)
        const studentsQ = query(collection(db, 'branches', selectedBranchId, 'students'));
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

        // Listen registrations of type support_lesson in this branch
        const signupsQ = query(
          collection(db, 'branches', selectedBranchId, 'registrations'),
          where('type', '==', 'support_lesson')
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

        // Branch settings (prices) from exact doc id
        const branchDocRef = doc(db, 'branches', selectedBranchId);
        const unsubBranch = onSnapshot(
          branchDocRef,
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

    // FIXED: Proper cleanup that unsubscribes all listeners and clears timeout
    return () => {
      clearTimeout(timeoutId);
      unsubscribes.forEach(unsub => {
        if (unsub && typeof unsub === 'function') {
          unsub();
        }
      });
    };
  }, [selectedBranchId]);

  const applicants = useMemo(() => {
    // Show all students for verification, prioritizing those not yet verified
    // Filter: students who need verification (not verified yet) OR students who signed up for support
    const supportUserIds = new Set(supportSignups.map(s => s.userId).filter(Boolean));
    
    // Include all students - those waiting for verification and those who signed up for support
    const allApplicants = students.filter(s => {
      // Show if not verified OR signed up for support
      return !s.verified || (s.userId && supportUserIds.has(s.userId));
    });

    // Sort: unverified first, then by creation date
    return allApplicants.sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? 1 : -1;
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return dateB - dateA;
    });
  }, [students, supportSignups]);

  const formatDate = (ts) => {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    return d ? d.toLocaleDateString('ar-DZ') : 'غير محدد';
  };

  const approve = async (student) => {
    try {
      const branchId = student.branchId || selectedBranchId;
      const userId = student.userId;
      
      if (!userId) {
        alert('خطأ: لم يتم العثور على معرف المستخدم');
        console.error('Student object missing userId:', student);
        return;
      }

      // 1) CRITICAL: Update user in branches/{branchId}/users/{userId} - this is what StudentDashboard reads from
      await updateDoc(doc(db, 'branches', branchId, 'users', userId), {
        verified: true,
        accountVerified: true,
        emailVerified: true,
        yearlyFeePaid: true,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      });

      // 2) Also update student in branches/{branchId}/students/{studentId} for consistency
      await updateDoc(doc(db, 'branches', branchId, 'students', student.id), {
        verified: true,
        yearlyFeePaid: true,
        verifiedAt: new Date(),
      });

      // 3) create payment record (type: yearlyFee) in branches/{branchId}/payments
      const amount = branchSettings?.yearlyVerificationFee || 1000;
      await addDoc(collection(db, 'branches', branchId, 'payments'), {
        userId: userId,
        branchId: branchId,
        serviceName: 'رسوم التحقق السنوي',
        type: 'yearlyFee',
        amount: Number(amount) || 1000,
        status: 'approved',
        createdAt: new Date(),
        reviewedAt: new Date(),
      });
      
      console.log('✅ Student verified successfully:', { userId, branchId, studentId: student.id });
      alert('تمت الموافقة وتم تسجيل الدفع السنوي.');
    } catch (e) {
      console.error('Approve error', e);
      alert('فشل في الموافقة: ' + e.message);
    }
  };

  const reject = async (student) => {
    try {
      const branchId = student.branchId || selectedBranchId;
      const userId = student.userId;
      
      if (!userId) {
        alert('خطأ: لم يتم العثور على معرف المستخدم');
        console.error('Student object missing userId:', student);
        return;
      }

      // CRITICAL: Update user in branches/{branchId}/users/{userId} - this is what StudentDashboard reads from
      await updateDoc(doc(db, 'branches', branchId, 'users', userId), {
        verified: false,
        accountVerified: false,
        emailVerified: false,
        yearlyFeePaid: false,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      });

      // Also update student in branches/{branchId}/students/{studentId} for consistency
      await updateDoc(doc(db, 'branches', branchId, 'students', student.id), {
        verified: false,
        yearlyFeePaid: false,
        verifiedAt: new Date(),
      });
      
      console.log('✅ Student rejected:', { userId, branchId, studentId: student.id });
      alert('تم الرفض');
    } catch (e) {
      console.error('Reject error', e);
      alert('فشل في الرفض: ' + e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!selectedBranchId) {
    return <div className="text-center py-12 text-gray-600">{t('admin.topbar.chooseBranch')}</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-primary mb-2">{t('pages.verificationPanel.title')}</h1>
          <p className="text-xl text-gray-600">{t('pages.verificationPanel.subtitle')}</p>
        </div>
        <div className="text-sm text-gray-600">
          {t('pages.verificationPanel.yearlyFee')}: <span className="font-semibold">{branchSettings?.yearlyVerificationFee || 1000} دج</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {applicants.map((s) => (
          <div key={s.id} className={`bg-white rounded-xl shadow-lg p-6 border-2 ${s.verified ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-yellow-50'}`}>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-white shadow-md">
                {s.profilePhotoUrl ? (
                  <img src={s.profilePhotoUrl} alt={s.fullName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <User className="w-8 h-8 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-gray-900">{s.fullName || 'غير محدد'}</h3>
                  {s.verified && (
                    <span className="px-2 py-1 text-xs bg-green-600 text-white rounded-full font-semibold">✓ موثق</span>
                  )}
                  {!s.verified && (
                    <span className="px-2 py-1 text-xs bg-yellow-600 text-white rounded-full font-semibold">⏳ قيد المراجعة</span>
                  )}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="text-gray-700">
                    <span className="font-medium">البريد:</span> {s.email || 'غير محدد'}
                  </div>
                  <div className="text-gray-700">
                    <span className="font-medium">الهاتف:</span> {s.studentPhone || s.phone || 'غير محدد'}
                  </div>
                  <div className="text-gray-600 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span className="text-xs">التسجيل: {formatDate(s.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* National ID Photo */}
            <div className="mb-4">
              <div className="text-sm font-semibold mb-2 text-gray-700 flex items-center gap-1">
                <Badge className="w-4 h-4" />
                صورة البطاقة الوطنية
              </div>
              <div className="w-full h-36 rounded-lg overflow-hidden border-2 border-white bg-white shadow-md flex items-center justify-center cursor-pointer hover:shadow-lg transition-shadow"
                   onClick={() => s.nationalIdPhotoUrl && window.open(s.nationalIdPhotoUrl, '_blank')}>
                {s.nationalIdPhotoUrl ? (
                  <img src={s.nationalIdPhotoUrl} alt="ID" className="max-h-36 object-contain" />
                ) : (
                  <div className="flex flex-col items-center text-gray-400">
                    <Badge className="w-8 h-8 mb-2" />
                    <span className="text-xs">لا توجد صورة</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-gray-700 bg-white rounded-lg p-2">
                <span className="font-medium">الرسوم السنوية:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${s.yearlyFeePaid ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                  {s.yearlyFeePaid ? '✓ مدفوعة' : '✗ غير مدفوعة'}
                </span>
              </div>
              {!s.verified && (
                <div className="flex gap-2">
                  <button onClick={() => approve(s)} className="flex-1 btn btn-success btn-sm">
                    <CheckCircle className="w-4 h-4 ml-1" /> موافقة
                  </button>
                  <button onClick={() => reject(s)} className="btn btn-danger btn-sm">
                    <XCircle className="w-4 h-4 ml-1" /> رفض
                  </button>
                </div>
              )}
              {s.verified && (
                <div className="text-center text-sm text-green-700 font-medium bg-green-100 rounded-lg py-2">
                  تم التوثيق بنجاح ✓
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {applicants.length === 0 && (
        <div className="text-center py-12 text-gray-500">{t('pages.verificationPanel.noApplicants')}</div>
      )}
    </div>
  );
};

export default VerificationPanel;
