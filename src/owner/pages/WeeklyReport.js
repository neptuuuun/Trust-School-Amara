/**
 * WeeklyReport — the owner's automated weekly executive report.
 *
 * Reads GET /api/owner/weekly-report (cron-generated, on-demand fallback) and
 * renders a clear, actionable summary: key stats, alerts, per-branch performance,
 * most-popular courses, and a short week-over-week history. "تحديث" recomputes.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  FileBarChart2, RefreshCw, TrendingUp, Users, CreditCard, CalendarClock,
  AlertTriangle, Building2, BookOpen, Loader2, Clock, CheckCircle2, Info,
} from 'lucide-react';
import { getOwnerWeeklyReport } from '../../services/ownerService';

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US')} دج`;
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB');
};

const ALERT_UI = {
  danger: { Icon: AlertTriangle, cls: 'border-danger-200 bg-danger-50 text-danger-700' },
  warning: { Icon: AlertTriangle, cls: 'border-warning-200 bg-warning-50 text-warning-700' },
  info: { Icon: Info, cls: 'border-secondary-200 bg-secondary-50 text-secondary-700' },
};

const StatCard = ({ Icon, label, value, tone = 'primary', sub }) => {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-600',
    secondary: 'bg-secondary-50 text-secondary-600',
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.primary}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl font-bold leading-tight text-gray-900">{value}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{label}</p>
        {sub && <p className="truncate text-[11px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
};

export default function WeeklyReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const res = await getOwnerWeeklyReport({ refresh });
      setData(res);
    } catch (err) {
      setError(err?.message || 'تعذر تحميل التقرير.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const report = data?.report;
  const t = report?.totals || {};
  const history = (data?.history || []).slice().reverse();

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileBarChart2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">التقرير الأسبوعي التنفيذي</h1>
            <p className="text-sm text-gray-500">
              {report ? `${fmtDate(report.weekStart)} — ${fmtDate(report.weekEnd)}` : 'ملخص أداء الأسبوع عبر الفروع'}
            </p>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-primary-100 bg-white px-3 py-2 text-sm font-medium text-primary hover:bg-primary-50 disabled:opacity-60"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          تحديث
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {report && (
        <>
          {/* Key stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard Icon={TrendingUp} tone="success" label="الإيرادات (7 أيام)" value={fmtMoney(t.revenue)} />
            <StatCard Icon={CreditCard} tone="primary" label="مدفوعات مستلمة" value={t.paymentsReceived ?? 0} />
            <StatCard Icon={Users} tone="secondary" label="طلاب جدد" value={t.newStudents ?? 0} />
            <StatCard Icon={CalendarClock} tone="primary" label="حجوزات جديدة" value={t.newReservations ?? 0} />
            <StatCard Icon={Clock} tone="warning" label="مدفوعات معلقة" value={t.pendingPayments?.count ?? 0} sub={fmtMoney(t.pendingPayments?.amount)} />
            <StatCard Icon={CheckCircle2} tone="warning" label="وثائق للمراجعة" value={t.pendingVerifications ?? 0} />
          </div>

          {/* Alerts */}
          {report.alerts?.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-gray-700">تنبيهات مهمة</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {report.alerts.map((a, i) => {
                  const ui = ALERT_UI[a.severity] || ALERT_UI.info;
                  return (
                    <div key={i} className={`flex items-start gap-2.5 rounded-xl border p-3 ${ui.cls}`}>
                      <ui.Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{a.title}</p>
                        <p className="text-xs opacity-90">{a.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Branch performance */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                <Building2 className="h-4 w-4 text-primary" /> أداء الفروع
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-400">
                    <tr>
                      <th className="pb-2 text-start font-semibold">الفرع</th>
                      <th className="pb-2 text-start font-semibold">الإيراد</th>
                      <th className="pb-2 text-start font-semibold">مدفوعات</th>
                      <th className="pb-2 text-start font-semibold">طلاب جدد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {report.branches?.map((b) => (
                      <tr key={b.branchId}>
                        <td className="py-2.5 font-medium text-gray-900">{b.name}</td>
                        <td className="py-2.5 font-semibold text-gray-800">{fmtMoney(b.revenue)}</td>
                        <td className="py-2.5 text-gray-600">{b.paymentsReceived}</td>
                        <td className="py-2.5 text-gray-600">{b.newStudents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Popular courses */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                <BookOpen className="h-4 w-4 text-primary" /> الدورات الأكثر طلباً
              </h2>
              {report.popularCourses?.length ? (
                <ul className="space-y-2">
                  {report.popularCourses.map((c, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{c.name}</p>
                          {c.label && <p className="truncate text-[11px] text-gray-400">{c.label}</p>}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-end">
                        <p className="text-sm font-semibold text-gray-800">{c.count} تسجيل</p>
                        <p className="text-[11px] text-gray-400">{fmtMoney(c.revenue)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-gray-400">لا توجد تسجيلات هذا الأسبوع.</p>
              )}
            </section>
          </div>

          {/* Week-over-week history */}
          {history.length > 1 && (
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-bold text-gray-900">الأسابيع السابقة</h2>
              <div className="flex flex-wrap gap-3">
                {history.map((h) => (
                  <div key={h.id} className="min-w-[120px] flex-1 rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-center">
                    <p className="text-xs text-gray-400">{fmtDate(h.weekStart)}</p>
                    <p className="mt-1 text-sm font-bold text-gray-900">{fmtMoney(h.revenue)}</p>
                    <p className="text-[11px] text-gray-500">{h.newStudents} طالب · {h.paymentsReceived} دفعة</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="text-center text-xs text-gray-400">
            يُحدَّث هذا التقرير تلقائياً كل أسبوع. آخر تحديث: {report.generatedAt ? new Date(report.generatedAt).toLocaleString('en-GB') : '—'}
          </p>
        </>
      )}
    </div>
  );
}
