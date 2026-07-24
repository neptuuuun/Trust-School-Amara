import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Search,
  Clock,
  Eye,
  UserCheck,
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Hash,
  Building2,
  Users,
  UserPlus,
  Trash2,
  GraduationCap,
  Pencil,
} from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import FileViewerModal from '../components/FileViewerModal';
import AdminCreateStudentModal from '../components/AdminCreateStudentModal';
import EditStudentAverageModal from '../components/EditStudentAverageModal';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import { classificationFromProfile, classificationBadge } from '../../utils/supportClassification';
import { branchLabel } from '../../utils/branches';
import { useBranch } from '../../contexts/BranchContext';
import OwnershipBadge from '../../components/ui/OwnershipBadge';
import { useAuth } from '../../contexts/AuthContext';
import { getUsersByBranch, updateUser } from '../../services/userService';
import { cleanupRejectedRegistration } from '../../services/storageCleanupService';
import { useToast } from '../components/ToastNotifications';
import { logAdminAction } from '../../services/auditService';
import apiCall from '../../utils/apiClient';
import { formatDate } from '../../utils/dateUtils';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Alert, LoadingState } from '../../components/ui/feedback';

// ─── helpers ────────────────────────────────────────────────────────────────

// How often the student list refreshes in the background (documents arrive
// while the admin is on this page, so a stale list means someone waits).
const REFRESH_MS = 30_000;

/** Firestore Timestamp | Date | ms | ISO → epoch ms (0 when unusable). */
const msOf = (v) => {
  if (!v) return 0;
  if (typeof v.toDate === 'function') { try { return v.toDate().getTime(); } catch { return 0; } }
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const getImageUrl = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v.publicUrl) return v.publicUrl;
  return null;
};


const STATUS_CONFIG = {
  pending:       { label: 'قيد المراجعة',       color: 'bg-warning-100 text-warning-800', icon: Clock },
  verified:      { label: 'مقبول',               color: 'bg-success-100 text-success-800', icon: CheckCircle },
  active:        { label: 'مقبول',               color: 'bg-success-100 text-success-800', icon: CheckCircle },
  rejected:      { label: 'مرفوض',               color: 'bg-danger-100  text-danger-800',  icon: XCircle },
  email_pending: { label: 'في انتظار التأكيد',   color: 'bg-gray-100 text-gray-600',       icon: Clock },
  unverified:    { label: 'غير مؤكد',            color: 'bg-gray-100 text-gray-600',       icon: Clock },
};

const getStatusConfig = (user) => {
  const vs = String(user?.verificationStatus || '').toLowerCase();
  const st = String(user?.status || '').toLowerCase();
  // email not yet confirmed → email_pending badge regardless of verificationStatus
  if (st === 'email_pending') return STATUS_CONFIG['email_pending'];
  // use verificationStatus as primary source of truth
  const key = vs || 'unverified';
  return STATUS_CONFIG[key] || { label: key, color: 'bg-gray-100 text-gray-700', icon: Clock };
};

// ─── Field row inside card ───────────────────────────────────────────────────

const Field = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2">
    <Icon className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
    <div className="min-w-0">
      <span className="text-xs text-gray-500 block">{label}</span>
      <span className="text-sm text-gray-900 font-medium break-words">{value || '—'}</span>
    </div>
  </div>
);

// ─── Single user card ────────────────────────────────────────────────────────

