import React, { useState, useRef } from 'react';
import {
  Loader2, Trash2, GripVertical, Info, Plus, Save, X,
  Pencil, Eye, EyeOff, ChevronUp, ChevronDown, HelpCircle,
} from 'lucide-react';
import { addFaq, updateFaq, deleteFaq, reorderFaq } from '../../../services/websiteService';
import { Alert, EmptyState } from '../../../components/ui/feedback';
import ConfirmDialog from './ConfirmDialog';
import SectionIntro from './SectionIntro';
import FAQItem from '../../../components/FAQItem';

/**
 * FaqSettings — owner FAQ manager for the public «اتصل بنا» page.
 *
 * Full CMS: add, edit (question + answer), delete-with-confirmation, reorder
 * (drag-to-reorder + move up/down for touch/keyboard), hide/show without
 * deleting, and a live preview that renders exactly what visitors see.
 *
 * The list is an ordered array persisted through the owner backend
 * (`/api/owner/website/faq*`, owner-only + audit-logged). The public homepage /
 * contact page reads the same list (visible items only) via the public endpoint.
 *
 * Reorder and visibility toggles update optimistically and roll back on error.
 */
const FaqSettings = ({ settings, onSaved }) => {
  const [items, setItems] = useState(() => settings.faq || []);
  const [banner, setBanner] = useState(null);
  const [preview, setPreview] = useState(false);

  // Add form
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ question: '', answer: '' });

  // Inline edit
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ question: '', answer: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Per-item pending flags (visibility / move) so buttons can show a spinner.
  const [busyId, setBusyId] = useState(null);

  // Delete
  const [confirm, setConfirm] = useState(null); // item to delete
  const [deleting, setDeleting] = useState(false);

  // Drag & drop
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const commit = (faq) => { setItems(faq); onSaved?.('faq', faq); };

  // ── Add ──────────────────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault();
    setBanner(null);
    const question = draft.question.trim();
    const answer = draft.answer.trim();
    if (!question || !answer) {
      setBanner({ variant: 'danger', msg: 'الرجاء إدخال السؤال والجواب معاً.' });
      return;
    }
    setAdding(true);
    try {
      const res = await addFaq({ question, answer });
      commit(res.faq);
      setDraft({ question: '', answer: '' });
      setBanner({ variant: 'success', msg: 'تمت إضافة السؤال. ظاهر الآن على صفحة «اتصل بنا».' });
    } catch (err) {
      setBanner({ variant: 'danger', msg: err.message || 'تعذّرت إضافة السؤال.' });
    } finally {
      setAdding(false);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────
  const startEdit = (item) => {
    setBanner(null);
    setEditingId(item.id);
    setEditDraft({ question: item.question, answer: item.answer });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({ question: '', answer: '' });
  };

  const saveEdit = async (id) => {
    const question = editDraft.question.trim();
    const answer = editDraft.answer.trim();
    if (!question || !answer) {
      setBanner({ variant: 'danger', msg: 'السؤال والجواب مطلوبان.' });
      return;
    }
    setSavingEdit(true);
    setBanner(null);
    try {
      const res = await updateFaq(id, { question, answer });
      commit(res.faq);
      cancelEdit();
      setBanner({ variant: 'success', msg: 'تم حفظ التعديل.' });
    } catch (err) {
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر حفظ التعديل.' });
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Toggle visibility (optimistic) ─────────────────────────────────────────
  const toggleVisibility = async (item) => {
    const next = !item.isVisible;
    const prev = items;
    commit(items.map((f) => (f.id === item.id ? { ...f, isVisible: next } : f))); // optimistic
    setBusyId(item.id);
    setBanner(null);
    try {
      const res = await updateFaq(item.id, { isVisible: next });
      commit(res.faq);
    } catch (err) {
      commit(prev); // rollback
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر تغيير الظهور.' });
    } finally {
      setBusyId(null);
    }
  };

  // ── Reorder helpers ────────────────────────────────────────────────────────
  const persistOrder = async (reordered, prev) => {
    commit(reordered); // optimistic
    try {
      const res = await reorderFaq(reordered.map((f) => f.id));
      commit(res.faq);
    } catch (err) {
      commit(prev); // rollback
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر حفظ الترتيب.' });
    }
  };

  const move = (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setBanner(null);
    persistOrder(reordered, items);
  };

  const onDrop = (dropIndex) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    setDragOverIndex(null);
    if (from === null || from === dropIndex) return;
    const reordered = [...items];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIndex, 0, moved);
    setBanner(null);
    persistOrder(reordered, items);
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const doDelete = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      const res = await deleteFaq(confirm.id);
      commit(res.faq);
      setBanner({ variant: 'success', msg: 'تم حذف السؤال.' });
      setConfirm(null);
    } catch (err) {
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر حذف السؤال.' });
    } finally {
      setDeleting(false);
    }
  };

  const visibleCount = items.filter((f) => f.isVisible !== false).length;

  return (
    <div className="space-y-6">
      <SectionIntro title="الأسئلة الشائعة">
        الأسئلة والأجوبة الظاهرة في قسم «الأسئلة الشائعة» على صفحة «اتصل بنا». تظهر بالترتيب أدناه، والأسئلة المخفية لا تظهر للزوار.
      </SectionIntro>

      {banner && <Alert variant={banner.variant}>{banner.msg}</Alert>}

      {/* ── Add new question ── */}
      <form onSubmit={handleAdd} className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Plus className="h-4 w-4 text-primary" />
          إضافة سؤال جديد
        </div>
        <div>
          <label htmlFor="faq-new-q" className="mb-1.5 block text-sm font-medium text-gray-700">السؤال</label>
          <input
            id="faq-new-q"
            type="text"
            value={draft.question}
            onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
            dir="rtl"
            placeholder="مثال: ما هي مواعيد الدوام في المدرسة؟"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label htmlFor="faq-new-a" className="mb-1.5 block text-sm font-medium text-gray-700">الجواب</label>
          <textarea
            id="faq-new-a"
            value={draft.answer}
            onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))}
            dir="rtl"
            rows={3}
            placeholder="اكتب إجابة واضحة ومختصرة..."
            className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit" disabled={adding}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {adding ? 'جاري الإضافة...' : 'إضافة السؤال'}
          </button>
        </div>
      </form>

      {/* ── Toolbar: count + preview toggle ── */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {items.length} سؤال — {visibleCount} ظاهر للزوار
          </p>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors
              ${preview ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Eye className="h-4 w-4" />
            {preview ? 'إنهاء المعاينة' : 'معاينة كما تظهر للزوار'}
          </button>
        </div>
      )}

      {/* ── Preview mode ── */}
      {preview && (
        <div className="rounded-2xl border border-primary-100 bg-gradient-to-br from-primary/5 to-secondary/5 p-6" dir="rtl">
          <div className="mb-4 text-center">
            <h3 className="text-xl font-bold text-primary">الأسئلة الشائعة</h3>
            <p className="text-sm text-gray-500">هكذا تظهر الأسئلة على صفحة «اتصل بنا»</p>
          </div>
          {visibleCount === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">لا توجد أسئلة ظاهرة حالياً.</p>
          ) : (
            <div className="mx-auto max-w-2xl space-y-3">
              {items.filter((f) => f.isVisible !== false).map((f) => (
                <FAQItem key={f.id} question={f.question} answer={f.answer} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Reorder hint ── */}
      {items.length > 1 && !preview && (
        <div className="flex items-start gap-2 rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3 text-xs text-secondary-800">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>اسحب السؤال أو استخدم الأسهم لإعادة الترتيب — يُحفظ الترتيب تلقائياً ويظهر نفسه على الموقع.</span>
        </div>
      )}

      {/* ── List / empty state ── */}
      {!preview && (
        items.length === 0 ? (
          <EmptyState
            icon={HelpCircle}
            title="لا توجد أسئلة بعد"
            description="أضف أول سؤال شائع ليظهر في قسم الأسئلة الشائعة على صفحة «اتصل بنا»."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((item, i) => {
              const hidden = item.isVisible === false;
              const isEditing = editingId === item.id;
              return (
                <li
                  key={item.id}
                  draggable={!isEditing}
                  onDragStart={() => { if (!isEditing) dragIndex.current = i; }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                  onDragLeave={() => setDragOverIndex((idx) => (idx === i ? null : idx))}
                  onDrop={() => onDrop(i)}
                  className={`rounded-2xl border bg-white p-4 shadow-sm transition-all
                    ${dragOverIndex === i ? 'border-primary ring-2 ring-primary/40' : 'border-gray-200'}
                    ${hidden ? 'opacity-70' : ''}`}
                >
                  {isEditing ? (
                    /* ── Inline edit form ── */
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">السؤال</label>
                        <input
                          type="text"
                          value={editDraft.question}
                          onChange={(e) => setEditDraft((d) => ({ ...d, question: e.target.value }))}
                          dir="rtl"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">الجواب</label>
                        <textarea
                          value={editDraft.answer}
                          onChange={(e) => setEditDraft((d) => ({ ...d, answer: e.target.value }))}
                          dir="rtl"
                          rows={3}
                          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button" onClick={cancelEdit} disabled={savingEdit}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
                        >
                          <X className="h-4 w-4" /> إلغاء
                        </button>
                        <button
                          type="button" onClick={() => saveEdit(item.id)} disabled={savingEdit}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                        >
                          {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          حفظ
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Display row ── */
                    <div className="flex items-start gap-3">
                      {/* Drag handle + move buttons */}
                      <div className="flex flex-col items-center gap-1 pt-0.5">
                        <button
                          type="button" onClick={() => move(i, -1)} disabled={i === 0}
                          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                          aria-label="تحريك للأعلى"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <span className="cursor-grab text-gray-300 active:cursor-grabbing" title="اسحب لإعادة الترتيب">
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <button
                          type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1}
                          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                          aria-label="تحريك للأسفل"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">{item.question}</p>
                          {hidden && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                              <EyeOff className="h-3 w-3" /> مخفي
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-gray-600">{item.answer}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button
                          type="button" onClick={() => toggleVisibility(item)} disabled={busyId === item.id}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50"
                          title={hidden ? 'إظهار للزوار' : 'إخفاء عن الزوار'}
                          aria-label={hidden ? 'إظهار' : 'إخفاء'}
                        >
                          {busyId === item.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button
                          type="button" onClick={() => startEdit(item)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-primary/10 hover:text-primary"
                          title="تعديل" aria-label="تعديل"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button" onClick={() => setConfirm(item)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-danger-50 hover:text-danger-600"
                          title="حذف" aria-label="حذف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}

      <ConfirmDialog
        open={!!confirm}
        title="حذف السؤال"
        message={confirm ? `سيُحذف السؤال «${confirm.question}» نهائياً من صفحة «اتصل بنا». لا يمكن التراجع. متابعة؟` : ''}
        confirmLabel="حذف"
        loading={deleting}
        onConfirm={doDelete}
        onCancel={() => (deleting ? null : setConfirm(null))}
      />
    </div>
  );
};

export default FaqSettings;
