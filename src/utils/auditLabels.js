/**
 * Shared presentation helpers for audit entries — used by both the owner
 * activity feed (owner/pages/AuditLog) and the record-level Entity History Panel
 * so action names, field names, and value formatting stay consistent.
 */

// action key → { label (Arabic), tone (badge classes), icon (emoji per spec) }
export const ACTION_META = {
  'student.create':     { label: 'إنشاء طالب',     tone: 'bg-secondary-50 text-secondary-700', icon: '🎓' },
  'student.update':     { label: 'تعديل طالب',     tone: 'bg-secondary-50 text-secondary-700', icon: '✏️' },
  'student.delete':     { label: 'حذف طالب',       tone: 'bg-danger-50 text-danger-700',       icon: '🗑' },
  'payment.verify':     { label: 'تأكيد دفع',      tone: 'bg-success-50 text-success-700',      icon: '💰' },
  'payment.reject':     { label: 'رفض دفع',        tone: 'bg-warning-50 text-warning-700',      icon: '💰' },
  'payment.edit':       { label: 'تعديل دفع',      tone: 'bg-warning-50 text-warning-700',      icon: '💰' },
  'payment.delete':     { label: 'حذف دفع',        tone: 'bg-danger-50 text-danger-700',        icon: '🗑' },
  'payment.correction': { label: 'طلب تصحيح دفع',  tone: 'bg-warning-50 text-warning-700',      icon: '💰' },
  'group.create':       { label: 'إنشاء مجموعة',   tone: 'bg-primary-50 text-primary-700',      icon: '📚' },
  'group.update':       { label: 'تعديل مجموعة',   tone: 'bg-primary-50 text-primary-700',      icon: '✏️' },
  'group.delete':       { label: 'حذف مجموعة',     tone: 'bg-danger-50 text-danger-700',        icon: '🗑' },
  'subject.create':     { label: 'إنشاء مادة',     tone: 'bg-primary-50 text-primary-700',      icon: '📚' },
  'subject.update':     { label: 'تعديل مادة',     tone: 'bg-primary-50 text-primary-700',      icon: '✏️' },
  'subject.delete':     { label: 'حذف مادة',       tone: 'bg-danger-50 text-danger-700',        icon: '🗑' },
  'teacher.create':     { label: 'إضافة أستاذ',    tone: 'bg-accent-50 text-accent-700',        icon: '👤' },
  'teacher.update':     { label: 'تعديل أستاذ',    tone: 'bg-accent-50 text-accent-700',        icon: '✏️' },
  'teacher.delete':     { label: 'حذف أستاذ',      tone: 'bg-danger-50 text-danger-700',        icon: '🗑' },
  'announcement.create':{ label: 'إنشاء إعلان',    tone: 'bg-secondary-50 text-secondary-700',  icon: '📢' },
  'announcement.update':{ label: 'تعديل إعلان',    tone: 'bg-secondary-50 text-secondary-700',  icon: '✏️' },
  'announcement.delete':{ label: 'حذف إعلان',      tone: 'bg-danger-50 text-danger-700',        icon: '🗑' },
  'document.approve':   { label: 'قبول وثيقة',     tone: 'bg-success-50 text-success-700',      icon: '✅' },
  'document.reject':    { label: 'رفض وثيقة',      tone: 'bg-warning-50 text-warning-700',      icon: '🚫' },
  'admin.create':       { label: 'إنشاء مسؤول',    tone: 'bg-accent-50 text-accent-700',        icon: '👤' },
  'admin.deactivate':   { label: 'تعطيل مسؤول',    tone: 'bg-danger-50 text-danger-700',        icon: '🔒' },
  'admin.reactivate':   { label: 'تفعيل مسؤول',    tone: 'bg-success-50 text-success-700',      icon: '🔓' },
};

export const actionMeta = (a) => ACTION_META[a] || { label: a || '—', tone: 'bg-gray-100 text-gray-700', icon: '•' };
export const actionLabel = (a) => actionMeta(a).label;

// entity field key → Arabic label (for change diffs).
export const FIELD_LABELS = {
  name: 'الاسم', fullName: 'الاسم', teacherName: 'الأستاذ', classroom: 'القاعة',
  groupName: 'المجموعة', schedules: 'المواعيد', capacity: 'السعة', price: 'السعر',
  status: 'الحالة', level: 'المستوى', subjectName: 'المادة', description: 'الوصف',
  amount: 'المبلغ', period: 'الفترة', title: 'العنوان', isPublished: 'منشور',
  isPinned: 'مثبّت', email: 'البريد', branchId: 'الفرع', serviceType: 'نوع الخدمة',
};
export const fieldLabel = (k) => FIELD_LABELS[k] || k;

/** Format an arbitrary snapshot value for display in a diff. */
export const displayValue = (v) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (Array.isArray(v)) return v.length ? `${v.length} عنصر` : '—';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return '[object]'; }
  }
  return String(v);
};

/** Best-effort human name for the affected entity, pulled from before/after. */
export const entityLabel = (entry = {}) => {
  const a = entry.after || {};
  const b = entry.before || {};
  return (
    a.name || a.groupName || a.subjectName || a.title || a.studentName ||
    b.name || b.groupName || b.subjectName || b.title || b.studentName || ''
  );
};

/** Two uppercase initials for an avatar chip. */
export const initials = (nameOrEmail = '') => {
  const s = String(nameOrEmail).trim();
  if (!s) return '؟';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
};
