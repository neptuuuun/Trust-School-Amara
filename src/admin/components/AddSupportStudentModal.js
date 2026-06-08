import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus, Loader2, Search, User, Phone, AlertCircle, CheckCircle } from 'lucide-react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { getClasses, getStudentSupportLessonRegistrations } from '../../services/firestoreService';
import apiCall from '../../utils/apiClient';
import { getUsersByBranch } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';
import { getYearById } from '../../data/studyLevels';
import AdminModal from './AdminModal';

const AddSupportStudentModal = ({ branchId, onClose, onSuccess }) => {
  const { user: adminUser } = useAuth();

  // Student search state
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const searchRef = useRef(null);

  // Read-only student info auto-loaded from profile
  const [studentName, setStudentName] = useState('');
  const [studentPhone, setStudentPhone] = useState('');

  // Approved academic year fetched from annualPayments
  const [approvedYear, setApprovedYear] = useState(null); // e.g. "sec3"
  const [loadingYear, setLoadingYear] = useState(false);

  // All lessons fetched from branch
  const [allLessons, setAllLessons] = useState([]);
  const [lessonId, setLessonId] = useState('');
  const [durationInMonths, setDurationInMonths] = useState(1);
  const [loadingLessons, setLoadingLessons] = useState(true);

  // Existing support lesson registrations for the selected student
  const [existingRegs, setExistingRegs] = useState([]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!branchId) return;
    Promise.all([
      getUsersByBranch(branchId).catch(() => []),
      getClasses(branchId, { serviceType: 'support', activeOnly: true }).catch(() => []),
    ]).then(([users, fetchedLessons]) => {
      setAllUsers(users || []);
      setAllLessons(fetchedLessons || []);
    }).finally(() => {
      setLoadingUsers(false);
      setLoadingLessons(false);
    });
  }, [branchId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  // IDs of lessons the student is already registered in (active or pending)
  const registeredLessonIds = useMemo(() => {
    const active = existingRegs.filter(
      (r) => r.status === 'verified' || r.status === 'pending'
    );
    return new Set(active.map((r) => r.lessonId).filter(Boolean));
  }, [existingRegs]);

  // Lessons filtered by approved year, then split into available vs already-registered
  const lessons = useMemo(() => {
    if (!approvedYear) return [];
    return allLessons.filter((l) => (l.studyYear || l.year || l.grade) === approvedYear);
  }, [allLessons, approvedYear]);

  const availableLessons = useMemo(
    () => lessons.filter((l) => !registeredLessonIds.has(l.id)),
    [lessons, registeredLessonIds]
  );

  const selectedLesson = lessons.find((l) => l.id === lessonId) ?? null;

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
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => setShowDropdown(true)}
              placeholder="ابحث بالاسم أو البريد الإلكتروني..."
              className="w-full rounded-lg border border-gray-300 py-2 ps-9 pe-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30"
              disabled={loadingUsers}
            />
            {loadingUsers && (
              <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
            )}
          </div>

          {/* Dropdown */}
          {showDropdown && !loadingUsers && filteredUsers.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {filteredUsers.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onMouseDown={() => handleSelectUser(u)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm hover:bg-gray-50"
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
                  </button>
                </li>
              ))}
            </ul>
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

        {/* Lesson select — shown only when student has approved year */}
        {selectedUser && approvedYear && !loadingYear && (
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

        {/* Duration */}
        {selectedUser && approvedYear && !loadingYear && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              مدة الاشتراك (أشهر)
            </label>
            <select
              value={durationInMonths}
              onChange={(e) => setDurationInMonths(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'شهر' : 'أشهر'}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedUser && approvedYear && !loadingYear && (
          <div className="rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3 text-sm text-secondary-800">
            سيتم إضافة التسجيل بحالة <strong>مؤكد</strong> مباشرةً دون الحاجة لمراجعة.
          </div>
        )}
      </form>
    </AdminModal>
  );
};

export default AddSupportStudentModal;
