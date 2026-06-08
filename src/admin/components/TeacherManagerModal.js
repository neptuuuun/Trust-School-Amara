/**
 * TeacherManagerModal — manage the branch's teachers catalog (list / add / delete).
 *
 * Classes pick a teacher from this list (ClassFormModal dropdown). Deleting a
 * teacher here does NOT touch classes or registrations — they keep the teacher
 * NAME snapshot, so historical data stays readable.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, UserPlus, Trash2, GraduationCap } from 'lucide-react';
import AdminModal from './AdminModal';
import AdminConfirmDialog from './AdminConfirmDialog';
import { useToast } from './ToastNotifications';
import { useAuth } from '../../contexts/AuthContext';
import { streamTeachers, createTeacher, deleteTeacher } from '../../services/firestoreService';

const TeacherManagerModal = ({ branchId, onClose }) => {
  const { user } = useAuth();
  const { show: showToast } = useToast();
  const [teachers, setTeachers] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);

  useEffect(() => {
    if (!branchId) return undefined;
    const unsub = streamTeachers(branchId, setTeachers);
    return () => unsub?.();
  }, [branchId]);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      setBusy(true);
      await createTeacher(branchId, n, { uid: user?.uid, email: user?.email });
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
            {teachers.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm font-medium text-gray-800">{t.name}</span>
                <button
                  onClick={() => setDel(t)}
                  aria-label="حذف"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-danger-100 bg-danger-50 text-danger-500 hover:bg-danger-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminModal>
  );
};

export default TeacherManagerModal;
