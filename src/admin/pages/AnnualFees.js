// AnnualFees — the SINGLE SOURCE OF TRUTH for annual fee management.
//
// This page answers "which students have paid their annual fees?" and is also
// where admins RECORD a payment for ANY existing student — self-registered or
// admin-created (see "Add Annual Fee Payment"). The annual fee is a standalone
// financial record linked to a student, never a side effect of account creation.
// Records appear identically regardless of how the account was created.
//
// The list shows ONLY records whose status === 'verified' (paid). Recording is
// done via the centralized backend endpoint (amount from owner config + ledger +
// audit + duplicate prevention per academic year). No approve/reject/delete here —
// financial records are never destroyed from this page.
//
// Branch isolation: reads branches/{selectedBranchId}/annualPayments only;
// getUsersByIds is branch-scoped. Early-return when no branch is selected.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  Wallet, Users, CalendarPlus, TrendingUp, Download,
  Eye, Printer, CreditCard, User, BookOpen, BadgeCheck, Plus,
} from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import { getUsersByIds } from '../../services/firestoreService';
import { exportToCsv, generateFilename } from '../../utils/csvExport';
import { printRecord } from '../../utils/printRecord';
import AdminModal from '../components/AdminModal';
import AddAnnualFeePaymentModal from '../components/AddAnnualFeePaymentModal';
import { useToast } from '../components/ToastNotifications';
import {
  StatCard, PageHeader, SearchInput, EmptyState, ArchiveSkeleton, SELECT_CLASS,
  DATE_RANGES, inDateRange, isThisMonth, fmtDate, fmtDateTime, formatMoney,
} from '../components/archive/ArchiveKit';

const amountOf = (f) => Number(f.amount ?? f.totalAmount ?? 0) || 0;

const PaidBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-700">
    <BadgeCheck className="h-3.5 w-3.5" /> مدفوع
  </span>
);

