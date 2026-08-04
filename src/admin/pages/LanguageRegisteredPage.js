// LanguageRegisteredPage — the roll of students enrolled in language programs.
//
// There is no approval step to model here: after the Chargily migration a
// languagesRegistered document only exists because money was captured (the
// online webhook, or an admin recording an in-person payment), so every record
// on this page is by construction paid and active. The page therefore reads
// branches/{b}/languagesRegistered and offers management actions only:
// view details, print, delete.
//
// Branch isolation: streamRegisteredLanguages is branchId-scoped; we early-return
// when no branch is selected. No cross-branch data is ever fetched.

import React, { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap, Languages, CalendarPlus, Layers, Download, UserPlus,
  Eye, Printer, Trash2, Phone, BadgeCheck,
} from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import {
  streamRegisteredLanguages,
  adminRemoveLanguageRegistration,
} from '../../services/firestoreService';
import { exportToCsv, generateFilename } from '../../utils/csvExport';
import { printRecord } from '../../utils/printRecord';
import AddEditLanguageModal from '../components/AddEditLanguageModal';
import AdminModal from '../components/AdminModal';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import { useToast } from '../components/ToastNotifications';
import {
  StatCard, PageHeader, SearchInput, EmptyState, ArchiveSkeleton,
  DetailSection, DetailRow, SELECT_CLASS, AcademicYearSelect,
  DATE_RANGES, inDateRange, isThisMonth, fmtDate, fmtDateTime, formatMoney,
} from '../components/archive/ArchiveKit';
import { getAcademicYearLabel } from '../../utils/academicYear';

// Format a schedules[] array into a compact Arabic string for display/CSV.
const formatSchedulesText = (schedules) =>
  (Array.isArray(schedules) ? schedules : [])
    .map((s) => `${s?.day || ''} ${s?.start || ''}${s?.end ? `-${s.end}` : ''}`.trim())
    .filter(Boolean)
    .join('، ');

// ── Normalizer: languagesRegistered document → view model ───────────────────────
const norm = (e) => ({
  id:            e.id,
  studentId:     e.userId || '',
  studentName:   e.studentName || '—',
  studentPhone:  e.studentPhone || '',
  guardianPhone: e.guardianPhone || '',
  studentEmail:  e.studentEmail || e.userEmail || '',
  // New Subject → Class fields (fall back to legacy language/level for old records)
  subjectName:   e.subjectName || e.languageName || '—',
  groupName:     e.groupName || '',
  schedules:     Array.isArray(e.schedules) ? e.schedules : [],
  schedulesText: formatSchedulesText(e.schedules),
  // Legacy fields kept for existing records + filters
  languageName:  e.languageName || e.subjectName || '—',
  levelLabel:    e.levelLabel || '',
  teacherName:   e.teacherName || '',
  languagePrice: e.languagePrice ?? e.price ?? null,
  paymentMethod: e.paymentMethod || '',
  registeredAt:  e.registeredAt || e.verifiedAt || e.createdAt || null,
  verifiedBy:    e.verifiedBy || null,
  notes:         e.notes || e.note || '',
  birthDate:     e.birthDate || null,
  birthPlace:    e.birthPlace || '',
});

const RegisteredBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-700">
    <BadgeCheck className="h-3.5 w-3.5" /> مسجَّل
  </span>
);

