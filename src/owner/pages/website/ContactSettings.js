import React, { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { updateContact } from '../../../services/websiteService';
import { Alert } from '../../../components/ui/feedback';
import SectionIntro from './SectionIntro';

const isValidEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());

// General contact info only. The Google Maps link is intentionally NOT here — it
// is branch-specific (each branch has its own location) and lives under Branch
// Information instead.
const FIELDS = [
  { key: 'phone',        label: 'رقم الهاتف',       dir: 'ltr', help: 'يظهر في تذييل الموقع وصفحة «اتصل بنا»، وقابل للنقر للاتصال المباشر.' },
  { key: 'email',        label: 'البريد الإلكتروني', dir: 'ltr', help: 'يظهر في التذييل وصفحة «اتصل بنا»، وقابل للنقر لإرسال رسالة.' },
  { key: 'address',      label: 'العنوان',          dir: 'rtl', help: 'العنوان العام للمدرسة الظاهر في تذييل الموقع.' },
  { key: 'workingHours', label: 'ساعات العمل',      dir: 'rtl', help: 'تظهر في التذييل وصفحة «اتصل بنا» (مثال: السبت – الخميس: 8 ص – 8 م).' },
];

const ContactSettings = ({ settings, onSaved }) => {
  const contact = settings.contact || {};
  const [form, setForm] = useState({
    phone: contact.phone || '',
    email: contact.email || '',
    address: contact.address || '',
    workingHours: contact.workingHours || '',
  });
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setBanner(null);

    if (!isValidEmail(form.email)) {
      setBanner({ variant: 'danger', msg: 'البريد الإلكتروني غير صالح.' });
      return;
    }

    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
      const res = await updateContact(payload);
      onSaved?.('contact', res.contact || payload);
      setBanner({ variant: 'success', msg: 'تم حفظ معلومات الاتصال. التغييرات ظاهرة الآن عبر الموقع.' });
    } catch (err) {
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر حفظ التغييرات.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <SectionIntro title="معلومات الاتصال">
        بيانات التواصل الرسمية للمدرسة. تظهر تلقائياً في تذييل كل صفحات الموقع وفي صفحة «اتصل بنا».
      </SectionIntro>

      <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        {banner && <Alert variant={banner.variant}>{banner.msg}</Alert>}

        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`contact-${f.key}`} className="mb-1.5 block text-sm font-medium text-gray-700">{f.label}</label>
            <input
              id={`contact-${f.key}`}
              type="text"
              value={form[f.key]}
              onChange={set(f.key)}
              dir={f.dir}
              placeholder={f.placeholder}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {f.help && <p className="mt-1 text-xs text-gray-400">{f.help}</p>}
          </div>
        ))}

        <div className="flex justify-end border-t border-gray-100 pt-4">
          <button
            type="submit" disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default ContactSettings;
