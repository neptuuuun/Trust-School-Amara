/**
 * EditSupportRegistrationModal — correct a support-lesson subscription.
 *
 * WHAT CHANGED AND WHY
 * This component existed but was wired into nothing, so an admin could DELETE a
 * support registration (destroying a paid record) but not correct a typo or
 * extend a cycle. It is now reachable from SupportRegisteredPage.
 *
 * Its status dropdown (قيد المراجعة / مؤكد / مرفوض) was also removed. Those
 * states belong to the deleted receipt-approval workflow: a support registration
 * now only exists because money was captured, and flipping one to
 * pending/rejected would hide it from the archive while its ledger revenue
 * entry stayed on the books — an invisible way to make the numbers disagree.
 *
 * Changing the billed amount writes an append-only ledger ADJUSTMENT (the
 * backend never rewrites history), so a reason is required for that case and is
 * recorded in the audit log.
 *
 * @param {object}   props
 * @param {object}   props.registration  the registration document (with id)
 * @param {function} props.onClose
 * @param {function} props.onSuccess     called with the applied updates
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Loader2, AlertTriangle } from 'lucide-react';
import { adminEditSupportLessonRegistration } from '../../services/firestoreService';
import { toDate } from '../../utils/registrationUtils';
import AdminModal from './AdminModal';

const FIELD_CLASS =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30';

const toInputDate = (value) => {
  const d = toDate(value);
  if (!d) return '';
  // Local date parts — toISOString() would shift the day for eastern offsets.
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const EditSupportRegistrationModal = ({ registration, onClose, onSuccess }) => {
  const [endDateStr,  setEndDateStr]  = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [totalPrice,  setTotalPrice]  = useState('');
  const [reason,      setReason]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    if (!registration) return;
    setEndDateStr(toInputDate(registration.endDate ?? registration.expiresAt));
    setSubjectName(registration.subjectName || registration.courseName || '');
    setTeacherName(registration.teacherName || '');
    setTotalPrice(registration.totalPrice != null ? String(registration.totalPrice) : '');
    setReason('');
    setError('');
  }, [registration]);

  const originalPrice = registration?.totalPrice ?? registration?.proratedAmount ?? null;
  const priceChanged = useMemo(() => {
    if (totalPrice === '') return false;
    const n = Number(totalPrice);
    if (!Number.isFinite(n)) return false;
    return n !== Number(originalPrice ?? NaN);
  }, [totalPrice, originalPrice]);

  if (!registration) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const updates = {};
    if (subjectName.trim() !== (registration.subjectName || '')) updates.subjectName = subjectName.trim();
    if (teacherName.trim() !== (registration.teacherName || '')) updates.teacherName = teacherName.trim();

    if (endDateStr) {
      const parsed = new Date(`${endDateStr}T23:59:59`);
      if (Number.isNaN(parsed.getTime())) { setError('تاريخ الانتهاء غير صالح.'); return; }
      if (toInputDate(registration.endDate) !== endDateStr) updates.endDate = parsed;
    }

    if (priceChanged) {
      const n = Number(totalPrice);
      if (!Number.isFinite(n) || n < 0) { setError('المبلغ غير صالح.'); return; }
      if (!reason.trim()) { setError('يرجى ذكر سبب تعديل المبلغ — يُسجَّل في سجل التدقيق.'); return; }
      updates.totalPrice = n;
    }

    if (reason.trim()) updates.reason = reason.trim();

    // `reason` alone is metadata, not a change.
    const changedFields = Object.keys(updates).filter((k) => k !== 'reason');
    if (changedFields.length === 0) { setError('لم تُجرِ أي تعديل.'); return; }

    try {
      setSubmitting(true);
      await adminEditSupportLessonRegistration(registration.id, updates);
      onSuccess?.(updates);
      onClose();
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء الحفظ.');
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      >
        إلغاء
      </button>
      <button
        type="submit"
        form="edit-support-reg-form"
        disabled={submitting}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري الحفظ...
          </span>
        ) : 'حفظ التغييرات'}
      </button>
    </>
  );

  return (
    <AdminModal open onClose={onClose} size="md" icon={Edit2} title="تعديل الاشتراك" footer={footer}>
      <div className="mb-5 space-y-0.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <p><span className="font-medium">الطالب:</span> {registration.studentName || registration.userName || '—'}</p>
        <p><span className="font-medium">المجموعة:</span> {registration.groupName || '—'}</p>
        <p><span className="font-medium">دورة الفوترة:</span> {registration.cycleMonthKey || '—'}</p>
      </div>

      <form id="edit-support-reg-form" onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="sup-end">
            تاريخ انتهاء الاشتراك
          </label>
          <input id="sup-end" type="date" value={endDateStr} onChange={(e) => setEndDateStr(e.target.value)} className={FIELD_CLASS} />
          <p className="mt-1 text-xs text-gray-500">
            تمديد التاريخ يُبقي الطالب نشطاً دون دفعة جديدة — استخدمه للتصحيح أو كبادرة حسن نية.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="sup-subject">اسم المادة</label>
          <input id="sup-subject" type="text" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} className={FIELD_CLASS} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="sup-teacher">الأستاذ</label>
          <input id="sup-teacher" type="text" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} className={FIELD_CLASS} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="sup-price">
            المبلغ الإجمالي لهذه الدورة (دج)
          </label>
          <input
            id="sup-price" type="number" min="0" step="1" inputMode="numeric"
            value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} className={FIELD_CLASS}
          />
          {priceChanged && (
            <div className="mt-2 flex gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                تغيير المبلغ يُضيف قيد تسوية إلى السجل المالي (لا يُعدَّل السجل الأصلي أبداً).
                الفرق: {(Number(totalPrice) - Number(originalPrice || 0)).toLocaleString('en-US')} دج
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="sup-reason">
            سبب التعديل {priceChanged && <span className="text-danger-600">*</span>}
          </label>
          <textarea
            id="sup-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="يُحفظ في سجل التدقيق"
            className={`${FIELD_CLASS} resize-none`}
          />
        </div>
      </form>
    </AdminModal>
  );
};

export default EditSupportRegistrationModal;
