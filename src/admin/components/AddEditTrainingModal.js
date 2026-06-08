import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Loader2, Search, User, Phone } from 'lucide-react';
import { formatDate as fmtDate } from '../../utils/dateUtils';
import {
  adminAddTrainingRegistration,
  getClasses,
  getStudentTrainingRegistrations,
} from '../../services/firestoreService';
import { getUsersByBranch } from '../../services/userService';
import AdminModal from './AdminModal';

/**
 * Add a training registration (admin).
 * Workflow: Select student → Select training → Save.
 * Edit mode shows a read-only summary; no data re-entry needed.
 */
const AddEditTrainingModal = ({ branchId, registration, onClose, onSuccess }) => {
  const isEdit = Boolean(registration);

  // ── Student search ──────────────────────────────────────────────────────────
  const [allUsers,     setAllUsers]     = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(!isEdit);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const searchRef = useRef(null);

  // ── Training selector ────────────────────────────────────────────────────────
  const [allTrainings,     setAllTrainings]     = useState([]);
  const [loadingTrainings, setLoadingTrainings] = useState(!isEdit);
  const [selectedTraining, setSelectedTraining] = useState(null);

  // ── Existing registrations for the selected student ──────────────────────────
  const [existingRegs,    setExistingRegs]    = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  // ── Load data (add mode only) ────────────────────────────────────────────────
  useEffect(() => {
    if (isEdit || !branchId) return;
    getUsersByBranch(branchId)
      .then(setAllUsers).catch(() => {})
      .finally(() => setLoadingUsers(false));
    getClasses(branchId, { serviceType: 'training', activeOnly: true })
      .then(setAllTrainings).catch(() => {})
      .finally(() => setLoadingTrainings(false));
  }, [isEdit, branchId]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allUsers.slice(0, 8);
    return allUsers.filter(
      (u) => (u.fullName || u.name || '').toLowerCase().includes(q) ||
             (u.email || '').toLowerCase().includes(q)
    ).slice(0, 10);
  }, [allUsers, searchQuery]);

  const isTrainingRegistered = (trainingId) =>
    existingRegs.some((r) => r.trainingId === trainingId);

  const handleSelectUser = async (u) => {
    setSelectedUser(u);
    setSearchQuery(u.fullName || u.name || u.email || '');
    setShowDropdown(false);
    setSelectedTraining(null);
    setExistingRegs([]);

    // Load existing registrations for this student in this branch
    setLoadingExisting(true);
    try {
      const regs = await getStudentTrainingRegistrations(branchId, u.id);
      setExistingRegs(regs);
    } catch {
      setExistingRegs([]);
    } finally {
      setLoadingExisting(false);
    }
  };

  const handleSelectTraining = (t) => {
    if (!isTrainingRegistered(t.id)) setSelectedTraining(t);
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!selectedUser)    { setError('يرجى اختيار طالب');    return; }
    if (!selectedTraining){ setError('يرجى اختيار الدورة'); return; }

    const payload = {
      userId:        selectedUser.id,
      studentName:   selectedUser.fullName || selectedUser.name  || '',
      studentPhone:  selectedUser.phone    || selectedUser.phoneNumber || selectedUser.guardianPhone || '',
      trainingId:    selectedTraining.id, // class id
      trainingTitle: selectedTraining.subjectName || selectedTraining.title || selectedTraining.name || '',
      // Subject → Class snapshot
      classId:       selectedTraining.id,
      subjectId:     selectedTraining.subjectId || null,
      subjectName:   selectedTraining.subjectName || selectedTraining.title || selectedTraining.name || '',
      groupName:     selectedTraining.groupName || '',
      teacherName:   selectedTraining.teacherName || '',
      schedules:     Array.isArray(selectedTraining.schedules) ? selectedTraining.schedules : [],
    };

    try {
      setSubmitting(true);
      await adminAddTrainingRegistration(branchId, payload);
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء الحفظ.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTrainingAlreadyRegistered = selectedTraining
    ? isTrainingRegistered(selectedTraining.id)
    : false;

  const canSubmit = selectedUser && selectedTraining &&
    !selectedTrainingAlreadyRegistered && !loadingExisting;

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
        form="add-training-form"
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
      icon={Briefcase}
      title={isEdit ? 'تفاصيل التسجيل' : 'إضافة تسجيل — الدورات التكوينية'}
      footer={footer}
    >
      {isEdit ? (
        /* ── Edit mode: read-only summary ─────────────────────────────── */
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
            <Row label="الطالب"        value={registration.studentName   || '—'} />
            <Row label="الهاتف"         value={registration.studentPhone  || '—'} />
            <Row label="الدورة"         value={registration.trainingTitle || '—'} />
            <Row label="تاريخ التسجيل"  value={fmtDate(registration.registeredAt)} />
          </div>
          <p className="text-center text-xs text-gray-500">
            بيانات التسجيل محفوظة تلقائياً من ملف الطالب والدورة.
          </p>
        </div>
      ) : (
        /* ── Add mode: 2-step wizard ──────────────────────────────────── */
        <form id="add-training-form" onSubmit={handleSubmit} className="space-y-5">
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
                  placeholder="ابحث بالاسم أو البريد..."
                  disabled={loadingUsers}
                  className="w-full rounded-lg border border-gray-300 py-2 ps-9 pe-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
                {loadingUsers && <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
              </div>

              {showDropdown && !loadingUsers && filteredUsers.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {filteredUsers.map((u) => (
                    <li key={u.id}>
                      <button type="button" onMouseDown={() => handleSelectUser(u)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm hover:bg-gray-50">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{u.fullName || u.name || '—'}</p>
                          <p className="truncate text-xs text-gray-500">{u.email}</p>
                        </div>
                      </button>
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

          {/* Step 2 — Training */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              <span className="me-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">2</span>
              اختر الدورة التكوينية
            </h3>

            {loadingTrainings ? (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل...
              </div>
            ) : allTrainings.length === 0 ? (
              <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700">
                لا توجد دورات مضافة في هذا الفرع. أضف الدورات أولاً من قسم الإدارة.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allTrainings.map((t) => {
                  const alreadyReg = isTrainingRegistered(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTraining(t)}
                      disabled={alreadyReg}
                      title={alreadyReg ? 'الطالب مسجل مسبقاً في هذه الدورة' : undefined}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        alreadyReg
                          ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 line-through'
                          : selectedTraining?.id === t.id
                          ? 'border-primary bg-primary text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-primary hover:text-primary'
                      }`}
                    >
                      {t.subjectName || t.title || t.name || t.id}
                      {t.groupName ? ` — ${t.groupName}` : ''}
                      {alreadyReg && <span className="ms-1 text-xs">(مسجل)</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Summary preview */}
          {canSubmit && (
            <div className="space-y-1 rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3 text-sm text-secondary-800">
              <p className="font-semibold">ملخص التسجيل</p>
              <p>الطالب: <strong>{selectedUser.fullName || selectedUser.name}</strong></p>
              <p>الدورة: <strong>{[selectedTraining.subjectName || selectedTraining.title || selectedTraining.name, selectedTraining.groupName].filter(Boolean).join(' — ')}</strong></p>
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

export default AddEditTrainingModal;
