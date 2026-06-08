import React, { useEffect, useState } from 'react';
import { Edit2, Loader2 } from 'lucide-react';
import { adminEditSupportLessonRegistration } from '../../services/firestoreService';
import { toDate } from '../../utils/registrationUtils';
import AdminModal from './AdminModal';

/**
 * Modal for admins to edit a support lesson registration.
 * Identity fields (branchId, userId, lessonId, createdAt) are read-only.
 *
 * @param {object}   props
 * @param {object}   props.registration  - The registration document (with id)
 * @param {function} props.onClose
 * @param {function} props.onSuccess
 */
const EDITABLE_STATUSES = ['pending', 'verified', 'rejected'];

const toInputDate = (value) => {
  const d = toDate(value);
  if (!d) return '';
  return d.toISOString().slice(0, 10); // yyyy-mm-dd for <input type="date">
};

const EditSupportRegistrationModal = ({ registration, onClose, onSuccess }) => {
  const [status, setStatus] = useState('');
  const [endDateStr, setEndDateStr] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Populate form from existing registration
  useEffect(() => {
    if (!registration) return;
    setStatus(String(registration.status || 'pending').toLowerCase());
    setEndDateStr(toInputDate(registration.endDate ?? registration.expiresAt));
    setSubjectName(registration.subjectName || registration.courseName || '');
  }, [registration]);

  if (!registration) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const updates = { status };
    if (subjectName.trim()) updates.subjectName = subjectName.trim();
    if (endDateStr) {
      const parsed = new Date(endDateStr);
      if (!Number.isNaN(parsed.getTime())) {
        updates.endDate = parsed;
      }
    }

    try {
      setSubmitting(true);
      await adminEditSupportLessonRegistration(registration.id, updates);
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('adminEditSupportLessonRegistration error:', err);
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
        className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
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
    <AdminModal open onClose={onClose} size="md" icon={Edit2} title="تعديل التسجيل" footer={footer}>
      {/* Read-only identity info */}
      <div className="mb-5 space-y-0.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <p><span className="font-medium">معرف الطالب:</span> {registration.userId || '—'}</p>
        <p><span className="font-medium">معرف الدرس:</span>  {registration.lessonId || '—'}</p>
        <p><span className="font-medium">الفرع:</span>       {registration.branchId || '—'}</p>
      </div>

      <form id="edit-support-reg-form" onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            {error}
          </div>
        )}

        {/* Status */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">الحالة</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30"
          >
            {EDITABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'pending'   ? 'قيد المراجعة'
                  : s === 'verified' ? 'مؤكد'
                  : 'مرفوض'}
              </option>
            ))}
          </select>
        </div>

        {/* End date */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">تاريخ انتهاء الاشتراك</label>
          <input
            type="date"
            value={endDateStr}
            onChange={(e) => setEndDateStr(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
          <p className="mt-1 text-xs text-gray-500">اتركه فارغاً للإبقاء على القيمة الحالية.</p>
        </div>

        {/* Subject name */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">اسم المادة</label>
          <input
            type="text"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder={registration.subjectName || 'اسم المادة'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </form>
    </AdminModal>
  );
};

export default EditSupportRegistrationModal;
