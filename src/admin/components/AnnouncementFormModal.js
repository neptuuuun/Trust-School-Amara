import React, { useState } from 'react';
import { Pin, Calendar, Eye, EyeOff, Megaphone } from 'lucide-react';
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_STYLES,
  PAGE_TARGETS,
} from '../../services/announcementService';
import AdminModal from './AdminModal';

const STYLE_KEYS = Object.keys(ANNOUNCEMENT_STYLES);

const toDatetimeLocal = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const initForm = (a) => ({
  title:        a?.title        || '',
  body:         a?.body         || '',
  emoji:        a?.emoji        || '',
  category:     a?.category     || 'general',
  style:        a?.style        || 'info',
  targetPage:   a?.targetPage   || 'all',
  targetYear:   a?.targetYear   || '',
  targetGroup:  a?.targetGroup  || '',
  isPinned:     a?.isPinned     || false,
  priority:     a?.priority     ?? 5,
  isPublished:  a?.isPublished  ?? true,
  publishAtStr: toDatetimeLocal(a?.publishAt),
  expiresAtStr: toDatetimeLocal(a?.expiresAt),
  ctaLabel:     a?.ctaLabel     || '',
  ctaLink:      a?.ctaLink      || '',
});

const AnnouncementFormModal = ({ announcement, onSave, onClose, saving }) => {
  const isEdit = Boolean(announcement);
  const [form, setForm] = useState(() => initForm(announcement));

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    const parseDate = (str) => {
      if (!str) return null;
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    };

    onSave({
      title:       form.title.trim(),
      body:        form.body.trim(),
      emoji:       form.emoji.trim() || null,
      category:    form.category,
      style:       form.style,
      targetPage:  form.targetPage,
      targetYear:  form.targetYear.trim() || null,
      targetGroup: form.targetGroup.trim() || null,
      isPinned:    form.isPinned,
      priority:    Number(form.priority) || 5,
      isPublished: form.isPublished,
      publishAt:   parseDate(form.publishAtStr),
      expiresAt:   parseDate(form.expiresAtStr),
      ctaLabel:    form.ctaLabel.trim() || null,
      ctaLink:     form.ctaLink.trim() || null,
    });
  };

  const currentStyle = ANNOUNCEMENT_STYLES[form.style] || ANNOUNCEMENT_STYLES.info;

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
      >
        إلغاء
      </button>
      <button
        type="submit"
        form="announcement-form"
        disabled={saving || !form.title.trim()}
        className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? 'جاري الحفظ…' : isEdit ? 'حفظ التعديلات' : 'نشر الإعلان'}
      </button>
    </>
  );

  return (
    <AdminModal
      open
      onClose={onClose}
      size="lg"
      icon={Megaphone}
      title={isEdit ? 'تعديل الإعلان' : 'إعلان جديد'}
      subtitle={isEdit ? 'عدّل الحقول ثم احفظ' : 'سيُنشر في الفرع الحالي فقط'}
      footer={footer}
    >
      <form id="announcement-form" onSubmit={handleSubmit} className="space-y-6">

        {/* Live preview */}
        <div
          className="rounded-xl border-r-4 p-4 text-sm"
          style={{
            background: currentStyle.lightBg,
            borderColor: currentStyle.accent,
            color: currentStyle.darkText,
          }}
        >
          <p className="text-base font-bold leading-snug">
            {form.emoji && <span className="me-1.5">{form.emoji}</span>}
            {form.title || <span className="opacity-40">عنوان الإعلان…</span>}
          </p>
          {form.body && <p className="mt-1 text-sm opacity-80">{form.body}</p>}
        </div>

        {/* Title + Emoji */}
        <div className="grid grid-cols-[1fr_90px] gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              العنوان <span className="text-danger-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              required
              maxLength={120}
              placeholder="مثال: التسجيل في دورة الإنجليزية مفتوح"
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">إيموجي</label>
            <input
              type="text"
              value={form.emoji}
              onChange={(e) => set('emoji', e.target.value)}
              placeholder="📢"
              maxLength={4}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-center text-xl outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Body */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            تفاصيل إضافية
            <span className="ms-2 text-xs font-normal text-gray-400">اختياري</span>
          </label>
          <textarea
            value={form.body}
            onChange={(e) => set('body', e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="أكتب تفاصيل أو تعليمات إضافية هنا…"
            className="w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Style */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">نوع الإعلان</label>
          <div className="grid grid-cols-4 gap-2">
            {STYLE_KEYS.map((key) => {
              const st = ANNOUNCEMENT_STYLES[key];
              const active = form.style === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('style', key)}
                  className="flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-xs font-semibold transition-all"
                  style={
                    active
                      ? { background: st.lightBg, borderColor: st.accent, color: st.darkText }
                      : { background: '#f9fafb', borderColor: '#e5e7eb', color: '#6b7280' }
                  }
                >
                  <span className="text-lg">{st.icon}</span>
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category + Target page */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">الفئة</label>
            <select
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              {Object.entries(ANNOUNCEMENT_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">الصفحة المستهدفة</label>
            <select
              value={form.targetPage}
              onChange={(e) => set('targetPage', e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              {Object.entries(PAGE_TARGETS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Targeting: year + group */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            استهداف دقيق
            <span className="ms-2 text-xs font-normal text-gray-400">اختياري — مثال: السنة الثالثة، مجموعة أ</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={form.targetYear}
              onChange={(e) => set('targetYear', e.target.value)}
              placeholder="السنة الدراسية (مثال: 3am)"
              maxLength={60}
              className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="text"
              value={form.targetGroup}
              onChange={(e) => set('targetGroup', e.target.value)}
              placeholder="المجموعة (مثال: مجموعة أ)"
              maxLength={60}
              className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Priority + Pin + Publish */}
        <div className="grid grid-cols-2 items-start gap-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              الأولوية: <span className="font-bold text-primary">{form.priority}</span>
            </label>
            <input
              type="range"
              min={1} max={10}
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
              className="w-full accent-primary"
            />
            <div className="mt-0.5 flex justify-between text-xs text-gray-400">
              <span>منخفضة</span>
              <span>عالية</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 pt-1">
            <label className="flex cursor-pointer select-none items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.isPinned}
                onChange={(e) => set('isPinned', e.target.checked)}
                className="h-4 w-4 rounded accent-primary"
              />
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <Pin className="h-4 w-4 text-gray-500" />
                تثبيت في الأعلى
              </span>
            </label>
            <label className="flex cursor-pointer select-none items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => set('isPublished', e.target.checked)}
                className="h-4 w-4 rounded accent-primary"
              />
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                {form.isPublished
                  ? <Eye className="h-4 w-4 text-success-500" />
                  : <EyeOff className="h-4 w-4 text-gray-400" />
                }
                {form.isPublished ? 'منشور' : 'مسودة'}
              </span>
            </label>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              نشر مجدول
              <span className="text-xs font-normal text-gray-400">(اختياري)</span>
            </label>
            <input
              type="datetime-local"
              value={form.publishAtStr}
              onChange={(e) => set('publishAtStr', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              تاريخ الانتهاء
              <span className="text-xs font-normal text-gray-400">(اختياري)</span>
            </label>
            <input
              type="datetime-local"
              value={form.expiresAtStr}
              onChange={(e) => set('expiresAtStr', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* CTA */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            زر الإجراء
            <span className="ms-2 text-xs font-normal text-gray-400">(اختياري)</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={form.ctaLabel}
              onChange={(e) => set('ctaLabel', e.target.value)}
              placeholder="نص الزر — مثال: سجّل الآن"
              maxLength={40}
              className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="text"
              value={form.ctaLink}
              onChange={(e) => set('ctaLink', e.target.value)}
              placeholder="رابط — /languages أو https://…"
              maxLength={200}
              className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      </form>
    </AdminModal>
  );
};

export default AnnouncementFormModal;
