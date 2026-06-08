// TrainingRegisteredPage — ARCHIVE of approved training-course registrations.
//
// Answers "who is already registered in training courses?" — a management/archive
// view, NOT a verification queue. Approval (verify/reject) lives on the Payments
// Verification page. This page reads ONLY approved records
// (branches/{b}/trainingsRegistered) and offers view / print / delete.
//
// Branch isolation: streamRegisteredTrainings is branchId-scoped; early-return
// when no branch is selected.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase, CalendarPlus, Layers, Wallet, Download, UserPlus,
  Eye, Printer, Trash2, Phone, BadgeCheck,
} from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import {
  streamRegisteredTrainings,
  adminRemoveTrainingRegistration,
} from '../../services/firestoreService';
import { exportToCsv, generateFilename } from '../../utils/csvExport';
import { printRecord } from '../../utils/printRecord';
import AddEditTrainingModal from '../components/AddEditTrainingModal';
import AdminModal from '../components/AdminModal';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import FileViewerModal from '../components/FileViewerModal';
import { useToast } from '../components/ToastNotifications';
import {
  StatCard, PageHeader, SearchInput, EmptyState, ArchiveSkeleton,
  DetailSection, DetailRow, SELECT_CLASS,
  DATE_RANGES, inDateRange, isThisMonth, fmtDate, fmtDateTime, formatMoney,
} from '../components/archive/ArchiveKit';

// Format a schedules[] array into a compact Arabic string for display/CSV.
const formatSchedulesText = (schedules) =>
  (Array.isArray(schedules) ? schedules : [])
    .map((s) => `${s?.day || ''} ${s?.start || ''}${s?.end ? `-${s.end}` : ''}`.trim())
    .filter(Boolean)
    .join('، ');

// ── Normalizer: trainingsRegistered document → view model ───────────────────────
const norm = (e) => ({
  id:            e.id,
  studentId:     e.userId || '',
  studentName:   e.studentName || '—',
  studentPhone:  e.studentPhone || '',
  studentEmail:  e.studentEmail || e.userEmail || '',
  trainingTitle: e.trainingTitle || e.subjectName || e.trainingName || '—',
  // New Subject → Class fields (fall back gracefully for legacy records)
  groupName:     e.groupName || '',
  schedules:     Array.isArray(e.schedules) ? e.schedules : [],
  schedulesText: formatSchedulesText(e.schedules),
  trainingPrice: e.trainingPrice ?? e.price ?? null,
  paymentMethod: e.paymentMethod || '',
  paymentProof:  e.paymentProof || e.receiptUrl || '',
  registeredAt:  e.registeredAt || e.verifiedAt || e.createdAt || null,
  verifiedBy:    e.verifiedBy || null,
  notes:         e.notes || e.note || '',
});

const RegisteredBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-700">
    <BadgeCheck className="h-3.5 w-3.5" /> مسجَّل
  </span>
);

