// SupportRegisteredPage — the roll of monthly support-lesson subscriptions.
//
// Support is billed per calendar month, so this page is really a subscription
// book: who is active, who lapsed, and who needs renewing. Records are shown
// when their computed status is `active` or `expired`; anything else is a legacy
// row from the deleted receipt-approval workflow (a support registration now
// only exists because money was captured) and is filtered out rather than
// presented as pending work.
//
// Actions are management-only: renew, edit (correct a cycle / amount, writing a
// ledger adjustment), print, delete. There is no verify/reject.
//
// Branch isolation: streamSupportLessonRegistrations filters where branchId == ;
// getUsersByIds is branch-scoped. Early-return when no branch is selected.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, CheckCircle2, Clock3, Layers, Download, UserPlus,
  Eye, Printer, Trash2, RefreshCw, Phone, Loader2, Pencil,
} from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getUsersByIds,
  streamSupportLessonRegistrations,
  adminRenewSupportLessonRegistration,
  adminRemoveSupportLessonRegistration,
} from '../../services/firestoreService';
import { exportToCsv, generateFilename } from '../../utils/csvExport';
import { printRecord } from '../../utils/printRecord';
import { getComputedStatus, getExpiryLabel } from '../../utils/registrationUtils';
import AddSupportStudentModal from '../components/AddSupportStudentModal';
import EditSupportRegistrationModal from '../components/EditSupportRegistrationModal';
import AdminModal from '../components/AdminModal';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import { useToast } from '../components/ToastNotifications';
import {
  StatCard, PageHeader, SearchInput, EmptyState, ArchiveSkeleton,
  DetailSection, DetailRow, SELECT_CLASS,
  fmtDate, fmtDateTime, formatMoney,
} from '../components/archive/ArchiveKit';

const yearOf = (e) => e.studentStudyYear || e.studyYearLabel || e.yearName || e.studyYearId || '';
const subjectOf = (e) => e.subjectName || e.courseName || '';
const groupOf = (e) => e.groupName || '';
const schedulesTextOf = (e) =>
  (Array.isArray(e.schedules) ? e.schedules : [])
    .map((s) => `${s?.day || ''} ${s?.start || ''}${s?.end ? `-${s.end}` : ''}`.trim())
    .filter(Boolean)
    .join('، ');

const SubBadge = ({ status }) => (
  status === 'active' ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-700">
      <CheckCircle2 className="h-3.5 w-3.5" /> نشط
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning-200 bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-700">
      <Clock3 className="h-3.5 w-3.5" /> منتهي
    </span>
  )
);

