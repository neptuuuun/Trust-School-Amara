import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, Loader2, Search, User, Phone, AlertCircle, CheckCircle, CalendarDays } from 'lucide-react';
import { formatMonthKey } from '../../utils/dateUtils';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { getClasses, getStudentSupportLessonRegistrations } from '../../services/firestoreService';
import { getAcademicYearLabel } from '../../utils/academicYear';
import apiCall from '../../utils/apiClient';
import { getUsersByBranch } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';
import { getYearById } from '../../data/studyLevels';
import {
  classificationFromProfile, classify, validateAverage, classificationBadge,
  visibleClassesFor,
} from '../../utils/supportClassification';
import AdminModal from './AdminModal';

const AddSupportStudentModal = ({ branchId, onClose, onSuccess }) => {
  const { user: adminUser } = useAuth();

  // Student search state
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  // Dropdown is portaled to <body> and fixed-positioned to escape the modal's
  // overflow clipping; dropdownPos holds its on-screen geometry.
  const [dropdownPos, setDropdownPos] = useState(null);
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const optionRefs = useRef([]);

  // Read-only student info auto-loaded from profile
  const [studentName, setStudentName] = useState('');
  const [studentPhone, setStudentPhone] = useState('');

  // Approved academic year fetched from annualPayments
  const [approvedYear, setApprovedYear] = useState(null); // e.g. "sec3"
  const [loadingYear, setLoadingYear] = useState(false);

  // All lessons fetched from branch
  const [allLessons, setAllLessons] = useState([]);
  const [lessonId, setLessonId] = useState('');
  const [loadingLessons, setLoadingLessons] = useState(true);
  // Support is strictly month-by-month (calendar cycle) — no duration choice.
  const durationInMonths = 1;
  // Live prorated estimate for the selected class this calendar month.
  const [quote, setQuote] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  // Existing support lesson registrations for the selected student
  const [existingRegs, setExistingRegs] = useState([]);

  // Support-level average: admin may enter/correct it when the student has none.
  const [averageInput, setAverageInput] = useState('');
  const [localAverage, setLocalAverage] = useState(null); // numeric, admin-entered this session
  const [averageError, setAverageError] = useState('');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!branchId) return;
    Promise.all([
      getUsersByBranch(branchId).catch(() => []),
      getClasses(branchId, { serviceType: 'support', activeOnly: true, academicYear: getAcademicYearLabel() }).catch(() => []),
    ]).then(([users, fetchedLessons]) => {
      setAllUsers(users || []);
      setAllLessons(fetchedLessons || []);
    }).finally(() => {
      setLoadingUsers(false);
      setLoadingLessons(false);
    });
  }, [branchId]);

  // Close dropdown on outside click. The list is portaled out of searchRef, so
  // we must treat clicks inside EITHER the search box or the floating panel as
  // "inside" — otherwise picking a result would close the list first.
  useEffect(() => {
    const handler = (e) => {
      const inSearch = searchRef.current?.contains(e.target);
      const inDropdown = dropdownRef.current?.contains(e.target);
      if (!inSearch && !inDropdown) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Anchor the portaled dropdown to the input and keep it aligned while the
  // modal body scrolls or the window resizes. Flips above the input when there
  // isn't enough room below (laptop screens / lower fields).
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
    // capture:true so we also catch scrolls on the modal body / inner containers.
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showDropdown]);

  // Reset the keyboard highlight to the first result whenever the query changes
  // or the list (re)opens.
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, showDropdown]);

  // Keep the highlighted row scrolled into view during keyboard navigation.
  useEffect(() => {
    if (showDropdown) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, showDropdown]);

  // Fetch the live prorated estimate whenever the selected class changes.
  useEffect(() => {
    if (!branchId || !lessonId) { setQuote(null); return undefined; }
    let cancelled = false;
    setLoadingQuote(true);
    const params = new URLSearchParams({ branchId, classId: lessonId });
    apiCall(`/api/support-sessions/quote?${params.toString()}`)
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch(() => { if (!cancelled) setQuote(null); })
      .finally(() => { if (!cancelled) setLoadingQuote(false); });
    return () => { cancelled = true; };
  }, [branchId, lessonId]);

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
    setShowDropdown(false);
    setLessonId('');
    setApprovedYear(null);
    setExistingRegs([]);
    setLocalAverage(null);
    setAverageInput('');
    setAverageError('');

    // Run annual-fee check and existing-registrations fetch in parallel
    setLoadingYear(true);
    try {
      const [annualSnap, existingSupport] = await Promise.all([
        getDocs(query(
          collection(db, 'branches', branchId, 'annualPayments'),
          where('userId', '==', u.id),
          where('status', '==', 'verified'),
          orderBy('createdAt', 'desc'),
          limit(1)
        )),
        getStudentSupportLessonRegistrations(branchId, u.id).catch(() => []),
      ]);

      if (!annualSnap.empty) {
        const paymentData = annualSnap.docs[0].data();
        setApprovedYear(paymentData.academicYear || paymentData.studyYear || null);
      } else {
        setApprovedYear(null);
      }
      setExistingRegs(existingSupport);
    } catch (e) {
      console.error('Failed to fetch student data:', e);
      setApprovedYear(null);
    } finally {
      setLoadingYear(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setSelectedUser(null);
    setStudentName('');
    setStudentPhone('');
    setApprovedYear(null);
    setLessonId('');
    setShowDropdown(true);
  };

  // Keyboard navigation for the search combobox (arrows / enter / escape / tab).
  const handleSearchKeyDown = (e) => {
    if (loadingUsers) return;

    // Re-open the list with ArrowDown if it was closed.
    if (!showDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setShowDropdown(true);
      }
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
        // Never let Enter submit the form while a student is being chosen.
        if (count > 0) {
          e.preventDefault();
          handleSelectUser(filteredUsers[Math.min(highlightedIndex, count - 1)]);
        }
        break;
      case 'Escape':
        // Close ONLY the dropdown — keep the modal open.
        e.preventDefault();
        e.stopPropagation();
        setShowDropdown(false);
        break;
      case 'Tab':
        setShowDropdown(false);
        break;
      default:
        break;
    }
  };

  // IDs of lessons the student is already registered in (active or pending)
  const registeredLessonIds = useMemo(() => {
    const active = existingRegs.filter(
      (r) => r.status === 'verified' || r.status === 'pending'
    );
    return new Set(active.map((r) => r.lessonId).filter(Boolean));
  }, [existingRegs]);

  // The student's STORED classification (from their saved profile average). This —
  // never the value the admin is mid-typing — decides whether we render the
  // read-only badge or the editable average input, so a keystroke can't hide it.
  const storedClassification = classificationFromProfile(selectedUser);

  // Live preview of the value currently being typed. Drives an inline hint only;
  // it must never gate navigation or replace the input.
  const averagePreview = useMemo(() => validateAverage(averageInput), [averageInput]);
  const previewClassification = averagePreview.valid ? classify(averagePreview.value) : null;

  // Effective (confirmed) classification: the admin-confirmed average this session
  // takes precedence over the stored one. `localAverage` is set ONLY on explicit
  // confirmation (تأكيد / Enter / blur) — never on every keystroke — so a
  // half-typed value like "1" is never mistaken for the final average.
  const classification = localAverage != null ? classify(localAverage) : storedClassification;
  const needsAverage = Boolean(selectedUser && classification == null);
  const effectiveAverage = localAverage != null ? localAverage : (selectedUser?.distinguishedSubjectsAverage ?? null);

  // onChange records the raw text only (+ clears the error). Editing a value that
  // was already confirmed invalidates that confirmation and resets the lesson
  // choice, so the eligible-lesson list can never be built on a stale average.
  const handleAverageInputChange = (val) => {
    setAverageInput(val);
    setAverageError('');
    if (localAverage != null) {
      setLocalAverage(null);
      setLessonId('');
    }
  };

  // Confirm the typed average (تأكيد button / Enter / blur). Only a valid, complete
  // value locks in; an empty or half-typed value is left untouched so the admin
  // can keep typing ("1" → "10" → "10.5") without being cut off mid-entry.
  const confirmAverage = () => {
    const v = validateAverage(averageInput);
    if (!v.valid) {
      if (averageInput.trim() !== '') setAverageError(v.error);
      return;
    }
    setLocalAverage(v.value);
    setAverageError('');
  };

  // Lessons filtered by approved year, then by support-level eligibility (RULE A/B),
  // then split into available vs already-registered.
  const lessons = useMemo(() => {
    if (!approvedYear) return [];
    return allLessons.filter((l) => (l.studyYear || l.year || l.grade) === approvedYear);
  }, [allLessons, approvedYear]);

  const eligibleLessons = useMemo(
    () => (classification ? visibleClassesFor(classification, lessons) : []),
    [lessons, classification]
  );

  const availableLessons = useMemo(
    () => eligibleLessons.filter((l) => !registeredLessonIds.has(l.id)),
    [eligibleLessons, registeredLessonIds]
  );

  const selectedLesson = lessons.find((l) => l.id === lessonId) ?? null;
  // Reserved when the group's Start Month is a future month: the student's seat
  // is held now and the subscription auto-activates on the 1st of that month.
  const nowMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const lessonIsReserved = Boolean(selectedLesson?.startMonth) && String(selectedLesson.startMonth) > nowMonthKey;

  const approvedYearMeta = approvedYear ? getYearById(approvedYear) : null;
  const approvedYearLabel = approvedYearMeta?.nameShort || approvedYearMeta?.name || approvedYear || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedUser) {
      setError('يرجى اختيار طالب من القائمة');
      return;
    }
    if (!approvedYear) {
      setError('هذا الطالب لا يملك رسوماً سنوية مؤكدة. لا يمكن إضافته لدرس الدعم.');
      return;
    }
    if (needsAverage) {
      setAverageError('يرجى إدخال معدل المواد المميزة لتصنيف الطالب قبل التسجيل.');
      setError('');
      return;
    }
    if (!lessonId) {
      setError('يرجى اختيار درس الدعم');
      return;
    }

    try {
      setSubmitting(true);
      await apiCall('/api/support-lesson-registrations/admin-create', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          userId:          selectedUser.id,
          lessonId,
          classId:         lessonId,
          subjectId:       selectedLesson?.subjectId || null,
          subjectName:     selectedLesson?.subjectName || selectedLesson?.name || selectedLesson?.subject || '',
          groupName:       selectedLesson?.groupName || '',
          teacherName:     selectedLesson?.teacherName || selectedLesson?.teacher || '',
          schedules:       Array.isArray(selectedLesson?.schedules) ? selectedLesson.schedules : [],
          yearName:        selectedLesson?.studyYearLabel || approvedYearLabel || null,
          studyYearId:     selectedLesson?.studyYear || approvedYear || null,
          studyYearLabel:  approvedYearLabel || null,
          durationInMonths,
          studentName:     studentName.trim(),
          studentPhone:    studentPhone.trim(),
          // Send the admin-entered average (backend persists + re-derives the
          // classification); omit to let the backend use the stored value.
          distinguishedSubjectsAverage: localAverage != null ? localAverage : undefined,
        }),
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('admin-create support lesson error:', err);
      setError(err.message || 'حدث خطأ أثناء إضافة الطالب.');
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        إلغاء
      </button>
      <button
        type="submit"
        form="add-support-student-form"
        disabled={submitting || loadingLessons || loadingUsers || loadingYear || !selectedUser || !approvedYear}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري الإضافة...
          </span>
        ) : 'إضافة'}
      </button>
    </>
  );

  return (
    <AdminModal open onClose={onClose} size="md" icon={UserPlus} title="إضافة طالب يدوياً" footer={footer}>
      <form id="add-support-student-form" onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            {error}
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
              aria-controls="support-student-listbox"
              aria-autocomplete="list"
              aria-activedescendant={
                showDropdown && filteredUsers.length > 0
                  ? `support-student-option-${highlightedIndex}`
                  : undefined
              }
              autoComplete="off"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder="ابحث بالاسم أو البريد الإلكتروني..."
              className="w-full rounded-lg border border-gray-300 py-2 ps-9 pe-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30"
              disabled={loadingUsers}
            />
            {loadingUsers && (
              <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
            )}
          </div>

          {/* Dropdown — portaled to <body> & fixed-positioned so the modal's
              overflow-hidden / overflow-y-auto containers can't clip or trap it.
              z-index sits above the modal (base tier = 1000). */}
          {showDropdown && !loadingUsers && filteredUsers.length > 0 && dropdownPos && createPortal(
            <ul
              ref={dropdownRef}
              id="support-student-listbox"
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
                  id={`support-student-option-${idx}`}
                  role="option"
                  aria-selected={idx === highlightedIndex}
                  ref={(el) => { optionRefs.current[idx] = el; }}
                  // preventDefault on mousedown keeps the input focused, so the
                  // click is never swallowed by a blur. The list only closes when
                  // handleSelectUser actually picks a student.
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
                    <p className="truncate font-medium text-gray-900">
                      {u.fullName || u.name || '—'}
                    </p>
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
              <span className="font-normal text-gray-400">({selectedUser.id.slice(0, 8)}...)</span>
            </p>
          )}
        </div>

        {/* Student info — read-only, auto-loaded */}
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
          </div>
        )}

        {/* Approved academic year status */}
        {selectedUser && (
          <div>
            {loadingYear ? (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
                جاري التحقق من الرسوم السنوية...
              </div>
            ) : approvedYear ? (
              <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800">
                <p className="flex items-center gap-1 font-semibold">
                  <CheckCircle className="h-4 w-4" />
                  الرسوم السنوية مؤكدة
                </p>
                <p className="mt-0.5 text-xs">السنة الدراسية: <strong>{approvedYearLabel}</strong> — سيتم عرض دروس هذه السنة فقط.</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-semibold">لا توجد رسوم سنوية مؤكدة</p>
                  <p className="mt-0.5 text-xs">يجب أن يدفع الطالب الرسوم السنوية ويتم تأكيدها قبل التسجيل في دروس الدعم.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Support-level classification + average (admin can enter/correct it).
            The choice of badge-vs-input is gated on the STORED classification, not
            the value being typed — so typing never hides the input mid-entry. */}
        {selectedUser && approvedYear && !loadingYear && (
          storedClassification ? (
            (() => {
              const b = classificationBadge(storedClassification);
              return (
                <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="text-sm">
                    <p className="text-xs text-gray-500">معدل المواد المميزة</p>
                    <p className="font-semibold text-gray-900" dir="ltr">{effectiveAverage != null ? effectiveAverage : '—'}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${b.classes}`}>
                    <b.Icon className={`h-2.5 w-2.5 shrink-0 ${b.iconClass}`} fill="currentColor" aria-hidden="true" /> {b.label}
                  </span>
                </div>
              );
            })()
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                معدل المواد المميزة <span className="text-danger-500">*</span>
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  value={averageInput}
                  // onChange ONLY records the text — it never confirms or advances.
                  onChange={(e) => handleAverageInputChange(e.target.value)}
                  // Auto-confirm when the field is left with a valid value.
                  onBlur={confirmAverage}
                  // Enter confirms without submitting the surrounding form.
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); confirmAverage(); }
                  }}
                  placeholder="مثال: 10.5"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={confirmAverage}
                  disabled={!averagePreview.valid || localAverage != null}
                  className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {localAverage != null ? 'مؤكَّد' : 'تأكيد'}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                يُصنَّف الطالب تلقائياً: 11 فأكثر = مجموعة عادية، أقل من 11 = مجموعة دعم خاصة.
              </p>
              {/* Live classification — updates as the admin types WITHOUT hiding the
                  input, then flips to a confirmed (locked-in) state on تأكيد/blur. */}
              {(() => {
                const shown = localAverage != null ? classification : previewClassification;
                if (!shown) return null;
                const b = classificationBadge(shown);
                const confirmed = localAverage != null;
                return (
                  <p className="mt-2 flex items-center gap-1.5 text-xs">
                    <span className="text-gray-500">{confirmed ? 'التصنيف المؤكَّد:' : 'التصنيف المتوقع:'}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${b.classes}`}>
                      <b.Icon className={`h-2.5 w-2.5 shrink-0 ${b.iconClass}`} fill="currentColor" aria-hidden="true" /> {b.label}
                    </span>
                  </p>
                );
              })()}
              {averageError && <p className="mt-1 text-xs text-danger-600">{averageError}</p>}
            </div>
          )
        )}

        {/* Lesson select — shown only when student has approved year + classification */}
        {selectedUser && approvedYear && !loadingYear && !needsAverage && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              درس الدعم <span className="text-danger-500">*</span>
            </label>
            {loadingLessons ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري تحميل الدروس...
              </div>
            ) : lessons.length === 0 ? (
              <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
                لا توجد دروس دعم مضافة لـ <strong>{approvedYearLabel}</strong> في هذا الفرع.
              </div>
            ) : availableLessons.length === 0 ? (
              <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
                الطالب مسجل مسبقاً في جميع دروس الدعم المتاحة لـ <strong>{approvedYearLabel}</strong>.
              </div>
            ) : (
              <>
                <select
                  value={lessonId}
                  onChange={(e) => setLessonId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30"
                  required
                >
                  <option value="">-- اختر درس --</option>
                  {availableLessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.subjectName || l.name || l.subject || 'درس بدون اسم'}
                      {l.groupName ? ` — ${l.groupName}` : ''}
                    </option>
                  ))}
                </select>
                {registeredLessonIds.size > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {registeredLessonIds.size} درس مخفي — الطالب مسجل فيه مسبقاً.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Prorated estimate (support is month-by-month, calendar cycle) */}
        {selectedUser && approvedYear && !loadingYear && lessonId && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
            {loadingQuote ? (
              <span className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> جاري حساب المبلغ المستحق...
              </span>
            ) : quote ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">المبلغ المستحق هذا الشهر</span>
                  <span className="font-bold text-gray-900">{(quote.amountDue || 0).toLocaleString('en-US')} دج</span>
                </div>
                <p className="text-xs text-gray-500">
                  {quote.remainingSessions} من {quote.totalSessions} حصة متبقية × {(quote.pricePerSession || 0).toLocaleString('en-US')} دج
                  {quote.remainingSessions < quote.totalSessions
                    ? ` — مخفّض من ${(quote.monthlyPrice || 0).toLocaleString('en-US')} دج للشهر الكامل`
                    : ''}
                </p>
              </div>
            ) : (
              <span className="text-gray-500">سيُحتسب السعر الشهري الكامل.</span>
            )}
          </div>
        )}

        {/* Reservation notice — group starts in a future month. */}
        {selectedUser && approvedYear && !loadingYear && lessonId && lessonIsReserved && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <span>
              تبدأ هذه المجموعة في <strong>{formatMonthKey(selectedLesson.startMonth)}</strong>. سيتم <strong>حجز</strong> مقعد الطالب، ويُفعّل اشتراكه تلقائياً في اليوم الأول من ذلك الشهر (يُحتسب السعر الشهري الكامل).
            </span>
          </div>
        )}

        {selectedUser && approvedYear && !loadingYear && (
          <div className="rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3 text-sm text-secondary-800">
            سيتم إضافة التسجيل بحالة <strong>{lessonIsReserved ? 'محجوز' : 'مؤكد'}</strong> مباشرةً دون الحاجة لمراجعة.
          </div>
        )}
      </form>
    </AdminModal>
  );
};

export default AddSupportStudentModal;
