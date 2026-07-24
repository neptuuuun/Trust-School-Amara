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
import { streamTeachers, createTeacher, deleteTeacher, streamClasses } from '../../services/firestoreService';
import { normalizeGroupType } from '../../utils/supportClassification';
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
  const [supportClasses, setSupportClasses] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);

  useEffect(() => {
    if (!branchId) return undefined;
    const unsub = streamTeachers(branchId, setTeachers);
    const unsubCls = streamClasses(branchId, { serviceType: 'support' }, setSupportClasses);
    return () => { unsub?.(); unsubCls?.(); };
  }, [branchId]);

  // teacherName(normalized) → which support group types they teach (normal/low).
  const teacherGroupKinds = useMemo(() => {
    const map = {};
    supportClasses.forEach((c) => {
      const key = norm(c.teacherName);
      if (!key) return;
      if (!map[key]) map[key] = { normal: false, low: false };
      if (normalizeGroupType(c.groupType) === 'low_level_support') map[key].low = true;
      else map[key].normal = true;
    });
    return map;
  }, [supportClasses]);

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
        admin: { uid: user?.uid, email: user?.email },
        name: n,
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
              return (
                <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{t.name}</span>
                      {badge && (
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${badge.classes}`} title="نوع مجموعات الدعم التي يدرّسها">
                          {badge.label}
                        </span>
                      )}
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
