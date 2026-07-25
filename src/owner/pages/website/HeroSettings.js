import React, { useEffect, useState } from 'react';
import { Save, Loader2, Check } from 'lucide-react';
import { uploadHeroImage, updateHero } from '../../../services/websiteService';
import { Alert } from '../../../components/ui/feedback';
import ImageDropzone from './ImageDropzone';
import SectionIntro from './SectionIntro';
import { HERO_DESTINATIONS, DEFAULT_HERO_DESTINATION } from '../../../config/websiteDefaults';

const HERO_HINT = 'JPG أو PNG أو WebP — بحد أقصى 5 ميغابايت.';
const MAX_TITLE = 120;
const MAX_SUBTITLE = 240;

// Recommendations shown under the image uploader (plain language for the owner).
const IMAGE_RECOMMENDATIONS = [
  'المقاس المُوصى به: 1920×1080 بكسل',
  'اتجاه أفقي (Landscape)',
  'الحجم الأقصى: 5 ميغابايت',
  'استخدم صوراً عالية الجودة للطلاب أو القاعات أو فعاليات المدرسة',
];

// Normalize a stored buttonLink to a known destination (fallback if unrecognized).
const normalizeDestination = (link) =>
  HERO_DESTINATIONS.some((d) => d.value === link) ? link : DEFAULT_HERO_DESTINATION;

const HeroSettings = ({ settings, onSaved }) => {
  const hero = settings.hero || {};
  const [form, setForm] = useState({
    title: hero.title || '',
    subtitle: hero.subtitle || '',
    buttonText: hero.buttonText || '',
    buttonLink: normalizeDestination(hero.buttonLink),
  });
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(hero.imageUrl || '');
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  // Live object-URL preview for a freshly-picked file; revoke to avoid leaks.
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setBanner(null);

    if (!form.title.trim()) {
      setBanner({ variant: 'danger', msg: 'العنوان الرئيسي مطلوب.' });
      return;
    }

    setSaving(true);
    try {
      let imageUrl = hero.imageUrl || '';
      let imagePath = hero.imagePath || '';

      // Upload replaces the single hero file at a fixed path (no duplicates). The
      // returned URL carries a fresh ?t= cache-buster so the new image is never
      // served stale from the browser/CDN cache.
      if (file) {
        const uploaded = await uploadHeroImage(file);
        imageUrl = uploaded.publicUrl;
        imagePath = uploaded.path;
      }

      const payload = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim(),
        buttonText: form.buttonText.trim(),
        buttonLink: normalizeDestination(form.buttonLink),
        imageUrl,
        imagePath,
      };
      // The success banner shows ONLY after this resolves — i.e. after the write
      // is committed to Firestore. The public homepage (live onSnapshot) then
      // reflects the new values immediately, with no reload.
      const res = await updateHero(payload);
      onSaved?.('hero', res.hero || payload);
      setFile(null);
      setPreviewUrl(imageUrl);
      setBanner({ variant: 'success', msg: 'تم الحفظ. التغييرات ظاهرة الآن على الصفحة الرئيسية مباشرةً.' });
    } catch (err) {
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر حفظ التغييرات.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <SectionIntro title="القسم الرئيسي (Hero)">
        هذا هو أول ما يراه الزائر أعلى الصفحة الرئيسية: صورة الخلفية الكبيرة، العنوان، الوصف، وزر الدعوة للتفاعل.
      </SectionIntro>

      <div className="space-y-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        {banner && <Alert variant={banner.variant}>{banner.msg}</Alert>}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">صورة الخلفية</label>
          <ImageDropzone
            previewUrl={previewUrl}
            onSelect={(f) => { setFile(f); setBanner(null); }}
            onError={(msg) => setBanner({ variant: 'danger', msg })}
            hint={HERO_HINT}
            disabled={saving}
          />
          <ul className="mt-2 space-y-1">
            {IMAGE_RECOMMENDATIONS.map((r) => (
              <li key={r} className="flex items-center gap-1.5 text-xs text-gray-500">
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-success-600" />
                {r}
              </li>
            ))}
          </ul>
          {!previewUrl && (
            <p className="mt-2 text-xs text-gray-400">لم يتم تعيين صورة مخصّصة — تُستخدم الصورة الافتراضية للموقع.</p>
          )}
        </div>

        <div>
          <label htmlFor="hero-title" className="mb-1.5 block text-sm font-medium text-gray-700">العنوان الرئيسي *</label>
          <input
            id="hero-title" type="text" value={form.title} onChange={set('title')} maxLength={MAX_TITLE}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-gray-400">العنوان الكبير الظاهر فوق صورة الخلفية.</p>
            <p className="text-xs text-gray-400">{form.title.length}/{MAX_TITLE}</p>
          </div>
        </div>

        <div>
          <label htmlFor="hero-subtitle" className="mb-1.5 block text-sm font-medium text-gray-700">العنوان الفرعي</label>
          <textarea
            id="hero-subtitle" rows={2} value={form.subtitle} onChange={set('subtitle')} maxLength={MAX_SUBTITLE}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-gray-400">جملة قصيرة تظهر أسفل العنوان لتعريف المدرسة.</p>
            <p className="text-xs text-gray-400">{form.subtitle.length}/{MAX_SUBTITLE}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="hero-btn-text" className="mb-1.5 block text-sm font-medium text-gray-700">نص الزر الأساسي</label>
            <input
              id="hero-btn-text" type="text" value={form.buttonText} onChange={set('buttonText')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-xs text-gray-400">النص المكتوب داخل الزر (مثال: «تواصل معنا»). اتركه فارغاً لإخفاء الزر.</p>
          </div>
          <div>
            <label htmlFor="hero-btn-dest" className="mb-1.5 block text-sm font-medium text-gray-700">وجهة الزر</label>
            <select
              id="hero-btn-dest" value={form.buttonLink} onChange={set('buttonLink')}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {HERO_DESTINATIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">الصفحة التي ينتقل إليها الزائر عند الضغط على الزر.</p>
          </div>
        </div>

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

export default HeroSettings;
