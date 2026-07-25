import React, { useState } from 'react';
import { Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { updateBranches } from '../../../services/websiteService';
import { Alert } from '../../../components/ui/feedback';
import ConfirmDialog from './ConfirmDialog';
import SectionIntro from './SectionIntro';

const isValidUrl = (v) => {
  const s = String(v || '').trim();
  if (!s) return true;
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
};

const newBranch = () => ({
  id: `branch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  name: '', address: '', phone: '', mapsLink: '',
});

const BranchSettings = ({ settings, onSaved }) => {
  const [rows, setRows] = useState(() =>
    (settings.branches || []).map((b) => ({ ...b }))
  );
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);
  const [confirm, setConfirm] = useState(null); // index to remove

  const setField = (i, k) => (e) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: e.target.value } : r)));

  const addRow = () => setRows((rs) => [...rs, newBranch()]);
  const removeRow = (i) => { setRows((rs) => rs.filter((_, idx) => idx !== i)); setConfirm(null); };

  const handleSave = async (e) => {
    e.preventDefault();
    setBanner(null);

    if (rows.some((r) => !r.name.trim())) {
      setBanner({ variant: 'danger', msg: 'اسم الفرع مطلوب لكل فرع.' });
      return;
    }
    const badLink = rows.find((r) => !isValidUrl(r.mapsLink));
    if (badLink) {
      setBanner({ variant: 'danger', msg: `رابط خرائط جوجل غير صالح للفرع "${badLink.name}".` });
      return;
    }

    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        id: r.id, name: r.name.trim(), address: r.address.trim(),
        phone: r.phone.trim(), mapsLink: r.mapsLink.trim(),
      }));
      const res = await updateBranches(payload);
      const saved = res.branches || payload;
      onSaved?.('branches', saved);
      setRows(saved.map((b) => ({ ...b })));
      setBanner({ variant: 'success', msg: 'تم حفظ معلومات الفروع. تظهر عبر الموقع أينما ذُكرت الفروع.' });
    } catch (err) {
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر حفظ التغييرات.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <SectionIntro title="معلومات الفروع">
        بيانات كل فرع من فروع المدرسة. تظهر في صفحة «اتصل بنا» ضمن بطاقات المواقع (الاسم، العنوان، الهاتف، والخريطة).
      </SectionIntro>

      {banner && <Alert variant={banner.variant}>{banner.msg}</Alert>}

      {rows.map((r, i) => (
        <div key={r.id || i} className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">{r.name || `الفرع ${i + 1}`}</h3>
            <button
              type="button"
              onClick={() => setConfirm(i)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger-200 px-3 py-1.5 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> حذف الفرع
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">اسم الفرع *</label>
              <input type="text" value={r.name} onChange={setField(i, 'name')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">رقم الهاتف</label>
              <input type="text" value={r.phone} onChange={setField(i, 'phone')} dir="ltr"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">العنوان</label>
              <input type="text" value={r.address} onChange={setField(i, 'address')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">رابط خرائط جوجل</label>
              <input type="text" value={r.mapsLink} onChange={setField(i, 'mapsLink')} dir="ltr" placeholder="https://maps.google.com/..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button" onClick={addRow}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="h-4 w-4" /> إضافة فرع
      </button>

      <div className="flex justify-end border-t border-gray-100 pt-4">
        <button
          type="submit" disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title="حذف الفرع"
        message="سيُحذف هذا الفرع من قائمة الفروع. لن يظهر بعد الحفظ. متابعة؟"
        confirmLabel="حذف"
        onConfirm={() => removeRow(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </form>
  );
};

export default BranchSettings;
