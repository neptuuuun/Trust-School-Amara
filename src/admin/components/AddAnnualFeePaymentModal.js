import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Wallet, Loader2, Search, User, Phone, School, AlertCircle, CheckCircle, BadgeCheck,
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { getUsersByBranch } from '../../services/userService';
import { getAnnualFeeAmount, recordAnnualFeePayment } from '../../services/firestoreService';
import { isAnnualPaymentForCurrentYear, getCurrentAcademicYear } from '../../utils/registrationUtils';
import AdminModal from './AdminModal';

// Grade levels (same vocabulary as Create Student). The financial academic-year
// LABEL (e.g. 2025-2026) is derived automatically — this picks the student's grade
// so support-lesson eligibility keeps working after the fee is recorded.
const ACADEMIC_YEARS = [
  { id: 'mid1', label: 'أولى متوسط' },
  { id: 'mid2', label: 'ثانية متوسط' },
  { id: 'mid3', label: 'ثالثة متوسط' },
  { id: 'mid4', label: 'رابعة متوسط' },
  { id: 'sec1', label: 'أولى ثانوي' },
  { id: 'sec2', label: 'ثانية ثانوي' },
  { id: 'sec3', label: 'ثالثة ثانوي' },
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US')} دج`;

/**
 * Record a STANDALONE annual fee payment for ANY existing student (self-registered
 * or admin-created). The annual fee is a payment obligation of the student — not a
 * property of how the account was created. Amount is owner-configured (read-only).
 */
const AddAnnualFeePaymentModal = ({ branchId, onClose, onSuccess }) => {
  // Student search (portaled combobox — mirrors AddSupportStudentModal).
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState(null);
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const optionRefs = useRef([]);

  // Selected-student info.
  const [studentName, setStudentName] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentSchool, setStudentSchool] = useState('');
  const [studyYear, setStudyYear] = useState('');
  // The level already saved on the profile is reused as-is; the selector only
  // appears when the admin explicitly chooses to change it (or none is saved).
  const [editLevel, setEditLevel] = useState(false);

  // Duplicate guard (mirrors the server check for instant feedback).
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState(false);

  // Owner-configured amount (read-only) + payment metadata.
  const [annualFeeAmount, setAnnualFeeAmount] = useState(null);
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISO());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const academicYearLabel = useMemo(() => getCurrentAcademicYear().label, []);

  // Load the branch students + the configured fee once.
  useEffect(() => {
    if (!branchId) return;
    setLoadingUsers(true);
    Promise.all([
      getUsersByBranch(branchId).catch(() => []),
      getAnnualFeeAmount().catch(() => null),
    ]).then(([users, amount]) => {
      setAllUsers(users || []);
      setAnnualFeeAmount(amount);
    }).finally(() => setLoadingUsers(false));
  }, [branchId]);

  // Close dropdown on outside click (search box + portaled panel both count as inside).
  useEffect(() => {
    const handler = (e) => {
      const inSearch = searchRef.current?.contains(e.target);
      const inDropdown = dropdownRef.current?.contains(e.target);
      if (!inSearch && !inDropdown) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Anchor the portaled dropdown to the input; keep aligned on scroll/resize.
  useLayoutEffect(() => {
    if (!showDropdown) { setDropdownPos(null); return undefined; }
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const GAP = 6;
      const MAX_H = 300;
      const spaceBelow = window.innerHeight - rect.bottom - GAP;
      const spaceAbove = rect.top - GAP;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      setDropdownPos({
        left: rect.left,
        width: rect.width,
        top: openUp ? null : rect.bottom + GAP,
        bottom: openUp ? window.innerHeight - rect.top + GAP : null,
        maxHeight: Math.max(140, Math.min(MAX_H, openUp ? spaceAbove : spaceBelow)),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showDropdown]);

  useEffect(() => { setHighlightedIndex(0); }, [searchQuery, showDropdown]);
  useEffect(() => {
    if (showDropdown) optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, showDropdown]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allUsers.slice(0, 8);
    return allUsers.filter(
      (u) =>
        (u.fullName || u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || u.phoneNumber || u.guardianPhone || '').includes(q)
    ).slice(0, 10);
  }, [allUsers, searchQuery]);

  const handleSelectUser = async (u) => {
    setSelectedUser(u);
    setSearchQuery(u.fullName || u.name || u.email || '');
    setStudentName(u.fullName || u.name || '');
    setStudentPhone(u.guardianPhone || u.phoneNumber || u.phone || u.studentPhone || '');
    setStudentSchool(u.school || '');
    setStudyYear(u.studyYear || '');
    setEditLevel(false);
    setShowDropdown(false);
    setError('');
    setSuccess('');
    setAlreadyPaid(false);

    // Duplicate check — does this student already have a verified fee this year?
    setCheckingPayment(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'branches', branchId, 'annualPayments'),
        where('userId', '==', u.id)
      ));
      const paid = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .some((p) => isAnnualPaymentForCurrentYear(p));
      setAlreadyPaid(paid);
    } catch (e) {
      console.error('annual-fee dup check failed:', e);
      setAlreadyPaid(false);
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setSelectedUser(null);
    setStudentName('');
    setStudentPhone('');
    setStudentSchool('');
    setStudyYear('');
    setEditLevel(false);
    setAlreadyPaid(false);
    setShowDropdown(true);
  };

  const handleSearchKeyDown = (e) => {
    if (loadingUsers) return;
    if (!showDropdown) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setShowDropdown(true); }
      return;
    }
    const count = filteredUsers.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (count > 0) setHighlightedIndex((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (count > 0) setHighlightedIndex((i) => (i - 1 + count) % count);
        break;
      case 'Enter':
        if (count > 0) { e.preventDefault(); handleSelectUser(filteredUsers[Math.min(highlightedIndex, count - 1)]); }
        break;
      case 'Escape':
        e.preventDefault(); e.stopPropagation(); setShowDropdown(false);
        break;
      case 'Tab':
        setShowDropdown(false);
        break;
      default:
        break;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedUser) { setError('يرجى اختيار طالب من القائمة'); return; }
    if (alreadyPaid) { setError('هذا الطالب دفع الرسوم السنوية لهذه السنة الدراسية بالفعل.'); return; }

    setSubmitting(true);
    try {
      await recordAnnualFeePayment(branchId, selectedUser.id, {
        studyYear: studyYear || null,
        notes: notes.trim() || null,
        paidAt: paymentDate || null,
      });
      setSuccess('تم تسجيل دفعة الرسوم السنوية بنجاح.');
      setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
    } catch (err) {
      console.error('recordAnnualFeePayment error:', err);
      if (err.code === 'already-paid') {
        setAlreadyPaid(true);
        setError('هذا الطالب دفع الرسوم السنوية لهذه السنة الدراسية بالفعل.');
      } else if (err.code === 'permission-denied') {
        setError('ليس لديك صلاحية تسجيل الرسوم السنوية.');
      } else if (err.code === 'not-found') {
        setError('لم يتم العثور على الطالب.');
      } else {
        setError(err.message || 'حدث خطأ أثناء تسجيل الدفعة.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = selectedUser && !alreadyPaid && !checkingPayment && !submitting && !success;

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
      >
        إلغاء
      </button>
      <button
        type="submit"
        form="add-annual-fee-form"
        disabled={!canSubmit}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> جاري التسجيل...
          </span>
        ) : 'تسجيل الدفعة'}
      </button>
    </>
  );

  return (
    <AdminModal open onClose={onClose} size="md" icon={Wallet} title="إضافة دفعة الرسوم السنوية" footer={footer}>
      <form id="add-annual-fee-form" onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex gap-2.5 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex gap-2.5 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">
            <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Student search */}
        <div ref={searchRef} className="relative">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            بحث عن الطالب <span className="text-danger-500">*</span>
          </label>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={showDropdown && filteredUsers.length > 0}
              aria-controls="annual-fee-student-listbox"
              aria-autocomplete="list"
              aria-activedescendant={
                showDropdown && filteredUsers.length > 0 ? `annual-fee-student-option-${highlightedIndex}` : undefined
              }
              autoComplete="off"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder="ابحث بالاسم أو البريد الإلكتروني أو الهاتف..."
              className="w-full rounded-lg border border-gray-300 py-2 ps-9 pe-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30"
              disabled={loadingUsers}
            />
            {loadingUsers && (
              <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
            )}
          </div>

          {showDropdown && !loadingUsers && filteredUsers.length > 0 && dropdownPos && createPortal(
            <ul
              ref={dropdownRef}
              id="annual-fee-student-listbox"
              role="listbox"
              aria-label="نتائج البحث عن الطلاب"
              dir="rtl"
              style={{
                position: 'fixed',
                left: dropdownPos.left,
                width: dropdownPos.width,
                top: dropdownPos.top ?? undefined,
                bottom: dropdownPos.bottom ?? undefined,
                maxHeight: dropdownPos.maxHeight,
                zIndex: 1300,
              }}
              className="overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white shadow-xl"
            >
              {filteredUsers.map((u, idx) => (
                <li
                  key={u.id}
                  id={`annual-fee-student-option-${idx}`}
                  role="option"
                  aria-selected={idx === highlightedIndex}
                  ref={(el) => { optionRefs.current[idx] = el; }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectUser(u)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-start text-sm ${
                    idx === highlightedIndex ? 'bg-gray-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{u.fullName || u.name || '—'}</p>
                    <p className="truncate text-xs text-gray-500">{u.email}</p>
                  </div>
                </li>
              ))}
            </ul>,
            document.body
          )}

          {showDropdown && !loadingUsers && searchQuery && filteredUsers.length === 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-lg">
              لا يوجد طالب مطابق للبحث
            </div>
          )}

          {selectedUser && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-success-600">
              <CheckCircle className="h-3.5 w-3.5" />
              تم اختيار: {selectedUser.fullName || selectedUser.name || selectedUser.email}
            </p>
          )}
        </div>

        {/* Student info — read-only */}
        {selectedUser && (
          <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">بيانات الطالب</p>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <User className="h-4 w-4 flex-shrink-0 text-gray-400" />
              <span className="font-medium">{studentName || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Phone className="h-4 w-4 flex-shrink-0 text-gray-400" />
              <span dir="ltr">{studentPhone || 'لا يوجد رقم هاتف'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <School className="h-4 w-4 flex-shrink-0 text-gray-400" />
              <span>{studentSchool || '—'}</span>
            </div>
          </div>
        )}

        {/* Already-paid guard */}
        {selectedUser && checkingPayment && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
            جاري التحقق من سجل الرسوم السنوية...
          </div>
        )}
        {selectedUser && !checkingPayment && alreadyPaid && (
          <div className="flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-semibold">الرسوم السنوية مدفوعة بالفعل</p>
              <p className="mt-0.5 text-xs">هذا الطالب لديه دفعة مؤكدة للسنة الدراسية {academicYearLabel}. لا يمكن تسجيل دفعة مكررة.</p>
            </div>
          </div>
        )}

        {/* Payment fields — only when a student is chosen and not already paid */}
        {selectedUser && !checkingPayment && !alreadyPaid && (
          <>
            {/* Academic year (label) — informational */}
            <div className="flex items-center justify-between rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3 text-sm">
              <span className="text-secondary-700">السنة الدراسية</span>
              <span className="font-semibold text-secondary-900">{academicYearLabel}</span>
            </div>

            {/* Grade level — the saved level is reused; never asked for again. */}
            {selectedUser.studyYear && !editLevel ? (
              <div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">المستوى الدراسي (محفوظ في ملف الطالب)</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {ACADEMIC_YEARS.find((y) => y.id === selectedUser.studyYear)?.label || selectedUser.studyYear}
                      {selectedUser.academicYear && <span className="ms-1.5 text-xs font-normal text-gray-500">· {selectedUser.academicYear}</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditLevel(true)}
                    className="flex-shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    تغيير
                  </button>
                </div>
                {selectedUser.academicYear && selectedUser.academicYear !== academicYearLabel && (
                  <p className="mt-1.5 rounded border border-warning-200 bg-warning-50 px-2 py-1 text-xs text-warning-800">
                    هذا المستوى مسجّل للسنة الدراسية {selectedUser.academicYear}. تأكد أنه ما زال صحيحاً للسنة {academicYearLabel}، أو غيّره.
                  </p>
                )}
              </div>
            ) : (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">المستوى الدراسي للطالب</label>
              <select
                value={studyYear}
                onChange={(e) => setStudyYear(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">-- غير محدد --</option>
                <optgroup label="متوسط">
                  {ACADEMIC_YEARS.filter((y) => y.id.startsWith('mid')).map((y) => (
                    <option key={y.id} value={y.id}>{y.label}</option>
                  ))}
                </optgroup>
                <optgroup label="ثانوي">
                  {ACADEMIC_YEARS.filter((y) => y.id.startsWith('sec')).map((y) => (
                    <option key={y.id} value={y.id}>{y.label}</option>
                  ))}
                </optgroup>
              </select>
              <p className="mt-1 text-xs text-gray-500">يُستخدم لتفعيل دروس الدعم للمستوى المختار، ويُحفظ في ملف الطالب.</p>
            </div>
            )}

            {/* Amount — read-only, owner-configured */}
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <BadgeCheck className="h-4 w-4 text-primary" /> المبلغ
              </div>
              <span className="text-base font-bold text-gray-900">
                {annualFeeAmount == null ? '—' : fmtMoney(annualFeeAmount)}
              </span>
            </div>

            {/* Payment date */}
            <div>
              <label htmlFor="aff-date" className="mb-1.5 block text-sm font-medium text-gray-700">تاريخ الدفع</label>
              <input
                id="aff-date"
                type="date"
                value={paymentDate}
                max={todayISO()}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                dir="ltr"
              />
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="aff-notes" className="mb-1.5 block text-sm font-medium text-gray-700">ملاحظات (اختياري)</label>
              <textarea
                id="aff-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="مثال: دفع نقداً في المكتب"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3 text-sm text-secondary-800">
              سيتم تسجيل الدفعة بحالة <strong>مؤكد</strong> مباشرةً وإضافتها إلى الإيرادات.
            </div>
          </>
        )}
      </form>
    </AdminModal>
  );
};

export default AddAnnualFeePaymentModal;