// ── Detail drawer ────────────────────────────────────────────────────────────────
const DetailDrawer = ({ entry, status, busy, onClose, onRenew, onEdit, onPrint, onDelete }) => (
  <AdminModal
    open
    onClose={onClose}
    size="md"
    title="تفاصيل التسجيل"
    badge={<SubBadge status={status} />}
    footer={(
      <div className="flex w-full gap-2.5">
        <button
          onClick={() => onRenew(entry)}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-secondary-200 bg-secondary-50 py-2.5 text-sm font-semibold text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60"
        >
          {busy === 'renewing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} تجديد
        </button>
        <button
          onClick={() => onEdit(entry)}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
        >
          <Pencil className="h-4 w-4" /> تعديل
        </button>
        <button
          onClick={() => onPrint(entry)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Printer className="h-4 w-4" /> طباعة
        </button>
        <button
          onClick={() => onDelete(entry)}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-danger-200 bg-danger-50 py-2.5 text-sm font-semibold text-danger-600 transition-colors hover:bg-danger-100 disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" /> حذف
        </button>
      </div>
    )}
  >
    <div className="space-y-5">
      <DetailSection title="معلومات الطالب">
        <DetailRow label="الاسم الكامل" value={entry._name} />
        <DetailRow label="رقم الهاتف" value={entry._phone} />
        <DetailRow label="البريد الإلكتروني" value={entry._email} />
      </DetailSection>

      <DetailSection title="معلومات الاشتراك">
        <DetailRow label="المادة" value={subjectOf(entry)} />
        {groupOf(entry) && <DetailRow label="المجموعة" value={groupOf(entry)} />}
        <DetailRow label="المستوى الدراسي" value={yearOf(entry)} />
        <DetailRow label="الأستاذ" value={entry.teacherName} />
        {entry.schedules?.length > 0 && <DetailRow label="المواعيد" value={schedulesTextOf(entry)} />}
        <DetailRow label="السعر الشهري" value={formatMoney(entry.monthlyPrice)} />
        <DetailRow label="الإجمالي" value={formatMoney(entry.totalPrice)} />
        <DetailRow label="المدة (أشهر)" value={entry.durationInMonths} />
        <DetailRow label="تاريخ التسجيل" value={fmtDateTime(entry.createdAt)} />
        <DetailRow label="تاريخ الانتهاء" value={getExpiryLabel(entry)} />
        <DetailRow label="الحالة" value={status === 'active' ? 'نشط' : 'منتهي'} />
      </DetailSection>
    </div>
  </AdminModal>
);

// ── Main page ─────────────────────────────────────────────────────────────────
const SupportRegisteredPage = () => {
  const { selectedBranchId } = useBranch();
  const { user: adminUser } = useAuth();
  const { show: showToast } = useToast();

  const [rawEntries, setRawEntries] = useState([]);
  const [profiles, setProfiles] = useState(new Map());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [drawer, setDrawer] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, type: null, entry: null });
  const [busy, setBusy] = useState({});

  // Real-time stream (branch-scoped). Keep ONLY approved (active/expired) records.
  useEffect(() => {
    if (!selectedBranchId) {
      setRawEntries([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const unsub = streamSupportLessonRegistrations(selectedBranchId, (list) => {
      const approved = list.filter((e) => ['active', 'expired'].includes(getComputedStatus(e)));
      approved.sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const db_ = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return db_ - da;
      });
      setRawEntries(approved);
      setLoading(false);
    });
    return () => unsub?.();
  }, [selectedBranchId]);

  // Resolve student profiles for any registrations lacking a denormalized name.
  useEffect(() => {
    let mounted = true;
    if (!selectedBranchId || rawEntries.length === 0) { setProfiles(new Map()); return undefined; }
    const ids = [...new Set(rawEntries.map((e) => e.userId).filter(Boolean))];
    if (ids.length === 0) return undefined;
    getUsersByIds(selectedBranchId, ids)
      .then((map) => { if (mounted) setProfiles(new Map(map)); })
      .catch(() => { if (mounted) setProfiles(new Map()); });
    return () => { mounted = false; };
  }, [rawEntries, selectedBranchId]);

  // Merge profile data + computed fields onto each entry.
  const entries = useMemo(() => rawEntries.map((e) => {
    const p = e.userId ? profiles.get(e.userId) : null;
    return {
      ...e,
      _name:  e.studentName?.trim() || p?.fullName || p?.name || 'طالب غير مسمى',
      _phone: e.studentPhone || p?.phoneNumber || p?.phone || '',
      _email: e.studentEmail || e.userEmail || p?.email || '',
      _status: getComputedStatus(e),
    };
  }), [rawEntries, profiles]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:    entries.length,
    active:   entries.filter((e) => e._status === 'active').length,
    expired:  entries.filter((e) => e._status === 'expired').length,
    subjects: new Set(entries.map(subjectOf).filter(Boolean)).size,
  }), [entries]);

  const yearOptions = useMemo(
    () => [...new Set(entries.map(yearOf).filter(Boolean))].sort(),
    [entries]
  );

  const subjectOptions = useMemo(() => {
    if (yearFilter === 'all') return [];
    return [...new Set(entries.filter((e) => yearOf(e) === yearFilter).map(subjectOf).filter(Boolean))].sort();
  }, [entries, yearFilter]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (yearFilter !== 'all' && yearOf(e) !== yearFilter) return false;
      if (subjectFilter !== 'all' && subjectOf(e) !== subjectFilter) return false;
      if (statusFilter !== 'all' && e._status !== statusFilter) return false;
      if (term) {
        const hay = `${e._name} ${e._phone} ${e._email} ${subjectOf(e)} ${yearOf(e)}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [entries, search, yearFilter, subjectFilter, statusFilter]);

  const handleYearFilter = (v) => { setYearFilter(v); setSubjectFilter('all'); };

  // ── Actions ───────────────────────────────────────────────────────────────
  const askRenew = (entry) => setConfirm({ open: true, type: 'renew', entry });
  const askDelete = (entry) => setConfirm({ open: true, type: 'delete', entry });

  const runConfirm = useCallback(async () => {
    const { type, entry } = confirm;
    if (!entry) return;
    setConfirm({ open: false, type: null, entry: null });
    setBusy((p) => ({ ...p, [entry.id]: type === 'renew' ? 'renewing' : 'deleting' }));
    try {
      if (type === 'renew') {
        await adminRenewSupportLessonRegistration(entry.id, { uid: adminUser?.uid ?? null });
        showToast('success', 'تم تجديد الاشتراك بنجاح');
      } else {
        await adminRemoveSupportLessonRegistration(entry.id);
        showToast('info', 'تم حذف التسجيل');
        setDrawer((d) => (d?.id === entry.id ? null : d));
      }
    } catch (err) {
      showToast('error', (type === 'renew' ? 'فشل التجديد: ' : 'فشل الحذف: ') + (err.message || ''));
    } finally {
      setBusy((p) => { const n = { ...p }; delete n[entry.id]; return n; });
    }
  }, [confirm, adminUser, showToast]);

  const handlePrint = (entry) => {
    const ok = printRecord({
      title: 'تأكيد تسجيل — دروس الدعم',
      student: entry._name,
      badge: entry._status === 'active' ? { label: 'نشط', tone: 'green' } : { label: 'منتهي', tone: 'amber' },
      sections: [
        { heading: 'معلومات الطالب', rows: [
          ['الاسم الكامل', entry._name],
          ['رقم الهاتف', entry._phone],
          ['البريد الإلكتروني', entry._email],
        ]},
        { heading: 'معلومات الاشتراك', rows: [
          ['المادة', subjectOf(entry)],
          ['المجموعة', groupOf(entry)],
          ['المستوى الدراسي', yearOf(entry)],
          ['الأستاذ', entry.teacherName],
          ['المواعيد', schedulesTextOf(entry)],
          ['السعر الشهري', formatMoney(entry.monthlyPrice)],
          ['الإجمالي', formatMoney(entry.totalPrice)],
          ['المدة (أشهر)', entry.durationInMonths],
          ['تاريخ التسجيل', fmtDateTime(entry.createdAt)],
          ['تاريخ الانتهاء', getExpiryLabel(entry)],
        ]},
      ],
    });
    if (!ok) showToast('warning', 'يرجى السماح بالنوافذ المنبثقة للطباعة.');
  };

  const handleExport = () => {
    if (rows.length === 0) { showToast('warning', 'لا توجد بيانات للتصدير.'); return; }
    const data = rows.map((e) => ({
      studentName: e._name, studentPhone: e._phone, studentEmail: e._email,
      subject: subjectOf(e), group: groupOf(e), schedules: schedulesTextOf(e), year: yearOf(e), teacherName: e.teacherName || '',
      status: e._status === 'active' ? 'نشط' : 'منتهي',
      monthlyPrice: e.monthlyPrice ?? '', totalPrice: e.totalPrice ?? '',
      createdAt: e.createdAt, expiry: getExpiryLabel(e) || '',
    }));
    exportToCsv(data, [
      { key: 'studentName',  header: 'اسم الطالب' },
      { key: 'studentPhone', header: 'الهاتف' },
      { key: 'studentEmail', header: 'البريد الإلكتروني' },
      { key: 'subject',      header: 'المادة' },
      { key: 'group',        header: 'المجموعة' },
      { key: 'schedules',    header: 'المواعيد' },
      { key: 'year',         header: 'المستوى الدراسي' },
      { key: 'teacherName',  header: 'الأستاذ' },
      { key: 'status',       header: 'الحالة' },
      { key: 'totalPrice',   header: 'الإجمالي' },
      { key: 'createdAt',    header: 'تاريخ التسجيل', type: 'date' },
      { key: 'expiry',       header: 'تاريخ الانتهاء' },
    ], generateFilename('support-registered', 'csv'));
  };

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!selectedBranchId) {
    return <div className="p-6 text-center text-gray-500" dir="rtl">يرجى اختيار الفرع لعرض المسجلين في دروس الدعم.</div>;
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Overlays */}
      {drawer && (
        <DetailDrawer
          entry={drawer}
          status={drawer._status}
          busy={busy[drawer.id]}
          onClose={() => setDrawer(null)}
          onRenew={askRenew}
          onEdit={(e) => { setDrawer(null); setEditEntry(e); }}
          onPrint={handlePrint}
          onDelete={askDelete}
        />
      )}
      {showAddModal && (
        <AddSupportStudentModal
          branchId={selectedBranchId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => setShowAddModal(false)}
        />
      )}
      {editEntry && (
        <EditSupportRegistrationModal
          registration={editEntry}
          onClose={() => setEditEntry(null)}
          onSuccess={() => showToast('success', 'تم حفظ التعديلات')}
        />
      )}
      <AdminConfirmDialog
        open={confirm.open}
        title={confirm.type === 'renew' ? 'تجديد الاشتراك' : 'حذف التسجيل'}
        message={confirm.type === 'renew'
          ? `هل تريد تجديد اشتراك "${confirm.entry?._name || ''}"؟`
          : `هل أنت متأكد من حذف تسجيل "${confirm.entry?._name || ''}"؟ لا يمكن التراجع.`}
        confirmLabel={confirm.type === 'renew' ? 'تجديد' : 'حذف'}
        danger={confirm.type === 'delete'}
        onConfirm={runConfirm}
        onCancel={() => setConfirm({ open: false, type: null, entry: null })}
      />

      {/* Header */}
      <PageHeader
        title="المسجلون في دروس الدعم"
        description="عرض وإدارة الطلاب المسجلين في دروس الدعم بعد الموافقة على طلباتهم."
      >
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Download className="h-4 w-4" /> تصدير CSV
        </button>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          <UserPlus className="h-4 w-4" /> إضافة طالب
        </button>
      </PageHeader>

      {loading ? (
        <ArchiveSkeleton statCount={4} cols={6} />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={BookOpen}     tone="primary" label="إجمالي المسجلين" value={stats.total} />
            <StatCard icon={CheckCircle2} tone="green"   label="اشتراكات نشطة" value={stats.active} />
            <StatCard icon={Clock3}       tone="amber"   label="اشتراكات منتهية" value={stats.expired} />
            <StatCard icon={Layers}       tone="indigo"  label="عدد المواد" value={stats.subjects} />
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الهاتف أو المادة..." />
            <select value={yearFilter} onChange={(e) => handleYearFilter(e.target.value)} className={SELECT_CLASS}>
              <option value="all">جميع المستويات الدراسية</option>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {yearFilter !== 'all' && subjectOptions.length > 0 && (
              <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className={SELECT_CLASS}>
                <option value="all">جميع المواد</option>
                {subjectOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={SELECT_CLASS}>
              <option value="all">جميع الحالات</option>
              <option value="active">نشط</option>
              <option value="expired">منتهي</option>
            </select>
          </div>

          {/* Content */}
          {rows.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={entries.length === 0 ? 'لا يوجد طلاب مسجلون بعد' : 'لا توجد نتائج مطابقة'}
              subtitle={entries.length === 0
                ? 'سيظهر هنا الطلاب بعد الموافقة على طلبات تسجيلهم في دروس الدعم.'
                : 'جرّب تعديل البحث أو الفلاتر.'}
            />
          ) : (
            <>
              {/* Desktop table — sticky header */}
              <div className="hidden max-h-[70vh] overflow-auto rounded-2xl border border-gray-100 bg-white shadow-sm sm:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['الطالب', 'المادة', 'المستوى الدراسي', 'تاريخ الانتهاء', 'الحالة', 'الإجراءات'].map((h) => (
                        <th key={h} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((e) => {
                      const b = busy[e.id];
                      return (
                        <tr key={e.id} className="transition-colors hover:bg-gray-50/70">
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-gray-900">{e._name}</p>
                            {e._phone && <p className="mt-0.5 text-xs text-gray-400">{e._phone}</p>}
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-medium text-gray-700">{subjectOf(e) || '—'}</p>
                            {groupOf(e) && <p className="mt-0.5 text-xs text-gray-500">{groupOf(e)}</p>}
                          </td>
                          <td className="px-4 py-3.5 text-gray-600">{yearOf(e) || '—'}</td>
                          <td className={`whitespace-nowrap px-4 py-3.5 text-xs ${e._status === 'expired' ? 'font-semibold text-danger-600' : 'text-gray-500'}`}>
                            {getExpiryLabel(e) || '—'}
                          </td>
                          <td className="px-4 py-3.5"><SubBadge status={e._status} /></td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => setDrawer(e)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                                <Eye className="h-3.5 w-3.5" /> عرض
                              </button>
                              <button onClick={() => askRenew(e)} disabled={!!b} aria-label="تجديد" title="تجديد" className="inline-flex items-center justify-center rounded-lg border border-secondary-200 bg-secondary-50 p-1.5 text-secondary-600 transition-colors hover:bg-secondary-100 disabled:opacity-60">
                                {b === 'renewing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                              </button>
                              <button onClick={() => setEditEntry(e)} aria-label="تعديل" title="تعديل" className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-primary">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={() => handlePrint(e)} aria-label="طباعة" title="طباعة" className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-primary">
                                <Printer className="h-4 w-4" />
                              </button>
                              <button onClick={() => askDelete(e)} disabled={!!b} aria-label="حذف" title="حذف" className="inline-flex items-center justify-center rounded-lg border border-danger-200 p-1.5 text-danger-500 transition-colors hover:bg-danger-50 disabled:opacity-60">
                                {b === 'deleting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </button>
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
                {rows.map((e) => {
                  const b = busy[e.id];
                  return (
                    <div key={e.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900">{e._name}</p>
                          <p className="mt-0.5 text-sm font-medium text-primary">{[subjectOf(e) || '—', groupOf(e)].filter(Boolean).join(' — ')}</p>
                          {e._phone && (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400"><Phone className="h-3.5 w-3.5" />{e._phone}</p>
                          )}
                        </div>
                        <SubBadge status={e._status} />
                      </div>
                      <p className="mt-2 text-xs text-gray-400">
                        {yearOf(e) ? `${yearOf(e)} · ` : ''}ينتهي في {getExpiryLabel(e) || '—'}
                      </p>
                      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-gray-100 pt-3">
                        <button onClick={() => setDrawer(e)} className="inline-flex items-center justify-center gap-1 rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-600">
                          <Eye className="h-3.5 w-3.5" /> عرض
                        </button>
                        <button onClick={() => askRenew(e)} disabled={!!b} className="inline-flex items-center justify-center rounded-xl border border-secondary-200 bg-secondary-50 py-2 text-secondary-600 disabled:opacity-60">
                          {b === 'renewing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </button>
                        <button onClick={() => handlePrint(e)} className="inline-flex items-center justify-center rounded-xl border border-gray-200 py-2 text-gray-500">
                          <Printer className="h-4 w-4" />
                        </button>
                        <button onClick={() => askDelete(e)} disabled={!!b} className="inline-flex items-center justify-center rounded-xl border border-danger-200 bg-danger-50 py-2 text-danger-600 disabled:opacity-60">
                          {b === 'deleting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="px-1 text-xs text-gray-400">عرض {rows.length} من {entries.length} تسجيل</p>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default SupportRegisteredPage;
