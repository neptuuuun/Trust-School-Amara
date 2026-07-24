// PaymentOrdersPage — the branch's payment log AND the recovery desk for
// payments that took money but failed to enrol the student.
//
// WHAT CHANGED AND WHY
//  1. The stat cards were computed from `orders`, which the server had ALREADY
//     narrowed by the selected status filter and truncated to a page. Picking
//     "مدفوع" therefore made "في انتظار الدفع" read 0, and "إجمالي الإيرادات"
//     silently meant "revenue within the last N rows". Headline numbers now come
//     from a server-side `summary` computed over the whole branch, independent of
//     the filter, and the money figure is explicitly labelled as the window it
//     covers.
//  2. "نقداً" was structurally always zero: the admin manual-enrolment paths wrote
//     a registration + ledger entry but never a paymentOrder, so a page that
//     advertised "Chargily Pay + نقداً" could only ever show Chargily. The backend
//     now writes a cash receipt for every admin-side enrolment
//     (services/paymentOrderLog.js), so this page is finally the complete log.
//     `physical` is also mapped — older support records use that spelling.
//  3. Paid-but-unseated orders were invisible. chargilyController flags them
//     `needsAttention: true` with the failure reason when the student paid but
//     could not be seated (full class, duplicate, schedule conflict, ineligible
//     support level). Nothing ever surfaced them, so the money sat unnoticed.
//     They now get a dedicated filter, a persistent banner, a readable reason,
//     and a "تمت المعالجة" action that clears the alert with an audit entry.
//  4. Added a row detail modal (the table could not show serviceData, order id,
//     Chargily ids, or who recorded a cash payment) and CSV export.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CreditCard, RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Banknote,
  AlertTriangle, Download, Eye, Wallet, Hourglass, ShieldCheck,
} from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import { getPaymentOrders, resolveStuckPaymentOrder } from '../../services/adminOpsService';
import { exportToCsv, generateFilename } from '../../utils/csvExport';
import AdminModal from '../components/AdminModal';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import { useToast } from '../components/ToastNotifications';
import {
  StatCard, PageHeader, SearchInput, EmptyState, ArchiveSkeleton,
  DetailSection, DetailRow, SELECT_CLASS, formatMoney, fmtDate, fmtDateTime,
} from '../components/archive/ArchiveKit';

// ─── Vocabulary ───────────────────────────────────────────────────────────────

const SERVICE_LABELS = {
  language:  'دورة لغة',
  training:  'دورة تكوينية',
  support:   'درس دعم',
  annualFee: 'رسوم سنوية',
};

const STATUS_CONFIG = {
  pending_payment: { label: 'في انتظار الدفع', icon: Clock,        badge: 'bg-gray-100 text-gray-700' },
  paid:            { label: 'مدفوع',           icon: CheckCircle2, badge: 'bg-success-50 text-success-700 border border-success-200' },
  failed:          { label: 'فشل الدفع',       icon: XCircle,      badge: 'bg-danger-50 text-danger-600 border border-danger-200' },
  cancelled:       { label: 'ملغى',            icon: XCircle,      badge: 'bg-danger-50 text-danger-600 border border-danger-200' },
};

const METHOD_CONFIG = {
  chargily: { label: 'Chargily Pay', icon: CreditCard },
  cash:     { label: 'نقداً (بالمركز)', icon: Banknote },
  // Support registrations created by an admin before the unified receipt existed
  // stamped `physical`; treat it as the same channel so nothing reads as unknown.
  physical: { label: 'نقداً (بالمركز)', icon: Banknote },
};

// Why a paid order could not be seated, in words an admin can act on.
const FAILURE_REASONS = {
  'class-full':                   'اكتمل العدد في المجموعة',
  'duplicate-registration':       'الطالب مسجَّل بالفعل في هذه الخدمة',
  'schedule-conflict':            'تعارض في التوقيت مع تسجيل آخر للطالب',
  'missing-class':                'لم تُحدَّد المجموعة في الطلب',
  'class-not-found':              'المجموعة محذوفة أو غير موجودة',
  'average-required':             'معدل المواد المميزة غير مسجَّل للطالب',
  'invalid-average':              'معدل المواد المميزة غير صالح',
  'normal-cannot-join-low-level': 'الطالب عادي ولا يمكنه الالتحاق بمجموعة مستوى الدعم',
  'support-must-join-low-level':  'الطالب من مستوى الدعم ويجب توجيهه لمجموعة مخصصة',
};
const reasonLabel = (code) => FAILURE_REASONS[code] || code || 'سبب غير معروف';

