import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  Search, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  X as CloseIcon, 
  Eye, 
  UserCheck, 
  Filter,
  Archive,
  Trash2,
  UserX,
  RefreshCw,
  Calendar,
  Activity,
  Users,
  AlertTriangle
} from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import FileViewerModal from '../components/FileViewerModal';
import { useBranch } from '../../contexts/BranchContext';
import { 
  getUsersByBranch, 
  updateVerificationStatus
} from '../../services/userService';
import {
  getUsersByLifecycleStatus,
  updateUserLifecycleStatus,
  processAutomaticStatusTransitions,
  USER_STATUS,
  ACTIVITY_THRESHOLDS,
  recordUserActivity
} from '../../services/userLifecycleService';

const UserLifecyclePage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive, archived, deleted
  const [processing, setProcessing] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [imageModal, setImageModal] = useState({ open: false, url: null, title: '' });
  const [currentUser, setCurrentUser] = useState(null);
  const { selectedBranchId } = useBranch();
  const [showArchivedOnly, setShowArchivedOnly] = useState(false);
  const [cleanupProcessing, setCleanupProcessing] = useState(false);
  const [cleanupResults, setCleanupResults] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setError('يجب تسجيل الدخول كمشرف للوصول إلى هذه الصفحة');
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser || !selectedBranchId) return;
    
    const loadUsers = async () => {
      setLoading(true);
      try {
        let usersData;
        
        if (statusFilter === 'all') {
          usersData = await getUsersByBranch(selectedBranchId);
        } else {
          usersData = await getUsersByLifecycleStatus(selectedBranchId, statusFilter);
        }
        
        setUsers(usersData);
        setError('');
      } catch (err) {
        console.error('Error loading users:', err);
        setError('فشل في تحميل المستخدمين: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
    const interval = setInterval(loadUsers, 30000);
    return () => clearInterval(interval);
  }, [currentUser, selectedBranchId, statusFilter]);

  const filteredUsers = useMemo(() => {
    let filtered = users;
    
    // Filter out deleted users unless explicitly requested
    if (statusFilter !== 'deleted') {
      filtered = filtered.filter(user => user.lifecycleStatus !== USER_STATUS.DELETED);
    }
    
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter(user =>
        (user.fullName || '').toLowerCase().includes(query) ||
        (user.email || '').toLowerCase().includes(query) ||
        (user.registrationNumber || '').toLowerCase().includes(query) ||
        (user.phone || '').toLowerCase().includes(query) ||
        (user.phoneNumber || '').toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [users, searchQuery, statusFilter]);

  const handleStatusChange = async (userId, newStatus, branchId) => {
    try {
      setProcessing(prev => ({ ...prev, [`status-${userId}`]: true }));
      
      if (!branchId) {
        const user = users.find(u => u.id === userId);
        branchId = user?.branchId;
      }
      
      await updateUserLifecycleStatus(userId, branchId, newStatus, {
        manualUpdate: true,
        updatedBy: currentUser.uid
      });
      
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, lifecycleStatus: newStatus } : u
      ));
      
      alert(`تم تحديث حالة المستخدم إلى: ${getStatusDisplayName(newStatus)}`);
    } catch (err) {
      console.error('Error updating status:', err);
      alert('حدث خطأ أثناء تحديث الحالة: ' + err.message);
    } finally {
      setProcessing(prev => ({ ...prev, [`status-${userId}`]: false }));
    }
  };

  const handleReactivateUser = async (userId, branchId) => {
    try {
      setProcessing(prev => ({ ...prev, [`reactivate-${userId}`]: true }));
      
      await recordUserActivity(userId, branchId, 'manual_reactivation');
      
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, lifecycleStatus: USER_STATUS.ACTIVE } : u
      ));
      
      alert('تم إعادة تفعيل المستخدم بنجاح');
    } catch (err) {
      console.error('Error reactivating user:', err);
      alert('حدث خطأ أثناء إعادة التفعيل: ' + err.message);
    } finally {
      setProcessing(prev => ({ ...prev, [`reactivate-${userId}`]: false }));
    }
  };

  const handleProcessCleanup = async () => {
    setCleanupProcessing(true);
    try {
      const results = await processAutomaticStatusTransitions(true); // Dry run first
      
      setCleanupResults(results);
      
      const confirmCleanup = window.confirm(
        `سيتم معالجة ${results.processed} مستخدم:\n` +
        `- ${results.transitions.inactive} سيتم تحويلهم إلى غير نشط\n` +
        `- ${results.transitions.archived} سيتم أرشفتهم\n` +
        `- ${results.transitions.deleted} سيتم حذفهم\n\n` +
        `هل تريد المتابعة؟`
      );
      
      if (confirmCleanup) {
        const liveResults = await processAutomaticStatusTransitions(false);
        setCleanupResults(liveResults);
        alert('تمت معالجة دورة حياة المستخدمين بنجاح');
      }
    } catch (err) {
      console.error('Error processing cleanup:', err);
      alert('حدث خطأ أثناء المعالجة: ' + err.message);
    } finally {
      setCleanupProcessing(false);
    }
  };

  const getStatusDisplayName = (status) => {
    const statusMap = {
      [USER_STATUS.ACTIVE]: 'نشط',
      [USER_STATUS.INACTIVE]: 'غير نشط',
      [USER_STATUS.ARCHIVED]: 'مؤرشف',
      [USER_STATUS.DELETED]: 'محذوف'
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status) => {
    const colorMap = {
      [USER_STATUS.ACTIVE]: 'green',
      [USER_STATUS.INACTIVE]: 'yellow',
      [USER_STATUS.ARCHIVED]: 'orange',
      [USER_STATUS.DELETED]: 'red'
    };
    return colorMap[status] || 'gray';
  };

  const getStatusIcon = (status) => {
    const iconMap = {
      [USER_STATUS.ACTIVE]: CheckCircle,
      [USER_STATUS.INACTIVE]: Clock,
      [USER_STATUS.ARCHIVED]: Archive,
      [USER_STATUS.DELETED]: Trash2
    };
    return iconMap[status] || AlertCircle;
  };

  const formatLastActivity = (lastActivity) => {
    if (!lastActivity) return 'غير محدد';
    
    try {
      const date = lastActivity.toDate ? lastActivity.toDate() : new Date(lastActivity);
      const now = new Date();
      const diffMonths = (now - date) / (1000 * 60 * 60 * 24 * 30);
      
      if (diffMonths < 1) return 'أقل من شهر';
      if (diffMonths < 12) return `${Math.floor(diffMonths)} أشهر`;
      return `${Math.floor(diffMonths / 12)} سنوات`;
    } catch (err) {
      return 'غير محدد';
    }
  };

  const getImageUrl = (urlValue) => {
    if (!urlValue) return null;
    if (typeof urlValue === 'string') return urlValue;
    if (typeof urlValue === 'object' && urlValue.publicUrl) return urlValue.publicUrl;
    return null;
  };

  const openImageModal = (url, title) => {
    const imageUrl = getImageUrl(url);
    if (imageUrl) {
      setImageModal({ open: true, url: imageUrl, title });
    }
  };

  const openDetailsModal = (user) => {
    setSelectedUser(user);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedUser(null);
  };

  const statusCounts = useMemo(() => {
    const counts = {
      total: filteredUsers.length,
      [USER_STATUS.ACTIVE]: 0,
      [USER_STATUS.INACTIVE]: 0,
      [USER_STATUS.ARCHIVED]: 0,
      [USER_STATUS.DELETED]: 0
    };
    
    filteredUsers.forEach(user => {
      const status = user.lifecycleStatus || USER_STATUS.ACTIVE;
      counts[status] = (counts[status] || 0) + 1;
    });
    
    return counts;
  }, [filteredUsers]);

  if (loading) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-gray-600">جاري تحميل المستخدمين...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <Breadcrumb trail={["المستخدمون", "دورة الحياة"]} />
      
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">إدارة دورة حياة المستخدمين</h1>
          <p className="text-gray-600">مراقبة وإدارة حالة المستخدمين النشطين وغير النشطين والمؤرشفين</p>
        </div>
        <button
          onClick={handleProcessCleanup}
          disabled={cleanupProcessing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${cleanupProcessing ? 'animate-spin' : ''}`} />
          {cleanupProcessing ? 'جاري المعالجة...' : 'معالجة تلقائية'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {cleanupResults && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-4">
          <h3 className="font-semibold mb-2">نتائج المعالجة:</h3>
          <div className="text-sm space-y-1">
            <p>• تمت معالجة: {cleanupResults.processed} مستخدم</p>
            <p>• تحويل إلى غير نشط: {cleanupResults.transitions[USER_STATUS.INACTIVE]}</p>
            <p>• تم أرشفته: {cleanupResults.transitions[USER_STATUS.ARCHIVED]}</p>
            <p>• تم حذفه: {cleanupResults.transitions[USER_STATUS.DELETED]}</p>
            {cleanupResults.errors.length > 0 && (
              <p>• أخطاء: {cleanupResults.errors.length}</p>
            )}
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-gray-600" />
            <span className="text-sm text-gray-600">الإجمالي</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{statusCounts.total}</div>
        </div>
        
        {Object.values(USER_STATUS).map(status => {
          const Icon = getStatusIcon(status);
          const color = getStatusColor(status);
          return (
            <div key={status} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-5 h-5 text-${color}-600`} />
                <span className="text-sm text-gray-600">{getStatusDisplayName(status)}</span>
              </div>
              <div className={`text-2xl font-bold text-${color}-600`}>
                {statusCounts[status] || 0}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="ابحث بالاسم، البريد الإلكتروني، رقم التسجيل، أو رقم الهاتف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-right"
            />
          </div>
          <div className="relative">
            <Filter className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-right appearance-none bg-white"
            >
              <option value="all">جميع الحالات</option>
              <option value={USER_STATUS.ACTIVE}>نشط</option>
              <option value={USER_STATUS.INACTIVE}>غير نشط</option>
              <option value={USER_STATUS.ARCHIVED}>مؤرشف</option>
              <option value={USER_STATUS.DELETED}>محذوف</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showArchived"
              checked={showArchivedOnly}
              onChange={(e) => setShowArchivedOnly(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="showArchived" className="text-sm text-gray-600">
              عرض المؤرشفين فقط
            </label>
          </div>
        </div>
      </div>

      {/* Users Table */}
      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <UserX className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchQuery ? 'لا توجد نتائج' : 'لا يوجد مستخدمون'}
          </h3>
          <p className="text-gray-600">
            {searchQuery ? 'جرب البحث بكلمات مختلفة' : 'لم يتم العثور على مستخدمين بهذه الحالة'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">المستخدم</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الحالة</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">آخر نشاط</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الفرع</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">التحقق</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => {
                  const StatusIcon = getStatusIcon(user.lifecycleStatus || USER_STATUS.ACTIVE);
                  const statusColor = getStatusColor(user.lifecycleStatus || USER_STATUS.ACTIVE);
                  
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {user.photoUrl && (
                            <button 
                              onClick={() => openImageModal(user.photoUrl, 'الصورة الشخصية')} 
                              className="relative group"
                            >
                              <img 
                                src={getImageUrl(user.photoUrl)} 
                                alt="الصورة الشخصية" 
                                className="w-10 h-10 object-cover rounded-full border-2 border-gray-200 hover:border-primary transition-colors cursor-pointer" 
                                onError={(e) => { e.target.style.display = 'none'; }} 
                              />
                            </button>
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">{user.fullName || 'غير محدد'}</div>
                            <div className="text-sm text-gray-500">{user.email || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-${statusColor}-100 text-${statusColor}-800 text-xs font-medium`}>
                          <StatusIcon className="w-3 h-3" />
                          {getStatusDisplayName(user.lifecycleStatus || USER_STATUS.ACTIVE)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-700">
                          {formatLastActivity(user.lastActivityAt || user.createdAt)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {user.lastActivityType || 'account_creation'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-700">
                          {user.branchId === 'boumerdes' ? 'بومرداس' : 
                           user.branchId === 'bordj_menaiel' ? 'برج منايل' : 
                           user.branchName || user.branchId || '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.verified ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                            <CheckCircle className="w-3 h-3" />
                            موثق
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                            <Clock className="w-3 h-3" />
                            غير موثق
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => openDetailsModal(user)} 
                            className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm"
                          >
                            <Eye className="w-3 h-3" />
                            عرض
                          </button>
                          
                          {(user.lifecycleStatus === USER_STATUS.INACTIVE || user.lifecycleStatus === USER_STATUS.ARCHIVED) && (
                            <button 
                              onClick={() => handleReactivateUser(user.id, user.branchId)}
                              disabled={processing[`reactivate-${user.id}`]}
                              className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
                            >
                              <RefreshCw className="w-3 h-3" />
                              تفعيل
                            </button>
                          )}
                          
                          {user.lifecycleStatus === USER_STATUS.ACTIVE && (
                            <select
                              onChange={(e) => handleStatusChange(user.id, e.target.value, user.branchId)}
                              disabled={processing[`status-${user.id}`]}
                              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                              defaultValue=""
                            >
                              <option value="" disabled>تغيير الحالة</option>
                              <option value={USER_STATUS.INACTIVE}>غير نشط</option>
                              <option value={USER_STATUS.ARCHIVED}>مؤرشف</option>
                            </select>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {modalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50" onClick={closeModal}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">تفاصيل دورة حياة المستخدم</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <CloseIcon className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* User Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الكامل</label>
                  <div className="p-3 bg-gray-50 rounded-lg">{selectedUser.fullName || '—'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                  <div className="p-3 bg-gray-50 rounded-lg">{selectedUser.email || '—'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">حالة دورة الحياة</label>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    {getStatusDisplayName(selectedUser.lifecycleStatus || USER_STATUS.ACTIVE)}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">آخر نشاط</label>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    {formatLastActivity(selectedUser.lastActivityAt || selectedUser.createdAt)}
                  </div>
                </div>
              </div>

              {/* Activity Timeline */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  الخط الزمني للنشاط
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <div className="text-sm">
                      <div className="font-medium">إنشاء الحساب</div>
                      <div className="text-gray-500">{selectedUser.createdAt?.toDate?.()?.toLocaleDateString('ar-EG') || '—'}</div>
                    </div>
                  </div>
                  {selectedUser.lastActivityAt && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Activity className="w-4 h-4 text-gray-500" />
                      <div className="text-sm">
                        <div className="font-medium">آخر نشاط: {selectedUser.lastActivityType || 'general'}</div>
                        <div className="text-gray-500">{selectedUser.lastActivityAt?.toDate?.()?.toLocaleDateString('ar-EG') || '—'}</div>
                      </div>
                    </div>
                  )}
                  {selectedUser.lifecycleStatusUpdatedAt && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <RefreshCw className="w-4 h-4 text-gray-500" />
                      <div className="text-sm">
                        <div className="font-medium">تحديث الحالة</div>
                        <div className="text-gray-500">{selectedUser.lifecycleStatusUpdatedAt?.toDate?.()?.toLocaleDateString('ar-EG') || '—'}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {(selectedUser.lifecycleStatus === USER_STATUS.INACTIVE || selectedUser.lifecycleStatus === USER_STATUS.ARCHIVED) && (
                  <button
                    onClick={() => handleReactivateUser(selectedUser.id, selectedUser.branchId)}
                    disabled={processing[`reactivate-${selectedUser.id}`]}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    إعادة تفعيل الحساب
                  </button>
                )}
              </div>
            </div>
            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex justify-end">
              <button onClick={closeModal} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {imageModal.open && imageModal.url && (
        <FileViewerModal
          url={imageModal.url}
          onClose={() => setImageModal({ open: false, url: null, title: '' })}
        />
      )}
    </div>
  );
};

export default UserLifecyclePage;
