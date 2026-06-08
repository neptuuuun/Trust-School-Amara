import React, { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import FileViewerModal from '../components/FileViewerModal';
import AdminCreateStudentModal from '../components/AdminCreateStudentModal';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import { useBranch } from '../../contexts/BranchContext';
import { getUsersByBranch, updateUser } from '../../services/userService';
import { cleanupRejectedRegistration } from '../../services/storageCleanupService';
import { useToast } from '../components/ToastNotifications';
import apiCall from '../../utils/apiClient';
import { formatDate } from '../../utils/dateUtils';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Alert, LoadingState } from '../../components/ui/feedback';

// ─── helpers ────────────────────────────────────────────────────────────────

const branchLabel = (id) =>
  id === 'boumerdes' ? 'بومرداس' : id === 'bordj_menaiel' ? 'برج منايل' : id || '—';

const getImageUrl = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v.publicUrl) return v.publicUrl;
  return null;
};


const STATUS_CONFIG = {
  pending:  { label: 'قيد المراجعة', color: 'bg-warning-100 text-warning-800', icon: Clock },
  verified: { label: 'مقبول',        color: 'bg-success-100 text-success-800', icon: CheckCircle },
  active:   { label: 'مقبول',        color: 'bg-success-100 text-success-800', icon: CheckCircle },
  rejected: { label: 'مرفوض',        color: 'bg-danger-100  text-danger-800',  icon: XCircle },
};

const getStatusConfig = (user) => {
  const raw = String(user?.verificationStatus || user?.status || '').toLowerCase();
  return STATUS_CONFIG[raw] || { label: raw || 'غير محدد', color: 'bg-gray-100 text-gray-700', icon: Clock };
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

const UserCard = ({ user, onDecision, processing, onViewImage }) => {
  const photoUrl  = getImageUrl(user.photoUrl);
  const idCardUrl = getImageUrl(user.idCardUrl);
  const busy      = processing[`decision-${user.id}`];
  const status    = getStatusConfig(user);
  const StatusIcon = status.icon;
  const isPending = String(user?.verificationStatus || '').toLowerCase() === 'pending';

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
        <div className="px-4 pb-4 grid grid-cols-2 gap-2">
          <Button
            variant="success"
            size="sm"
            fullWidth
            onClick={() => onDecision(user.id, true, user.branchId)}
            disabled={busy}
          >
            <CheckCircle className="w-4 h-4" />
            {busy ? 'جاري...' : 'قبول'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            onClick={() => onDecision(user.id, false, user.branchId)}
            disabled={busy}
          >
            <XCircle className="w-4 h-4" />
            {busy ? 'جاري...' : 'رفض'}
          </Button>
        </div>
      )}
    </div>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: 'all',      label: 'الكل' },
  { value: 'pending',  label: 'قيد المراجعة' },
  { value: 'verified', label: 'مقبول' },
  { value: 'rejected', label: 'مرفوض' },
];

const UsersPage = () => {
  const [users,               setUsers]               = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [error,               setError]               = useState('');
  const [searchQuery,         setSearchQuery]         = useState('');
  const [statusFilter,        setStatusFilter]        = useState('all');
  const [processing,          setProcessing]          = useState({});
  const [imageModal,          setImageModal]          = useState({ open: false, url: null });
  const [showCreateModal,     setShowCreateModal]     = useState(false);
  const [currentUser,         setCurrentUser]         = useState(null);
  const [rejectDialog,        setRejectDialog]        = useState({ open: false, userId: null, branchId: null, userName: '' });
  const { selectedBranchId } = useBranch();
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

  useEffect(() => {
    if (!currentUser || !selectedBranchId) return;

    let isFirstLoad = true;

    const load = async () => {
      // Only show the full-page spinner on the very first fetch.
      // Background refreshes must NOT call setLoading(true) because that
      // triggers the early-return spinner, which unmounts the modal and
      // destroys any in-progress form data the admin may have typed.
      if (isFirstLoad) setLoading(true);
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
        if (isFirstLoad) {
          setLoading(false);
          isFirstLoad = false;
        }
      }
    };

    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [currentUser, selectedBranchId]);

  const filteredUsers = useMemo(() => {
    let list = users;

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter((u) => {
        const vs = String(u?.verificationStatus || u?.status || '').toLowerCase();
        if (statusFilter === 'verified') return vs === 'verified' || vs === 'active';
        return vs === statusFilter;
      });
    }

    // Search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          (u.fullName         || '').toLowerCase().includes(q) ||
          (u.email            || '').toLowerCase().includes(q) ||
          (u.registrationNumber||'').toLowerCase().includes(q) ||
          (u.phone            || '').toLowerCase().includes(q) ||
          (u.phoneNumber      || '').toLowerCase().includes(q) ||
          (u.address          || '').toLowerCase().includes(q) ||
          (u.birthPlace       || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [users, searchQuery, statusFilter]);

  // Counts per status for the filter pills
  const counts = useMemo(() => {
    const c = { all: users.length, pending: 0, verified: 0, rejected: 0 };
    users.forEach((u) => {
      const vs = String(u?.verificationStatus || u?.status || '').toLowerCase();
      if (vs === 'pending')              c.pending++;
      else if (vs === 'verified' || vs === 'active') c.verified++;
      else if (vs === 'rejected')        c.rejected++;
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
      await updateUser(
        userId,
        approve
          ? { status: 'active', verificationStatus: 'verified', verificationRequest: null, verified: true, accountVerified: true }
          : { status: 'rejected', verificationStatus: 'rejected', verificationRequest: null, verified: false, accountVerified: false, uploadedDocs: [], photoUrl: null, idCardUrl: null },
        resolved
      );

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

  const openImage = (urlValue, title) => {
    const url = getImageUrl(urlValue);
    if (url) setImageModal({ open: true, url, title });
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

      <Breadcrumb trail={['المستخدمون']} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-primary">قائمة المستخدمين</h1>
          <p className="text-gray-600 mt-1">جميع المستخدمين المسجلين في الفرع مع معلوماتهم الكاملة</p>
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
              processing={processing}
              onViewImage={openImage}
            />
          ))}
        </div>
      )}

      {imageModal.open && imageModal.url && (
        <FileViewerModal
          url={imageModal.url}
          onClose={() => setImageModal({ open: false, url: null })}
        />
      )}

      {showCreateModal && (
        <AdminCreateStudentModal
          branchId={selectedBranchId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            // Reload user list after creation
            if (currentUser && selectedBranchId) {
              setLoading(true);
              getUsersByBranch(selectedBranchId)
                .then((data) => setUsers(data))
                .catch(() => {})
                .finally(() => setLoading(false));
            }
          }}
        />
      )}
    </div>
  );
};

export default UsersPage;
