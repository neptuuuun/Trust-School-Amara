/**
 * ClassCard — a single joinable class (group) shown to students.
 * Displays teacher, group, schedules, price, then a Register button whose
 * state is driven by the `status` prop computed by the parent page.
 *
 * status: { type, note? }
 *   type: 'none' | 'pending' | 'verified' | 'rejected' | 'full' | 'disabled'
 */

import React from 'react';
import { User, Users, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { formatPriceText, scheduleRows } from './academicDisplay';

const BUTTON_BY_STATUS = {
  none:     { text: 'التسجيل',        disabled: false, cls: 'bg-primary text-white hover:bg-primary-600' },
  rejected: { text: 'إعادة المحاولة', disabled: false, cls: 'bg-primary text-white hover:bg-primary-600' },
  pending:  { text: 'قيد المراجعة',   disabled: true,  cls: 'bg-warning-100 text-warning-800 border border-warning-300 cursor-not-allowed' },
  verified: { text: 'مسجل',           disabled: true,  cls: 'bg-success-100 text-success-800 border border-success-300 cursor-not-allowed' },
  full:     { text: 'اكتمل العدد',     disabled: true,  cls: 'bg-gray-200 text-gray-600 border border-gray-300 cursor-not-allowed' },
  disabled: { text: 'غير متاح',        disabled: true,  cls: 'bg-gray-200 text-gray-600 border border-gray-300 cursor-not-allowed' },
};

const ClassCard = ({ cls, status = { type: 'none' }, onRegister }) => {
  const rows = scheduleRows(cls?.schedules);
  const btn = { ...(BUTTON_BY_STATUS[status.type] || BUTTON_BY_STATUS.none) };
  if (status.label) btn.text = status.label;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-gray-100 transition-shadow duration-300 hover:shadow-lg">
      <div className="flex flex-1 flex-col p-6">
        {/* Group title + optional level */}
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-7 w-7 flex-shrink-0 text-primary" aria-hidden="true" />
          <h3 className="text-xl font-bold text-primary">{cls?.groupName || 'مجموعة'}</h3>
          {cls?.level && (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{cls.level}</span>
          )}
        </div>

        {/* Teacher */}
        <div className="mb-3 flex items-center text-gray-700">
          <User className="me-2 h-5 w-5 text-gray-400" aria-hidden="true" />
          <span className="font-medium">{cls?.teacherName || 'غير محدد'}</span>
        </div>

        {/* Schedules */}
        {rows.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center text-sm text-gray-700">
                <Clock className="me-2 h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                <span className="font-medium">{r.day}</span>
                {r.time && <span className="ms-2 text-gray-500">{r.time}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Price */}
        <div className="mb-2 text-gray-700">
          <span className="font-semibold">السعر: </span>
          <span>{formatPriceText(cls?.price, cls?.priceType)}</span>
        </div>

        {/* Remaining seats (only when a capacity is set) */}
        {Number(cls?.capacity) > 0 && (() => {
          const remaining = Math.max(0, (Number(cls.capacity) || 0) - (Number(cls.enrollmentCount) || 0));
          return (
            <div className="mb-4 text-sm">
              {remaining > 0
                ? <span className="text-success-600">المقاعد المتبقية: {remaining}</span>
                : <span className="font-medium text-danger-600">اكتمل العدد</span>}
            </div>
          );
        })()}

        {/* Status banners */}
        {status.type === 'verified' && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-success-200 bg-success-50 p-3">
            <CheckCircle className="h-5 w-5 text-success-600" aria-hidden="true" />
            <span className="text-sm font-medium text-success-700">مسجل ومفعّل</span>
          </div>
        )}
        {status.type === 'pending' && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 p-3">
            <Clock className="h-5 w-5 text-warning-600" aria-hidden="true" />
            <span className="text-sm font-medium text-warning-700">بانتظار التحقق من الإدارة</span>
          </div>
        )}
        {status.note && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
            <span className="text-xs text-gray-600">{status.note}</span>
          </div>
        )}

        {/* Register button */}
        <button
          type="button"
          onClick={() => { if (!btn.disabled) onRegister?.(cls); }}
          disabled={btn.disabled}
          className={`mt-auto w-full rounded-lg px-6 py-3 font-semibold transition-colors duration-300 ${btn.cls}`}
        >
          {btn.text}
        </button>
      </div>
    </div>
  );
};

export default ClassCard;