const UserCard = ({ user, onDecision, onDelete, onEditAverage, processing, onViewImage }) => {
  const photoUrl   = getImageUrl(user.photoUrl);
  const idCardUrl  = getImageUrl(user.idCardUrl);
  const busy       = processing[`decision-${user.id}`];
  const deleteBusy = processing[`delete-${user.id}`];
  const status     = getStatusConfig(user);
  const StatusIcon = status.icon;
  const isPending = String(user?.verificationStatus || '').toLowerCase() === 'pending';
  const classification = classificationFromProfile(user);
  const clsBadge = classificationBadge(classification);
  const average = user?.distinguishedSubjectsAverage;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">

      {/* Header */}
      <div className="bg-primary-50 border-b border-primary-100 p-4 flex items-center gap-4">
        {photoUrl ? (
          <button
            onClick={() => onViewImage(user.photoUrl, 'الصورة الشخصية')}
            className="relative group flex-shrink-0"
            title="عرض الصورة الشخصية"
          >
            <img
              src={photoUrl}
              alt="الصورة الشخصية"
              className="w-16 h-16 rounded-full object-cover border-2 border-white shadow cursor-pointer hover:opacity-90 transition-opacity"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity">
              <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
            </div>
          </button>
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
            <UserCheck className="w-8 h-8 text-gray-400" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-900 truncate">{user.fullName || user.name || '—'}</h3>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${status.color}`}>
            <StatusIcon className="w-3 h-3" />
            {status.label}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
        <Field icon={Hash}      label="رقم التسجيل"      value={user.registrationNumber} />
        <Field icon={Mail}      label="البريد الإلكتروني" value={user.email} />
        <Field icon={Phone}     label="رقم الهاتف"        value={user.phone || user.phoneNumber} />
        <Field icon={Calendar}  label="تاريخ الازدياد"    value={formatDate(user.birthDate)} />
        <Field icon={MapPin}    label="مكان الازدياد"     value={user.birthPlace} />
        <Field icon={MapPin}    label="العنوان"           value={user.address} />
        <Field icon={Building2} label="الفرع"             value={branchLabel(user.branchId)} />
        <Field icon={Calendar}  label="تاريخ التسجيل"    value={formatDate(user.createdAt)} />
      </div>

      {/* Accountability — who enrolled / last edited this student (admin-created only). */}
      {((user.createdBy && typeof user.createdBy === 'object') ||
        (user.updatedBy && typeof user.updatedBy === 'object')) && (
        <div className="px-4 pb-2">
          <OwnershipBadge
            createdBy={user.createdBy}
            createdAt={user.createdAt}
            updatedBy={user.updatedBy}
            updatedAt={user.updatedAt}
          />
        </div>
      )}

      {/* Support-level classification (دروس الدعم only — does not affect languages/trainings) */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <GraduationCap className="h-4 w-4 flex-shrink-0 text-primary" />
            <div className="min-w-0">
              <span className="block text-xs text-gray-500">معدل المواد المميزة (دعم)</span>
              <span className="block text-sm font-semibold text-gray-900" dir="ltr">
                {average != null ? average : 'غير محدد'}
              </span>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${clsBadge.classes}`}>
              <clsBadge.Icon className={`h-2.5 w-2.5 shrink-0 ${clsBadge.iconClass}`} fill="currentColor" aria-hidden="true" /> {clsBadge.label}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onEditAverage(user)}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
            title="تعديل المعدل"
          >
            <Pencil className="h-3.5 w-3.5" />
            {average != null ? 'تعديل' : 'تحديد'}
          </button>
        </div>
      </div>

      {/* ID card thumbnail */}
      {idCardUrl && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-500 mb-1">بطاقة الهوية</p>
          <button
            onClick={() => onViewImage(user.idCardUrl, 'صورة بطاقة الهوية')}
            className="relative group w-full rounded-lg overflow-hidden border border-gray-200 hover:border-primary transition-colors"
          >
            <img
              src={idCardUrl}
              alt="بطاقة الهوية"
              className="w-full h-28 object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-25 transition-opacity">
              <ImageIcon className="w-6 h-6 text-white opacity-0 group-hover:opacity-100" />
            </div>
          </button>
        </div>
      )}

      {/* Accept / Reject — only for pending users */}
      {isPending && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          <Button
            variant="success"
            size="sm"
            fullWidth
            onClick={() => onDecision(user.id, true, user.branchId)}
            disabled={busy || deleteBusy}
          >
            <CheckCircle className="w-4 h-4" />
            {busy ? 'جاري...' : 'قبول'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            onClick={() => onDecision(user.id, false, user.branchId)}
            disabled={busy || deleteBusy}
          >
            <XCircle className="w-4 h-4" />
            {busy ? 'جاري...' : 'رفض'}
          </Button>
        </div>
      )}

      {/* Permanent delete — shown for all users */}
      <div className="px-4 pb-4">
        <Button
          variant="ghost"
          size="sm"
          fullWidth
          onClick={() => onDelete(user.id, user.branchId)}
          disabled={busy || deleteBusy}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 w-full"
        >
          <Trash2 className="w-4 h-4" />
          {deleteBusy ? 'جاري الحذف...' : 'حذف الطالب نهائياً'}
        </Button>
      </div>
    </div>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: 'all',           label: 'الكل' },
  { value: 'email_pending', label: 'ينتظر تأكيد البريد' },
  { value: 'pending',       label: 'قيد المراجعة' },
  { value: 'verified',      label: 'مقبول' },
  { value: 'rejected',      label: 'مرفوض' },
];

// Support-level classification filter (دروس الدعم).
const CLASS_FILTERS = [
  { value: 'all',           label: 'كل التصنيفات' },
  { value: 'support_level', label: 'مستوى دعم' },
  { value: 'normal',        label: 'عادي' },
  { value: 'unclassified',  label: 'غير محدد' },
];

const UsersPage = () => {
  const [users,               setUsers]               = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [error,               setError]               = useState('');
  const [searchQuery,         setSearchQuery]         = useState('');
  const [statusFilter,        setStatusFilter]        = useState('all');
  const [classFilter,         setClassFilter]         = useState('all');
  const [averageModal,        setAverageModal]        = useState({ open: false, student: null });
  const [processing,          setProcessing]          = useState({});
  const [imageModal,          setImageModal]          = useState({ open: false, url: null, title: '' });
  const [showCreateModal,     setShowCreateModal]     = useState(false);
  const [currentUser,         setCurrentUser]         = useState(null);
  const [rejectDialog,        setRejectDialog]        = useState({ open: false, userId: null, branchId: null, userName: '' });
  const [deleteDialog,        setDeleteDialog]        = useState({ open: false, userId: null, branchId: null, userName: '' });
  const { selectedBranchId } = useBranch();
  const { adminData } = useAuth();
  const { show: showToast } = useToast();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
      if (!u) {
        setError('يجب تسجيل الدخول كمشرف للوصول إلى هذه الصفحة');
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Reload the branch's students. `background: true` skips the full-page spinner
  // — the early-return spinner unmounts open modals and would destroy whatever
  // the admin has typed into a form.
  const loadUsers = useCallback(async ({ background = false } = {}) => {
    if (!selectedBranchId) return;
    if (!background) setLoading(true);
    try {
      const data = await getUsersByBranch(selectedBranchId);
      setUsers(data);
      setError('');
    } catch (err) {
      setError(
        err.code === 'permission-denied'
          ? 'ليس لديك صلاحية للوصول إلى قائمة المستخدمين.'
          : 'فشل في تحميل المستخدمين: ' + err.message
      );
    } finally {
      if (!background) setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    if (!currentUser || !selectedBranchId) return undefined;

    loadUsers();

    // Students appear here as soon as they submit documents, so a stale list
    // means someone waits. Poll in the background — but pause while the tab is
    // hidden so a dashboard left open overnight doesn't burn quota.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadUsers({ background: true });
    }, REFRESH_MS);

    // Catch up immediately when the admin comes back to the tab.
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadUsers({ background: true });
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser, selectedBranchId, loadUsers]);

  const filteredUsers = useMemo(() => {
    let list = users;

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter((u) => {
        const vs  = String(u?.verificationStatus || '').toLowerCase();
        const st  = String(u?.status || '').toLowerCase();
        if (statusFilter === 'verified')      return vs === 'verified';
        if (statusFilter === 'email_pending') return st === 'email_pending';
        if (statusFilter === 'pending')       return vs === 'pending' && st !== 'email_pending';
        return vs === statusFilter || st === statusFilter;
      });
    }

    // Support-level classification filter
    if (classFilter !== 'all') {
      list = list.filter((u) => {
        const c = classificationFromProfile(u);
        if (classFilter === 'unclassified') return c == null;
        return c === classFilter;
      });
    }

    // Search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          (u.fullName          || '').toLowerCase().includes(q) ||
          (u.email             || '').toLowerCase().includes(q) ||
          (u.registrationNumber|| '').toLowerCase().includes(q) ||
          (u.phone             || '').toLowerCase().includes(q) ||
          (u.phoneNumber       || '').toLowerCase().includes(q) ||
          (u.address           || '').toLowerCase().includes(q) ||
          (u.birthPlace        || '').toLowerCase().includes(q)
      );
    }

    // Students awaiting a decision come FIRST, newest first. This page is the
    // only remaining approval queue in the dashboard; burying the three people
    // who are waiting among hundreds of already-verified accounts made the admin
    // reach for a filter before they could do their actual job.
    return [...list].sort((a, b) => {
      const aPending = String(a?.verificationStatus || '').toLowerCase() === 'pending' ? 0 : 1;
      const bPending = String(b?.verificationStatus || '').toLowerCase() === 'pending' ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return msOf(b.createdAt) - msOf(a.createdAt);
    });
  }, [users, searchQuery, statusFilter, classFilter]);

  // Counts per classification for the support filter pills.
  const classCounts = useMemo(() => {
    const c = { all: users.length, support_level: 0, normal: 0, unclassified: 0 };
    users.forEach((u) => {
      const cl = classificationFromProfile(u);
      if (cl === 'support_level') c.support_level += 1;
      else if (cl === 'normal') c.normal += 1;
      else c.unclassified += 1;
    });
    return c;
  }, [users]);

  // Counts per status for the filter pills
  const counts = useMemo(() => {
    const c = { all: users.length, email_pending: 0, pending: 0, verified: 0, rejected: 0 };
    users.forEach((u) => {
      const vs = String(u?.verificationStatus || '').toLowerCase();
      const st = String(u?.status || '').toLowerCase();
      if (st === 'email_pending')                       c.email_pending++;
      else if (vs === 'pending')                        c.pending++;
      else if (vs === 'verified') c.verified++;
      else if (vs === 'rejected')                       c.rejected++;
    });
    return c;
  }, [users]);

  const handleDecision = (userId, approve, branchId) => {
    if (!approve) {
      const targetUser = users.find((u) => u.id === userId);
      setRejectDialog({
        open: true,
        userId,
        branchId,
        userName: targetUser?.fullName || targetUser?.name || 'هذا المستخدم',
      });
      return;
    }
    executeDecision(userId, true, branchId);
  };

  const executeDecision = async (userId, approve, branchId) => {
    setProcessing((prev) => ({ ...prev, [`decision-${userId}`]: true }));
    try {
      const resolved = branchId || users.find((u) => u.id === userId)?.branchId;
      if (!resolved) throw new Error('branchId is required');

      const targetUser = users.find((u) => u.id === userId);
      // Canonical actor {uid,name,email} — records WHICH employee made the decision.
      const reviewer = {
        uid: adminData?.uid || '',
        name: adminData?.name || '',
        email: adminData?.email || '',
      };
      await updateUser(
        userId,
        approve
          ? { status: 'active', verificationStatus: 'verified', verificationRequest: null, verified: true, accountVerified: true, verifiedBy: reviewer, verifiedAt: new Date() }
          : { status: 'rejected', verificationStatus: 'rejected', verificationRequest: null, verified: false, accountVerified: false, uploadedDocs: [], photoUrl: null, idCardUrl: null, rejectedBy: reviewer, rejectedAt: new Date() },
        resolved
      );

      // Immutable audit trail — actor name resolved server-side from admins/owners.
      logAdminAction({
        action: approve ? 'document.approve' : 'document.reject',
        branchId: resolved,
        targetType: 'student',
        targetId: userId,
        after: { verificationStatus: approve ? 'verified' : 'rejected' },
      });

      // When a registration is rejected, immediately remove the applicant's
      // uploaded identity media from Supabase Storage (spec §4).
      // Best-effort: never throws, never blocks UI.
      if (!approve && targetUser) {
        await cleanupRejectedRegistration({
          photoUrl:   targetUser.photoUrl,
          idCardUrl:  targetUser.idCardUrl,
          documents:  targetUser.uploadedDocs || [],
        });
      }

      apiCall('/api/notify/user-decision', {
        method: 'POST',
        body: JSON.stringify({
          userId, branchId: resolved, approved: approve,
          studentName:  targetUser?.fullName || targetUser?.name || '',
          studentEmail: targetUser?.email || '',
        }),
      }).catch(() => {});

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, verificationStatus: approve ? 'verified' : 'rejected', status: approve ? 'active' : 'rejected', verified: approve, accountVerified: approve }
            : u
        )
      );
      showToast(approve ? 'success' : 'info', approve ? 'تم قبول الحساب بنجاح' : 'تم رفض الحساب');
    } catch (err) {
      showToast('error', 'حدث خطأ: ' + err.message);
    } finally {
      setProcessing((prev) => ({ ...prev, [`decision-${userId}`]: false }));
    }
  };

  const confirmRejectUser = () => {
    const { userId, branchId } = rejectDialog;
    setRejectDialog({ open: false, userId: null, branchId: null, userName: '' });
    executeDecision(userId, false, branchId);
  };

  const handleDeleteStudent = (userId, branchId) => {
    const targetUser = users.find((u) => u.id === userId);
    setDeleteDialog({
      open:     true,
      userId,
      branchId,
      userName: targetUser?.fullName || targetUser?.name || 'هذا الطالب',
    });
  };

  const executeDeleteStudent = async () => {
    const { userId, branchId, userName } = deleteDialog;
    setDeleteDialog({ open: false, userId: null, branchId: null, userName: '' });

    const targetUser = users.find((u) => u.id === userId);
    setProcessing((prev) => ({ ...prev, [`delete-${userId}`]: true }));
    try {
      const res = await apiCall('/api/admin/delete-student', {
        method: 'POST',
        body: JSON.stringify({ branchId, userId }),
      });

      // Best-effort: remove the student's uploaded files from Supabase Storage.
      await cleanupRejectedRegistration({
        photoUrl:  res.photoUrl,
        idCardUrl: res.idCardUrl,
        documents: targetUser?.uploadedDocs || [],
      });

      setUsers((prev) => prev.filter((u) => u.id !== userId));
      showToast('success', `تم حذف حساب "${userName}" نهائياً`);
    } catch (err) {
      showToast('error', 'فشل حذف الحساب: ' + err.message);
    } finally {
      setProcessing((prev) => ({ ...prev, [`delete-${userId}`]: false }));
    }
  };

  const openImage = (urlValue, title) => {
    const url = getImageUrl(urlValue);
    if (url) setImageModal({ open: true, url, title });
  };

  const handleEditAverage = (student) => setAverageModal({ open: true, student });

  const handleAverageSaved = ({ average, classification }) => {
    const { student } = averageModal;
    if (!student) return;
    setUsers((prev) => prev.map((u) =>
      u.id === student.id
        ? { ...u, distinguishedSubjectsAverage: average, supportClassification: classification }
        : u));
    showToast('success', 'تم تحديث معدل المواد المميزة');
  };

  if (loading) {
    return <LoadingState label="جاري تحميل المستخدمين..." />;
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Reject confirmation dialog */}
      <AdminConfirmDialog
        open={rejectDialog.open}
        title="تأكيد رفض الحساب"
        message={`هل أنت متأكد من رفض حساب "${rejectDialog.userName}"؟ سيتم حذف وثائقه وإشعاره بالرفض.`}
        confirmLabel="رفض الحساب"
        danger={true}
        onConfirm={confirmRejectUser}
        onCancel={() => setRejectDialog({ open: false, userId: null, branchId: null, userName: '' })}
      />

      {/* Delete confirmation dialog */}
      <AdminConfirmDialog
        open={deleteDialog.open}
        title="حذف الطالب نهائياً"
        message={`هل أنت متأكد من حذف حساب "${deleteDialog.userName}" بشكل نهائي؟ سيتم حذف حسابه من Firebase وجميع بياناته. لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف نهائياً"
        danger={true}
        onConfirm={executeDeleteStudent}
        onCancel={() => setDeleteDialog({ open: false, userId: null, branchId: null, userName: '' })}
      />

      <Breadcrumb trail={['الطلاب']} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-primary">الطلاب</h1>
          <p className="text-gray-600 mt-1">
            {counts.pending > 0
              ? `${counts.pending} طالب بانتظار مراجعة وثائقه — يظهرون في أعلى القائمة.`
              : 'جميع طلاب الفرع. لا توجد وثائق بانتظار المراجعة حالياً.'}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
          <UserPlus className="h-4 w-4" />
          إنشاء حساب طالب
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <Input
          type="text"
          placeholder="ابحث بالاسم، البريد، رقم التسجيل، الهاتف، العنوان، أو مكان الازدياد..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          startIcon={<Search className="w-5 h-5" />}
        />
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {f.label}
            <span className={`ms-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              statusFilter === f.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {counts[f.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Support-level classification filter (دروس الدعم) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">تصنيف الدعم:</span>
        {CLASS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setClassFilter(f.value)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              classFilter === f.value
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {f.label}
            <span className={`ms-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              classFilter === f.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {classCounts[f.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Users className="w-4 h-4" />
        <span>عرض {filteredUsers.length} من أصل {users.length} مستخدم</span>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <UserCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchQuery || statusFilter !== 'all' ? 'لا توجد نتائج' : 'لا يوجد مستخدمون'}
          </h3>
          <p className="text-gray-500">
            {searchQuery || statusFilter !== 'all'
              ? 'جرب تغيير معايير البحث أو الفلتر'
              : 'لم يتم تسجيل أي مستخدمين في هذا الفرع بعد'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredUsers.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onDecision={handleDecision}
              onDelete={handleDeleteStudent}
              onEditAverage={handleEditAverage}
              processing={processing}
              onViewImage={openImage}
            />
          ))}
        </div>
      )}

      {imageModal.open && imageModal.url && (
        <FileViewerModal
          url={imageModal.url}
          onClose={() => setImageModal({ open: false, url: null, title: '' })}
        />
      )}

      {averageModal.open && averageModal.student && (
        <EditStudentAverageModal
          branchId={averageModal.student.branchId || selectedBranchId}
          student={averageModal.student}
          onClose={() => setAverageModal({ open: false, student: null })}
          onSaved={handleAverageSaved}
        />
      )}

      {showCreateModal && (
        <AdminCreateStudentModal
          branchId={selectedBranchId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            // Background refresh: a foreground reload would blank the page to a
            // spinner right after a successful create, hiding the new student.
            loadUsers({ background: true });
          }}
        />
      )}
    </div>
  );
};

export default UsersPage;