// ── Detail drawer ────────────────────────────────────────────────────────────────
const DetailDrawer = ({ entry, onClose, onPrint, onDelete }) => (
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
        <DetailRow label="هاتف الولي" value={entry.guardianPhone} />
        <DetailRow label="البريد الإلكتروني" value={entry.studentEmail} />
        <DetailRow label="مكان الميلاد" value={entry.birthPlace} />
        <DetailRow label="تاريخ الميلاد" value={entry.birthDate ? fmtDate(entry.birthDate) : ''} />
      </DetailSection>

      <DetailSection title="معلومات البرنامج">
        <DetailRow label="اللغة" value={entry.subjectName} />
        {entry.groupName && <DetailRow label="المجموعة" value={entry.groupName} />}
        {entry.levelLabel && <DetailRow label="المستوى" value={entry.levelLabel} />}
        <DetailRow label="الأستاذ" value={entry.teacherName} />
        {entry.schedules?.length > 0 && <DetailRow label="المواعيد" value={entry.schedulesText} />}
        <DetailRow label="السعر" value={formatMoney(entry.languagePrice)} />
        <DetailRow label="طريقة الدفع" value={entry.paymentMethod} />
        <DetailRow label="تاريخ التسجيل" value={fmtDateTime(entry.registeredAt)} />
        <DetailRow label="تمت المعالجة بواسطة" value={entry.verifiedBy?.name} />
      </DetailSection>

      {entry.notes && (
        <DetailSection title="ملاحظات">
          <p className="py-2.5 text-sm text-gray-700">{entry.notes}</p>
        </DetailSection>
      )}
    </div>
  </AdminModal>
);

