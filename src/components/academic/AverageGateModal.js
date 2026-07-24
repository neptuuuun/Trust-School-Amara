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
import { X, GraduationCap, Loader2 } from 'lucide-react';
import { numberInputGuards } from '../../utils/numberInputGuards';
import apiCall from '../../utils/apiClient';
import { validateAverage, AVERAGE_MIN, AVERAGE_MAX } from '../../utils/supportClassification';
import { Button } from '../ui/button';

const AverageGateModal = ({ branchId, onClose, onClassified }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

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
      setError(err.message || 'تعذر حفظ المعدل. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

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
              type="number"
              inputMode="decimal"
              step="0.01"
              min={AVERAGE_MIN}
              max={AVERAGE_MAX}
              {...numberInputGuards}
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
