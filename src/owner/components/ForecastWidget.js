import React from 'react';
import { TrendingUp, Target, Wallet, Gauge, CalendarClock, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';

/**
 * Financial Forecast — the executive "where will this month land?" widget.
 *
 * Consumes `forecast` from getOwnerSummary (support-subscription basis):
 *   { current, projected, target, collectionPct, status, isCurrentMonth,
 *     isPastMonth, isFutureMonth, daysElapsed, daysInMonth }
 *
 * Projection is a linear run-rate of what's actually been collected so far this
 * month (never an arbitrary figure). Past months are final; future months carry
 * no projection. Basis is support subscriptions, labelled explicitly so the
 * "collection %" can't be misread as whole-school revenue.
 */

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US')} دج`;

const STATUS = {
  ahead:    { label: 'متقدّم على الهدف',   icon: CheckCircle2, chip: 'bg-success-50 text-success-700 border-success-200',   bar: 'bg-success-500' },
  on_track: { label: 'على المسار الصحيح',  icon: TrendingUp,   chip: 'bg-secondary-50 text-secondary-700 border-secondary-200', bar: 'bg-secondary-500' },
  behind:   { label: 'أقل من الهدف',        icon: AlertTriangle, chip: 'bg-warning-50 text-warning-700 border-warning-200',    bar: 'bg-warning-500' },
  none:     { label: 'غير متاح',            icon: MinusCircle,  chip: 'bg-gray-100 text-gray-500 border-gray-200',             bar: 'bg-gray-300' },
};

const Figure = ({ icon: Icon, label, value, tone = 'text-gray-900', hint }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
    <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </div>
    <p className={`text-xl font-bold ${tone}`}>{value}</p>
    {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
  </div>
);

export default function ForecastWidget({ forecast }) {
  if (!forecast) return null;

  const { current, projected, target, collectionPct, status, applicable, isPastMonth, isFutureMonth, daysElapsed, daysInMonth } = forecast;
  // `applicable` is only true for the current month (see backend note): off the
  // current month the live target can't judge a historical/future actual, so we
  // show the final collected figure (past) or a placeholder (future) instead.
  const isApplicable = applicable !== false && !isPastMonth && !isFutureMonth;
  const meta = STATUS[status] || STATUS.none;
  const StatusIcon = meta.icon;
  const pctClamped = collectionPct == null ? 0 : Math.max(0, Math.min(100, collectionPct));

  return (
    <div className="rounded-2xl border-2 border-primary-100 bg-white p-5 shadow-md sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-primary">
            <Gauge className="h-5 w-5" aria-hidden="true" />
            التوقعات المالية
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            بناءً على اشتراكات الدعم النشطة
            {isPastMonth
              ? ' · الشهر مكتمل — القيمة نهائية'
              : isFutureMonth
                ? ' · شهر قادم — لا يوجد تحصيل بعد'
                : ` · مضى ${daysElapsed} من ${daysInMonth} يوماً`}
          </p>
        </div>
        {isApplicable ? (
          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${meta.chip}`}>
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
            {meta.label}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-500">
            {isPastMonth ? 'مكتمل' : 'قادم'}
          </span>
        )}
      </div>

      {isApplicable ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure icon={Wallet} label="المحصّل حتى الآن" value={fmtMoney(current)} tone="text-success-600" />
            <Figure
              icon={CalendarClock}
              label="المتوقع بنهاية الشهر"
              value={projected == null ? '—' : fmtMoney(projected)}
              tone="text-primary-600"
              hint="بمعدل التحصيل الحالي"
            />
            <Figure icon={Target} label="الهدف المتوقّع" value={fmtMoney(target)} tone="text-gray-900" />
            <Figure icon={Gauge} label="نسبة التحصيل" value={collectionPct == null ? '—' : `${collectionPct}%`} tone="text-accent-600" />
          </div>

          {/* Collection progress toward target */}
          {target > 0 && (
            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
                <span>التقدّم نحو الهدف</span>
                <span>{fmtMoney(current)} / {fmtMoney(target)}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pctClamped} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full rounded-full transition-all ${meta.bar}`} style={{ width: `${pctClamped}%` }} />
              </div>
            </div>
          )}
        </>
      ) : isPastMonth ? (
        <div className="grid grid-cols-2 gap-3">
          <Figure icon={Wallet} label="المحصّل النهائي (الدعم)" value={fmtMoney(current)} tone="text-success-600" />
          <Figure icon={CalendarClock} label="أيام الشهر" value={`${daysInMonth}`} tone="text-gray-900" />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 text-sm text-gray-500">
          لم يبدأ التحصيل لهذا الشهر بعد — اختر الشهر الحالي لعرض التوقعات.
        </div>
      )}
    </div>
  );
}
