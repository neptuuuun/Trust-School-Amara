import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GraduationCap, Loader2, Search, User, Phone } from 'lucide-react';
import { formatDate as fmtDate } from '../../utils/dateUtils';
import {
  adminAddLanguageRegistration,
  getSubjects,
  getClasses,
  getStudentLanguageRegistrations,
} from '../../services/firestoreService';
import { getUsersByBranch } from '../../services/userService';
import { getAcademicYearLabel } from '../../utils/academicYear';
import AdminModal from './AdminModal';
import TeacherGroupPicker from './TeacherGroupPicker';

/**
 * Add a language registration (admin).
 * Workflow: Select student → Select language → Select level → Save.
 * Edit mode shows a read-only summary; no data re-entry needed.
 */
const AddEditLanguageModal = ({ branchId, registration, onClose, onSuccess }) => {
  const isEdit = Boolean(registration);

  // ── Student search ──────────────────────────────────────────────────────────
  const [allUsers,     setAllUsers]     = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(!isEdit);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxId = 'language-student-listbox';

  // ── Language / level selector ────────────────────────────────────────────────
  const [allLanguages,     setAllLanguages]     = useState([]);
  const [loadingLanguages, setLoadingLanguages] = useState(!isEdit);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [selectedLevel,    setSelectedLevel]    = useState(null);

  // ── Existing registrations for the selected student ──────────────────────────
  const [existingRegs,     setExistingRegs]     = useState([]);
  const [loadingExisting,  setLoadingExisting]  = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  // ── Load data (add mode only) ────────────────────────────────────────────────
  useEffect(() => {
    if (isEdit || !branchId) return;
    getUsersByBranch(branchId)
      .then(setAllUsers).catch(() => {})
      .finally(() => setLoadingUsers(false));

    // New model: languages = subjects (serviceType 'language'); each subject's
    // joinable groups = its classes. The level picker becomes a class picker.
    Promise.all([
      getSubjects(branchId, 'language'),
      getClasses(branchId, { serviceType: 'language', activeOnly: true, academicYear: getAcademicYearLabel() }),
    ]).then(([subjects, classes]) => {
      const bySubject = {};
      classes.forEach((c) => { (bySubject[c.subjectId] = bySubject[c.subjectId] || []).push(c); });
      const normalized = subjects.map((s) => ({
        ...s,
        languageName: s.name,
        _levels: (bySubject[s.id] || []).map((c) => ({
          id:          c.id,                                  // classId
          name:        c.groupName || c.level || 'مجموعة',
          groupName:   c.groupName || '',
          level:       c.level || '',
          teacherName: c.teacherName || '',
          schedules:   Array.isArray(c.schedules) ? c.schedules : [],
          capacity:    Number(c.capacity) || 0,
          enrollmentCount: Number(c.enrollmentCount) || 0,
        })),
      }));
      setAllLanguages(normalized);
    }).catch(() => {}).finally(() => setLoadingLanguages(false));
  }, [isEdit, branchId]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Reset highlight when the query changes or the dropdown visibility toggles
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery, showDropdown]);

  // Keep the highlighted option scrolled into view
  useEffect(() => {
    if (showDropdown && highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, showDropdown]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allUsers.slice(0, 8);
    return allUsers.filter(
      (u) => (u.fullName || u.name || '').toLowerCase().includes(q) ||
             (u.email || '').toLowerCase().includes(q)
    ).slice(0, 10);
  }, [allUsers, searchQuery]);

  const handleSelectUser = async (u) => {
    setSelectedUser(u);
    setSearchQuery(u.fullName || u.name || u.email || '');
    setShowDropdown(false);
    setSelectedLanguage(null);
    setSelectedLevel(null);
    setExistingRegs([]);

    // Load existing registrations for this student in this branch
    setLoadingExisting(true);
    try {
      const regs = await getStudentLanguageRegistrations(branchId, u.id);
      setExistingRegs(regs);
    } catch {
      setExistingRegs([]);
    } finally {
      setLoadingExisting(false);
    }
  };

  // Keyboard navigation for the search dropdown
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showDropdown) { setShowDropdown(true); return; }
      setHighlightedIndex((i) => (i < filteredUsers.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!showDropdown) { setShowDropdown(true); return; }
      setHighlightedIndex((i) => (i > 0 ? i - 1 : filteredUsers.length - 1));
    } else if (e.key === 'Enter') {
      // Never let Enter submit the form while choosing from the list
      if (showDropdown && filteredUsers.length > 0) {
        e.preventDefault();
        if (highlightedIndex >= 0) handleSelectUser(filteredUsers[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      // Close only the dropdown, not the surrounding modal
      if (showDropdown) {
        e.stopPropagation();
        setShowDropdown(false);
      }
    } else if (e.key === 'Tab') {
      setShowDropdown(false);
    }
  };

  // In the new model a "level" is a class; match the student's existing
  // registrations by classId (falls back to legacy languageId/levelId).
  const isLevelRegistered = (langId, classId) =>
    existingRegs.some(
      (r) => (r.classId && r.classId === classId) ||
             (r.languageId === langId && (r.levelId === classId || r.levelLabel === classId))
    );

  const handleSelectLanguage = (lang) => {
    setSelectedLanguage(lang);
    setSelectedLevel(null);
  };

  // Teacher-first group selection within the chosen language: group the
  // language's classes by teacher, then pick the group only when ambiguous.
  const levelItems = useMemo(() => {
    if (!selectedLanguage) return [];
    return selectedLanguage._levels.map((lv) => ({
      id: lv.id,
      teacherName: lv.teacherName || '',
      groupLabel: lv.name || lv.groupName || 'مجموعة',
      subLabel: lv.level && lv.level !== lv.name ? lv.level : '',
      disabled: isLevelRegistered(selectedLanguage.id, lv.id),
      disabledReason: 'مسجل',
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguage, existingRegs]);

  const handlePickLevel = (id) => {
    if (!selectedLanguage) return;
    setSelectedLevel(id ? selectedLanguage._levels.find((lv) => lv.id === id) || null : null);
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!selectedUser)    { setError('يرجى اختيار طالب');  return; }
    if (!selectedLanguage){ setError('يرجى اختيار اللغة'); return; }
    if (!selectedLevel) {
      setError('يرجى اختيار المستوى');
      return;
    }

    const cls = selectedLevel; // selected class (group)
    const payload = {
      userId:       selectedUser.id,
      studentName:  selectedUser.fullName || selectedUser.name  || '',
      studentPhone: selectedUser.phone    || selectedUser.phoneNumber || selectedUser.guardianPhone || '',
      languageId:   selectedLanguage.id,   // subjectId
      languageName: selectedLanguage.name || selectedLanguage.languageName || '',
      // Subject → Class snapshot
      subjectId:    selectedLanguage.id,
      subjectName:  selectedLanguage.name || selectedLanguage.languageName || '',
      classId:      cls?.id || '',
      groupName:    cls?.groupName || cls?.name || '',
      levelId:      cls?.level || cls?.id || '',
      levelLabel:   cls?.level || cls?.groupName || cls?.name || '',
      teacherName:  cls?.teacherName || '',
      schedules:    Array.isArray(cls?.schedules) ? cls.schedules : [],
    };

    try {
      setSubmitting(true);
      await adminAddLanguageRegistration(branchId, payload);
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء الحفظ.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedLevelAlreadyRegistered = selectedLevel
    ? isLevelRegistered(selectedLanguage?.id, selectedLevel.id)
    : false;

  const canSubmit = selectedUser && selectedLanguage && selectedLevel &&
    !selectedLevelAlreadyRegistered && !loadingExisting;

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footer = isEdit ? (
    <button
      type="button"
      onClick={onClose}
      className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
    >
      إغلاق
    </button>
  ) : (
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
        form="add-language-form"
        disabled={submitting || !canSubmit}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AdminModal
      open
      onClose={onClose}
      size="md"
      icon={GraduationCap}
      title={isEdit ? 'تفاصيل التسجيل' : 'إضافة تسجيل — اللغات'}
      footer={footer}
    >
      {isEdit ? (
        /* ── Edit mode: read-only summary ─────────────────────────────── */
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
            <Row label="الطالب"       value={registration.studentName  || '—'} />
            <Row label="الهاتف"        value={registration.studentPhone || '—'} />
            <Row label="اللغة"         value={registration.languageName || '—'} />
            <Row label="المستوى"       value={registration.levelLabel   || '—'} />
            <Row label="الأستاذ"       value={registration.teacherName  || '—'} />
            <Row label="تاريخ التسجيل" value={fmtDate(registration.registeredAt)} />
          </div>
          <p className="text-center text-xs text-gray-500">
            بيانات التسجيل محفوظة تلقائياً من ملف الطالب والدورة.
          </p>
        </div>
      ) : (
        /* ── Add mode: 3-step wizard ──────────────────────────────────── */
        <form id="add-language-form" onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>
          )}

          {/* Step 1 — Student */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              <span className="me-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">1</span>
              اختر الطالب
            </h3>

            <div ref={searchRef} className="relative">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSelectedUser(null); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="ابحث بالاسم أو البريد..."
                  disabled={loadingUsers}
                  className="w-full rounded-lg border border-gray-300 py-2 ps-9 pe-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30"
                  role="combobox"
                  aria-expanded={showDropdown && filteredUsers.length > 0}
                  aria-controls={listboxId}
                  aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
                  autoComplete="off"
                />
                {loadingUsers && <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
              </div>

              {showDropdown && !loadingUsers && filteredUsers.length > 0 && (
                <ul
                  id={listboxId}
                  role="listbox"
                  className="absolute z-10 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
                >
                  {filteredUsers.map((u, index) => (
                    <li
                      key={u.id}
                      id={`${listboxId}-option-${index}`}
                      role="option"
                      aria-selected={highlightedIndex === index}
                      ref={(el) => (optionRefs.current[index] = el)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectUser(u)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-start text-sm ${
                        highlightedIndex === index ? 'bg-gray-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{u.fullName || u.name || '—'}</p>
                        <p className="truncate text-xs text-gray-500">{u.email}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedUser && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm">
                <User className="h-4 w-4 shrink-0 text-success-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-success-800">{selectedUser.fullName || selectedUser.name}</p>
                  {(selectedUser.phone || selectedUser.phoneNumber || selectedUser.guardianPhone) && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-success-700">
                      <Phone className="h-3 w-3" />
                      {selectedUser.phone || selectedUser.phoneNumber || selectedUser.guardianPhone}
                    </p>
                  )}
                </div>
                {loadingExisting && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-success-500" />}
              </div>
            )}
          </section>

          {/* Step 2 — Language */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              <span className="me-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">2</span>
              اختر اللغة
            </h3>

            {loadingLanguages ? (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل...
              </div>
            ) : allLanguages.length === 0 ? (
              <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700">
                لا توجد لغات مضافة في هذا الفرع. أضف اللغات أولاً من قسم الإدارة.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allLanguages.map((lang) => (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => handleSelectLanguage(lang)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedLanguage?.id === lang.id
                        ? 'border-primary bg-primary text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-primary hover:text-primary'
                    }`}
                  >
                    {lang.languageName || lang.name || lang.id}
                  </button>
                ))}
              </div>
            )}

            {/* Group picker — teacher-first; shown when the language has groups */}
            {selectedLanguage && selectedLanguage._levels.length > 0 && (
              <div className="mt-3">
                <TeacherGroupPicker
                  key={selectedLanguage.id}
                  items={levelItems}
                  value={selectedLevel?.id || ''}
                  onChange={handlePickLevel}
                  groupQuestion="ما هي المجموعة التي تريد تسجيل الطالب فيها؟"
                  emptyLabel="لا يوجد أساتذة متاحون لهذه اللغة."
                />
                {selectedLanguage._levels.every((lv) => isLevelRegistered(selectedLanguage.id, lv.id)) && (
                  <p className="mt-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-700">
                    الطالب مسجل في جميع مستويات هذه اللغة.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Summary preview */}
          {canSubmit && (
            <div className="space-y-1 rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3 text-sm text-secondary-800">
              <p className="font-semibold">ملخص التسجيل</p>
              <p>الطالب: <strong>{selectedUser.fullName || selectedUser.name}</strong></p>
              <p>اللغة: <strong>{selectedLanguage.languageName || selectedLanguage.name}{selectedLevel ? ` — ${selectedLevel.name}` : ''}</strong></p>
              <p className="pt-1 text-xs text-secondary-600">سيتم إضافة التسجيل بحالة مؤكد مباشرةً.</p>
            </div>
          )}
        </form>
      )}
    </AdminModal>
  );
};

const Row = ({ label, value }) => (
  <div className="flex items-center gap-2">
    <span className="w-28 shrink-0 text-gray-500">{label}</span>
    <span className="font-semibold text-gray-900">{value}</span>
  </div>
);

export default AddEditLanguageModal;
