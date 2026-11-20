/**
 * TeacherManagerModal — manage the branch's teachers catalog (list / add / delete).
 *
 * Classes pick a teacher from this list (ClassFormModal dropdown). Deleting a
 * teacher here does NOT touch classes or registrations — they keep the teacher
 * NAME snapshot, so historical data stays readable.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, UserPlus, Trash2, GraduationCap } from 'lucide-react';
import AdminModal from './AdminModal';
import AdminConfirmDialog from './AdminConfirmDialog';
import { useToast } from './ToastNotifications';
import { useAuth } from '../../contexts/AuthContext';
import { streamTeachers, createTeacher, deleteTeacher, updateTeacher, streamClasses } from '../../services/firestoreService';
import { normalizeGroupType } from '../../utils/supportClassification';
import {
  SERVICE_TYPES, SERVICE_TYPE_LABELS, deriveTeacherCategories, normalizeTeacherName,
} from '../../utils/teacherGroups';
import OwnershipBadge from '../../components/ui/OwnershipBadge';

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

// What support group types a teacher is currently assigned to.
const teachesBadge = (kinds) => {
  if (kinds.normal && kinds.low) return { label: 'عادية + دعم خاص', classes: 'bg-secondary-50 text-secondary-700 border border-secondary-200' };
  if (kinds.low) return { label: '🟠 دعم خاص', classes: 'bg-orange-50 text-orange-700 border border-orange-200' };
  if (kinds.normal) return { label: '🟢 عادية', classes: 'bg-success-50 text-success-700 border border-success-200' };
  return null;
};

const TeacherManagerModal = ({ branchId, onClose }) => {
  const { user, adminData } = useAuth();
  const { show: showToast } = useToast();
  const [teachers, setTeachers] = useState([]);
  const [allClasses, setAllClasses] = useState([]); // every class — for derived categories + support badge
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  const [savingKey, setSavingKey] = useState(null); // `${teacherId}:${serviceType}` while a toggle persists

  useEffect(() => {
    if (!branchId) return undefined;
    const unsub = streamTeachers(branchId, setTeachers);
    const unsubCls = streamClasses(branchId, {}, setAllClasses);
    return () => { unsub?.(); unsubCls?.(); };
  }, [branchId]);

  // Categories each teacher already teaches, derived from the classes that
  // reference them (normalized name → Set(serviceType)).
  const derivedByName = useMemo(() => deriveTeacherCategories(allClasses), [allClasses]);

  // teacherName(normalized) → which support group types they teach (normal/low).
  const teacherGroupKinds = useMemo(() => {
    const map = {};
    allClasses.forEach((c) => {
      if (c.serviceType !== 'support') return;
      const key = norm(c.teacherName);
      if (!key) return;
      if (!map[key]) map[key] = { normal: false, low: false };
      if (normalizeGroupType(c.groupType) === 'low_level_support') map[key].low = true;
      else map[key].normal = true;
    });
    return map;
  }, [allClasses]);

  // Toggle a teacher's membership in a lesson category. Categories the teacher
  // already teaches (derived from real classes) are locked on and can't be
  // removed here; only the explicit assignment is edited.
  const toggleCategory = async (teacher, serviceType) => {
    const derived = derivedByName.get(normalizeTeacherName(teacher.name)) || new Set();
    if (derived.has(serviceType)) return; // locked — has real classes in this category
    const explicit = new Set(Array.isArray(teacher.serviceTypes) ? teacher.serviceTypes : []);
    if (explicit.has(serviceType)) explicit.delete(serviceType);
    else explicit.add(serviceType);
    const key = `${teacher.id}:${serviceType}`;
    try {
      setSavingKey(key);
      await updateTeacher(branchId, teacher.id, { serviceTypes: [...explicit] },
        { uid: user?.uid, name: adminData?.name || '', email: user?.email });
    } catch (err) {
      console.error('[TeacherManager] updateTeacher failed', { code: err?.code, message: err?.message });
      showToast('error', 'تعذر تحديث أقسام الأستاذ');
    } finally {
      setSavingKey(null);
    }
  };

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      setBusy(true);
      await createTeacher(branchId, n, { uid: user?.uid, name: adminData?.name || '', email: user?.email });
      setName('');
    } catch (err) {
      // Never swallow the real cause again — surface it for diagnosis.
      console.error('[TeacherManager] createTeacher failed', {
        branchId,
        adminUid: user?.uid,
        code: err?.code,
        message: err?.message,
      });
      showToast('error', 'تعذر إضافة الأستاذ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const t = del;
    setDel(null);
    try {
      await deleteTeacher(branchId, t.id);
      showToast('info', 'تم حذف الأستاذ');
    } catch {
      showToast('error', 'تعذر حذف الأستاذ');
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      size="md"
      icon={GraduationCap}
      title="إدارة الأساتذة"
      footer={(
        <button
          onClick={onClose}
          className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          إغلاق
        </button>
      )}
    >
      <AdminConfirmDialog
        open={!!del}
        title="حذف الأستاذ"
        message={`حذف "${del?.name}"؟ لن يؤثر ذلك على المجموعات أو التسجيلات الحالية (الاسم محفوظ بداخلها).`}
        confirmLabel="حذف"
        danger
        onConfirm={remove}
        onCancel={() => setDel(null)}
      />

      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="اسم الأستاذ الجديد"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={add}
            disabled={busy || !name.trim()}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4" /> إضافة</>}
          </button>
        </div>

        {teachers.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">لا يوجد أساتذة بعد.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
            {teachers.map((t) => {
              const badge = teachesBadge(teacherGroupKinds[norm(t.name)] || { normal: false, low: false });
              const derived = derivedByName.get(norm(t.name)) || new Set();
              const explicit = new Set(Array.isArray(t.serviceTypes) ? t.serviceTypes : []);
              return (
                <li key={t.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{t.name}</span>
                      {badge && (
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${badge.classes}`} title="نوع مجموعات الدعم التي يدرّسها">
                          {badge.label}
                        </span>
                      )}
                    </div>
                    {/* Category assignment — which lesson sections offer this teacher.
                        Categories with real classes are locked on; the rest toggle freely. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-gray-400">الأقسام:</span>
                      {SERVICE_TYPES.map((st) => {
                        const active = derived.has(st) || explicit.has(st);
                        const locked = derived.has(st);
                        const saving = savingKey === `${t.id}:${st}`;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => toggleCategory(t, st)}
                            disabled={locked || saving}
                            aria-pressed={active}
                            title={locked
                              ? 'مستنتج من مجموعات فعلية — لا يمكن إزالته'
                              : (active ? 'إزالة من هذا القسم' : 'إضافة إلى هذا القسم')}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              active
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-gray-200 bg-white text-gray-400 hover:border-primary/40 hover:text-primary'
                            } ${locked ? 'cursor-default' : ''} ${saving ? 'opacity-60' : ''}`}
                          >
                            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                            {SERVICE_TYPE_LABELS[st]}
                          </button>
                        );
                      })}
                    </div>
                    <OwnershipBadge
                      compact
                      createdBy={t.createdBy}
                      createdAt={t.createdAt}
                      updatedBy={t.updatedBy}
                      updatedAt={t.updatedAt}
                    />
                  </div>
                  <button
                    onClick={() => setDel(t)}
                    aria-label="حذف"
                    className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-danger-100 bg-danger-50 text-danger-500 hover:bg-danger-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminModal>
  );
};

export default TeacherManagerModal;
