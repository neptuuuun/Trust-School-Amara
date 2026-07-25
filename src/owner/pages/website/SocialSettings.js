import React, { useState } from 'react';
import { Save, Loader2, Info } from 'lucide-react';
import { updateSocial } from '../../../services/websiteService';
import { Alert } from '../../../components/ui/feedback';
import { SOCIAL_PLATFORMS } from '../../../config/websiteDefaults';
import SectionIntro from './SectionIntro';

const isValidUrl = (v) => {
  const s = String(v || '').trim();
  if (!s) return true; // empty = platform hidden on the public site
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
};

/**
 * SocialSettings — one field per platform in the SOCIAL_PLATFORMS registry, so
 * adding TikTok/YouTube later is a single registry entry (no change here). Only
 * platforms with a valid URL are shown on the public site.
 */
const SocialSettings = ({ settings, onSaved }) => {
  const social = settings.social || {};
  const [form, setForm] = useState(
    Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.key, social[p.key] || '']))
  );
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setBanner(null);

    const invalid = SOCIAL_PLATFORMS.find((p) => !isValidUrl(form[p.key]));
    if (invalid) {
      setBanner({ variant: 'danger', msg: `رابط ${invalid.label} غير صالح — يجب أن يبدأ بـ http:// أو https://` });
      return;
    }

    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
      const res = await updateSocial(payload);
      onSaved?.('social', res.social || payload);
      setBanner({ variant: 'success', msg: 'تم حفظ روابط التواصل. تظهر الأيقونات على الموقع فقط عند وجود رابط صالح.' });
    } catch (err) {
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر حفظ التغييرات.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <SectionIntro title="وسائل التواصل الاجتماعي">
        روابط صفحات المدرسة على مواقع التواصل. تظهر كأيقونات في تذييل الموقع — والأيقونة لا تظهر إلا عند إدخال رابط صالح.
      </SectionIntro>

      <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        {banner && <Alert variant={banner.variant}>{banner.msg}</Alert>}

        <div className="flex items-start gap-2 rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3 text-xs text-secondary-800">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>اترك الحقل فارغاً لإخفاء الأيقونة من الموقع. تُفتح كل الروابط في نافذة جديدة.</span>
        </div>

        {SOCIAL_PLATFORMS.map((p) => (
          <div key={p.key}>
            <label htmlFor={`social-${p.key}`} className="mb-1.5 block text-sm font-medium text-gray-700">{p.label}</label>
            <input
              id={`social-${p.key}`}
              type="text"
              value={form[p.key]}
              onChange={set(p.key)}
              dir="ltr"
              placeholder={p.placeholder}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-xs text-gray-400">الرابط الكامل لصفحة {p.label} (يبدأ بـ https://).</p>
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

export default SocialSettings;
