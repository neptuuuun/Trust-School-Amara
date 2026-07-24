// Overview — the branch administrator's daily work console.
//
// WHAT CHANGED AND WHY
// The previous version fired ~21 client-side aggregation queries and headlined
// "المدفوعات المعلقة — تتطلب مراجعة فورية", counting `status == 'pending'` rows
// across languageFormEntries / trainingFormEntries / supportLessonRegistrations /
// annualPayments. That queue described the OLD receipt-upload workflow, where a
// student uploaded a payment proof and an admin approved it. After the Chargily
// migration a registration document is only ever written once money has actually
// been captured, so nothing can sit in "pending verification" — the card counted
// stale legacy rows and sent the admin to /admin/payments-verification, a page
// that no longer exists.
//
// This version asks one question instead: what does this branch admin have to do
// right now? All figures come from GET /api/admin/overview, computed server-side
// against the caller's own branch in a single round-trip.
//
// The four real queues, in priority order:
//   1. مدفوعات عالقة  — the student PAID but could not be seated (full class,
//      duplicate, schedule conflict, support-level ineligibility). Money is held
//      with no service delivered; this is the only item that can lose the school
//      a customer, so it leads.
//   2. وثائق بانتظار المراجعة — the one genuine human approval queue left.
//   3. طلبات الدورات التكوينية — un-triaged custom-training leads.
//   4. اشتراكات دعم تنتهي قريباً — support is billed per calendar month; this is
//      the renewal worklist.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, GraduationCap, AlertTriangle, CreditCard, RefreshCw, Loader2,
  BookOpen, Languages, CheckCircle2, ArrowLeft, Wallet, Clock3, Layers,
  FileText, Hourglass, ShieldCheck,
} from 'lucide-react';
import { useAdminOverview } from '../AdminOverviewContext';
import { formatMoney, fmtDate } from '../components/archive/ArchiveKit';
import { Alert } from '../../components/ui/feedback';

const SERVICE_LABELS = {
  language:  'دورة لغة',
  training:  'دورة تكوينية',
  support:   'درس دعم',
  annualFee: 'رسوم سنوية',
};

// Why a paid order could not be seated, in words an admin can act on.
const FAILURE_REASONS = {
  'class-full':                  'اكتمل العدد في المجموعة',
  'duplicate-registration':      'الطالب مسجَّل بالفعل',
  'schedule-conflict':           'تعارض في التوقيت مع تسجيل آخر',
  'missing-class':               'المجموعة غير محددة',
  'class-not-found':             'المجموعة محذوفة أو غير موجودة',
  'average-required':            'معدل المواد المميزة غير مسجَّل',
  'normal-cannot-join-low-level':'الطالب عادي ولا يمكنه الالتحاق بمجموعة مستوى الدعم',
  'support-must-join-low-level': 'الطالب من مستوى الدعم ويجب توجيهه لمجموعة مخصصة',
};
const reasonLabel = (code) => FAILURE_REASONS[code] || code || 'سبب غير معروف';

// ── Small presentational pieces ───────────────────────────────────────────────

const TONES = {
  danger:  { card: 'border-danger-300 bg-danger-50 hover:bg-danger-100',   chip: 'bg-danger-100 text-danger-700',   icon: 'text-danger-600' },
  warning: { card: 'border-warning-300 bg-warning-50 hover:bg-warning-100', chip: 'bg-warning-100 text-warning-800', icon: 'text-warning-600' },
  accent:  { card: 'border-accent-300 bg-accent-50 hover:bg-accent-100',   chip: 'bg-accent-100 text-accent-700',   icon: 'text-accent-600' },
  neutral: { card: 'border-gray-200 bg-white hover:bg-gray-50',            chip: 'bg-gray-100 text-gray-600',       icon: 'text-gray-400' },
};

