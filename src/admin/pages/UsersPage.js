import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Search, AlertCircle, CheckCircle, Clock, X as CloseIcon, Eye, UserCheck, Image as ImageIcon, Filter } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import FileViewerModal from '../components/FileViewerModal';
import { useBranch } from '../../contexts/BranchContext';
import { getPendingAdminUsersByBranch, updateUser } from '../../services/userService';

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [processing, setProcessing] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [imageModal, setImageModal] = useState({ open: false, url: null, title: '' });
  const [viewMode, setViewMode] = useState('table');
  const [currentUser, setCurrentUser] = useState(null);
  const { selectedBranchId } = useBranch();

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
    // Only load users when an admin is authenticated AND a branch is selected.
    if (!currentUser || !selectedBranchId) return;
    
    const loadUsers = async () => {
      setLoading(true);
      try {
        const usersData = await getPendingAdminUsersByBranch(selectedBranchId);
        setUsers(usersData);
        setError('');
      } catch (err) {
        console.error('Error loading users:', err);
        if (err.code === 'permission-denied') {
          setError('ليس لديك صلاحية للوصول إلى قائمة المستخدمين. تحقق من إعدادات Firebase Security Rules.');
        } else {
          setError('فشل في تحميل المستخدمين: ' + err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
    const interval = setInterval(loadUsers, 30000);
    return () => clearInterval(interval);
  }, [currentUser, selectedBranchId]);

  const filteredUsers = useMemo(() => {
    let filtered = users;
    if (branchFilter !== 'all') {
      filtered = filtered.filter(user => user.branchId === branchFilter);
    }

    // SINGLE SOURCE OF TRUTH:
    // branches/{branchId}/users/{uid}.verificationStatus
    filtered = filtered.filter((u) => String(u?.verificationStatus || '').toLowerCase() === 'pending');

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
  }, [users, searchQuery, branchFilter]);

  const handleDecision = async (userId, approve, branchId) => {
    try {
      setProcessing(prev => ({ ...prev, [`decision-${userId}`]: true }));
      if (!branchId) {
        const user = users.find(u => u.id === userId);
        branchId = user?.branchId;
      }
      if (!branchId) {
        throw new Error('branchId is required to update verification status');
      }

      await updateUser(
        userId,
        approve
          ? {
              status: 'active',
              verificationStatus: 'verified',
              verificationRequest: null,
              verified: true,
              accountVerified: true,
            }
          : {
              status: 'rejected',
              verificationStatus: 'rejected',
              verificationRequest: null,
              verified: false,
              accountVerified: false,
              uploadedDocs: [],
              photoUrl: null,
              idCardUrl: null,
            },
        branchId
      );

      setUsers(prev => prev.filter(u => u.id !== userId));
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser(null);
        setModalOpen(false);
      }

      alert(approve ? 'تم قبول الحساب بنجاح' : 'تم رفض الحساب');
    } catch (err) {
      console.error('Error toggling verification:', err);
      alert('حدث خطأ أثناء معالجة الحساب: ' + err.message);
    } finally {
      setProcessing(prev => ({ ...prev, [`decision-${userId}`]: false }));
    }
  };

  // Helper function to extract URL from either string or object format
  const getImageUrl = (urlValue) => {
    if (!urlValue) return null;
    if (typeof urlValue === 'string') {
      return urlValue;
    }
    if (typeof urlValue === 'object' && urlValue.publicUrl) {
      return urlValue.publicUrl;
    }
    return null;
  };

  const openImageModal = (url, title) => {
    const imageUrl = getImageUrl(url);
    if (imageUrl) {
      setImageModal({ open: true, url: imageUrl, title });
    }
  };

  const formatDate = (date) => {
    if (!date) return 'غير محدد';
    try {
      if (date.toDate) {
        return date.toDate().toLocaleDateString('ar-EG');
      }
      if (typeof date === 'string') {
        return new Date(date).toLocaleDateString('ar-EG');
      }
      return date.toString();
    } catch (err) {
      return 'غير محدد';
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
      <Breadcrumb trail={["المستخدمون"]} />
      
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">إدارة المستخدمين</h1>
          <p className="text-gray-600">عرض طلبات إنشاء الحسابات التي تم التحقق من بريدها الإلكتروني</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <div>
              <p className="font-semibold">{error}</p>
              {error.includes('صلاحية') && (
                <p className="text-sm mt-2">
                  تأكد من إضافة القواعد التالية في Firebase Console → Firestore Database → Rules:
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-right appearance-none bg-white"
            >
              <option value="all">جميع الفروع</option>
              <option value="boumerdes">بومرداس</option>
              <option value="bordj_menaiel">برج منايل</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">عرض:</span>
            <button
              onClick={() => setViewMode('table')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === 'table' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              جدول
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === 'card' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              بطاقات
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{filteredUsers.length}</div>
          <div className="text-sm text-gray-600">
            {branchFilter === 'all' ? 'إجمالي الطلبات' : `الطلبات (${branchFilter === 'boumerdes' ? 'بومرداس' : 'برج منايل'})`}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-green-600">{filteredUsers.length}</div>
          <div className="text-sm text-gray-600">طلبات بانتظار القرار</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-yellow-600">{filteredUsers.length}</div>
          <div className="text-sm text-gray-600">بانتظار المراجعة</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-blue-600">{filteredUsers.filter(u => u.branchId).length}</div>
          <div className="text-sm text-gray-600">مستخدمون في الفروع</div>
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <UserCheck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchQuery ? 'لا توجد نتائج' : 'لا يوجد مستخدمون'}
          </h3>
          <p className="text-gray-600">
            {searchQuery ? 'جرب البحث بكلمات مختلفة' : 'لم يتم تسجيل أي مستخدمين حتى الآن'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="admin-table-container">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>الاسم الكامل</th>
                  <th>رقم التسجيل</th>
                  <th>البريد الإلكتروني</th>
                  <th>الفرع</th>
                  <th>الصور</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  (console.log('[Admin UsersPage] Pending user row', {
                    path: `branches/${selectedBranchId}/users/${user.id}`,
                    verificationStatus: user?.verificationStatus,
                    status: user?.status,
                    doc: user,
                  }),
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{user.fullName || 'غير محدد'}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="text-sm text-gray-700">{user.registrationNumber || '—'}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="text-sm text-gray-600">{user.email || '—'}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="text-sm text-gray-700">
                        {user.branchId === 'boumerdes' ? 'بومرداس' : user.branchId === 'bordj_menaiel' ? 'برج منايل' : user.branchName || user.branchId || '—'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {user.photoUrl && (
                          <button onClick={() => openImageModal(user.photoUrl, 'الصورة الشخصية')} className="relative group" title="الصورة الشخصية">
                            <img src={getImageUrl(user.photoUrl)} alt="الصورة الشخصية" className="w-12 h-12 object-cover rounded-lg border-2 border-gray-200 hover:border-primary transition-colors cursor-pointer" onError={(e) => { e.target.style.display = 'none'; }} />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-lg transition-opacity flex items-center justify-center">
                              <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </button>
                        )}
                        {user.idCardUrl && (
                          <button onClick={() => openImageModal(user.idCardUrl, 'صورة بطاقة الهوية')} className="relative group" title="صورة بطاقة الهوية">
                            <img src={getImageUrl(user.idCardUrl)} alt="صورة بطاقة الهوية" className="w-12 h-12 object-cover rounded-lg border-2 border-gray-200 hover:border-primary transition-colors cursor-pointer" onError={(e) => { e.target.style.display = 'none'; }} />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-lg transition-opacity flex items-center justify-center">
                              <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </button>
                        )}
                        {!user.photoUrl && !user.idCardUrl && <span className="text-gray-400 text-xs whitespace-normal">لا توجد صور</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                        <Clock className="w-3 h-3" />قيد المراجعة
                      </span>
                    </td>
                    <td className="admin-table-actions">
                      <button
                        onClick={() => openDetailsModal(user)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                      >
                        <Eye className="w-4 h-4" />
                        عرض التفاصيل
                      </button>
                    </td>
                  </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUsers.map((user) => (
            (console.log('[Admin UsersPage] Pending user card', {
              path: `branches/${selectedBranchId}/users/${user.id}`,
              verificationStatus: user?.verificationStatus,
              status: user?.status,
              doc: user,
            }),
            <div key={user.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  {user.photoUrl ? (
                    <button onClick={() => openImageModal(user.photoUrl, 'الصورة الشخصية')} className="relative group flex-shrink-0">
                      <img src={getImageUrl(user.photoUrl)} alt="الصورة الشخصية" className="w-20 h-20 object-cover rounded-full border-2 border-gray-200 hover:border-primary transition-colors cursor-pointer" onError={(e) => { e.target.style.display = 'none'; }} />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-full transition-opacity flex items-center justify-center">
                        <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" />
                      </div>
                    </button>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                      <UserCheck className="w-10 h-10 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">{user.fullName || 'غير محدد'}</h3>
                    <p className="text-sm text-gray-600">{user.email || '—'}</p>
                    <p className="text-sm text-gray-500">{user.registrationNumber || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-600">حالة التحقق:</span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                    <Clock className="w-3 h-3" />قيد المراجعة
                  </span>
                </div>
                {user.idCardUrl && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">بطاقة الهوية:</label>
                    <button onClick={() => openImageModal(user.idCardUrl, 'صورة بطاقة الهوية')} className="relative group w-full">
                      <img src={getImageUrl(user.idCardUrl)} alt="صورة بطاقة الهوية" className="w-full h-32 object-cover rounded-lg border-2 border-gray-200 hover:border-primary transition-colors cursor-pointer" onError={(e) => { e.target.style.display = 'none'; }} />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-opacity flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-white opacity-0 group-hover:opacity-100" />
                      </div>
                    </button>
                  </div>
                )}
                <button onClick={() => openDetailsModal(user)} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium">
                  <Eye className="w-4 h-4" />عرض التفاصيل الكاملة
                </button>
              </div>
            </div>
            )
          ))}
        </div>
      )}

      {modalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50" onClick={closeModal}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-2xl font-bold text-gray-900">تفاصيل المستخدم</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <CloseIcon className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <UserCheck className="w-5 h-5" />حالة التحقق
                </h3>
                <span className="inline-flex items-center gap-1 text-yellow-700 mb-3">
                  <Clock className="w-5 h-5" /><span className="font-medium">⏳ قيد المراجعة</span>
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    onClick={() => handleDecision(selectedUser.id, true, selectedUser.branchId)}
                    disabled={processing[`decision-${selectedUser.id}`]}
                    className="w-full px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium bg-green-600 hover:bg-green-700"
                  >
                    {processing[`decision-${selectedUser.id}`] ? 'جاري المعالجة...' : 'قبول الحساب'}
                  </button>
                  <button
                    onClick={() => handleDecision(selectedUser.id, false, selectedUser.branchId)}
                    disabled={processing[`decision-${selectedUser.id}`]}
                    className="w-full px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium bg-red-600 hover:bg-red-700"
                  >
                    {processing[`decision-${selectedUser.id}`] ? 'جاري المعالجة...' : 'رفض الحساب'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedUser.photoUrl && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">الصورة الشخصية</h3>
                    <button onClick={() => openImageModal(selectedUser.photoUrl, 'الصورة الشخصية')} className="relative group w-full">
                      <img src={getImageUrl(selectedUser.photoUrl)} alt="الصورة الشخصية" className="w-full h-64 object-cover rounded-lg border-2 border-gray-200 hover:border-primary transition-colors cursor-pointer" onError={(e) => { e.target.style.display = 'none'; }} />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-opacity flex items-center justify-center">
                        <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100" />
                      </div>
                    </button>
                  </div>
                )}
                {selectedUser.idCardUrl && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">صورة بطاقة الهوية</h3>
                    <button onClick={() => openImageModal(selectedUser.idCardUrl, 'صورة بطاقة الهوية')} className="relative group w-full">
                      <img src={getImageUrl(selectedUser.idCardUrl)} alt="صورة بطاقة الهوية" className="w-full h-64 object-cover rounded-lg border-2 border-gray-200 hover:border-primary transition-colors cursor-pointer" onError={(e) => { e.target.style.display = 'none'; }} />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-opacity flex items-center justify-center">
                        <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100" />
                      </div>
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الكامل</label>
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{selectedUser.fullName || '—'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">رقم التسجيل</label>
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{selectedUser.registrationNumber || '—'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الازدياد</label>
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{formatDate(selectedUser.birthDate) || '—'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">مكان الازدياد</label>
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{selectedUser.birthPlace || '—'}</div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">العنوان</label>
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{selectedUser.address || '—'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{selectedUser.phone || selectedUser.phoneNumber || '—'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{selectedUser.email || '—'}</div>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex justify-end">
              <button onClick={closeModal} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium">
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

export default UsersPage;