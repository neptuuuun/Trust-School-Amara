// TrainingRequestsPage — Redesigned Request Management Dashboard
// Data:  branches/{branchId}/registrations  where  type === 'training_request'
// Role:  Inbox of student interest-requests (not paid enrollments).
//        Dedicated approval workflow: pending → completed | rejected

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import {
  Search, BookOpen, AlertCircle, Eye, Check, X, Clock,
  CheckCircle, XCircle, MoreVertical, Loader2, Download,
  User, Mail, Phone, Calendar, MessageSquare, RefreshCw,
} from 'lucide-react';
import { exportToCsv, generateFilename } from '../../utils/csvExport';
import AdminModal from '../components/AdminModal';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import { formatDateTime, formatDayMonth } from '../../utils/dateUtils';
import { Input } from '../../components/ui/input';
import { LoadingState } from '../../components/ui/feedback';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (ts, short = false) => short ? formatDayMonth(ts) : formatDateTime(ts);

const isToday = (ts) => {
  if (!ts) return false;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth()    === now.getMonth()    &&
           d.getDate()     === now.getDate();
  } catch { return false; }
};

const useDebounce = (value, delay) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
};

// ─── Status configuration ─────────────────────────────────────────────────────

const normalizeStatus = (raw) => {
  const s = raw == null ? '' : String(raw).trim().toLowerCase();
  if (!s || s === 'pending') return 'pending';
  if (['reviewed', 'reviewing', 'قيد المراجعة'].includes(s)) return 'reviewing';
  if (['completed', 'مكتمل', 'accepted', 'approved'].includes(s)) return 'completed';
  if (['rejected', 'مرفوض'].includes(s)) return 'rejected';
  return 'pending';
};

const STATUS_CFG = {
  pending:   { label: 'قيد الانتظار', badge: 'bg-warning-50 text-warning-700 border-warning-200'   },
  reviewing: { label: 'قيد المراجعة', badge: 'bg-secondary-50 text-secondary-700 border-secondary-200' },
  completed: { label: 'مكتمل',        badge: 'bg-success-50 text-success-700 border-success-200' },
  rejected:  { label: 'مرفوض',        badge: 'bg-danger-50 text-danger-600 border-danger-200'    },
};

const StatusBadge = ({ status }) => {
  const s = normalizeStatus(status);
  const c = STATUS_CFG[s];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${c.badge}`}>
      {c.label}
    </span>
  );
};

// ─── StatCard ─────────────────────────────────────────────────────────────────

const StatCard = ({ icon, label, value, sub, iconBg, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-start shadow-sm transition-all hover:shadow-md
      ${active ? 'border-primary/40 ring-2 ring-primary/20' : 'border-gray-100'}`}
  >
    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-xl font-bold leading-none text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500 truncate">{label}</p>
      {sub != null && <p className="mt-0.5 text-xs font-medium text-success-600">+{sub} اليوم</p>}
    </div>
  </button>
);

// ─── RowMenu ──────────────────────────────────────────────────────────────────

