import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import { Save, Plus, Trash2, Building2 } from 'lucide-react';

const BranchesManagement = () => {
  const { branches, selectedBranchId, selectBranch } = useBranch();
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load selected branch live
  useEffect(() => {
    if (!selectedBranchId) {
      setDraft(null);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'branches', selectedBranchId);
    const unsub = onSnapshot(ref, (snap) => {
      setDraft(snap.exists() ? { id: snap.id, ...snap.data() } : { id: selectedBranchId });
      setLoading(false);
    });
    return () => unsub();
  }, [selectedBranchId]);

  const setField = (path, value) => {
    setDraft((prev) => {
      const copy = { ...(prev || {}) };
      const parts = path.split('.');
      let obj = copy;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = obj[parts[i]] || {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return copy;
    });
  };

  const save = async () => {
    if (!selectedBranchId || !draft) return;
    try {
      const { id, ...payload } = draft;
      await setDoc(doc(db, 'branches', selectedBranchId), payload, { merge: true });
      alert('تم حفظ معلومات الفرع');
    } catch (e) {
      console.error(e);
      alert('فشل حفظ البيانات');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-primary mb-2">إدارة الفروع</h1>
          <p className="text-xl text-gray-600">تحديث معلومات كل فرع</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">الفرع:</span>
          <select
            className="input min-w-[180px]"
            value={selectedBranchId || ''}
            onChange={(e) => selectBranch(e.target.value)}
          >
            <option value="" disabled>اختر الفرع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedBranchId ? (
        <div className="text-center py-12 text-gray-600">يرجى اختيار فرع لإدارة معلوماته.</div>
      ) : loading || !draft ? (
        <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow p-6 border">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-primary" />
              <h3 className="text-xl font-bold text-primary">معلومات أساسية</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم الفرع (AR)</label>
                <input className="input w-full" value={draft.name || ''} onChange={(e) => setField('name', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name (EN)</label>
                <input className="input w-full" value={draft.nameEn || ''} onChange={(e) => setField('nameEn', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">العنوان</label>
                <input className="input w-full" value={draft.address || ''} onChange={(e) => setField('address', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الهاتف</label>
                <input className="input w-full" value={draft.phone || ''} onChange={(e) => setField('phone', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                <input className="input w-full" value={draft.email || ''} onChange={(e) => setField('email', e.target.value)} />
              </div>
            </div>

            <div className="mt-6">
              <button className="btn btn-primary" onClick={save}>
                <Save className="w-4 h-4 ml-2" /> حفظ
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6 border">
            <h3 className="text-xl font-bold text-primary mb-4">ملاحظات</h3>
            <p className="text-gray-600 text-sm">يتم تخزين الأسعار على مستوى الفرع أيضاً في نفس وثيقة الفرع (yearlyVerificationFee, trainingPrices, languagePrices, supportMonthlyPrices). سيتم استخدامها من صفحات التسجيل والمدفوعات.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchesManagement;
