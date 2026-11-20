/**
 * ClassFormModal — add / edit a Class under a Subject, with an embedded
 * schedule editor (repeatable day / start / end rows).
 *
 * Validation (src/utils/classValidation.js):
 *   - teacher & group required; capacity/price non-negative
 *   - ≥1 schedule; valid times (start < end); no duplicate / overlapping rows
 *
 * Built on AdminModal. Used by all services; `showLevel` surfaces the optional
 * CEFR level field for languages.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Users, Plus, Trash2, Clock, UserPlus, X, DoorOpen, Calendar } from 'lucide-react';
import AdminModal from './AdminModal';
import ScheduleConflictPanel from './ScheduleConflictPanel';
import { useToast } from './ToastNotifications';
import { useAuth } from '../../contexts/AuthContext';
import { createClass, updateClass, streamTeachers, streamClasses, createTeacher } from '../../services/firestoreService';
import { validateClass, validateSchedules, DAYS_OF_WEEK } from '../../utils/classValidation';
import { numberInputGuards } from '../../utils/numberInputGuards';
import { GROUP_TYPE_OPTIONS, normalizeGroupType } from '../../utils/supportClassification';
import { deriveTeacherCategories, teacherTeachesCategory, SERVICE_TYPE_LABELS } from '../../utils/teacherGroups';

const emptyRow = () => ({ day: '', start: '', end: '' });

/** Current calendar month as 'YYYY-MM' (local time) for the Start Month default. */
const currentMonthValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const ClassFormModal = ({
  branchId,
  serviceType,
  subject,          // parent subject { id, name, level?, studyYear? } — required
  classData,        // existing class for edit, null for add
  showLevel = false,
  terms = {},       // { classWord, levelLabel }
  onClose,
}) => {
  const isEdit = Boolean(classData);
  const isSupport = serviceType === 'support';
  const { user, adminData } = useAuth();
  const { show: showToast } = useToast();

  const [teacherName, setTeacherName] = useState(classData?.teacherName || '');
  const [groupName, setGroupName] = useState(classData?.groupName || '');
  const [classroom, setClassroom] = useState(classData?.classroom || '');
  const [level, setLevel] = useState(classData?.level || '');
  // Support-only: group type (normal vs low-level support). Defaults to normal.
  const [groupType, setGroupType] = useState(
    isSupport ? normalizeGroupType(classData?.groupType) : '',
  );
  // Support-only: Group Start Month ('YYYY-MM'). Defaults to the current month
  // (so a new group is "already running" unless the admin picks a future month).
  const [startMonth, setStartMonth] = useState(
    isSupport ? (classData?.startMonth || currentMonthValue()) : '',
  );
  const [capacity, setCapacity] = useState(
    classData?.capacity != null && classData.capacity !== 0 ? String(classData.capacity) : '',
  );
  const [price, setPrice] = useState(
    classData?.price != null && classData.price !== 0 ? String(classData.price) : '',
  );
  const [schedules, setSchedules] = useState(
    Array.isArray(classData?.schedules) && classData.schedules.length
      ? classData.schedules.map((s) => ({ day: s.day || '', start: s.start || '', end: s.end || '' }))
      : [emptyRow()],
  );

  const [fieldErrors, setFieldErrors] = useState({});
  const [scheduleErrors, setScheduleErrors] = useState({ errors: [], rowErrors: {} });
  const [formError, setFormError] = useState('');
  const [conflicts, setConflicts] = useState([]); // schedule-conflict descriptors
  const [submitting, setSubmitting] = useState(false);

  // Teacher dropdown (managed teachers collection) + inline add.
  const [teachers, setTeachers] = useState([]);
  const [allClasses, setAllClasses] = useState([]); // every class — to derive teacher categories
  const [addingTeacher, setAddingTeacher] = useState(false);
  const [newTeacher, setNewTeacher] = useState('');
  const [teacherBusy, setTeacherBusy] = useState(false);

  useEffect(() => {
    if (!branchId) return undefined;
    const unsubT = streamTeachers(branchId, setTeachers);
    // All classes (every service) so a teacher's categories can be derived from
    // the groups that already reference them — no schema migration required.
    const unsubC = streamClasses(branchId, {}, setAllClasses);
    return () => { unsubT?.(); unsubC?.(); };
  }, [branchId]);

  // Category separation: only offer teachers relevant to the category being
  // created. A teacher is relevant when they have an explicit assignment OR an
  // existing class in this category; brand-new/unassigned teachers stay visible.
  const derivedTeacherCategories = useMemo(() => deriveTeacherCategories(allClasses), [allClasses]);
  const visibleTeachers = useMemo(
    () => teachers.filter((t) => teacherTeachesCategory(t, serviceType, derivedTeacherCategories)),
    [teachers, serviceType, derivedTeacherCategories],
  );
  const serviceLabel = SERVICE_TYPE_LABELS[serviceType] || '';

  const handleAddTeacher = async () => {
    const n = newTeacher.trim();
    if (!n) return;
    try {
      setTeacherBusy(true);
      // Stamp the new teacher with THIS category so they appear in its dropdown
      // immediately (and, if they already exist, this category is merged in).
      const t = await createTeacher(
        branchId, n,
        { uid: user?.uid, name: adminData?.name || '', email: user?.email },
        { serviceTypes: [serviceType] },
      );
      setTeacherName(t.name);
      setNewTeacher('');
      setAddingTeacher(false);
      if (fieldErrors.teacherName) setFieldErrors((p) => ({ ...p, teacherName: undefined }));
    } catch (err) {
      // Never swallow the real cause again — surface it for diagnosis.
      console.error('[ClassForm] createTeacher failed', {
        branchId,
        adminUid: user?.uid,
        code: err?.code,
        message: err?.message,
      });
      setFormError('تعذر إضافة الأستاذ. حاول مرة أخرى.');
    } finally {
      setTeacherBusy(false);
    }
  };

  const classWord = terms.classWord || 'المجموعة';

  const updateRow = (idx, field, value) =>
    setSchedules((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  const addRow = () => setSchedules((prev) => [...prev, emptyRow()]);
  const removeRow = (idx) => setSchedules((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setConflicts([]);

    const classCheck = validateClass(
      { teacherName, groupName, capacity, price, groupType, startMonth },
      { requireGroupType: isSupport, requireStartMonth: isSupport },
    );
    const scheduleCheck = validateSchedules(schedules);
    setFieldErrors(classCheck.errors);
    setScheduleErrors({ errors: scheduleCheck.errors, rowErrors: scheduleCheck.rowErrors });

    if (!classCheck.valid || !scheduleCheck.valid) return;

    // Level: CEFR input for languages; mirror the subject's level for support.
    const resolvedLevel = showLevel ? level : (subject.level || '');
    const payload = {
      subjectId: subject.id,
      subjectName: subject.name,
      teacherName,
      groupName,
      classroom,
      capacity,
      price,
      schedules,
      ...(isSupport ? { groupType, startMonth } : {}),
      ...(resolvedLevel ? { level: resolvedLevel } : {}),
      ...(subject.studyYear ? { studyYear: subject.studyYear } : {}),
    };

    try {
      setSubmitting(true);
      if (isEdit) {
        await updateClass(branchId, classData.id, payload);
        showToast('success', `تم تحديث ${classWord} بنجاح`);
      } else {
        await createClass(branchId, serviceType, payload, { uid: user?.uid, email: user?.email });
        showToast('success', `تمت إضافة ${classWord} بنجاح`);
      }
      onClose();
    } catch (err) {
      // Schedule conflict → render the actionable panel (teacher / classroom).
      if (err?.code === 'schedule-conflict') {
        setConflicts(err.conflicts || [err.conflict].filter(Boolean));
        setFormError('');
      } else {
        console.error('ClassFormModal save error:', err);
        setFormError('حدث خطأ أثناء الحفظ. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = (hasError) =>
    `w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 ${
      hasError
        ? 'border-danger-300 focus:border-danger-400 focus:ring-danger-100'
        : 'border-gray-200 focus:border-primary focus:ring-primary/20'
    }`;

  return (
    <AdminModal
      open
      onClose={onClose}
      size="lg"
      icon={Users}
      title={isEdit ? `تعديل ${classWord}` : `إضافة ${classWord} جديدة`}
      subtitle={subject?.name}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            إلغاء
          </button>
          <button
            type="submit"
            form="class-form"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'حفظ التعديلات' : 'إضافة'}
          </button>
        </>
      )}
    >
      <form id="class-form" onSubmit={handleSubmit} className="space-y-5">
        {formError && (
          <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            {formError}
          </div>
        )}

        {conflicts.length > 0 && <ScheduleConflictPanel conflicts={conflicts} />}

        {/* Teacher + Group */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-800">
              الأستاذ <span className="text-danger-500">*</span>
            </label>
            {!addingTeacher ? (
              <div className="flex gap-2">
                <select
                  value={teacherName}
                  onChange={(e) => { setTeacherName(e.target.value); if (fieldErrors.teacherName) setFieldErrors((p) => ({ ...p, teacherName: undefined })); }}
                  className={inputCls(fieldErrors.teacherName)}
                >
                  <option value="">— اختر الأستاذ —</option>
                  {visibleTeachers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  {/* keep the current value selectable even if it's scoped to another category */}
                  {teacherName && !visibleTeachers.some((t) => t.name === teacherName) && (
                    <option value={teacherName}>{teacherName}</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => setAddingTeacher(true)}
                  title="إضافة أستاذ جديد"
                  className="inline-flex flex-shrink-0 items-center rounded-lg border border-primary/30 bg-primary/5 px-3 text-primary hover:bg-primary/10"
                >
                  <UserPlus className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTeacher}
                  onChange={(e) => setNewTeacher(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTeacher(); } }}
                  placeholder="اسم الأستاذ الجديد"
                  className={inputCls(false)}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddTeacher}
                  disabled={teacherBusy || !newTeacher.trim()}
                  className="inline-flex flex-shrink-0 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  {teacherBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إضافة'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingTeacher(false); setNewTeacher(''); }}
                  title="إلغاء"
                  className="inline-flex flex-shrink-0 items-center rounded-lg border border-gray-300 px-2 text-gray-500 hover:bg-gray-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {fieldErrors.teacherName
              ? <p className="mt-1 text-xs text-danger-600">{fieldErrors.teacherName}</p>
              : (!addingTeacher && serviceLabel && <p className="mt-1 text-xs text-gray-500">يتم عرض أساتذة قسم «{serviceLabel}» فقط.</p>)}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-800">
              اسم المجموعة <span className="text-danger-500">*</span>
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => { setGroupName(e.target.value); if (fieldErrors.groupName) setFieldErrors((p) => ({ ...p, groupName: undefined })); }}
              placeholder="مثال: المجموعة أ، المسائية..."
              className={inputCls(fieldErrors.groupName)}
            />
            {fieldErrors.groupName && <p className="mt-1 text-xs text-danger-600">{fieldErrors.groupName}</p>}
          </div>
        </div>

        {/* Group type — support only (routes weak students to dedicated groups) */}
        {isSupport && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-800">
              نوع المجموعة <span className="text-danger-500">*</span>
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GROUP_TYPE_OPTIONS.map((opt) => {
                const active = groupType === opt.value;
                const isLow = opt.value === 'low_level_support';
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setGroupType(opt.value); if (fieldErrors.groupType) setFieldErrors((p) => ({ ...p, groupType: undefined })); }}
                    className={`flex items-start gap-2 rounded-xl border p-3 text-start transition-colors ${
                      active
                        ? (isLow ? 'border-orange-300 bg-orange-50 ring-2 ring-orange-100' : 'border-success-300 bg-success-50 ring-2 ring-success-100')
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <span className="mt-0.5 text-lg leading-none">{isLow ? '🟠' : '🟢'}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900">{opt.label}</span>
                      <span className="block text-xs text-gray-500">{opt.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {fieldErrors.groupType && <p className="mt-1 text-xs text-danger-600">{fieldErrors.groupType}</p>}
          </div>
        )}

        {/* Start Month — support only. Defines when the group officially begins:
            students who register earlier are RESERVED (seat held, not yet active)
            and auto-activate on the 1st of this month. */}
        {isSupport && (
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
              <Calendar className="h-4 w-4 text-primary" />
              شهر بدء المجموعة <span className="text-danger-500">*</span>
            </label>
            <input
              type="month"
              value={startMonth}
              onChange={(e) => { setStartMonth(e.target.value); if (fieldErrors.startMonth) setFieldErrors((p) => ({ ...p, startMonth: undefined })); }}
              className={inputCls(fieldErrors.startMonth)}
            />
            {fieldErrors.startMonth
              ? <p className="mt-1 text-xs text-danger-600">{fieldErrors.startMonth}</p>
              : <p className="mt-1 text-xs text-gray-500">الشهر الذي تبدأ فيه المجموعة رسمياً. مَن يسجّل قبله يُحجز له مقعد ويُفعّل اشتراكه تلقائياً في أول يوم من هذا الشهر.</p>}
          </div>
        )}

        {/* Optional level (CEFR for languages) */}
        {showLevel && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-800">
              {terms.levelLabel || 'المستوى'} <span className="text-gray-400">(اختياري)</span>
            </label>
            <input
              type="text"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="مثال: A1، A2، B1..."
              className={inputCls(false)}
            />
          </div>
        )}

        {/* Classroom (optional) — enables room double-booking detection */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
            <DoorOpen className="h-4 w-4 text-primary" />
            القاعة <span className="text-gray-400">(اختياري)</span>
          </label>
          <input
            type="text"
            value={classroom}
            onChange={(e) => setClassroom(e.target.value)}
            placeholder="مثال: القاعة 1، المخبر..."
            className={inputCls(false)}
          />
          <p className="mt-1 text-xs text-gray-500">
            عند تحديد القاعة يمنع النظام حجزها لمجموعتين في نفس الوقت.
          </p>
        </div>

        {/* Capacity + Price */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-800">
              عدد المقاعد <span className="text-gray-400">(اختياري)</span>
            </label>
            <input
              type="number"
              min="0"
              {...numberInputGuards}
              value={capacity}
              onChange={(e) => { setCapacity(e.target.value); if (fieldErrors.capacity) setFieldErrors((p) => ({ ...p, capacity: undefined })); }}
              placeholder="اترك فارغاً لعدد غير محدود"
              className={inputCls(fieldErrors.capacity)}
            />
            {fieldErrors.capacity && <p className="mt-1 text-xs text-danger-600">{fieldErrors.capacity}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-800">
              {isSupport ? 'السعر الشهري (دج)' : 'السعر (دج)'} <span className="text-gray-400">(اختياري)</span>
            </label>
            <input
              type="number"
              min="0"
              {...numberInputGuards}
              value={price}
              onChange={(e) => { setPrice(e.target.value); if (fieldErrors.price) setFieldErrors((p) => ({ ...p, price: undefined })); }}
              placeholder="0"
              className={inputCls(fieldErrors.price)}
            />
            {fieldErrors.price && <p className="mt-1 text-xs text-danger-600">{fieldErrors.price}</p>}
          </div>
        </div>

        {/* Support pricing note — proration is derived automatically from the schedule. */}
        {isSupport && (
          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            يُحتسب سعر الحصة تلقائياً = السعر الشهري ÷ عدد الحصص المجدولة في الشهر. عند انضمام الطالب في منتصف الشهر يدفع فقط مقابل الحصص المتبقية حسب المواعيد أدناه.
          </p>
        )}

        {/* Schedules */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
              <Clock className="h-4 w-4 text-primary" />
              المواعيد <span className="text-danger-500">*</span>
            </label>
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" />
              إضافة موعد
            </button>
          </div>

          {scheduleErrors.errors.length > 0 && (
            <div className="mb-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
              {scheduleErrors.errors.map((msg) => <p key={msg}>{msg}</p>)}
            </div>
          )}

          <div className="space-y-2">
            {schedules.map((row, idx) => {
              const rowError = scheduleErrors.rowErrors[idx];
              return (
                <div
                  key={idx}
                  className={`rounded-lg border bg-white p-3 ${rowError ? 'border-danger-300' : 'border-gray-200'}`}
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end">
                    <div>
                      <p className="mb-1 text-xs text-gray-500">اليوم</p>
                      <select
                        value={row.day}
                        onChange={(e) => updateRow(idx, 'day', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                      >
                        <option value="">اختر اليوم</option>
                        {DAYS_OF_WEEK.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-gray-500">من</p>
                      <input
                        type="time"
                        value={row.start}
                        onChange={(e) => updateRow(idx, 'start', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-gray-500">إلى</p>
                      <input
                        type="time"
                        value={row.end}
                        onChange={(e) => updateRow(idx, 'end', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    {schedules.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        aria-label="حذف الموعد"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-danger-100 bg-danger-50 text-danger-500 hover:bg-danger-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {rowError && <p className="mt-1.5 text-xs text-danger-600">{rowError}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </form>
    </AdminModal>
  );
};

export default ClassFormModal;