// ── Detail drawer ────────────────────────────────────────────────────────────────
const DetailDrawer = ({ entry, onClose, onPrint, onDelete, onViewImage }) => (
  <AdminModal
    open
    onClose={onClose}
    size="md"
    title="تفاصيل التسجيل"
    badge={<RegisteredBadge />}
    footer={(
      <div className="flex w-full gap-2.5">
        <button
          onClick={() => onPrint(entry)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Printer className="h-4 w-4" /> طباعة
        </button>
        <button
          onClick={() => onDelete(entry)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-danger-200 bg-danger-50 py-2.5 text-sm font-semibold text-danger-600 transition-colors hover:bg-danger-100"
        >
          <Trash2 className="h-4 w-4" /> حذف
        </button>
      </div>
    )}
  >
    <div className="space-y-5">
      <DetailSection title="معلومات الطالب">
        <DetailRow label="الاسم الكامل" value={entry.studentName} />
        <DetailRow label="رقم الهاتف" value={entry.studentPhone} />
        <DetailRow label="البريد الإلكتروني" value={entry.studentEmail} />
      </DetailSection>

      <DetailSection title="معلومات الدورة">
        <DetailRow label="الدورة" value={entry.trainingTitle} />
        {entry.groupName && <DetailRow label="المجموعة" value={entry.groupName} />}
        {entry.schedules?.length > 0 && <DetailRow label="المواعيد" value={entry.schedulesText} />}
        <DetailRow label="السعر" value={formatMoney(entry.trainingPrice)} />
        <DetailRow label="طريقة الدفع" value={entry.paymentMethod} />
        <DetailRow label="تاريخ التسجيل" value={fmtDateTime(entry.registeredAt)} />
        <DetailRow label="تمت المعالجة بواسطة" value={entry.verifiedBy?.name} />
      </DetailSection>

      {entry.notes && (
        <DetailSection title="ملاحظات">
          <p className="py-2.5 text-sm text-gray-700">{entry.notes}</p>
        </DetailSection>
      )}

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">إيصال الدفع</p>
        {entry.paymentProof ? (
          <button
            type="button"
            onClick={() => onViewImage(entry.paymentProof)}
            className="group relative block w-full overflow-hidden rounded-xl border border-gray-200"
          >
            <img src={entry.paymentProof} alt="إيصال الدفع" className="max-h-52 w-full object-contain transition-opacity group-hover:opacity-90" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
              <Eye className="h-8 w-8 text-white opacity-0 drop-shadow-lg transition-opacity group-hover:opacity-100" />
            </span>
          </button>
        ) : (
          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-sm italic text-gray-400">لا يوجد إيصال مرفق</p>
        )}
      </section>
    </div>
  </AdminModal>
);

// ── Main page ─────────────────────────────────────────────────────────────────
const TrainingRegisteredPage = () => {
  const { selectedBranchId } = useBranch();
  const { show: showToast } = useToast();

  const [rawEntries, setRawEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [trainingFilter, setTrainingFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const [drawer, setDrawer] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, entry: null });
  const [deleting, setDeleting] = useState(false);

  // Real-time: approved training registrations only (branch-scoped).
  useEffect(() => {
    if (!selectedBranchId) {
      setRawEntries([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const unsub = streamRegisteredTrainings(selectedBranchId, (list) => {
      setRawEntries(list.map(norm));
      setLoading(false);
    });
    return () => unsub?.();
  }, [selectedBranchId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     rawEntries.length,
    thisMonth: rawEntries.filter((e) => isThisMonth(e.registeredAt)).length,
    courses:   new Set(rawEntries.map((e) => e.trainingTitle).filter(Boolean)).size,
    revenue:   rawEntries.reduce((sum, e) => sum + (Number(e.trainingPrice) || 0), 0),
  }), [rawEntries]);

  const trainingOptions = useMemo(
    () => [...new Set(rawEntries.map((e) => e.trainingTitle).filter(Boolean))].sort(),
    [rawEntries]
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rawEntries.filter((e) => {
      if (trainingFilter !== 'all' && e.trainingTitle !== trainingFilter) return false;
      if (!inDateRange(e.registeredAt, dateFilter)) return false;
      if (term) {
        const hay = `${e.studentName} ${e.studentPhone} ${e.studentEmail} ${e.trainingTitle}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rawEntries, search, trainingFilter, dateFilter]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handlePrint = (entry) => {
    const ok = printRecord({
      title: 'تأكيد تسجيل — الدورات التكوينية',
      student: entry.studentName,
      badge: { label: 'مسجَّل', tone: 'green' },
      sections: [
        { heading: 'معلومات الطالب', rows: [
          ['الاسم الكامل', entry.studentName],
          ['رقم الهاتف', entry.studentPhone],
          ['البريد الإلكتروني', entry.studentEmail],
        ]},
        { heading: 'معلومات الدورة', rows: [
          ['الدورة', entry.trainingTitle],
          ['المجموعة', entry.groupName],
          ['المواعيد', entry.schedulesText],
          ['السعر', formatMoney(entry.trainingPrice)],
          ['طريقة الدفع', entry.paymentMethod],
          ['تاريخ التسجيل', fmtDateTime(entry.registeredAt)],
        ]},
      ],
    });
    if (!ok) showToast('warning', 'يرجى السماح بالنوافذ المنبثقة للطباعة.');
  };

  const askDelete = (entry) => setDeleteConfirm({ open: true, entry });

  const confirmDelete = async () => {
    const { entry } = deleteConfirm;
    if (!entry) return;
    setDeleting(true);
    try {
      await adminRemoveTrainingRegistration(selectedBranchId, entry.id);
      showToast('info', 'تم حذف التسجيل');
      setDeleteConfirm({ open: false, entry: null });
      setDrawer((d) => (d?.id === entry.id ? null : d));
    } catch (err) {
      showToast('error', 'فشل الحذف: ' + (err.message || ''));
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    if (rows.length === 0) { showToast('warning', 'لا توجد بيانات للتصدير.'); return; }
    exportToCsv(rows, [
      { key: 'studentName',   header: 'اسم الطالب' },
      { key: 'studentPhone',  header: 'الهاتف' },
      { key: 'studentEmail',  header: 'البريد الإلكتروني' },
      { key: 'trainingTitle', header: 'الدورة' },
      { key: 'groupName',     header: 'المجموعة' },
      { key: 'schedulesText', header: 'المواعيد' },
      { key: 'trainingPrice', header: 'السعر' },
      { key: 'registeredAt',  header: 'تاريخ التسجيل', type: 'date' },
    ], generateFilename('training-registered', 'csv'));
  };

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!selectedBranchId) {
    return <div className="p-6 text-center text-gray-500" dir="rtl">يرجى اختيار الفرع لعرض المسجلين في الدورات التكوينية.</div>;
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Overlays */}
      {drawer && (
        <DetailDrawer
          entry={drawer}
          onClose={() => setDrawer(null)}
          onPrint={handlePrint}
          onDelete={askDelete}
          onViewImage={setLightbox}
        />
      )}
      <FileViewerModal url={lightbox} onClose={() => setLightbox(null)} />
      {showAddModal && (
        <AddEditTrainingModal
          branchId={selectedBranchId}
          registration={null}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => setShowAddModal(false)}
        />
      )}
      <AdminConfirmDialog
        open={deleteConfirm.open}
        title="حذف التسجيل"
        message={`هل أنت متأكد من حذف تسجيل "${deleteConfirm.entry?.studentName || ''}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, entry: null })}
      />

      {/* Header */}
      <PageHeader
        title="المسجلون في الدورات التكوينية"
        description="عرض وإدارة جميع الطلاب المقبولين في الدورات التكوينية."
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
          <UserPlus className="h-4 w-4" /> تسجيل يدوي
        </button>
      </PageHeader>

      {loading ? (
        <ArchiveSkeleton statCount={4} cols={4} />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Briefcase}    tone="primary" label="إجمالي المسجلين" value={stats.total} />
            <StatCard icon={CalendarPlus} tone="green"   label="المسجلون هذا الشهر" value={stats.thisMonth} />
            <StatCard icon={Layers}       tone="indigo"  label="عدد الدورات" value={stats.courses} />
            <StatCard icon={Wallet}       tone="blue"    label="إجمالي القيمة" value={formatMoney(stats.revenue) || '0 دج'} />
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الهاتف أو الدورة..." />
            <select value={trainingFilter} onChange={(e) => setTrainingFilter(e.target.value)} className={SELECT_CLASS}>
              <option value="all">جميع الدورات</option>
              {trainingOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={SELECT_CLASS}>
              {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {/* Content */}
          {rows.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title={rawEntries.length === 0 ? 'لا يوجد طلاب مسجلون بعد' : 'لا توجد نتائج مطابقة'}
              subtitle={rawEntries.length === 0
                ? 'سيظهر هنا الطلاب بعد الموافقة على تسجيلاتهم في الدورات التكوينية.'
                : 'جرّب تعديل البحث أو الفلاتر.'}
            />
          ) : (
            <>
              {/* Desktop table — sticky header */}
              <div className="hidden max-h-[70vh] overflow-auto rounded-2xl border border-gray-100 bg-white shadow-sm sm:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['الطالب', 'الدورة', 'تاريخ التسجيل', 'السعر', 'الإجراءات'].map((h) => (
                        <th key={h} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((e) => (
                      <tr key={e.id} className="transition-colors hover:bg-gray-50/70">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-gray-900">{e.studentName}</p>
                          {e.studentPhone && <p className="mt-0.5 text-xs text-gray-400">{e.studentPhone}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-gray-700">{e.trainingTitle}</p>
                          {e.groupName && <p className="mt-0.5 text-xs text-gray-500">{e.groupName}</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs text-gray-500">{fmtDate(e.registeredAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-gray-700">{formatMoney(e.trainingPrice) || '—'}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setDrawer(e)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                              <Eye className="h-3.5 w-3.5" /> عرض
                            </button>
                            <button onClick={() => handlePrint(e)} aria-label="طباعة" title="طباعة" className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-primary">
                              <Printer className="h-4 w-4" />
                            </button>
                            <button onClick={() => askDelete(e)} aria-label="حذف" title="حذف" className="inline-flex items-center justify-center rounded-lg border border-danger-200 p-1.5 text-danger-500 transition-colors hover:bg-danger-50">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 sm:hidden">
                {rows.map((e) => (
                  <div key={e.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{e.studentName}</p>
                        <p className="mt-0.5 text-sm font-medium text-primary">
                          {[e.trainingTitle, e.groupName].filter(Boolean).join(' — ')}
                        </p>
                        {e.studentPhone && (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400"><Phone className="h-3.5 w-3.5" />{e.studentPhone}</p>
                        )}
                      </div>
                      <RegisteredBadge />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-gray-400">سُجّل في {fmtDate(e.registeredAt)}</span>
                      {formatMoney(e.trainingPrice) && <span className="font-semibold text-gray-600">{formatMoney(e.trainingPrice)}</span>}
                    </div>
                    <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                      <button onClick={() => setDrawer(e)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-600">
                        <Eye className="h-3.5 w-3.5" /> عرض
                      </button>
                      <button onClick={() => handlePrint(e)} className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-gray-500">
                        <Printer className="h-4 w-4" />
                      </button>
                      <button onClick={() => askDelete(e)} className="inline-flex items-center justify-center rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-danger-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <p className="px-1 text-xs text-gray-400">عرض {rows.length} من {rawEntries.length} تسجيل</p>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default TrainingRegisteredPage;
