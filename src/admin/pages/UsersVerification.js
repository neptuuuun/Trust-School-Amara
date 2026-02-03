import React, { useEffect, useState } from 'react';
import { useBranch } from '../../contexts/BranchContext';
import { getUnverifiedUsers, updateUserVerification } from '../../services/firestoreService';
import { UserCheck, UserX, Mail, Calendar, AlertCircle } from 'lucide-react';

/**
 * Admin page for verifying new user registrations
 * Users must be verified before they can log in
 */
const UsersVerification = () => {
  const { selectedBranchId } = useBranch();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState({});

  useEffect(() => {
    if (selectedBranchId) {
      loadUsers();
    }
  }, [selectedBranchId]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await getUnverifiedUsers(selectedBranchId);

      console.log('[Admin UsersVerification] Pending users loaded', {
        branchId: selectedBranchId,
        paths: (data || []).map((u) => `branches/${selectedBranchId}/users/${u.id}`),
        users: data,
      });

      setUsers(data);
      setError('');
    } catch (err) {
      console.error('Error loading unverified users:', err);
      setError('فشل في تحميل المستخدمين');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (userId, approve) => {
    try {
      setProcessing(prev => ({ ...prev, [userId]: true }));
      await updateUserVerification(selectedBranchId, userId, approve);
      
      // Remove from list
      setUsers(prev => prev.filter(u => u.id !== userId));
      
      alert(approve ? 'تم قبول المستخدم بنجاح' : 'تم رفض المستخدم');
    } catch (err) {
      console.error('Error verifying user:', err);
      alert('حدث خطأ أثناء معالجة الطلب');
    } finally {
      setProcessing(prev => ({ ...prev, [userId]: false }));
    }
  };

  if (!selectedBranchId) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <p className="text-gray-600">يرجى اختيار الفرع أولاً</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-gray-600">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">التحقق من المستخدمين الجدد</h1>
        <p className="text-gray-600">
          راجع واقبل أو ارفض طلبات التسجيل الجديدة
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {users.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <UserCheck className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">لا توجد طلبات جديدة</h3>
          <p className="text-gray-600">جميع المستخدمين تم التحقق منهم</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {users.map(user => (
            (console.log('[Admin UsersVerification] Pending user card', {
              path: `branches/${selectedBranchId}/users/${user.id}`,
              verificationStatus: user?.verificationStatus,
              status: user?.status,
              doc: user,
            }),
            <div
              key={user.id}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">
                      {user.name || user.fullName || 'اسم غير متوفر'}
                    </h3>
                    <div className="flex items-center text-gray-600 mb-1">
                      <Mail className="w-4 h-4 ml-2" />
                      <span>{user.email}</span>
                    </div>
                    <div className="flex items-center text-gray-500 text-sm">
                      <Calendar className="w-4 h-4 ml-2" />
                      <span>
                        {user.createdAt?.toDate
                          ? new Date(user.createdAt.toDate()).toLocaleDateString('ar-EG')
                          : 'تاريخ غير متوفر'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleVerify(user.id, true)}
                      disabled={processing[user.id]}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <UserCheck className="w-5 h-5" />
                      قبول
                    </button>
                    <button
                      onClick={() => handleVerify(user.id, false)}
                      disabled={processing[user.id]}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <UserX className="w-5 h-5" />
                      رفض
                    </button>
                  </div>
                </div>

                {/* Additional user info */}
                {(user.phoneNumber || user.address || user.birthDate) && (
                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-semibold text-gray-900 mb-2">معلومات إضافية:</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {user.phoneNumber && (
                        <div>
                          <span className="text-gray-600">رقم الهاتف:</span>
                          <span className="mr-2 font-medium">{user.phoneNumber}</span>
                        </div>
                      )}
                      {user.birthDate && (
                        <div>
                          <span className="text-gray-600">تاريخ الميلاد:</span>
                          <span className="mr-2 font-medium">{user.birthDate}</span>
                        </div>
                      )}
                      {user.birthPlace && (
                        <div>
                          <span className="text-gray-600">مكان الميلاد:</span>
                          <span className="mr-2 font-medium">{user.birthPlace}</span>
                        </div>
                      )}
                      {user.address && (
                        <div className="col-span-2">
                          <span className="text-gray-600">العنوان:</span>
                          <span className="mr-2 font-medium">{user.address}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Display uploaded documents if available */}
                {user.uploadedDocs && user.uploadedDocs.length > 0 && (
                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-semibold text-gray-900 mb-2">المستندات المرفوعة:</h4>
                    <div className="flex gap-2 flex-wrap">
                      {user.uploadedDocs.map((docUrl, index) => (
                        <a
                          key={index}
                          href={docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline text-sm"
                        >
                          مستند {index + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            )
          ))}
        </div>
      )}
    </div>
  );
};

export default UsersVerification;







