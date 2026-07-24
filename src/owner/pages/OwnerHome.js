import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign, TrendingUp, TrendingDown, Users, UserPlus, AlertTriangle,
  Bell, Building2, LineChart, ChevronLeft, Sparkles, Scale,
} from 'lucide-react';
import { getOwnerSummary, getOwnerAlerts, getOwnerBranches, getOwnerRetention } from '../../services/ownerService';
import { useOwnerFilters } from '../ownerFilters';
import { LoadingState, Alert } from '../../components/ui/feedback';
import AlertsPanel from '../components/AlertsPanel';
import ForecastWidget from '../components/ForecastWidget';
import TrendChart from '../components/TrendChart';

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US')} دج`;
const fmtNum = (n) => Number(n || 0).toLocaleString('ar-EG');

const TONES = {
  primary:   { bg: 'bg-primary-50',   text: 'text-primary-600' },
  secondary: { bg: 'bg-secondary-50', text: 'text-secondary-600' },
  accent:    { bg: 'bg-accent-50',    text: 'text-accent-600' },
  success:   { bg: 'bg-success-50',   text: 'text-success-600' },
  warning:   { bg: 'bg-warning-50',   text: 'text-warning-600' },
  danger:    { bg: 'bg-danger-50',    text: 'text-danger-600' },
};

const Trend = ({ pct }) => {
  if (pct == null) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? 'text-success-600' : 'text-danger-600'}`}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(pct)}%
    </span>
  );
};

// KPI card — becomes a link when `to` is supplied (turns a dead number into a doorway).
const Card = ({ title, value, subtitle, icon: Icon, tone = 'primary', trend, alert, to }) => {
  const t = TONES[tone] || TONES.primary;
  const inner = (
    <div className={`h-full bg-white rounded-xl shadow-md p-5 border-2 transition-all hover:shadow-lg ${alert ? 'border-warning-400' : 'border-gray-100'} ${to ? 'hover:border-primary-200' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${t.bg}`}>
          <Icon className={`h-5 w-5 ${t.text}`} />
        </div>
        {trend !== undefined && <Trend pct={trend} />}
        {alert && <AlertTriangle className="h-5 w-5 text-warning-600" />}
      </div>
      <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${t.text}`}>{value}</p>
      {subtitle && (
        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
          {subtitle}
          {to && <ChevronLeft className="h-3 w-3 text-primary-400" aria-hidden="true" />}
        </p>
      )}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
};

// Section header with an optional "view details" deep link.
const SectionHead = ({ icon: Icon, title, to, linkLabel }) => (
  <div className="mb-3 flex items-center justify-between">
    <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      {title}
    </h2>
    {to && (
      <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-600">
        {linkLabel || 'عرض التفاصيل'}
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Link>
    )}
  </div>
);

// One-line executive verdict — the 10-second answer, in words, above the numbers.
const buildVerdict = ({ trends, alerts, branches }) => {
  const clauses = [];
  const pct = trends?.revenue?.changePct;
  if (pct != null) {
    clauses.push(`الإيرادات ${pct >= 0 ? 'مرتفعة' : 'منخفضة'} ${Math.abs(pct)}% عن الشهر السابق`);
  }
  const urgent = (alerts || []).filter((a) => a.severity === 'critical' || a.severity === 'warning').length;
  clauses.push(urgent > 0 ? `${fmtNum(urgent)} تنبيه يحتاج المتابعة` : 'لا تنبيهات حرجة');

  // Branch needing attention: biggest positive collection gap, else weakest growth.
  if (Array.isArray(branches) && branches.length) {
    const withGap = branches
      .map((b) => ({ b, gap: (b.expectedRevenue || 0) - (b.actualRevenue || 0) }))
      .sort((x, y) => y.gap - x.gap);
    if (withGap[0]?.gap > 0) {
      clauses.push(`فرع ${withGap[0].b.name} يحتاج مراجعة (عجز تحصيل)`);
    } else {
      const weakest = [...branches].sort((a, b) => (a.growthRate || 0) - (b.growthRate || 0))[0];
      if (weakest && (weakest.growthRate || 0) < 0) clauses.push(`فرع ${weakest.name} يتراجع نموّه`);
    }
  }
  return clauses.join(' · ');
};

