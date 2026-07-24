import React, { useEffect, useState } from 'react';
import { Wallet, Save, Loader2, Info } from 'lucide-react';
import { getOwnerSettings, setOwnerAnnualFee } from '../../services/ownerService';
import { LoadingState, Alert } from '../../components/ui/feedback';

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US')} دج`;

// updatedAt may arrive as a serialized Firestore Timestamp, ISO string, or ms.
const fmtDateTime = (v) => {
  if (!v) return '—';
  let d;
  if (typeof v === 'object' && (v._seconds != null || v.seconds != null)) {
    d = new Date((v._seconds ?? v.seconds) * 1000);
  } else {
    d = new Date(v);
  }
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
};

/**
 * Owner Settings — school-wide financial policy. Currently: the annual fee amount.
 * Changing it affects FUTURE payments only; recorded payments keep their original
 * snapshotted amount (accounting accuracy). Owner-only (route guarded by the
 * OwnerDashboard / backend requireOwner).
 */
const Settings = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null); // { variant, msg }

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getOwnerSettings();
      const s = res?.settings || null;
      setSettings(s);
      setAmount(s ? String(s.annualFeeAmount) : '');
    } catch (e) {
      setError(e.message || 'تعذّر تحميل الإعدادات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const dirty = settings
    && String(amount).trim() !== ''
    && Number(amount) !== Number(settings.annualFeeAmount);

  const handleSave = async (e) => {
    e.preventDefault();
    setBanner(null);
    const val = Number(amount);
    if (!Number.isFinite(val) || val < 0) {
      setBanner({ variant: 'danger', msg: 'يرجى إدخال مبلغ صالح (رقم موجب).' });
      return;
    }
    setSaving(true);
    try {
      const res = await setOwnerAnnualFee(val);
      setBanner({
        variant: 'success',
        msg: `تم تحديث الرسوم السنوية إلى ${fmtMoney(res.annualFeeAmount)}. ستُطبّق على المدفوعات الجديدة فقط.`,
      });
      await load();
    } catch (e) {
      setBanner({ variant: 'danger', msg: e.message || 'تعذّر حفظ المبلغ.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="جاري تحميل الإعدادات..." />;

  return (
    <div dir="rtl" className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">الإعدادات المالية</h1>
        <p className="mt-1 text-sm text-gray-500">إدارة سياسات الرسوم على مستوى المدرسة (جميع الفروع).</p>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}
      {banner && <Alert variant={banner.variant}>{banner.msg}</Alert>}

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">الرسوم السنوية</h2>
            <p className="text-xs text-gray-500">
              المبلغ الحالي: <strong className="text-gray-700">{fmtMoney(settings?.annualFeeAmount)}</strong>
              {settings?.isDefault && ' (افتراضي)'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="annual-fee" className="mb-1.5 block text-sm font-medium text-gray-700">
              مبلغ الرسوم السنوية (دج)
            </label>
            <input
              id="annual-fee"
              type="number"
              inputMode="numeric"
              min="0"
              step="50"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3 text-xs text-secondary-800">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              تغيير المبلغ يؤثر على المدفوعات الجديدة فقط. تحتفظ السجلات السابقة بمبلغها الأصلي للحفاظ على دقة المحاسبة.
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400">
              آخر تحديث: {fmtDateTime(settings?.updatedAt)}
              {settings?.updatedBy?.name ? ` — ${settings.updatedBy.name}` : ''}
            </p>
            <button
              type="submit"
              disabled={!dirty || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;