/** A queue that needs the admin. Renders muted (neutral) when the count is 0. */
const ActionCard = ({ icon: Icon, title, count, hint, tone, onClick }) => {
  const t = TONES[count > 0 ? tone : 'neutral'];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-start shadow-sm transition-all hover:shadow-md ${t.card}`}
    >
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/70 ${t.icon}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold leading-none text-gray-900">{count}</span>
          <span className="truncate text-sm font-semibold text-gray-800">{title}</span>
        </div>
        <p className="mt-1 text-xs text-gray-600">{hint}</p>
      </div>
      <ArrowLeft className="mt-1 h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
    </button>
  );
};

/** Read-only metric. */
const Metric = ({ icon: Icon, label, value, sub, tone = 'primary' }) => {
  const ring = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    accent:  'bg-accent-50 text-accent-600',
    neutral: 'bg-gray-100 text-gray-500',
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${ring}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl font-bold leading-tight text-gray-900">{value}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{label}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
};

const Panel = ({ icon: Icon, title, action, children }) => (
  <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        {title}
      </h2>
      {action}
    </div>
    {children}
  </section>
);

const SkeletonBlock = ({ className = '' }) => (
  <div className={`animate-pulse rounded-2xl bg-gray-200/70 ${className}`} />
);

// ── Page ──────────────────────────────────────────────────────────────────────

const Overview = () => {
  const navigate = useNavigate();
  // Same snapshot the sidebar badges read — one fetch for the whole dashboard.
  const { data, loading, refreshing, error, refresh } = useAdminOverview();

  if (loading) {
    return (
      <div className="space-y-5" dir="rtl">
        <SkeletonBlock className="h-9 w-56" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-20" />)}
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SkeletonBlock className="h-56" />
          <SkeletonBlock className="h-56" />
        </div>
      </div>
    );
  }

  // No snapshot to render: either the fetch failed outright, or no branch is
  // selected yet (the provider resolves without data in that case).
  if (!data) {
    return (
      <div className="space-y-4" dir="rtl">
        <Alert variant={error ? 'danger' : 'warning'}>
          {error || 'يرجى اختيار الفرع لعرض النظرة العامة.'}
        </Alert>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" /> إعادة المحاولة
        </button>
      </div>
    );
  }

  const { actionRequired, stuckPaymentsList = [], students, revenue, support, catalog, annualFees } = data;
  const nothingPending = actionRequired.total === 0 && support.expiringSoon === 0;

  return (
    <div className="space-y-6" dir="rtl">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">نظرة عامة</h1>
          <p className="mt-1 text-sm text-gray-500">
            ما الذي يحتاج إليك اليوم في هذا الفرع · السنة الدراسية {data.academicYear}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          تحديث
        </button>
      </div>

      {error && <Alert variant="warning">{error}</Alert>}

      {/* ── 1. What needs you ─────────────────────────────────────────────── */}
      {nothingPending ? (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-success-200 bg-success-50 p-5">
          <CheckCircle2 className="h-7 w-7 flex-shrink-0 text-success-600" />
          <div>
            <p className="font-semibold text-success-800">لا يوجد ما ينتظر إجراءً منك</p>
            <p className="mt-0.5 text-sm text-success-700">
              لا توجد وثائق بانتظار المراجعة، ولا مدفوعات عالقة، ولا طلبات معلقة.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ActionCard
            icon={AlertTriangle}
            tone="danger"
            count={actionRequired.stuckPayments}
            title="مدفوعات عالقة"
            hint="دفع الطالب ولم يُسجَّل — يجب معالجتها فوراً"
            onClick={() => navigate('/admin/payment-orders?filter=attention')}
          />
          <ActionCard
            icon={ShieldCheck}
            tone="warning"
            count={actionRequired.documentVerification}
            title="وثائق بانتظار المراجعة"
            hint="طلاب رفعوا وثائقهم وينتظرون القبول أو الرفض"
            onClick={() => navigate('/admin/users')}
          />
          <ActionCard
            icon={FileText}
            tone="accent"
            count={actionRequired.trainingRequests}
            title="طلبات دورات تكوينية"
            hint="طلبات جديدة لم تتم مراجعتها بعد"
            onClick={() => navigate('/admin/training-requests')}
          />
          <ActionCard
            icon={Clock3}
            tone="warning"
            count={support.expiringSoon}
            title="اشتراكات دعم تنتهي قريباً"
            hint="تنتهي خلال 7 أيام — تواصل مع الطالب للتجديد"
            onClick={() => navigate('/admin/support-registered')}
          />
        </div>
      )}

      {/* ── 2. Stuck payments detail (money captured, seat not granted) ────── */}
      {stuckPaymentsList.length > 0 && (
        <Panel
          icon={AlertTriangle}
          title="مدفوعات تحتاج تدخلاً"
          action={(
            <button
              onClick={() => navigate('/admin/payment-orders?filter=attention')}
              className="text-sm font-semibold text-primary hover:underline"
            >
              عرض الكل
            </button>
          )}
        >
          <div className="overflow-hidden rounded-xl border border-danger-100">
            {stuckPaymentsList.map((o) => (
              <div
                key={o.orderId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-danger-100 bg-danger-50/40 px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{o.studentName || o.studentEmail || '—'}</p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    {SERVICE_LABELS[o.serviceType] || o.serviceType} · {reasonLabel(o.reason)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap text-sm font-bold text-danger-700">
                    {formatMoney(o.amount) || '0 دج'}
                  </span>
                  <span className="whitespace-nowrap text-xs text-gray-400">{fmtDate(o.paidAt)}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            هذه الطلبات دُفعت فعلاً عبر Chargily لكن تعذّر إتمام التسجيل. عالجها من صفحة سجل المدفوعات
            (تسجيل الطالب يدوياً في مجموعة مناسبة، أو استرجاع المبلغ) ثم علّمها كمعالَجة.
          </p>
        </Panel>
      )}

      {/* ── 3. Money captured ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          icon={Wallet}
          tone="success"
          label="إيرادات اليوم"
          value={formatMoney(revenue.today) || '0 دج'}
          sub={`${revenue.paidOrdersToday} عملية دفع`}
        />
        <Metric
          icon={CreditCard}
          tone="primary"
          label="إيرادات هذا الشهر"
          value={formatMoney(revenue.month) || '0 دج'}
          sub={`آخر ${revenue.window} طلب دفع`}
        />
        <Metric
          icon={Hourglass}
          tone="neutral"
          label="في انتظار الدفع"
          value={revenue.awaitingPayment}
          sub="بدأ الطالب الدفع ولم يُكمله"
        />
        <Metric
          icon={GraduationCap}
          tone="accent"
          label="رسوم سنوية مدفوعة"
          value={annualFees.paidThisYear}
          sub={data.academicYear}
        />
      </div>

      {/* ── 4. Branch snapshot ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        <Panel icon={Users} title="الطلاب">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{students.total}</p>
              <p className="mt-1 text-xs text-gray-500">الإجمالي</p>
            </div>
            <div className="rounded-xl bg-success-50 p-4 text-center">
              <p className="text-2xl font-bold text-success-700">{students.verified}</p>
              <p className="mt-1 text-xs text-success-700">موثَّق</p>
            </div>
            <div className="rounded-xl bg-warning-50 p-4 text-center">
              <p className="text-2xl font-bold text-warning-700">{students.pendingDocs}</p>
              <p className="mt-1 text-xs text-warning-700">بانتظار المراجعة</p>
            </div>
          </div>
          {students.other > 0 && (
            <p className="mt-3 text-xs text-gray-400">
              {students.other} حساب آخر (مرفوض أو لم يؤكّد بريده الإلكتروني بعد).
            </p>
          )}
          <button
            onClick={() => navigate('/admin/users')}
            className="mt-4 w-full rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            إدارة الطلاب
          </button>
        </Panel>

        <Panel icon={BookOpen} title="دروس الدعم (اشتراكات شهرية)">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-success-50 p-4 text-center">
              <p className="text-2xl font-bold text-success-700">{support.active}</p>
              <p className="mt-1 text-xs text-success-700">نشط</p>
            </div>
            <div className="rounded-xl bg-warning-50 p-4 text-center">
              <p className="text-2xl font-bold text-warning-700">{support.expiringSoon}</p>
              <p className="mt-1 text-xs text-warning-700">ينتهي خلال 7 أيام</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <p className="text-2xl font-bold text-gray-700">{support.expired}</p>
              <p className="mt-1 text-xs text-gray-500">منتهٍ</p>
            </div>
          </div>
          {support.expiringList.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {support.expiringList.slice(0, 4).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-gray-700">
                    {s.studentName || '—'} · {s.subjectName || '—'}
                  </span>
                  <span className="flex-shrink-0 text-gray-400">{fmtDate(s.endDate)}</span>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => navigate('/admin/support-registered')}
            className="mt-4 w-full rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            إدارة اشتراكات الدعم
          </button>
        </Panel>
      </div>

      {/* ── 5. Catalog + capacity ──────────────────────────────────────────── */}
      <Panel icon={Layers} title="البرامج والمجموعات">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric icon={Languages}     tone="primary" label="مواد اللغات"     value={catalog.subjects.language} />
          <Metric icon={BookOpen}      tone="primary" label="مواد الدعم"      value={catalog.subjects.support} />
          <Metric icon={GraduationCap} tone="primary" label="الدورات التكوينية" value={catalog.subjects.training} />
          <Metric icon={Layers}        tone="neutral" label="المجموعات"       value={catalog.classes} sub={`${catalog.seatsFree} مقعد شاغر`} />
          <Metric
            icon={AlertTriangle}
            tone={catalog.classesFull > 0 ? 'warning' : 'neutral'}
            label="مجموعات مكتملة"
            value={catalog.classesFull}
            sub={catalog.classesFull > 0 ? 'لا يمكن التسجيل فيها' : 'يوجد مقاعد في الكل'}
          />
        </div>
      </Panel>
    </div>
  );
};

export default Overview;
