import React, { useEffect, useState, useMemo } from 'react';
import { useBranch } from '../../contexts/BranchContext';
import { db } from '../../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  MessageSquare,
  CheckCircle,
  FileText,
  Mail,
  Calendar,
  Search,
  Filter,
  User,
  BookOpen,
  AlertCircle,
  Eye,
  Check
} from 'lucide-react';

/**
 * Admin page for viewing and managing all training requests from students
 * Features:
 * - Real-time updates
 * - Search by name and training type
 * - Filter by status
 * - Mark as Reviewed or Completed
 */
const TrainingRequestsPage = () => {
  const { selectedBranchId } = useBranch();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState({});
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, pending, reviewed, completed
  const [viewMode, setViewMode] = useState('table'); // table or card
  const [expandedNotes, setExpandedNotes] = useState({}); // Track which rows have notes expanded

  const normalizeStatus = (rawStatus) => {
    const status = rawStatus == null ? '' : String(rawStatus).trim();
    if (!status) return 'جديد';
    if (status.toLowerCase() === 'pending') return 'جديد';
    return status;
  };

  // Set up real-time listener for training requests
  useEffect(() => {
    if (!selectedBranchId) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Query for all training requests
    const q = query(
      collection(db, 'branches', selectedBranchId, 'registrations'),
      where('type', '==', 'training_request'),
      orderBy('createdAt', 'desc')
    );

    // Set up real-time listener
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const requestsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setRequests(requestsData);
        setLoading(false);
        setError('');
      },
      (err) => {
        console.error('Error loading training requests:', err);
        setError('فشل في تحميل طلبات الدورات التكوينية');
        setLoading(false);
      }
    );

    // Cleanup listener on unmount or branch change
    return () => unsubscribe();
  }, [selectedBranchId]);

  // Filter and search requests
  const filteredRequests = useMemo(() => {
    let filtered = requests;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(req => {
        const status = normalizeStatus(req.status);
        if (statusFilter === 'pending') return status === 'جديد' || status === 'pending';
        if (statusFilter === 'reviewed') return status === 'reviewed' || status === 'تمت المراجعة';
        if (statusFilter === 'completed') return status === 'completed' || status === 'مكتمل';
        return true;
      });
    }

    // Search by name, email, or training topic/type
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(req => {
        const name = (req.name || '').toLowerCase();
        const email = (req.email || '').toLowerCase();
        const course = (req.course || req.courseName || '').toLowerCase();
        return name.includes(query) || email.includes(query) || course.includes(query);
      });
    }

    return filtered;
  }, [requests, statusFilter, searchQuery]);

  // Handle status update
  const handleUpdateStatus = async (requestId, newStatus) => {
    if (!selectedBranchId) return;

    try {
      setProcessing(prev => ({ ...prev, [requestId]: true }));
      
      const requestRef = doc(db, 'branches', selectedBranchId, 'registrations', requestId);
      await updateDoc(requestRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      const statusMessages = {
        reviewed: 'تم وضع علامة مراجعة على الطلب',
        completed: 'تم إكمال الطلب',
        pending: 'تم إعادة الطلب للحالة المعلقة'
      };

      alert(statusMessages[newStatus] || 'تم تحديث حالة الطلب');
    } catch (err) {
      console.error('Error updating request status:', err);
      alert('حدث خطأ أثناء تحديث حالة الطلب');
    } finally {
      setProcessing(prev => ({ ...prev, [requestId]: false }));
    }
  };

  // Format date helper
  const formatDate = (timestamp) => {
    if (!timestamp) return 'غير محدد';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (err) {
      return 'غير محدد';
    }
  };

  // Get status badge color
  const getStatusBadge = (status) => {
    const normalizedStatus = normalizeStatus(status);
    const statusMap = {
      'جديد': { label: 'جديد', class: 'bg-yellow-100 text-yellow-800' },
      pending: { label: 'قيد الانتظار', class: 'bg-yellow-100 text-yellow-800' },
      reviewed: { label: 'تمت المراجعة', class: 'bg-blue-100 text-blue-800' },
      completed: { label: 'مكتمل', class: 'bg-green-100 text-green-800' },
      accepted: { label: 'مقبول', class: 'bg-green-100 text-green-800' },
      rejected: { label: 'مرفوض', class: 'bg-red-100 text-red-800' }
    };
    const statusInfo = statusMap[normalizedStatus] || statusMap['جديد'];
    
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusInfo.class}`}>
        {statusInfo.label}
      </span>
    );
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
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">طلبات الدورات التكوينية</h1>
        <p className="text-gray-600">
          عرض وإدارة جميع طلبات الدورات التكوينية من الطلاب
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {/* Search and Filter Controls */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="ابحث بالاسم، البريد الإلكتروني، أو نوع الدورة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-right"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent appearance-none text-right bg-white"
            >
              <option value="all">جميع الحالات</option>
              <option value="pending">قيد الانتظار</option>
              <option value="reviewed">تمت المراجعة</option>
              <option value="completed">مكتمل</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">عرض:</span>
            <button
              onClick={() => setViewMode('table')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === 'table'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              جدول
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === 'card'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              بطاقات
            </button>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{requests.length}</div>
          <div className="text-sm text-gray-600">إجمالي الطلبات</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-yellow-600">
            {requests.filter(r => {
              const status = normalizeStatus(r.status);
              return status === 'جديد' || status === 'pending';
            }).length}
          </div>
          <div className="text-sm text-gray-600">قيد الانتظار</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-blue-600">
            {requests.filter(r => r.status === 'reviewed').length}
          </div>
          <div className="text-sm text-gray-600">تمت المراجعة</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-green-600">
            {requests.filter(r => r.status === 'completed').length}
          </div>
          <div className="text-sm text-gray-600">مكتمل</div>
        </div>
      </div>

      {/* Requests Display */}
      {filteredRequests.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchQuery || statusFilter !== 'all' ? 'لا توجد نتائج' : 'لا توجد طلبات'}
          </h3>
          <p className="text-gray-600">
            {searchQuery || statusFilter !== 'all'
              ? 'جرب البحث أو تغيير المرشحات'
              : 'لم يتم إرسال أي طلبات دورات تكوينية حتى الآن'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* Table View */
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الاسم
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    البريد الإلكتروني
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    نوع الدورة
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    التاريخ المفضل
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    تاريخ الإرسال
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الحالة
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRequests.map((request) => {
                  const showNotes = expandedNotes[request.id] || false;
                  const normalizedStatus = normalizeStatus(request.status);
                  return (
                    <React.Fragment key={request.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <User className="w-4 h-4 text-gray-400 ml-2" />
                            <span className="text-sm font-medium text-gray-900">
                              {request.name || 'غير محدد'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Mail className="w-4 h-4 text-gray-400 ml-2" />
                            <span className="text-sm text-gray-600">{request.email || 'غير محدد'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900">
                            {request.course || request.courseName || 'غير محدد'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-500">
                            {request.preferredDate || 'غير محدد'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 text-gray-400 ml-2" />
                            <span className="text-sm text-gray-600">
                              {formatDate(request.createdAt)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(request.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {request.message && (
                              <button
                                onClick={() => setExpandedNotes(prev => ({ ...prev, [request.id]: !prev[request.id] }))}
                                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                                title="عرض الملاحظات"
                              >
                                <MessageSquare className="w-4 h-4" />
                                {showNotes ? 'إخفاء' : 'عرض'} الملاحظات
                              </button>
                            )}
                            {normalizedStatus === 'جديد' && (
                              <button
                                onClick={() => handleUpdateStatus(request.id, 'reviewed')}
                                disabled={processing[request.id]}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="وضع علامة مراجعة"
                              >
                                <Eye className="w-4 h-4" />
                                مراجعة
                              </button>
                            )}
                            {normalizedStatus !== 'completed' && normalizedStatus !== 'مكتمل' && (
                              <button
                                onClick={() => handleUpdateStatus(request.id, 'completed')}
                                disabled={processing[request.id]}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="وضع علامة مكتمل"
                              >
                                <Check className="w-4 h-4" />
                                إكمال
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {showNotes && request.message && (
                        <tr>
                          <td colSpan="7" className="px-6 py-4 bg-gray-50">
                            <div className="border-t pt-4">
                              <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5" />
                                ملاحظات إضافية:
                              </h4>
                              <p className="text-gray-700 whitespace-pre-wrap bg-white rounded-lg p-4">
                                {request.message}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Card View */
        <div className="grid gap-6">
          {filteredRequests.map((request) => {
            const normalizedStatus = normalizeStatus(request.status);
            return (
              <div
                key={request.id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900">
                          {request.name || 'غير محدد'}
                        </h3>
                        {getStatusBadge(request.status)}
                      </div>
                      <div className="flex items-center text-gray-600 mb-1">
                        <Mail className="w-4 h-4 ml-2" />
                        <span>{request.email || 'غير محدد'}</span>
                      </div>
                      <div className="flex items-center text-gray-500 text-sm">
                        <Calendar className="w-4 h-4 ml-2" />
                        <span>تاريخ الإرسال: {formatDate(request.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Training Topic */}
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <BookOpen className="w-5 h-5" />
                      نوع الدورة:
                    </h4>
                    <p className="text-gray-700 bg-gray-50 rounded-lg p-3">
                      {request.course || request.courseName || 'غير محدد'}
                    </p>
                  </div>

                  {/* Preferred Date */}
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      التاريخ المفضل:
                    </h4>
                    <p className="text-gray-700 bg-gray-50 rounded-lg p-3">
                      {request.preferredDate || 'غير محدد'}
                    </p>
                  </div>

                  {/* Additional Notes */}
                  {request.message && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5" />
                        ملاحظات إضافية:
                      </h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-gray-700 whitespace-pre-wrap">{request.message}</p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t">
                    {normalizedStatus === 'جديد' && (
                      <button
                        onClick={() => handleUpdateStatus(request.id, 'reviewed')}
                        disabled={processing[request.id]}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Eye className="w-5 h-5" />
                        وضع علامة مراجعة
                      </button>
                    )}
                    {normalizedStatus !== 'completed' && normalizedStatus !== 'مكتمل' && (
                      <button
                        onClick={() => handleUpdateStatus(request.id, 'completed')}
                        disabled={processing[request.id]}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <CheckCircle className="w-5 h-5" />
                        وضع علامة مكتمل
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TrainingRequestsPage;