const RowMenu = ({ status, onMarkReviewing, onReopen }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const normalStatus = normalizeStatus(status);
  const hasItems = normalStatus === 'pending' || normalStatus === 'completed' || normalStatus === 'rejected';
  if (!hasItems) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute end-0 top-8 z-20 min-w-max rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
          {normalStatus === 'pending' && (
            <button
              type="button"
              onClick={() => { onMarkReviewing(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-secondary-600 hover:bg-secondary-50"
            >
              <Eye className="h-3.5 w-3.5" />
              وضع قيد المراجعة
            </button>
          )}
          {(normalStatus === 'completed' || normalStatus === 'rejected') && (
            <button
              type="button"
              onClick={() => { onReopen(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              إعادة فتح الطلب
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── DetailDrawer ─────────────────────────────────────────────────────────────

const DRow = ({ label, value, mono = false }) => (
  <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2.5 last:border-0">
    <span className="shrink-0 text-sm text-gray-500">{label}</span>
    <span className={`text-end text-sm font-semibold text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</span>
  </div>
);

const DetailDrawer = ({ request, onClose, onComplete, onReject, onMarkReviewing, onReopen, busy }) => {
  const status = normalizeStatus(request.status);
  const isPendingOrReviewing = status === 'pending' || status === 'reviewing';

  const footer = isPendingOrReviewing ? (
    <div className="flex w-full flex-col gap-2.5">
      <button
        onClick={onComplete}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-success-600 py-3 text-sm font-semibold text-white hover:bg-success-700 disabled:opacity-60"
      >
        {busy === 'completing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        قبول الطلب
      </button>
      <button
        onClick={onReject}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-danger-200 bg-danger-50 py-3 text-sm font-semibold text-danger-600 hover:bg-danger-100 disabled:opacity-60"
      >
        <X className="h-4 w-4" />
        رفض الطلب
      </button>
      {status === 'pending' && (
        <button
          onClick={onMarkReviewing}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-secondary-200 bg-secondary-50 py-2.5 text-sm font-medium text-secondary-700 hover:bg-secondary-100 disabled:opacity-60"
        >
          <Eye className="h-4 w-4" />
          وضع قيد المراجعة
        </button>
      )}
    </div>
  ) : (
    <button
      onClick={onReopen}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
    >
      <RefreshCw className="h-4 w-4" />
      إعادة فتح الطلب
    </button>
  );

  return (
    <AdminModal
      open
      onClose={onClose}
      size="md"
      title="تفاصيل الطلب"
      badge={<StatusBadge status={request.status} />}
      footer={footer}
    >
      <div className="space-y-5">

          {/* Student */}
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">معلومات الطالب</p>
            <DRow label="الاسم الكامل" value={request.name} />
            <DRow label="البريد الإلكتروني" value={request.email} mono />
            {request.phone && <DRow label="الهاتف" value={request.phone} />}
            {request.userId && <DRow label="معرف الطالب" value={request.userId} mono />}
          </section>

          {/* Request */}
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">تفاصيل الطلب</p>
            <DRow label="نوع الدورة" value={request.course || request.courseName} />
            <DRow label="التاريخ المفضل" value={request.preferredDate} />
            <DRow label="تاريخ الإرسال" value={fmtDate(request.createdAt)} />
            {request.updatedAt && <DRow label="آخر تحديث" value={fmtDate(request.updatedAt)} />}
          </section>

          {/* Notes */}
          {request.message && (
            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">ملاحظات الطالب</p>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
                {request.message}
              </div>
            </section>
          )}

          {/* Rejection reason */}
          {status === 'rejected' && request.rejectionReason && (
            <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
              <p className="mb-1 font-semibold">سبب الرفض:</p>
              <p>{request.rejectionReason}</p>
            </div>
          )}
      </div>
    </AdminModal>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const TrainingRequestsPage = () => {
  const { selectedBranchId } = useBranch();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState('');

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState('');
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [courseFilter,  setCourseFilter]  = useState('all');
  const dSearch = useDebounce(search, 280);

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState(new Set());

  // ── UI state ──────────────────────────────────────────────────────────────
  const [drawer,       setDrawer]       = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy,         setBusy]         = useState({});  // { [id]: 'completing'|'rejecting'|'reviewing'|'reopening' }
  const [bulkBusy,     setBulkBusy]     = useState(false);

  // ── Real-time stream ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedBranchId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadErr('');
    const q = query(
      collection(db, 'branches', selectedBranchId, 'registrations'),
      where('type', '==', 'training_request'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => { setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error(err); setLoadErr('فشل في تحميل الطلبات'); setLoading(false); }
    );
    return () => unsub();
  }, [selectedBranchId]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const pending   = requests.filter((r) => normalizeStatus(r.status) === 'pending').length;
    const reviewing = requests.filter((r) => normalizeStatus(r.status) === 'reviewing').length;
    const completed = requests.filter((r) => normalizeStatus(r.status) === 'completed').length;
    const rejected  = requests.filter((r) => normalizeStatus(r.status) === 'rejected').length;
    // "today" counts: completed or rejected today
    const completedToday = requests.filter(
      (r) => normalizeStatus(r.status) === 'completed' && isToday(r.updatedAt)
    ).length;
    const rejectedToday = requests.filter(
      (r) => normalizeStatus(r.status) === 'rejected' && isToday(r.updatedAt)
    ).length;
    return { pending, reviewing, completed, rejected, completedToday, rejectedToday, total: requests.length };
  }, [requests]);

  const courseOptions = useMemo(
    () => [...new Set(requests.map((r) => r.course || r.courseName).filter(Boolean))].sort(),
    [requests]
  );

  // Sort: pending first, then reviewing, then completed/rejected by date desc
  const sortedRequests = useMemo(() => {
    const order = { pending: 0, reviewing: 1, completed: 2, rejected: 3 };
    return [...requests].sort((a, b) => {
      const oa = order[normalizeStatus(a.status)] ?? 4;
      const ob = order[normalizeStatus(b.status)] ?? 4;
      if (oa !== ob) return oa - ob;
      const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const db_ = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return db_ - da;
    });
  }, [requests]);

  const rows = useMemo(() => {
    const term = dSearch.trim().toLowerCase();
    return sortedRequests.filter((r) => {
      if (statusFilter !== 'all' && normalizeStatus(r.status) !== statusFilter) return false;
      if (courseFilter !== 'all' && (r.course || r.courseName) !== courseFilter) return false;
      if (term) {
        const haystack = `${r.name || ''} ${r.email || ''} ${r.course || ''} ${r.courseName || ''} ${r.phone || ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [sortedRequests, statusFilter, courseFilter, dSearch]);

  // ── Update helper ──────────────────────────────────────────────────────────

  const updateRequest = useCallback(async (id, updates) => {
    const ref = doc(db, 'branches', selectedBranchId, 'registrations', id);
    await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
  }, [selectedBranchId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleComplete = useCallback(async (req) => {
    setBusy((p) => ({ ...p, [req.id]: 'completing' }));
    try {
      await updateRequest(req.id, { status: 'completed' });
      setDrawer((d) => (d?.id === req.id ? null : d));
    } catch (err) {
      setLoadErr('فشل تحديث الحالة: ' + err.message);
    } finally {
      setBusy((p) => { const n = { ...p }; delete n[req.id]; return n; });
    }
  }, [updateRequest]);

  const openReject = (req) => { setRejectReason(''); setRejectTarget(req); };

  const confirmReject = useCallback(async () => {
    if (!rejectTarget) return;
    const req = rejectTarget;
    setRejectTarget(null);
    setBusy((p) => ({ ...p, [req.id]: 'rejecting' }));
    try {
      await updateRequest(req.id, {
        status: 'rejected',
        rejectionReason: rejectReason || '',
      });
      setRejectReason('');
      setDrawer((d) => (d?.id === req.id ? null : d));
    } catch (err) {
      setLoadErr('فشل الرفض: ' + err.message);
    } finally {
      setBusy((p) => { const n = { ...p }; delete n[req.id]; return n; });
    }
  }, [rejectTarget, rejectReason, updateRequest]);

  const handleMarkReviewing = useCallback(async (req) => {
    setBusy((p) => ({ ...p, [req.id]: 'reviewing' }));
    try {
      await updateRequest(req.id, { status: 'reviewing' });
    } catch (err) {
      setLoadErr('فشل تحديث الحالة: ' + err.message);
    } finally {
      setBusy((p) => { const n = { ...p }; delete n[req.id]; return n; });
    }
  }, [updateRequest]);

  const handleReopen = useCallback(async (req) => {
    setBusy((p) => ({ ...p, [req.id]: 'reopening' }));
    try {
      await updateRequest(req.id, { status: 'pending', rejectionReason: '' });
      setDrawer((d) => (d?.id === req.id ? null : d));
    } catch (err) {
      setLoadErr('فشل إعادة فتح الطلب: ' + err.message);
    } finally {
      setBusy((p) => { const n = { ...p }; delete n[req.id]; return n; });
    }
  }, [updateRequest]);

  // ── Bulk operations ────────────────────────────────────────────────────────

  const bulkComplete = async () => {
    setBulkBusy(true);
    const targets = rows.filter(
      (r) => selected.has(r.id) && ['pending', 'reviewing'].includes(normalizeStatus(r.status))
    );
    try {
      await Promise.all(targets.map((r) => updateRequest(r.id, { status: 'completed' })));
    } catch (err) {
      setLoadErr('فشلت بعض العمليات: ' + err.message);
    } finally {
      setBulkBusy(false);
      setSelected(new Set());
    }
  };

  const bulkReject = () => {
    // Open reject modal with null request = bulk mode
    setRejectReason('');
    setRejectTarget({ __bulk: true, ids: [...selected].filter((id) => {
      const req = requests.find((r) => r.id === id);
      return req && ['pending', 'reviewing'].includes(normalizeStatus(req.status));
    }) });
  };

  const confirmBulkReject = useCallback(async () => {
    if (!rejectTarget?.__bulk) return;
    const ids = rejectTarget.ids;
    setRejectTarget(null);
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => updateRequest(id, { status: 'rejected', rejectionReason: rejectReason || '' })));
      setRejectReason('');
    } catch (err) {
      setLoadErr('فشلت بعض العمليات: ' + err.message);
    } finally {
      setBulkBusy(false);
      setSelected(new Set());
    }
  }, [rejectTarget, rejectReason, updateRequest]);

  const exportData = () => {
    const data = selected.size ? rows.filter((r) => selected.has(r.id)) : rows;
    if (!data.length) return;
    exportToCsv(data, [
      { key: 'name',          header: 'الاسم' },
      { key: 'email',         header: 'البريد الإلكتروني' },
      { key: 'course',        header: 'الدورة المطلوبة' },
      { key: 'preferredDate', header: 'التاريخ المفضل' },
      { key: 'status',        header: 'الحالة' },
      { key: 'createdAt',     header: 'تاريخ الإرسال', type: 'date' },
    ], generateFilename('training-requests', 'csv'));
  };

  // ── Selection helpers ──────────────────────────────────────────────────────

  const toggleOne = (id) => setSelected((p) => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const toggleAll = () => setSelected(
    selected.size === rows.length && rows.length > 0 ? new Set() : new Set(rows.map((r) => r.id))
  );

  const actionableSelected = useMemo(
    () => [...selected].filter((id) => {
      const r = requests.find((x) => x.id === id);
      return r && ['pending', 'reviewing'].includes(normalizeStatus(r.status));
    }).length,
    [selected, requests]
  );

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!selectedBranchId) {
    return (
      <div className="flex items-center justify-center py-24 text-center" dir="rtl">
        <div>
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-warning-400" />
          <p className="text-gray-600">يرجى اختيار الفرع أولاً</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5" dir="rtl">

      {/* ── Overlays ──────────────────────────────────────────────────────── */}

      {/* Reject confirmation — single or bulk */}
      <AdminConfirmDialog
        open={!!rejectTarget}
        title="تأكيد الرفض"
        message={
          rejectTarget
            ? (rejectTarget.__bulk
                ? `سيتم رفض ${rejectTarget.ids.length} طلب محدد.`
                : `رفض طلب ${rejectTarget.name || '—'} بخصوص ${rejectTarget.course || rejectTarget.courseName || '—'}`)
            : ''
        }
        confirmLabel="رفض الطلب"
        danger
        withReason
        reasonLabel="سبب الرفض (اختياري — يُسجَّل للمراجعة الداخلية)"
        reasonPlaceholder="أدخل سبب الرفض..."
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onConfirm={rejectTarget?.__bulk ? confirmBulkReject : confirmReject}
        onCancel={() => setRejectTarget(null)}
      />

      {/* Detail Drawer */}
      {drawer && (
        <DetailDrawer
          request={drawer}
          onClose={() => setDrawer(null)}
          onComplete={() => handleComplete(drawer)}
          onReject={() => openReject(drawer)}
          onMarkReviewing={() => handleMarkReviewing(drawer)}
          onReopen={() => handleReopen(drawer)}
          busy={busy[drawer.id]}
        />
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">طلبات الدورات التكوينية</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            صندوق بريد طلبات الاهتمام من الطلاب — {counts.total} طلب إجمالاً
          </p>
        </div>
        <button
          onClick={exportData}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          تصدير
        </button>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}

      {loadErr && (
        <div className="flex items-center gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{loadErr}</span>
          <button onClick={() => setLoadErr('')} className="ms-auto text-danger-500 hover:text-danger-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Stats cards ───────────────────────────────────────────────────── */}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          value={counts.pending} label="قيد الانتظار"
          icon={<Clock className="h-5 w-5 text-warning-600" />} iconBg="bg-warning-50"
          active={statusFilter === 'pending'}
          onClick={() => setStatusFilter((p) => p === 'pending' ? 'all' : 'pending')}
        />
        <StatCard
          value={counts.reviewing} label="قيد المراجعة"
          icon={<Eye className="h-5 w-5 text-secondary-600" />} iconBg="bg-secondary-50"
          active={statusFilter === 'reviewing'}
          onClick={() => setStatusFilter((p) => p === 'reviewing' ? 'all' : 'reviewing')}
        />
        <StatCard
          value={counts.completed} label="مكتملة"
          sub={counts.completedToday || undefined}
          icon={<CheckCircle className="h-5 w-5 text-success-600" />} iconBg="bg-success-50"
          active={statusFilter === 'completed'}
          onClick={() => setStatusFilter((p) => p === 'completed' ? 'all' : 'completed')}
        />
        <StatCard
          value={counts.rejected} label="مرفوضة"
          icon={<XCircle className="h-5 w-5 text-danger-500" />} iconBg="bg-danger-50"
          active={statusFilter === 'rejected'}
          onClick={() => setStatusFilter((p) => p === 'rejected' ? 'all' : 'rejected')}
        />
        <StatCard
          value={counts.total} label="الإجمالي"
          icon={<BookOpen className="h-5 w-5 text-primary" />} iconBg="bg-primary/10"
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
          // spans 2 columns on 2-col mobile grid to center it
        />
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم، البريد، أو نوع الدورة..."
            startIcon={<Search className="h-4 w-4" />}
          />
        </div>
        {courseOptions.length > 0 && (
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">جميع الدورات</option>
            {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* ── Bulk action bar ────────────────────────────────────────────────── */}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium text-primary">
            تم اختيار {selected.size} طلب
          </span>
          <div className="ms-auto flex flex-wrap gap-2">
            {actionableSelected > 0 && (
              <>
                <button
                  onClick={bulkComplete}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-success-700 disabled:opacity-50"
                >
                  {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  قبول ({actionableSelected})
                </button>
                <button
                  onClick={bulkReject}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger-200 bg-danger-50 px-3 py-1.5 text-xs font-semibold text-danger-600 hover:bg-danger-100 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  رفض ({actionableSelected})
                </button>
              </>
            )}
            <button
              onClick={exportData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" />
              تصدير
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────────── */}

      {loading ? (
        <LoadingState />

      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-14 text-center">
          <BookOpen className="mx-auto mb-4 h-12 w-12 text-gray-200" />
          <p className="text-gray-400">
            {search || statusFilter !== 'all' || courseFilter !== 'all'
              ? 'لا توجد طلبات مطابقة للفلتر الحالي.'
              : 'لا توجد طلبات دورات تكوينية حتى الآن.'}
          </p>
        </div>

      ) : (
        <>
          {/* ── Desktop table ──────────────────────────────────────────────── */}
          <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === rows.length && rows.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 accent-primary"
                    />
                  </th>
                  {['الطالب', 'الدورة المطلوبة', 'تاريخ الإرسال', 'الحالة', 'الإجراءات'].map((h) => (
                    <th key={h} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((req) => {
                  const status   = normalizeStatus(req.status);
                  const isBusy   = busy[req.id];
                  const isActionable = status === 'pending' || status === 'reviewing';
                  const isPending = status === 'pending';
                  return (
                    <tr
                      key={req.id}
                      className={`transition-colors hover:bg-gray-50/70
                        ${selected.has(req.id) ? 'bg-primary/5' : ''}
                        ${isPending ? 'border-s-2 border-s-warning-400' : ''}`}
                    >
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(req.id)}
                          onChange={() => toggleOne(req.id)}
                          className="h-4 w-4 rounded border-gray-300 accent-primary"
                        />
                      </td>

                      {/* Student */}
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-gray-900">{req.name || '—'}</p>
                        <p className="mt-0.5 text-xs text-gray-400 truncate max-w-[160px]">{req.email || ''}</p>
                      </td>

                      {/* Course */}
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-700 max-w-[200px] truncate">
                          {req.course || req.courseName || '—'}
                        </p>
                        {req.message && (
                          <p className="mt-0.5 text-xs text-gray-400 line-clamp-1 max-w-[200px]">{req.message}</p>
                        )}
                      </td>

                      {/* Date */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs text-gray-500">
                        {fmtDate(req.createdAt, true)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <StatusBadge status={req.status} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setDrawer(req)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            عرض
                          </button>
                          {isActionable && (
                            <>
                              <button
                                onClick={() => handleComplete(req)}
                                disabled={!!isBusy}
                                className="inline-flex items-center gap-1 rounded-lg bg-success-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-success-700 disabled:opacity-50"
                              >
                                {isBusy === 'completing'
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Check className="h-3.5 w-3.5" />}
                                قبول
                              </button>
                              <button
                                onClick={() => openReject(req)}
                                disabled={!!isBusy}
                                className="inline-flex items-center gap-1 rounded-lg border border-danger-200 bg-danger-50 px-2.5 py-1.5 text-xs font-semibold text-danger-600 hover:bg-danger-100 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                رفض
                              </button>
                            </>
                          )}
                          <RowMenu
                            status={req.status}
                            onMarkReviewing={() => handleMarkReviewing(req)}
                            onReopen={() => handleReopen(req)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Mobile cards ───────────────────────────────────────────────── */}
          <div className="space-y-3 sm:hidden">
            {rows.map((req) => {
              const status      = normalizeStatus(req.status);
              const isBusy      = busy[req.id];
              const isActionable = status === 'pending' || status === 'reviewing';
              const isPending   = status === 'pending';
              return (
                <div
                  key={req.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm
                    ${selected.has(req.id) ? 'border-primary/30' : isPending ? 'border-warning-200' : 'border-gray-100'}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(req.id)}
                      onChange={() => toggleOne(req.id)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900">{req.name || '—'}</p>
                          <p className="mt-0.5 text-sm font-medium text-primary truncate">
                            {req.course || req.courseName || '—'}
                          </p>
                          {req.email && <p className="mt-0.5 text-xs text-gray-400 truncate">{req.email}</p>}
                        </div>
                        <StatusBadge status={req.status} />
                      </div>
                      <p className="mt-2 text-xs text-gray-400">{fmtDate(req.createdAt, true)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                    <button
                      onClick={() => setDrawer(req)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-600"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      عرض
                    </button>
                    {isActionable && (
                      <>
                        <button
                          onClick={() => handleComplete(req)}
                          disabled={!!isBusy}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-success-600 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {isBusy === 'completing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          قبول
                        </button>
                        <button
                          onClick={() => openReject(req)}
                          disabled={!!isBusy}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-danger-200 bg-danger-50 py-2 text-xs font-semibold text-danger-600 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          رفض
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default TrainingRequestsPage;