const BranchStripCard = ({ b }) => {
  const gap = (b.expectedRevenue || 0) - (b.actualRevenue || 0);
  const growthUp = (b.growthRate || 0) >= 0;
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-semibold text-gray-900">
          <Building2 className="h-4 w-4 text-gray-400" />
          {b.name}
        </span>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${growthUp ? 'text-success-600' : 'text-danger-600'}`}>
          {growthUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {b.growthRate}%
        </span>
      </div>
      <p className="text-lg font-bold text-success-600">{fmtMoney(b.revenue)}</p>
      <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {fmtNum(b.activeStudents)} نشط</span>
        <span className={`inline-flex items-center gap-1 ${gap > 0 ? 'text-warning-700' : 'text-gray-400'}`}>
          <Scale className="h-3 w-3" /> عجز {fmtMoney(gap)}
        </span>
      </div>
    </div>
  );
};

const OwnerHome = () => {
  const { month } = useOwnerFilters();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [retention, setRetention] = useState(null);
  const [secondaryLoading, setSecondaryLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getOwnerSummary(month)
      .then((res) => { if (active) setData(res); })
      .catch((e) => { if (active) setError(e.message || 'تعذر تحميل البيانات'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month]);

  // Secondary panels load independently — a failure in any must not blank the page.
  // Reset them on month change so nothing stale renders under the new month's
  // header, and gate the verdict/alerts on a single "loaded" flag (Fix: avoids a
  // transient where the verdict asserts on last month's data or "no alerts").
  useEffect(() => {
    let active = true;
    setSecondaryLoading(true);
    setAlerts([]); setBranches([]); setRetention(null);
    Promise.allSettled([
      getOwnerAlerts({ month }),
      getOwnerBranches(month),
      getOwnerRetention({ month, months: 6 }),
    ]).then(([al, br, rt]) => {
      if (!active) return;
      setAlerts(al.status === 'fulfilled' ? (al.value.alerts || []) : []);
      setBranches(br.status === 'fulfilled' ? (br.value.branches || []) : []);
      setRetention(rt.status === 'fulfilled' ? rt.value : null);
      setSecondaryLoading(false);
    });
    return () => { active = false; };
  }, [month]);

  if (loading) return <LoadingState label="جاري تحميل النظرة العامة..." />;
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!data) return null;

  const c = data.cards;
  const verdict = buildVerdict({ trends: data.trends, alerts, branches });
  const retentionSeries = (retention?.series || []).map((s) => ({ label: s.month.slice(2), bar: s.remaining, line: s.retentionRate }));
  const latestRetention = retention?.series?.length ? retention.series[retention.series.length - 1].retentionRate : null;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1">نظرة تنفيذية</h1>
        <p className="text-gray-600">ملخص الأداء عبر جميع الفروع — {data.month}</p>
      </div>

      {/* Verdict — the answer in one sentence, before any chart. Held until the
          secondary panels load so it never asserts on stale/empty data. */}
      {!secondaryLoading && verdict && (
        <div className="flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm text-primary-900">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-500" aria-hidden="true" />
          <span>{verdict}</span>
        </div>
      )}

      {/* Attention first: alerts guide the owner to problems instead of hunting. */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Bell className="h-5 w-5 text-warning-600" />
            {!secondaryLoading && alerts.length > 0 ? 'تنبيهات تحتاج انتباهك' : 'التنبيهات'}
          </h2>
          {!secondaryLoading && alerts.length > 0 && (
            <Link to="/owner/alerts" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-600">
              كل التنبيهات
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
        {secondaryLoading
          ? <div className="py-8 text-center text-sm text-gray-400">جاري تحميل التنبيهات...</div>
          : <AlertsPanel alerts={alerts} limit={4} />}
      </div>

      {/* Where will the month land? */}
      <ForecastWidget forecast={data.forecast} />

      {/* Core executive KPIs — money and growth only; vanity metrics removed. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card title="إجمالي إيرادات الشهر" value={fmtMoney(c.totalRevenueThisMonth)} icon={DollarSign}
          tone="success" trend={data.trends?.revenue?.changePct}
          subtitle={`الشهر السابق: ${fmtMoney(data.trends?.revenue?.previous)}`} />
        <Card title="طلاب جدد هذا الشهر" value={fmtNum(c.newStudentsThisMonth)} icon={UserPlus} tone="primary"
          trend={data.trends?.newStudents?.changePct}
          subtitle={`الشهر السابق: ${fmtNum(data.trends?.newStudents?.previous)}`} />
        <Card title="الطلاب النشطون" value={fmtNum(c.activeStudents)} icon={Users} tone="secondary" />
        <Card title="طلاب لم يدفعوا" value={fmtNum(c.unpaidStudents)} icon={AlertTriangle}
          tone="warning" alert={c.unpaidStudents > 0} subtitle="الرسوم السنوية · عرض القائمة"
          to="/owner/students" />
      </div>

      {/* Branch comparison — "where do I look?" without a click. */}
      {branches.length > 0 && (
        <div>
          <SectionHead icon={Building2} title="نظرة على الفروع" to="/owner/branches" linkLabel="تحليل الفروع" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {branches.map((b) => <BranchStripCard key={b.branchId} b={b} />)}
          </div>
        </div>
      )}

      {/* Retention trend — a concise trajectory; the detailed tables live in the section. */}
      {retentionSeries.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-5">
          <SectionHead icon={LineChart} title="اتجاه الاحتفاظ والنمو" to="/owner/retention" linkLabel="الاحتفاظ والنمو" />
          <p className="mb-2 text-xs text-gray-500">
            {latestRetention != null && <span className="font-semibold text-primary-700">معدل الاحتفاظ الحالي: {latestRetention}% · </span>}
            الأعمدة = الطلاب النشطون · الخط = معدل الاحتفاظ %
          </p>
          <TrendChart data={retentionSeries} height={170} />
        </div>
      )}
    </div>
  );
};

export default OwnerHome;
