/**
 * EditStudentAverageModal — admin sets/corrects a student's «معدل المواد المميزة».
 * Calls the branch-guarded backend endpoint (Admin SDK), which re-validates and
 * recomputes the support classification + writes an audit entry. The profile
 * fields are locked against client self-writes by Firestore rules, so this
 * (admin) and the student support-enroll flow are the only writers.
 */

import React, { useState } from 'react';
import { GraduationCap, Loader2, AlertCircle } from 'lucide-react';
import apiCall from '../../utils/apiClient';
import {
  validateAverage, classify, classificationBadge, AVERAGE_MIN, AVERAGE_MAX,
} from '../../utils/supportClassification';
import AdminModal from './AdminModal';

const EditStudentAverageModal = ({ branchId, student, onClose, onSaved }) => {
  const current = student?.distinguishedSubjectsAverage;
  const [value, setValue] = useState(current != null ? String(current) : '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Live preview of the classification from the typed value.
  const parsed = validateAverage(value);
  const previewClassification = parsed.valid ? classify(parsed.value) : null;
  const previewBadge = classificationBadge(previewClassification);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const v = validateAverage(value);
    if (!v.valid) { setError(v.error); return; }

    try {
      setSubmitting(true);
      const res = await apiCall(`/api/admin/students/${student.id}/distinguished-average`, {
        method: 'PATCH',
        body: JSON.stringify({ branchId, distinguishedSubjectsAverage: v.value }),
      });
      onSaved?.({ average: res.average ?? v.value, classification: res.classification });
      onClose();
    } catch (err) {
      setError(err.message || 'تعذر حفظ المعدل. حاول مرة أخرى.');
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
        form="edit-student-average-form"
        disabled={submitting}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> جاري الحفظ...
          </span>
        ) : 'حفظ'}
      </button>
    </>
  );

  return (
    <AdminModal open onClose={onClose} size="sm" icon={GraduationCap} title="معدل المواد المميزة" subtitle={student?.fullName || student?.name} footer={footer}>
      <form id="edit-student-average-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex gap-2.5 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="student-average" className="mb-1.5 block text-sm font-medium text-gray-700">
            المعدل (من {AVERAGE_MIN} إلى {AVERAGE_MAX}) <span className="text-danger-500">*</span>
          </label>
          <input
            id="student-average"
            type="text"
            inputMode="decimal"
            dir="ltr"
            autoFocus
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            placeholder="مثال: 9.8"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <span className="text-gray-600">التصنيف الناتج</span>
          {parsed.valid ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${previewBadge.classes}`}>
              <previewBadge.Icon className={`h-2.5 w-2.5 shrink-0 ${previewBadge.iconClass}`} fill="currentColor" aria-hidden="true" /> {previewBadge.label}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </div>

        <p className="rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 text-xs text-secondary-700">
          11 فأكثر = مجموعة عادية · أقل من 11 = مجموعة دعم خاصة. لا يؤثر هذا المعدل على اللغات أو الدورات التكوينية.
        </p>
      </form>
    </AdminModal>
  );
};

export default EditStudentAverageModal;