// ── Detail modal ─────────────────────────────────────────────────────────────────
const DetailModal = ({ fee, onClose, onPrint }) => (
  <AdminModal
    open
    onClose={onClose}
    size="lg"
    icon={CreditCard}
    title="تفاصيل الرسوم السنوية"
    badge={<PaidBadge />}
    footer={(
      <button
        onClick={() => onPrint(fee)}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
      >
        <Printer className="h-4 w-4" /> طباعة الإيصال
      </button>
    )}
  >
    <div className="space-y-5">
      {/* Student */}
      <div className="rounded-xl bg-gray-50 p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800">
          <User className="h-4 w-4 text-primary" /> معلومات الطالب
        </h3>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><span className="text-xs text-gray-500">اسم الطالب</span><p className="font-medium text-gray-900">{fee._name || '—'}</p></div>
          <div><span className="text-xs text-gray-500">هاتف الولي</span><p className="font-medium text-gray-900">{fee.guardianPhone || '—'}</p></div>
          <div><span className="text-xs text-gray-500">هاتف الطالب</span><p className="font-medium text-gray-900">{fee.studentPhone || '—'}</p></div>
          {fee._email && <div><span className="text-xs text-gray-500">البريد الإلكتروني</span><p className="font-medium text-gray-900">{fee._email}</p></div>}
        </div>
      </div>

      {/* Education */}
      <div className="rounded-xl bg-gray-50 p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800">
          <BookOpen className="h-4 w-4 text-primary" /> معلومات الدراسة
        </h3>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><span className="text-xs text-gray-500">المستوى</span><p className="font-medium text-gray-900">{fee.level || '—'}</p></div>
          <div><span className="text-xs text-gray-500">السنة الدراسية</span><p className="font-medium text-gray-900">{fee.year || '—'}</p></div>
          {fee.stream && <div><span className="text-xs text-gray-500">الشعبة</span><p className="font-medium text-gray-900">{fee.stream}</p></div>}
          <div className="sm:col-span-2"><span className="text-xs text-gray-500">المؤسسة التعليمية</span><p className="font-medium text-gray-900">{fee.school || '—'}</p></div>
          {fee.subjects.length > 0 && (
            <div className="sm:col-span-2">
              <span className="text-xs text-gray-500">المواد المختارة</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {fee.subjects.map((s, i) => (
                  <span key={i} className="rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-medium text-secondary-800">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment */}
      <div className="rounded-xl bg-gray-50 p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800">
          <CreditCard className="h-4 w-4 text-primary" /> معلومات الدفع
        </h3>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {fee.baseFee != null && <div><span className="text-xs text-gray-500">الرسوم الأساسية</span><p className="font-medium text-gray-900">{formatMoney(fee.baseFee)}</p></div>}
          <div><span className="text-xs text-gray-500">المبلغ الإجمالي</span><p className="text-base font-semibold text-success-600">{formatMoney(amountOf(fee)) || '0 دج'}</p></div>
          <div><span className="text-xs text-gray-500">طريقة الدفع</span><p className="font-medium text-gray-900">{fee.paymentMethod || '—'}</p></div>
          <div><span className="text-xs text-gray-500">تاريخ الدفع</span><p className="font-medium text-gray-900">{fmtDateTime(fee.createdAt)}</p></div>
        </div>
        {fee.subjectPrices && Object.keys(fee.subjectPrices).length > 0 && (
          <div className="mt-3">
            <span className="text-xs text-gray-500">أسعار المواد</span>
            <div className="mt-1 space-y-0.5">
              {Object.entries(fee.subjectPrices).map(([s, p]) => (
                <div key={s} className="text-xs text-gray-700">{s}: {p} دج/شهر</div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-success-200 bg-success-50 p-4">
        <BadgeCheck className="h-5 w-5 flex-shrink-0 text-success-600" />
        <div>
          <p className="text-sm font-semibold text-success-800">تم تأكيد دفع الرسوم السنوية</p>
          <p className="mt-0.5 text-xs text-success-700">الطالب مفعّل ويمكنه التسجيل في الخدمات.</p>
        </div>
      </div>
    </div>
  </AdminModal>
);

// ── Main component ────────────────────────────────────────────────────────────────
const AnnualFees = () => {
  const { selectedBranchId } = useBranch();
  const { show: showToast } = useToast();

  const [raw, setRaw] = useState([]);
  const [profiles, setProfiles] = useState(new Map());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const [selectedFee, setSelectedFee] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Real-time stream of annual payments (branch-scoped); keep only VERIFIED.
  useEffect(() => {
    if (!selectedBranchId) {
      setRaw([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(
      collection(db, 'branches', selectedBranchId, 'annualPayments'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const verified = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((f) => String(f.status || '').toLowerCase() === 'verified');
      setRaw(verified);
      setLoading(false);
    }, (err) => {
      console.error('Error loading annual payments:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [selectedBranchId]);

  // Resolve student names for records lacking a denormalized name.
  useEffect(() => {
    let mounted = true;
    if (!selectedBranchId || raw.length === 0) { setProfiles(new Map()); return undefined; }
    const ids = [...new Set(raw.map((f) => f.userId).filter(Boolean))];
    if (ids.length === 0) return undefined;
    getUsersByIds(selectedBranchId, ids)
      .then((map) => { if (mounted) setProfiles(new Map(map)); })
      .catch(() => { if (mounted) setProfiles(new Map()); });
    return () => { mounted = false; };
  }, [raw, selectedBranchId]);

  // Normalize + merge profile data.
  const fees = useMemo(() => raw.map((f) => {
    const p = f.userId ? profiles.get(f.userId) : null;
    return {
      id:            f.id,
      userId:        f.userId || '',
      _name:         f.userName || f.studentName || p?.fullName || p?.name || 'طالب غير مسمى',
      _email:        f.userEmail || f.studentEmail || p?.email || '',
      studentPhone:  f.studentPhone || '',
      guardianPhone: f.userPhone || f.guardianPhone || p?.phoneNumber || p?.phone || '',
      level:         f.level || '',
      year:          f.year || '',
      stream:        f.stream || '',
      school:        f.school || '',
      subjects:      Array.isArray(f.subjects) ? f.subjects : [],
      subjectPrices: f.subjectPrices || null,
      amount:        f.amount,
      totalAmount:   f.totalAmount,
      baseFee:       f.annualFee ?? f.baseAnnualFee ?? null,
      paymentMethod: f.paymentMethod || '',
      createdAt:     f.createdAt || null,
    };
  }), [raw, profiles]);

  // ── Stats (accurate — verified only) ────────────────────────────────────────
  const stats = useMemo(() => {
    const collected = fees.reduce((sum, f) => sum + amountOf(f), 0);
    const count = fees.length;
    return {
      collected,
      paid: count,
      thisMonth: fees.filter((f) => isThisMonth(f.createdAt)).length,
      avg: count ? Math.round(collected / count) : 0,
    };
  }, [fees]);

  const levelOptions = useMemo(
    () => [...new Set(fees.map((f) => f.level).filter(Boolean))].sort(),
    [fees]
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return fees.filter((f) => {
      if (levelFilter !== 'all' && f.level !== levelFilter) return false;
      if (!inDateRange(f.createdAt, dateFilter)) return false;
      if (term) {
        const hay = `${f._name} ${f.guardianPhone} ${f.studentPhone} ${f._email} ${f.school}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [fees, search, levelFilter, dateFilter]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handlePrint = (fee) => {
    const ok = printRecord({
      title: 'إيصال دفع — الرسوم السنوية',
      student: fee._name,
      badge: { label: 'مدفوع', tone: 'green' },
      sections: [
        { heading: 'معلومات الطالب', rows: [
          ['اسم الطالب', fee._name],
          ['هاتف الولي', fee.guardianPhone],
          ['هاتف الطالب', fee.studentPhone],
        ]},
        { heading: 'معلومات الدراسة', rows: [
          ['المستوى', fee.level],
          ['السنة الدراسية', fee.year],
          ['الشعبة', fee.stream],
          ['المؤسسة التعليمية', fee.school],
          ['المواد', fee.subjects.join('، ')],
        ]},
        { heading: 'معلومات الدفع', rows: [
          ['الرسوم الأساسية', formatMoney(fee.baseFee)],
          ['المبلغ الإجمالي', formatMoney(amountOf(fee))],
          ['طريقة الدفع', fee.paymentMethod],
          ['تاريخ الدفع', fmtDateTime(fee.createdAt)],
        ]},
      ],
    });
    if (!ok) showToast('warning', 'يرجى السماح بالنوافذ المنبثقة للطباعة.');
  };

  const handleExport = () => {
    if (rows.length === 0) { showToast('warning', 'لا توجد بيانات للتصدير.'); return; }
    const data = rows.map((f) => ({
      studentName: f._name, guardianPhone: f.guardianPhone, level: f.level,
      year: f.year, school: f.school, amount: amountOf(f),
      paymentMethod: f.paymentMethod, createdAt: f.createdAt,
    }));
    exportToCsv(data, [
      { key: 'studentName',   header: 'اسم الطالب' },
      { key: 'guardianPhone', header: 'هاتف الولي' },
      { key: 'level',         header: 'المستوى' },
      { key: 'year',          header: 'السنة الدراسية' },
      { key: 'school',        header: 'المؤسسة' },
      { key: 'amount',        header: 'المبلغ المدفوع' },
      { key: 'paymentMethod', header: 'طريقة الدفع' },
      { key: 'createdAt',     header: 'تاريخ الدفع', type: 'date' },
    ], generateFilename('annual-fees-paid', 'csv'));
  };

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!selectedBranchId) {
    return <div className="p-6 text-center text-gray-500" dir="rtl">يرجى اختيار الفرع لعرض الرسوم السنوية.</div>;
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Overlays */}
      {selectedFee && (
        <DetailModal
          fee={selectedFee}
          onClose={() => setSelectedFee(null)}
          onPrint={handlePrint}
        />
      )}
      {showAddModal && (
        <AddAnnualFeePaymentModal
          branchId={selectedBranchId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => showToast('success', 'تم تسجيل دفعة الرسوم السنوية بنجاح.')}
        />
      )}

      {/* Header */}
      <PageHeader
        title="الرسوم السنوية"
        description="سجّل دفعة الرسوم السنوية لأي طالب وتابع المدفوعات المؤكدة."
      >
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> إضافة دفعة الرسوم السنوية
        </button>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Download className="h-4 w-4" /> تصدير CSV
        </button>
      </PageHeader>

      {loading ? (
        <ArchiveSkeleton statCount={4} cols={6} />
      ) : (
        <>
          {/* Financial stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Wallet}       tone="green"   label="إجمالي المبلغ المحصّل" value={formatMoney(stats.collected) || '0 دج'} />
            <StatCard icon={Users}        tone="primary" label="عدد الطلاب المدفوعين" value={stats.paid} />
            <StatCard icon={CalendarPlus} tone="blue"    label="مدفوعات هذا الشهر" value={stats.thisMonth} />
            <StatCard icon={TrendingUp}   tone="indigo"  label="متوسط الدفعة" value={formatMoney(stats.avg) || '0 دج'} />
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الهاتف أو المؤسسة..." />
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={SELECT_CLASS}>
              <option value="all">جميع المستويات</option>
              {levelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={SELECT_CLASS}>
              {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {/* Content */}
          {rows.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title={fees.length === 0 ? 'لا توجد رسوم مدفوعة بعد' : 'لا توجد نتائج مطابقة'}
              subtitle={fees.length === 0
                ? 'سيظهر هنا الطلاب بعد التحقق من دفع الرسوم السنوية والموافقة عليها.'
                : 'جرّب تعديل البحث أو الفلاتر.'}
            />
          ) : (
            <>
              {/* Desktop table — sticky header */}
              <div className="hidden max-h-[70vh] overflow-auto rounded-2xl border border-gray-100 bg-white shadow-sm sm:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['الطالب', 'المستوى / السنة', 'المؤسسة', 'المبلغ', 'تاريخ الدفع', 'الحالة', 'الإجراءات'].map((h) => (
                        <th key={h} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((f) => (
                      <tr key={f.id} className="transition-colors hover:bg-gray-50/70">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-gray-900">{f._name}</p>
                          {f.guardianPhone && <p className="mt-0.5 text-xs text-gray-400">{f.guardianPhone}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-gray-700">{f.level || '—'}</p>
                          {f.year && <p className="mt-0.5 text-xs text-gray-500">{f.year}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-gray-600">{f.school || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-success-600">{formatMoney(amountOf(f)) || '0 دج'}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs text-gray-500">{fmtDate(f.createdAt)}</td>
                        <td className="px-4 py-3.5"><PaidBadge /></td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setSelectedFee(f)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                              <Eye className="h-3.5 w-3.5" /> عرض
                            </button>
                            <button onClick={() => handlePrint(f)} aria-label="طباعة" title="طباعة" className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-primary">
                              <Printer className="h-4 w-4" />
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
                {rows.map((f) => (
                  <div key={f.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{f._name}</p>
                        <p className="mt-0.5 text-sm text-gray-600">{[f.level, f.year].filter(Boolean).join(' · ') || '—'}</p>
                        {f.school && <p className="mt-0.5 text-xs text-gray-400">{f.school}</p>}
                      </div>
                      <PaidBadge />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="font-semibold text-success-600">{formatMoney(amountOf(f)) || '0 دج'}</span>
                      <span className="text-xs text-gray-400">{fmtDate(f.createdAt)}</span>
                    </div>
                    <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                      <button onClick={() => setSelectedFee(f)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600">
                        <Eye className="h-4 w-4" /> عرض التفاصيل
                      </button>
                      <button onClick={() => handlePrint(f)} className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-gray-500">
                        <Printer className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <p className="px-1 text-xs text-gray-400">عرض {rows.length} من {fees.length} دفعة مؤكدة</p>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default AnnualFees;