// ── Main page ─────────────────────────────────────────────────────────────────
const LanguageRegisteredPage = () => {
  const { selectedBranchId } = useBranch();
  const { show: showToast } = useToast();

  const [rawEntries, setRawEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  // Academic-year (history) filter — defaults to the current year; server-side.
  const [academicYear, setAcademicYear] = useState(getAcademicYearLabel());

  const [drawer, setDrawer] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, entry: null });
  const [deleting, setDeleting] = useState(false);

  // Real-time: approved language registrations only (branch-scoped).
  useEffect(() => {
    if (!selectedBranchId) {
      setRawEntries([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const unsub = streamRegisteredLanguages(selectedBranchId, (list) => {
      setRawEntries(list.map(norm));
      setLoading(false);
    }, { academicYear });
    return () => unsub?.();
  }, [selectedBranchId, academicYear]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     rawEntries.length,
    thisMonth: rawEntries.filter((e) => isThisMonth(e.registeredAt)).length,
    languages: new Set(rawEntries.map((e) => e.languageName).filter(Boolean)).size,
    levels:    new Set(rawEntries.map((e) => e.levelLabel).filter(Boolean)).size,
  }), [rawEntries]);

  const langOptions = useMemo(
    () => [...new Set(rawEntries.map((e) => e.languageName).filter(Boolean))].sort(),
    [rawEntries]
  );

  const levelOptions = useMemo(() => {
    if (langFilter === 'all') return [];
    return [...new Set(
      rawEntries.filter((e) => e.languageName === langFilter).map((e) => e.levelLabel).filter(Boolean)
    )].sort();
  }, [rawEntries, langFilter]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rawEntries.filter((e) => {
      if (langFilter !== 'all' && e.languageName !== langFilter) return false;
      if (levelFilter !== 'all' && e.levelLabel !== levelFilter) return false;
      if (!inDateRange(e.registeredAt, dateFilter)) return false;
      if (term) {
        const hay = `${e.studentName} ${e.studentPhone} ${e.studentEmail} ${e.languageName} ${e.levelLabel}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rawEntries, search, langFilter, levelFilter, dateFilter]);

  const handleLangFilter = (v) => { setLangFilter(v); setLevelFilter('all'); };

  // ── Actions ───────────────────────────────────────────────────────────────
  const handlePrint = (entry) => {
    const ok = printRecord({
      title: 'تأكيد تسجيل — برامج اللغات',
      student: entry.studentName,
      badge: { label: 'مسجَّل', tone: 'green' },
      sections: [
        { heading: 'معلومات الطالب', rows: [
          ['الاسم الكامل', entry.studentName],
          ['رقم الهاتف', entry.studentPhone],
          ['هاتف الولي', entry.guardianPhone],
          ['البريد الإلكتروني', entry.studentEmail],
        ]},
        { heading: 'معلومات البرنامج', rows: [
          ['اللغة', entry.subjectName],
          ['المجموعة', entry.groupName],
          ['المستوى', entry.levelLabel],
          ['الأستاذ', entry.teacherName],
          ['المواعيد', entry.schedulesText],
          ['السعر', formatMoney(entry.languagePrice)],
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
      await adminRemoveLanguageRegistration(selectedBranchId, entry.id);
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
      { key: 'subjectName',   header: 'اللغة' },
      { key: 'groupName',     header: 'المجموعة' },
      { key: 'levelLabel',    header: 'المستوى' },
      { key: 'teacherName',   header: 'الأستاذ' },
      { key: 'schedulesText', header: 'المواعيد' },
      { key: 'languagePrice', header: 'السعر' },
      { key: 'registeredAt',  header: 'تاريخ التسجيل', type: 'date' },
    ], generateFilename('language-registered', 'csv'));
  };

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!selectedBranchId) {
    return <div className="p-6 text-center text-gray-500" dir="rtl">يرجى اختيار الفرع لعرض المسجلين في اللغات.</div>;
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
        />
      )}
      {showAddModal && (
        <AddEditLanguageModal
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
        title="المسجلون في اللغات"
        description="عرض وإدارة جميع الطلاب المقبولين والمسجلين في برامج اللغات."
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
        <ArchiveSkeleton statCount={4} cols={5} />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={GraduationCap} tone="primary" label="إجمالي المسجلين" value={stats.total} />
            <StatCard icon={CalendarPlus}  tone="green"   label="المسجلون هذا الشهر" value={stats.thisMonth} />
            <StatCard icon={Languages}     tone="blue"    label="عدد اللغات" value={stats.languages} />
            <StatCard icon={Layers}        tone="indigo"  label="عدد المستويات" value={stats.levels} />
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الهاتف أو البريد..." />
            <AcademicYearSelect value={academicYear} onChange={setAcademicYear} />
            <select value={langFilter} onChange={(e) => handleLangFilter(e.target.value)} className={SELECT_CLASS}>
              <option value="all">جميع اللغات</option>
              {langOptions.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            {langFilter !== 'all' && levelOptions.length > 0 && (
              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={SELECT_CLASS}>
                <option value="all">جميع المستويات</option>
                {levelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={SELECT_CLASS}>
              {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {/* Content */}
          {rows.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title={rawEntries.length === 0 ? 'لا يوجد طلاب مسجلون بعد' : 'لا توجد نتائج مطابقة'}
              subtitle={rawEntries.length === 0
                ? 'سيظهر هنا الطلاب بعد الموافقة على تسجيلاتهم في برامج اللغات.'
                : 'جرّب تعديل البحث أو الفلاتر.'}
            />
          ) : (
            <>
              {/* Desktop table — sticky header */}
              <div className="hidden max-h-[70vh] overflow-auto rounded-2xl border border-gray-100 bg-white shadow-sm sm:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['الطالب', 'اللغة والمستوى', 'الأستاذ', 'تاريخ التسجيل', 'الإجراءات'].map((h) => (
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
                          <p className="font-medium text-gray-700">{e.subjectName}</p>
                          {(e.groupName || e.levelLabel) && (
                            <p className="mt-0.5 text-xs text-gray-500">
                              {[e.groupName, e.levelLabel].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-gray-600">{e.teacherName || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs text-gray-500">{fmtDate(e.registeredAt)}</td>
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
                          {[e.subjectName, e.groupName, e.levelLabel].filter(Boolean).join(' — ')}
                        </p>
                        {e.studentPhone && (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400"><Phone className="h-3.5 w-3.5" />{e.studentPhone}</p>
                        )}
                      </div>
                      <RegisteredBadge />
                    </div>
                    <p className="mt-2 text-xs text-gray-400">سُجّل في {fmtDate(e.registeredAt)}</p>
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

export default LanguageRegisteredPage;
