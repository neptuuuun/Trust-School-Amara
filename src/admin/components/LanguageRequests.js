import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, updateDoc, doc, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import { Check, CreditCard, User, FileText, Calendar } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

// Lists signups with courseType = 'language'. One-time payment; admin can mark payment received and approve.
const LanguageRequests = () => {
  const { selectedBranchId } = useBranch();
  const { t } = useI18n();
  const [signups, setSignups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branchSettings, setBranchSettings] = useState(null);

  useEffect(() => {
    if (!selectedBranchId) {
      setSignups([]);
      setBranchSettings(null);
      setLoading(false);
      return;
    }

    // Use registrations with type='language'
    const q = query(
      collection(db, 'branches', selectedBranchId, 'registrations'),
      where('type', '==', 'language'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSignups(list);
      setLoading(false);
    });

    const branchDocRef = doc(db, 'branches', selectedBranchId);
    const unsubBranch = onSnapshot(branchDocRef, (snap) => {
      setBranchSettings(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });

    return () => { unsub(); unsubBranch(); };
  }, [selectedBranchId]);

  const markPaymentReceived = async (signup) => {
    try {
      const amount = branchSettings?.languagePrices?.[signup.courseId] || branchSettings?.languageBasePrice || 0;
      if (!amount) {
        if (!window.confirm('لم يتم ضبط سعر هذه الدورة. هل تريد تسجيل دفعة بدون مبلغ؟')) return;
      }
      await addDoc(collection(db, 'branches', selectedBranchId, 'payments'), {
        userId: signup.userId,
        branchId: signup.branchId,
        serviceName: signup.courseName || 'دورة لغة',
        type: 'language',
        amount: Number(amount) || 0,
        status: 'approved',
        createdAt: new Date(),
        reviewedAt: new Date(),
      });
      await updateDoc(doc(db, 'branches', selectedBranchId, 'registrations', signup.id), { verified: true, paymentConfirmed: true });
      alert('تم تسجيل الدفع.');
    } catch (e) {
      console.error(e);
      alert('فشل تسجيل الدفع');
    }
  };

  const approveAccess = async (signup) => {
    try {
      await updateDoc(doc(db, 'branches', selectedBranchId, 'registrations', signup.id), { verified: true, approved: true, approvedAt: new Date() });
      alert('تمت الموافقة على الدورة');
    } catch (e) {
      console.error(e);
      alert('فشل الموافقة');
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
          <h1 className="text-4xl font-bold text-primary mb-2">{t('admin.nav.languageRequests')}</h1>
          <p className="text-xl text-gray-600">{t('pages.verificationPanel.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {signups.map(s => (
          <div key={s.id} className={`bg-white rounded-xl shadow p-6 border ${s.approved ? 'border-green-200' : 'border-gray-200'}`}>
            <div className="flex items-center gap-3 mb-2">
              <User className="w-5 h-5 text-primary" />
              <div className="font-bold text-lg">{s.name}</div>
            </div>
            <div className="text-sm text-gray-700 flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4" /> {s.courseName} {s.level ? `- ${s.level}` : ''}
            </div>
            <div className="text-sm text-gray-600 flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4" /> {formatDate(s.createdAt)}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700 flex items-center gap-1">
                <CreditCard className={`w-4 h-4 ${s.paymentConfirmed ? 'text-green-600' : 'text-gray-400'}`} />
                <span>{s.paymentConfirmed ? '✓' : '—'}</span>
              </div>
              <div className="flex gap-2">
                {!s.paymentConfirmed && (
                  <button className="btn btn-outline-primary btn-sm" onClick={() => markPaymentReceived(s)}>
                    {t('pages.supportLessons.recordThisMonth')}
                  </button>
                )}
                {!s.approved && (
                  <button className="btn btn-success btn-sm" onClick={() => approveAccess(s)}>
                    <Check className="w-4 h-4 ml-1" /> {t('pages.verificationPanel.approved')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {signups.length === 0 && (
        <div className="text-center py-12 text-gray-500">—</div>
      )}
    </div>
  );
};

export default LanguageRequests;
