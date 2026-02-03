import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import { Save, Plus, Trash2 } from 'lucide-react';

// Edit prices for a branch: training, language, support monthly, and yearly verification fee.
const BranchPriceManager = () => {
  const { selectedBranchId } = useBranch();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedBranchId) {
      setData(null);
      setLoading(false);
      return;
    }
    const ref = doc(db, 'branches', selectedBranchId);
    const unsub = onSnapshot(ref, (snap) => {
      setData(snap.exists() ? { id: snap.id, ...snap.data() } : {});
      setLoading(false);
    });
    return () => unsub();
  }, [selectedBranchId]);

  const setField = (path, value) => {
    setData(prev => {
      const copy = { ...prev };
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

  const addMapItem = (mapPath) => {
    const key = prompt('معرف الدورة/المادة (key)');
    const value = prompt('السعر بالدج');
    if (!key) return;
    setField(`${mapPath}.${key}`, Number(value) || 0);
  };

  const removeMapItem = (mapPath, key) => {
    setData(prev => {
      const copy = { ...prev };
      const parts = mapPath.split('.');
      let obj = copy;
      for (let i = 0; i < parts.length; i++) obj = obj[parts[i]] = obj[parts[i]] || {};
      delete obj[key];
      return { ...copy };
    });
  };

  const save = async () => {
    if (!selectedBranchId || !data) return;
    setSaving(true);
    try {
      const { id, ...payload } = data;
      await updateDoc(doc(db, 'branches', selectedBranchId), payload);
      alert('تم الحفظ');
    } catch (e) {
      console.error(e);
      alert('فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }
  if (!selectedBranchId) {
    return <div className="text-center py-12 text-gray-600">يرجى اختيار فرع لإدارة الأسعار.</div>;
  }
  if (!data) {
    return <div className="text-center py-12 text-gray-600">لم يتم العثور على بيانات الفرع.</div>;
  }

  const mapEntries = (obj) => Object.entries(obj || {});

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-primary mb-2">أسعار الفروع</h1>
          <p className="text-xl text-gray-600">تعديل أسعار التدريب، اللغات، دروس الدعم، والرسوم السنوية</p>
        </div>
        <button onClick={save} className="btn btn-primary" disabled={saving}>
          <Save className="w-4 h-4 ml-2" /> حفظ
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Yearly Verification Fee */}
        <div className="bg-white rounded-xl shadow p-6 border">
          <h3 className="text-xl font-bold text-primary mb-4">الرسوم السنوية للتحقق</h3>
          <input
            type="number"
            className="input w-full max-w-sm"
            value={data.yearlyVerificationFee || 1000}
            onChange={(e) => setField('yearlyVerificationFee', Number(e.target.value))}
          />
        </div>

        {/* Training Prices */}
        <div className="bg-white rounded-xl shadow p-6 border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-bold text-primary">أسعار الدورات التكوينية</h3>
            <button className="btn btn-outline-primary btn-sm" onClick={() => addMapItem('trainingPrices')}>
              <Plus className="w-4 h-4 ml-1" /> إضافة
            </button>
          </div>
          <div className="space-y-2">
            {mapEntries(data.trainingPrices).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="px-2 py-1 rounded bg-gray-100 text-gray-800">{k}</span>
                <input type="number" className="input" value={v} onChange={(e) => setField(`trainingPrices.${k}`, Number(e.target.value))} />
                <button className="btn btn-danger btn-sm" onClick={() => removeMapItem('trainingPrices', k)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {mapEntries(data.trainingPrices).length === 0 && <div className="text-gray-500">لا توجد أسعار محددة</div>}
          </div>
        </div>

        {/* Language Prices */}
        <div className="bg-white rounded-xl shadow p-6 border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-bold text-primary">أسعار دورات اللغات</h3>
            <button className="btn btn-outline-primary btn-sm" onClick={() => addMapItem('languagePrices')}>
              <Plus className="w-4 h-4 ml-1" /> إضافة
            </button>
          </div>
          <div className="space-y-2">
            {mapEntries(data.languagePrices).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="px-2 py-1 rounded bg-gray-100 text-gray-800">{k}</span>
                <input type="number" className="input" value={v} onChange={(e) => setField(`languagePrices.${k}`, Number(e.target.value))} />
                <button className="btn btn-danger btn-sm" onClick={() => removeMapItem('languagePrices', k)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {mapEntries(data.languagePrices).length === 0 && <div className="text-gray-500">لا توجد أسعار محددة</div>}
          </div>
        </div>

        {/* Support Monthly Prices */}
        <div className="bg-white rounded-xl shadow p-6 border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-bold text-primary">أسعار دروس الدعم (شهري)</h3>
            <button className="btn btn-outline-primary btn-sm" onClick={() => addMapItem('supportMonthlyPrices')}>
              <Plus className="w-4 h-4 ml-1" /> إضافة
            </button>
          </div>
          <div className="space-y-2">
            {mapEntries(data.supportMonthlyPrices).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="px-2 py-1 rounded bg-gray-100 text-gray-800">{k}</span>
                <input type="number" className="input" value={v} onChange={(e) => setField(`supportMonthlyPrices.${k}`, Number(e.target.value))} />
                <button className="btn btn-danger btn-sm" onClick={() => removeMapItem('supportMonthlyPrices', k)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {mapEntries(data.supportMonthlyPrices).length === 0 && <div className="text-gray-500">لا توجد أسعار محددة</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BranchPriceManager;