const FILTERS = [
  { value: 'attention',       label: 'تحتاج تدخلاً' },
  { value: 'all',             label: 'الكل' },
  { value: 'paid',            label: 'مدفوع' },
  { value: 'pending_payment', label: 'في انتظار الدفع' },
  { value: 'failed',          label: 'فشل الدفع' },
];

const TYPE_OPTIONS = [
  { value: 'all',       label: 'كل الخدمات' },
  { value: 'language',  label: 'دورة لغة' },
  { value: 'training',  label: 'دورة تكوينية' },
  { value: 'support',   label: 'درس دعم' },
  { value: 'annualFee', label: 'رسوم سنوية' },
];

const METHOD_OPTIONS = [
  { value: 'all',      label: 'كل طرق الدفع' },
  { value: 'chargily', label: 'Chargily Pay' },
  { value: 'cash',     label: 'نقداً (بالمركز)' },
];

const serviceNameOf = (o) =>
  o.serviceData?.serviceName || o.serviceData?.subjectName || o.serviceData?.trainingName || '';

const isCash = (o) => o.paymentMethod === 'cash' || o.paymentMethod === 'physical';

// ─── Pieces ───────────────────────────────────────────────────────────────────

const StatusBadge = ({ order }) => {
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending_payment;
  const Icon = cfg.icon;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.badge}`}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </span>
      {order.needsAttention && (
        <span className="inline-flex items-center gap-1 rounded-full border border-danger-200 bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-700">
          <AlertTriangle className="h-3 w-3" />
          لم يُسجَّل
        </span>
      )}
    </div>
  );
};

const DetailModal = ({ order, onClose, onResolve, resolving }) => {
  const MethodIcon = METHOD_CONFIG[order.paymentMethod]?.icon || CreditCard;
  return (
    <AdminModal
      open
      onClose={onClose}
      size="lg"
      icon={CreditCard}
      title="تفاصيل عملية الدفع"
      badge={<StatusBadge order={order} />}
      footer={order.needsAttention ? (
        <button
          onClick={() => onResolve(order)}
          disabled={resolving}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          تمّت المعالجة
        </button>
      ) : null}
    >
      <div className="space-y-5">
        {order.needsAttention && (
          <div className="rounded-xl border border-danger-200 bg-danger-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger-800">
              <AlertTriangle className="h-4 w-4" /> دفع الطالب ولم يكتمل التسجيل
            </p>
            <p className="mt-1.5 text-sm text-danger-700">السبب: {reasonLabel(order.registrationError)}</p>
            <p className="mt-2 text-xs text-danger-700">
              سجّل الطالب يدوياً في مجموعة مناسبة من صفحة الخدمة، أو استرجع المبلغ، ثم اضغط «تمّت المعالجة».
            </p>
          </div>
        )}

        <DetailSection title="الطالب">
          <DetailRow label="الاسم" value={order.studentName} />
          <DetailRow label="البريد الإلكتروني" value={order.studentEmail} />
        </DetailSection>

        <DetailSection title="الخدمة">
          <DetailRow label="النوع" value={SERVICE_LABELS[order.serviceType] || order.serviceType} />
          <DetailRow label="الاسم" value={serviceNameOf(order)} />
          <DetailRow label="المجموعة" value={order.serviceData?.groupName} />
          <DetailRow label="رقم التسجيل الناتج" value={order.registrationId} />
        </DetailSection>

        <DetailSection title="الدفع">
          <DetailRow label="المبلغ" value={formatMoney(order.amount) || '0 دج'} />
          <DetailRow
            label="طريقة الدفع"
            value={(
              <span className="inline-flex items-center gap-1.5">
                <MethodIcon className="h-4 w-4" />
                {METHOD_CONFIG[order.paymentMethod]?.label || order.paymentMethod || '—'}
              </span>
            )}
          />
          <DetailRow label="تاريخ الإنشاء" value={fmtDateTime(order.createdAt)} />
          <DetailRow label="تاريخ الدفع" value={fmtDateTime(order.paidAt)} />
          <DetailRow label="رقم الطلب" value={order.orderId} />
          <DetailRow label="Chargily checkout" value={order.chargilyCheckoutId} />
          <DetailRow label="Chargily payment" value={order.chargilyPaymentId} />
          <DetailRow label="سُجّل بواسطة" value={order.recordedBy?.email} />
          <DetailRow label="عولجت بواسطة" value={order.resolvedBy?.email} />
          <DetailRow label="ملاحظة المعالجة" value={order.resolutionNote} />
        </DetailSection>
      </div>
    </AdminModal>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaymentOrdersPage() {
  const { selectedBranchId } = useBranch();
  const { show: showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // Deep-link from the Overview action card: /admin/payment-orders?filter=attention
  const initialFilter = new URLSearchParams(location.search).get('filter') === 'attention'
    ? 'attention'
    : 'all';

  const [orders,  setOrders]  = useState([]);
  const [summary, setSummary] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState(initialFilter);
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');

  const [detail,  setDetail]  = useState(null);
  const [confirm, setConfirm] = useState({ open: false, order: null });
  const [resolveNote, setResolveNote] = useState('');
  const [resolvingId, setResolvingId] = useState(null);

  const fetchOrders = useCallback(async () => {
    if (!selectedBranchId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getPaymentOrders({
        needsAttention: statusFilter === 'attention',
        status: statusFilter,
      });
      setOrders(data.orders || []);
      setSummary(data.summary || null);
      setTruncated(Boolean(data.truncated));
    } catch (err) {
      setError(err.message || 'فشل في تحميل سجل المدفوعات.');
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Keep the URL honest so the view is shareable/refresh-safe.
  useEffect(() => {
    const want = statusFilter === 'attention' ? '?filter=attention' : '';
    if (location.search !== want) {
      navigate({ pathname: '/admin/payment-orders', search: want }, { replace: true });
    }
    // location.search is intentionally the only extra dep — navigate is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (typeFilter !== 'all' && o.serviceType !== typeFilter) return false;
      if (methodFilter === 'chargily' && o.paymentMethod !== 'chargily') return false;
      if (methodFilter === 'cash' && !isCash(o)) return false;
      if (!q) return true;
      return (
        (o.studentName  || '').toLowerCase().includes(q) ||
        (o.studentEmail || '').toLowerCase().includes(q) ||
        (o.orderId      || '').toLowerCase().includes(q) ||
        serviceNameOf(o).toLowerCase().includes(q)
      );
    });
  }, [orders, search, typeFilter, methodFilter]);

  // Money is summed over the LOADED window only — the server summary counts
  // orders, not amounts. The label says so rather than implying all-time revenue.
  const windowRevenue = useMemo(
    () => orders.filter((o) => o.status === 'paid').reduce((s, o) => s + (Number(o.amount) || 0), 0),
    [orders]
  );

  const attentionCount = summary?.needsAttention ?? orders.filter((o) => o.needsAttention).length;

  const askResolve = (order) => setConfirm({ open: true, order });

  const doResolve = async () => {
    const order = confirm.order;
    const note = resolveNote;
    setConfirm({ open: false, order: null });
    setResolveNote('');
    if (!order) return;
    setResolvingId(order.orderId);
    try {
      await resolveStuckPaymentOrder(order.orderId, note);
      setOrders((prev) => prev.map((o) =>
        o.orderId === order.orderId ? { ...o, needsAttention: false, resolutionNote: note || null } : o));
      setSummary((s) => (s ? { ...s, needsAttention: Math.max(0, s.needsAttention - 1) } : s));
      setDetail((d) => (d?.orderId === order.orderId ? { ...d, needsAttention: false, resolutionNote: note || null } : d));
      showToast('success', 'تم إغلاق التنبيه لهذا الطلب.');
      // The attention view must drop the row it no longer matches.
      if (statusFilter === 'attention') fetchOrders();
    } catch (err) {
      showToast('error', 'تعذّر إغلاق التنبيه: ' + (err.message || ''));
    } finally {
      setResolvingId(null);
    }
  };

  const handleExport = () => {
    if (rows.length === 0) { showToast('warning', 'لا توجد بيانات للتصدير.'); return; }
    const data = rows.map((o) => ({
      studentName:  o.studentName || '',
      studentEmail: o.studentEmail || '',
      serviceType:  SERVICE_LABELS[o.serviceType] || o.serviceType || '',
      serviceName:  serviceNameOf(o),
      amount:       Number(o.amount) || 0,
      method:       METHOD_CONFIG[o.paymentMethod]?.label || o.paymentMethod || '',
      status:       STATUS_CONFIG[o.status]?.label || o.status || '',
      issue:        o.needsAttention ? reasonLabel(o.registrationError) : '',
      createdAt:    o.createdAt,
    }));
    exportToCsv(data, [
      { key: 'studentName',  header: 'اسم الطالب' },
      { key: 'studentEmail', header: 'البريد الإلكتروني' },
      { key: 'serviceType',  header: 'نوع الخدمة' },
      { key: 'serviceName',  header: 'الخدمة' },
      { key: 'amount',       header: 'المبلغ' },
      { key: 'method',       header: 'طريقة الدفع' },
      { key: 'status',       header: 'الحالة' },
      { key: 'issue',        header: 'مشكلة التسجيل' },
      { key: 'createdAt',    header: 'التاريخ', type: 'date' },
    ], generateFilename('payment-orders', 'csv'));
  };

  if (!selectedBranchId) {
    return <div className="p-6 text-center text-gray-500" dir="rtl">يرجى اختيار الفرع لعرض سجل المدفوعات.</div>;
  }

  return (
    <div className="space-y-5" dir="rtl">
      {detail && (
        <DetailModal
          order={detail}
          onClose={() => setDetail(null)}
          onResolve={askResolve}
          resolving={resolvingId === detail.orderId}
        />
      )}
      <AdminConfirmDialog
        open={confirm.open}
        danger={false}
        title="تأكيد معالجة الطلب"
        message={`سيتم إغلاق تنبيه الطلب الخاص بـ "${confirm.order?.studentName || ''}". تأكّد أولاً من تسجيل الطالب يدوياً أو استرجاع المبلغ — هذا الإجراء لا يعيد المال ولا يغيّر السجل المالي.`}
        confirmLabel="تمّت المعالجة"
        withReason
        reasonLabel="ماذا فعلت؟ (يُحفظ في سجل التدقيق)"
        reasonPlaceholder="مثال: سُجّل الطالب يدوياً في المجموعة ب / تم استرجاع المبلغ نقداً"
        reason={resolveNote}
        onReasonChange={setResolveNote}
        loading={Boolean(resolvingId)}
        onConfirm={doResolve}
        onCancel={() => { setConfirm({ open: false, order: null }); setResolveNote(''); }}
      />

      <PageHeader
        title="سجل المدفوعات"
        description="كل عمليات الدفع في هذا الفرع — عبر Chargily Pay أو نقداً بالمركز — ومعالجة المدفوعات التي لم يكتمل تسجيلها."
      >
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Download className="h-4 w-4" /> تصدير CSV
        </button>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          تحديث
        </button>
      </PageHeader>

      {error && <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error}</div>}

      {/* Paid-but-unseated banner — persistent until the queue is empty. */}
      {attentionCount > 0 && statusFilter !== 'attention' && (
        <button
          onClick={() => setStatusFilter('attention')}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-danger-300 bg-danger-50 p-4 text-start transition-colors hover:bg-danger-100"
        >
          <AlertTriangle className="h-6 w-6 flex-shrink-0 text-danger-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-danger-800">
              {attentionCount} عملية دفع تحتاج تدخلاً
            </p>
            <p className="mt-0.5 text-sm text-danger-700">
              دفع الطالب لكن لم يكتمل تسجيله. اضغط للعرض والمعالجة.
            </p>
          </div>
        </button>
      )}

      {loading && orders.length === 0 ? (
        <ArchiveSkeleton statCount={4} cols={6} />
      ) : (
        <>
          {/* Branch-wide counts — independent of the active filter. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={CheckCircle2}  tone="green"   label="عمليات دفع ناجحة" value={summary?.paid ?? '—'} />
            <StatCard icon={Hourglass}     tone="gray"    label="في انتظار الدفع"   value={summary?.pending ?? '—'} />
            <StatCard icon={AlertTriangle} tone={attentionCount > 0 ? 'red' : 'gray'} label="تحتاج تدخلاً" value={attentionCount} />
            <StatCard icon={XCircle}       tone="amber"   label="فشل الدفع"         value={summary?.failed ?? '—'} />
          </div>

          {/* Money in the loaded window — explicitly scoped, never presented as all-time. */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/10 bg-primary/5 p-4">
            <Wallet className="h-6 w-6 flex-shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-xs text-primary/70">
                إجمالي المحصّل ضمن {orders.length} طلب معروض{truncated ? ' (وصلت للحد الأقصى — ضيّق الفلتر لرؤية المزيد)' : ''}
              </p>
              <p className="text-2xl font-bold text-primary">{formatMoney(windowRevenue) || '0 دج'}</p>
            </div>
            <p className="ms-auto max-w-xs text-xs text-gray-500">
              الإيرادات الرسمية الكاملة تُحتسب من السجل المالي في لوحة المالك، لا من هذه الصفحة.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const isAttention = f.value === 'attention';
              if (isAttention && attentionCount === 0 && statusFilter !== 'attention') return null;
              const active = statusFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    active
                      ? isAttention ? 'bg-danger-600 text-white shadow-sm' : 'bg-primary text-white shadow-sm'
                      : isAttention ? 'border border-danger-200 bg-danger-50 text-danger-700 hover:bg-danger-100'
                                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                  {isAttention && (
                    <span className={`ms-1.5 rounded-full px-1.5 py-0.5 text-xs ${active ? 'bg-white/20' : 'bg-danger-100 text-danger-700'}`}>
                      {attentionCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو البريد أو رقم الطلب..." />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={SELECT_CLASS}>
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className={SELECT_CLASS}>
              {METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Content */}
          {rows.length === 0 ? (
            <EmptyState
              icon={statusFilter === 'attention' ? ShieldCheck : CreditCard}
              title={statusFilter === 'attention'
                ? 'لا توجد مدفوعات تحتاج تدخلاً'
                : orders.length === 0 ? 'لا توجد عمليات دفع' : 'لا توجد نتائج مطابقة'}
              subtitle={statusFilter === 'attention'
                ? 'كل عملية دفع تم تحويلها إلى تسجيل بنجاح.'
                : orders.length === 0
                  ? 'ستظهر هنا كل عمليات الدفع عبر Chargily والمدفوعات النقدية المسجَّلة في المركز.'
                  : 'جرّب تعديل البحث أو الفلاتر.'}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden max-h-[70vh] overflow-auto rounded-2xl border border-gray-100 bg-white shadow-sm sm:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['الطالب', 'الخدمة', 'المبلغ', 'طريقة الدفع', 'الحالة', 'التاريخ', ''].map((h, i) => (
                        <th key={i} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((o) => {
                      const MethodIcon = METHOD_CONFIG[o.paymentMethod]?.icon || CreditCard;
                      return (
                        <tr
                          key={o.orderId}
                          className={`transition-colors hover:bg-gray-50/70 ${o.needsAttention ? 'bg-danger-50/40' : ''}`}
                        >
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-gray-900">{o.studentName || '—'}</p>
                            {o.studentEmail && <p className="mt-0.5 text-xs text-gray-400">{o.studentEmail}</p>}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                              {SERVICE_LABELS[o.serviceType] || o.serviceType || '—'}
                            </span>
                            {serviceNameOf(o) && <p className="mt-0.5 text-xs text-gray-500">{serviceNameOf(o)}</p>}
                            {o.needsAttention && (
                              <p className="mt-1 text-xs font-medium text-danger-700">{reasonLabel(o.registrationError)}</p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-gray-900">
                            {formatMoney(o.amount) || '0 دج'}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="flex items-center gap-1.5 whitespace-nowrap text-gray-600">
                              <MethodIcon className="h-4 w-4 flex-shrink-0" />
                              {METHOD_CONFIG[o.paymentMethod]?.label || o.paymentMethod || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5"><StatusBadge order={o} /></td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-xs text-gray-500">{fmtDate(o.createdAt)}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setDetail(o)}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                              >
                                <Eye className="h-3.5 w-3.5" /> عرض
                              </button>
                              {o.needsAttention && (
                                <button
                                  onClick={() => askResolve(o)}
                                  disabled={resolvingId === o.orderId}
                                  className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
                                >
                                  {resolvingId === o.orderId
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <ShieldCheck className="h-3.5 w-3.5" />}
                                  تمّت المعالجة
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 sm:hidden">
                {rows.map((o) => (
                  <div
                    key={o.orderId}
                    className={`rounded-2xl border bg-white p-4 shadow-sm ${o.needsAttention ? 'border-danger-200' : 'border-gray-100'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">{o.studentName || '—'}</p>
                        <p className="mt-0.5 text-sm text-primary">
                          {[SERVICE_LABELS[o.serviceType] || o.serviceType, serviceNameOf(o)].filter(Boolean).join(' — ')}
                        </p>
                      </div>
                      <StatusBadge order={o} />
                    </div>
                    {o.needsAttention && (
                      <p className="mt-2 rounded-lg bg-danger-50 px-2.5 py-1.5 text-xs font-medium text-danger-700">
                        {reasonLabel(o.registrationError)}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="font-semibold text-gray-900">{formatMoney(o.amount) || '0 دج'}</span>
                      <span className="text-xs text-gray-400">{fmtDate(o.createdAt)}</span>
                    </div>
                    <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                      <button
                        onClick={() => setDetail(o)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600"
                      >
                        <Eye className="h-4 w-4" /> عرض
                      </button>
                      {o.needsAttention && (
                        <button
                          onClick={() => askResolve(o)}
                          disabled={resolvingId === o.orderId}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {resolvingId === o.orderId
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <ShieldCheck className="h-4 w-4" />}
                          تمّت المعالجة
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="px-1 text-xs text-gray-400">عرض {rows.length} من {orders.length} طلب دفع</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
