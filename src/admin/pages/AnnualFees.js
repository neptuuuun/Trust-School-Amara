import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import { useAuth } from '../../contexts/AuthContext';
import { getAnnualPayments, verifyAnnualPayment, rejectAnnualPayment } from '../../services/firestoreService';
import { CheckCircle, XCircle, Calendar, Eye, CreditCard, User, BookOpen } from 'lucide-react';

const AnnualFees = () => {
  const { selectedBranchId } = useBranch();
  const { user } = useAuth();
  const [annualFees, setAnnualFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFee, setSelectedFee] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    if (!selectedBranchId) {
      setAnnualFees([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Read from annualPayments collection (new structure)
    const q = query(collection(db, 'branches', selectedBranchId, 'annualPayments'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAnnualFees(list);
      setLoading(false);
    }, (error) => {
      console.error('Error loading annual payments:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedBranchId]);

  const formatDate = (ts) => {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    return d ? d.toLocaleDateString('ar-DZ') : 'غير محدد';
  };

  const fetchUserData = async (userId) => {
    if (!userId) return null;
    if (!selectedBranchId) return null;
    
    try {
      const userDocRef = doc(db, 'branches', selectedBranchId, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        return userDoc.data();
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
    
    return null;
  };

  const handleOpenModal = async (fee) => {
    setSelectedFee(fee);
    setUserData(null); // Reset user data
    
    // Fetch user data when opening modal
    if (fee.userId) {
      const data = await fetchUserData(fee.userId);
      setUserData(data);
    }
    
    setShowModal(true);
  };

  const approveFee = async (fee) => {
    if (!user) {
      alert('يجب تسجيل الدخول كمسؤول');
      return;
    }

    try {
      const adminInfo = {
        uid: user.uid,
        email: user.email || ''
      };

      await verifyAnnualPayment(selectedBranchId, fee.id, adminInfo);

      alert('تم التحقق من الرسوم السنوية بنجاح. تم تفعيل حساب المستخدم.');
      setShowModal(false);
    } catch (e) {
      console.error('Error approving fee:', e);
      alert('تعذر التحقق من الرسوم السنوية: ' + e.message);
    }
  };

  const rejectFee = async (fee) => {
    try {
      const notes = prompt('أدخل سبب الرفض (اختياري):');
      await rejectAnnualPayment(selectedBranchId, fee.id, notes || null);

      alert('تم رفض الرسوم السنوية');
      setShowModal(false);
    } catch (e) {
      console.error('Error rejecting fee:', e);
      alert('تعذر رفض الرسوم السنوية: ' + e.message);
    }
  };

  if (!selectedBranchId) {
    return <div className="text-center py-12 text-gray-600">يرجى اختيار فرع.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-primary mb-2">الرسوم السنوية</h1>
          <p className="text-xl text-gray-600">إدارة طلبات الرسوم السنوية</p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-600">
              {annualFees.filter(f => f.status === 'pending').length}
            </div>
            <div className="text-sm text-yellow-700">قيد المراجعة</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">
              {annualFees.filter(f => f.status === 'verified').length}
            </div>
            <div className="text-sm text-green-700">تم التحقق</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-600">
              {annualFees.filter(f => f.status === 'rejected').length}
            </div>
            <div className="text-sm text-red-700">مرفوضة</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-100">
        <div className="p-6 overflow-x-auto">
          {annualFees.length === 0 ? (
            <div className="text-center py-12 text-gray-500">لا توجد طلبات رسوم سنوية</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">المستوى</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">المدرسة</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">المواد</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">المبلغ</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">طريقة الدفع</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الحالة</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">التاريخ</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {annualFees.map((fee) => (
                  <tr key={fee.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4">
                      <div className="font-semibold text-gray-800">{fee.level || '—'}</div>
                      {fee.year && <div className="text-sm text-gray-600">السنة: {fee.year}</div>}
                      {fee.stream && <div className="text-sm text-gray-600">الشعبة: {fee.stream}</div>}
                    </td>
                    <td className="py-4 px-4 text-sm">{fee.school || '—'}</td>
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1">
                        {fee.subjects?.slice(0, 2).map((subject, i) => (
                          <span key={i} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                            {subject}
                          </span>
                        ))}
                        {fee.subjects?.length > 2 && (
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                            +{fee.subjects.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-semibold text-green-600">{fee.totalAmount || fee.amount || 0} دج</span>
                    </td>
                    <td className="py-4 px-4 text-sm">{fee.paymentMethod || '—'}</td>
                    <td className="py-4 px-4">
                      {fee.status === 'verified' ? (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">تم التحقق</span>
                      ) : fee.status === 'rejected' ? (
                        <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">مرفوض</span>
                      ) : (
                        <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">قيد المراجعة</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-600 flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(fee.createdAt)}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleOpenModal(fee)} 
                          className="btn btn-outline-primary btn-sm"
                        >
                          <Eye className="w-4 h-4 ml-1" /> عرض
                        </button>
                        {fee.status === 'pending' && (
                          <>
                            <button onClick={() => approveFee(fee)} className="btn btn-success btn-sm">
                              <CheckCircle className="w-4 h-4 ml-1" /> تحقق
                            </button>
                            <button onClick={() => rejectFee(fee)} className="btn btn-danger btn-sm">
                              <XCircle className="w-4 h-4 ml-1" /> رفض
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal for viewing fee details */}
      {showModal && selectedFee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-primary">تفاصيل الرسوم السنوية</h2>
              <button onClick={() => setShowModal(false)} className="text-2xl leading-none">×</button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Student Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  معلومات الطالب
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">اسم الطالب:</span>
                    <div className="font-medium">
                      {userData?.displayName || userData?.username || selectedFee.userName || selectedFee.studentName || '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">رقم هاتف الولي:</span>
                    <div className="font-medium">{selectedFee.userPhone || selectedFee.guardianPhone || '—'}</div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">رقم هاتف التلميذ:</span>
                    <div className="font-medium">{selectedFee.studentPhone || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Education Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  معلومات الدراسة
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">المستوى:</span>
                    <div className="font-medium">{selectedFee.level || '—'}</div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">السنة الدراسية:</span>
                    <div className="font-medium">{selectedFee.year || '—'}</div>
                  </div>
                  {selectedFee.stream && (
                    <div>
                      <span className="text-sm text-gray-600">الشعبة:</span>
                      <div className="font-medium">{selectedFee.stream}</div>
                    </div>
                  )}
                  <div className="col-span-2">
                    <span className="text-sm text-gray-600">المؤسسة التعليمية:</span>
                    <div className="font-medium">{selectedFee.school || '—'}</div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm text-gray-600">المواد المختارة:</span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedFee.subjects?.map((subject, i) => (
                        <span key={i} className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
                          {subject}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  معلومات الدفع
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">الرسوم السنوية الأساسية:</span>
                    <div className="font-medium text-gray-800">{selectedFee.annualFee || selectedFee.baseAnnualFee || 1000} دج</div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">المبلغ الإجمالي:</span>
                    <div className="font-medium text-green-600">{selectedFee.amount || selectedFee.totalAmount || 0} دج</div>
                  </div>
                  {selectedFee.subjectPrices && Object.keys(selectedFee.subjectPrices).length > 0 && (
                    <div className="col-span-2">
                      <span className="text-sm text-gray-600">أسعار المواد:</span>
                      <div className="mt-2 space-y-1">
                        {Object.entries(selectedFee.subjectPrices).map(([subject, price]) => (
                          <div key={subject} className="text-sm text-gray-700">
                            {subject}: {price} دج/شهر
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="text-sm text-gray-600">طريقة الدفع:</span>
                    <div className="font-medium">{selectedFee.paymentMethod || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Receipt Image */}
              {(selectedFee.receiptUrl || selectedFee.screenshotUrl) && (
                <div>
                  <h3 className="font-semibold text-lg mb-3">إيصال الدفع</h3>
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <img 
                      src={selectedFee.receiptUrl || selectedFee.screenshotUrl} 
                      alt="Receipt" 
                      className="max-w-full h-auto rounded-lg cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => window.open(selectedFee.receiptUrl || selectedFee.screenshotUrl, '_blank')}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              {selectedFee.status === 'pending' && (
                <div className="flex justify-end space-x-4 space-x-reverse pt-4 border-t border-gray-200">
                  <button onClick={() => rejectFee(selectedFee)} className="btn btn-danger">
                    <XCircle className="w-4 h-4 ml-2" />
                    رفض
                  </button>
                  <button onClick={() => approveFee(selectedFee)} className="btn btn-success">
                    <CheckCircle className="w-4 h-4 ml-2" />
                    تحقق
                  </button>
                </div>
              )}
              {selectedFee.status === 'verified' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">تم التحقق من هذا الطلب</span>
                  </div>
                  <p className="text-sm text-green-700 mt-2">
                    تم تفعيل حساب المستخدم ويمكنه الآن التسجيل في دروس الدعم.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnualFees;






