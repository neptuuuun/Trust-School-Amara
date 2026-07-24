/**
 * SubjectFormModal — add / edit a Subject (unified academic catalog).
 *
 * Subjects are created once per (branch, serviceType[, studyYear]); name
 * uniqueness is enforced server-side by createSubject. Built on AdminModal.
 */

import React, { useState } from 'react';
import { Loader2, BookOpen } from 'lucide-react';
import AdminModal from './AdminModal';
import { useToast } from './ToastNotifications';
import { useAuth } from '../../contexts/AuthContext';
import { createSubject, updateSubject } from '../../services/firestoreService';
import { validateSubject } from '../../utils/classValidation';

const SubjectFormModal = ({
  branchId,
  serviceType,
  subject,          // existing subject for edit, undefined/null for add
  scope = {},       // extra creation context, e.g. { studyYear, level } for support
  terms = {},       // { subjectWord, addTitle, editTitle, namePlaceholder }
  onClose,
}) => {
  const isEdit = Boolean(subject);
  const { user, adminData } = useAuth();
  const { show: showToast } = useToast();

  const [name, setName] = useState(subject?.name || '');
  const [description, setDescription] = useState(subject?.description || '');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const subjectWord = terms.subjectWord || 'المادة';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const { valid, errors: vErrors } = validateSubject({ name });
    setErrors(vErrors);
    if (!valid) return;

    try {
      setSubmitting(true);
      const actor = { uid: user?.uid, name: adminData?.name || '', email: user?.email };
      if (isEdit) {
        await updateSubject(branchId, subject.id, { name, description }, actor);
        showToast('success', `تم تحديث ${subjectWord} بنجاح`);
      } else {
        await createSubject(
          branchId,
          serviceType,
          { name, description, ...scope },
          actor,
        );
        showToast('success', `تمت إضافة ${subjectWord} بنجاح`);
      }
      onClose();
    } catch (err) {
      if (err?.code === 'duplicate-subject') {
        setErrors({ name: `${subjectWord} موجودة بالفعل` });
      } else {
        console.error('SubjectFormModal save error:', err);
        setFormError('حدث خطأ أثناء الحفظ. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      size="md"
      icon={BookOpen}
      title={isEdit ? (terms.editTitle || `تعديل ${subjectWord}`) : (terms.addTitle || `إضافة ${subjectWord} جديدة`)}
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
            form="subject-form"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'حفظ التعديلات' : 'إضافة'}
          </button>
        </>
      )}
    >
      <form id="subject-form" onSubmit={handleSubmit} className="space-y-5">
        {formError && (
          <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            {formError}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-800">
            الاسم <span className="text-danger-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({}); }}
            placeholder={terms.namePlaceholder || 'مثال: الرياضيات'}
            className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 ${
              errors.name
                ? 'border-danger-300 focus:border-danger-400 focus:ring-danger-100'
                : 'border-gray-200 focus:border-primary focus:ring-primary/20'
            }`}
            autoFocus
          />
          {errors.name && <p className="mt-1.5 text-xs text-danger-600">{errors.name}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-800">
            الوصف <span className="text-gray-400">(اختياري)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="وصف مختصر يظهر للطلاب"
            className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </form>
    </AdminModal>
  );
};

export default SubjectFormModal;
