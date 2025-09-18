import React, { useState, useEffect } from 'react';
import { 
  collection, 
  deleteDoc, 
  doc, 
  onSnapshot,
  query,
  orderBy,
  updateDoc 
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Trash2, Check, X, Phone, User, Calendar, MessageSquare } from 'lucide-react';

const TrainingRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);

  useEffect(() => {
    // Listen to training requests collection
    const requestsQuery = query(collection(db, 'trainingRequests'), orderBy('createdAt', 'desc'));
    const requestsUnsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRequests(requestsData);
      setLoading(false);
    });

    return () => {
      requestsUnsubscribe();
    };
  }, []);

  const handleDeleteRequest = async (requestId) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الطلب؟')) {
      try {
        await deleteDoc(doc(db, 'trainingRequests', requestId));
      } catch (error) {
        console.error('Error deleting request:', error);
      }
    }
  };

  const markAsProcessed = async (requestId) => {
    try {
      await updateDoc(doc(db, 'trainingRequests', requestId), {
        processed: true,
        processedAt: new Date()
      });
    } catch (error) {
      console.error('Error marking as processed:', error);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'غير محدد';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ar-DZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-primary mb-2">طلبات التدريب</h1>
          <p className="text-xl text-gray-600">إدارة طلبات الأشخاص الراغبين في الحصول على دورات تدريبية</p>
        </div>
        <div className="text-lg text-gray-600">
          إجمالي الطلبات: <span className="font-bold text-primary">{requests.length}</span>
        </div>
      </div>

      {/* Requests Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {requests.map((request) => (
          <div key={request.id} className={`bg-white rounded-xl shadow-md p-6 border ${
            request.processed ? 'border-green-200 bg-green-50' : 'border-gray-200'
          }`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-bold text-primary">{request.name}</h3>
                  {request.processed && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      تم المعالجة
                    </span>
                  )}
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 text-secondary ml-2" />
                    <span className="text-base">{request.phone}</span>
                  </div>
                  
                  <div className="flex items-center">
                    <MessageSquare className="h-4 w-4 text-accent ml-2" />
                    <span className="text-base font-medium">{request.requestedTopic}</span>
                  </div>
                  
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 text-gray-500 ml-2" />
                    <span className="text-sm text-gray-600">{formatDate(request.createdAt)}</span>
                  </div>
                </div>

                {request.message && (
                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <p className="text-sm text-gray-700">{request.message}</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex space-x-2 space-x-reverse">
              {!request.processed && (
                <button
                  onClick={() => markAsProcessed(request.id)}
                  className="btn btn-success btn-sm flex-1"
                  title="تم التواصل مع الشخص"
                >
                  <Check className="h-4 w-4 ml-1" />
                  تم المعالجة
                </button>
              )}
              
              <button
                onClick={() => setSelectedRequest(request)}
                className="btn btn-outline-primary btn-sm"
                title="عرض التفاصيل"
              >
                عرض
              </button>
              
              <button
                onClick={() => handleDeleteRequest(request.id)}
                className="btn btn-danger btn-sm"
                title="حذف الطلب"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Request Details Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-primary">تفاصيل طلب التدريب</h3>
              <button
                onClick={() => setSelectedRequest(null)}
                className="btn btn-outline-primary btn-sm"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-2">
                    الاسم الكامل
                  </label>
                  <p className="text-xl text-gray-900 bg-gray-50 p-3 rounded-lg">
                    {selectedRequest.name}
                  </p>
                </div>
                
                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-2">
                    رقم الهاتف
                  </label>
                  <p className="text-xl text-gray-900 bg-gray-50 p-3 rounded-lg">
                    {selectedRequest.phone}
                  </p>
                </div>
              </div>
              
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  المجال المطلوب
                </label>
                <p className="text-xl text-gray-900 bg-gray-50 p-3 rounded-lg">
                  {selectedRequest.requestedTopic}
                </p>
              </div>
              
              {selectedRequest.message && (
                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-2">
                    رسالة إضافية
                  </label>
                  <p className="text-base text-gray-900 bg-gray-50 p-3 rounded-lg">
                    {selectedRequest.message}
                  </p>
                </div>
              )}
              
              <div>
                <label className="block text-lg font-medium text-gray-700 mb-2">
                  تاريخ الطلب
                </label>
                <p className="text-base text-gray-900 bg-gray-50 p-3 rounded-lg">
                  {formatDate(selectedRequest.createdAt)}
                </p>
              </div>
              
              {selectedRequest.processed && (
                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-2">
                    تاريخ المعالجة
                  </label>
                  <p className="text-base text-gray-900 bg-green-50 p-3 rounded-lg">
                    {formatDate(selectedRequest.processedAt)}
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-4 space-x-reverse mt-6">
              {!selectedRequest.processed && (
                <button
                  onClick={() => {
                    markAsProcessed(selectedRequest.id);
                    setSelectedRequest(null);
                  }}
                  className="btn btn-success"
                >
                  <Check className="h-4 w-4 ml-1" />
                  تم المعالجة
                </button>
              )}
              
              <button
                onClick={() => setSelectedRequest(null)}
                className="btn btn-outline-primary"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {requests.length === 0 && (
        <div className="text-center py-12">
          <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <p className="text-xl text-gray-500">لا توجد طلبات تدريب حالياً</p>
          <p className="text-base text-gray-400 mt-2">
            ستظهر هنا طلبات الأشخاص الراغبين في الحصول على دورات تدريبية
          </p>
        </div>
      )}
    </div>
  );
};

export default TrainingRequests;