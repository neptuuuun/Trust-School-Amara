/**
 * AverageGateModal — collects the student's «معدل المواد المميزة» (once) before
 * they can browse/enroll in support groups. The value is validated, saved to the
 * profile via the backend, and classified instantly (>=11 normal, <11 support).
 * The result drives per-subject routing (which group types the student sees).
 *
 * The wording is respectful and explains WHY we ask — never «ضعيف/سيء».
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, GraduationCap, Loader2, Clock } from 'lucide-react';
import apiCall from '../../utils/apiClient';
import { safeErrorMessage } from '../../utils/apiErrors';
import { validateAverage, AVERAGE_MIN, AVERAGE_MAX } from '../../utils/supportClassification';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';

const AverageGateModal = ({ branchId, onClose, onClassified }) => {
  // Admin-approval status. The average endpoint is authenticated but only
  // meaningful for approved students; we must NOT call it for an unapproved
  // account (see the approval panel below).
  const { verified } = useAuth();

  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Guard: never reach the backend for an account the admin hasn't approved.
    // The UI already renders the approval panel instead of this form, so this is
    // purely defensive against the form ever being submitted while unapproved.
    if (!verified) return;

    // Client validation (the backend re-validates authoritatively).
    const v = validateAverage(value);
    if (!v.valid) { setError(v.error); return; }

    try {
      setSubmitting(true);
      const res = await apiCall('/api/registrations/support-average', {
        method: 'POST',
        body: JSON.stringify({ branchId, distinguishedSubjectsAverage: v.value }),
      });
      onClassified?.({ average: res.average ?? v.value, classification: res.classification });
    } catch (err) {
      // Never surface raw fetch/CORS/exception text ("Failed to fetch", …).
      setError(safeErrorMessage(err, 'تعذر حفظ المعدل. يرجى المحاولة مرة أخرى لاحقاً.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Account not yet approved by the admin → show a friendly explanation and
  // stop here. No average is collected and no backend request is ever made.
  if (!verified) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
        <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
          <button
            onClick={onClose}
            className="absolute top-4 end-4 text-gray-400 hover:text-gray-600"
            aria-label="إغلاق"
          >
            <X className="h-6 w-6" />
          </button>

          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-warning-100">
              <Clock className="h-7 w-7 text-warning-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">لم يتم تفعيل الحساب بعد</h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              لم تتم الموافقة على حسابك من قبل الإدارة بعد.
              <br />
              يرجى انتظار مراجعة مستنداتك.
              <br />
              بعد تفعيل الحساب ستتمكن من التسجيل في دروس الدعم.
            </p>
          </div>

          <Button type="button" fullWidth onClick={onClose}>حسناً</Button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 end-4 text-gray-400 hover:text-gray-600"
          aria-label="إغلاق"
        >
          <X className="h-6 w-6" />
        </button>

        <div className="mb-4 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <GraduationCap className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">معدل المواد المميزة</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            لتوجيهك إلى مجموعة الدعم الأنسب لمستواك الدراسي، يُرجى إدخال معدل المواد المميزة.
            يساعدنا هذا على ضمان أفضل متابعة وتحسين النتائج.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="distinguished-average" className="mb-1.5 block text-sm font-medium text-gray-700">
              معدل المواد المميزة (من {AVERAGE_MIN} إلى {AVERAGE_MAX}) <span className="text-danger-500">*</span>
            </label>
            <input
              id="distinguished-average"
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(''); }}
              placeholder="مثال: 9.8"
              dir="ltr"
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {error && <p className="mt-1.5 text-sm text-danger-600">{error}</p>}
          </div>

          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> جاري الحفظ...
              </span>
            ) : 'متابعة'}
          </Button>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default AverageGateModal;
