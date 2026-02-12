import React, { useEffect, useState, useMemo } from 'react';
import { useBranch } from '../../contexts/BranchContext';
import { db } from '../../firebase';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { MessageSquare, CheckCircle, FileText, Mail, Calendar, Search, Filter, User, BookOpen, AlertCircle, Eye, Check, X, Clock } from 'lucide-react';

/**
 * Admin page for viewing and managing all training requests from students
 * Features:
 * - Real-time updates
 * - Search by name and training type
 * - Filter by status
 * - View full request details
 * - Clear status workflow: pending → reviewing → completed/rejected
 */
const TrainingRequestsPage = () => {
  const { selectedBranchId } = useBranch();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState({});
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, pending, reviewing, completed, rejected
  const [viewMode, setViewMode] = useState('table'); // table or card
  
  // Detail modal state
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const normalizeStatus = (rawStatus) => {
    const status = rawStatus == null ? '' : String(rawStatus).trim().toLowerCase();
    if (!status || status === 'pending') return 'pending';
    if (status === 'reviewed' || status === 'reviewing' || status === 'قيد المراجعة') return 'reviewing';
    if (status === 'completed' || status === 'مكتمل') return 'completed';
    if (status === 'rejected' || status === 'مرفوض') return 'rejected';
    return 'pending';
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
        return status === statusFilter;
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
        reviewing: 'تم وضع الطلب قيد المراجعة',
        completed: 'تم إكمال الطلب بنجاح',
        rejected: 'تم رفض الطلب',
        pending: 'تم إعادة الطلب للحالة المعلقة'
      };

      // Close modal if open
      if (showDetailModal) {
        setShowDetailModal(false);
        setSelectedRequest(null);
      }

    } catch (err) {
      console.error('Error updating request status:', err);
      alert('حدث خطأ أثناء تحديث حالة الطلب');
    } finally {
      setProcessing(prev => ({ ...prev, [requestId]: false }));
    }
  };

  // Open detail modal
  const handleViewDetails = (request) => {
    setSelectedRequest(request);
    setShowDetailModal(true);
  };

  // Close detail modal
  const handleCloseModal = () => {
    setShowDetailModal(false);
    setSelectedRequest(null);
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

  // Get status badge
  const getStatusBadge = (status) => {
    const normalizedStatus = normalizeStatus(status);
    
    const statusMap = {
      pending: { label: 'قيد الانتظار', class: 'bg-yellow-100 text-yellow-800', icon: Clock },
      reviewing: { label: 'قيد المراجعة', class: 'bg-blue-100 text-blue-800', icon: Eye },
      completed: { label: 'مكتمل', class: 'bg-green-100 text-green-800', icon: CheckCircle },
      rejected: { label: 'مرفوض', class: 'bg-red-100 text-red-800', icon: X }
    };

    const statusInfo = statusMap[normalizedStatus] || statusMap.pending;
    const StatusIcon = statusInfo.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${statusInfo.class}`}>
        <StatusIcon className="w-4 h-4" />
        {statusInfo.label}
      </span>
    );
  };

  // Get status counts
  const statusCounts = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter(r => normalizeStatus(r.status) === 'pending').length,
      reviewing: requests.filter(r => normalizeStatus(r.status) === 'reviewing').length,
      completed: requests.filter(r => normalizeStatus(r.status) === 'completed').length,
      rejected: requests.filter(r => normalizeStatus(r.status) === 'rejected').length
    };
  }, [requests]);

  if (!selectedBranchId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <p className="text-xl text-gray-700">يرجى اختيار الفرع أولاً</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-xl text-gray-700">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">طلبات الدورات التكوينية</h1>
        <p className="text-gray-600">عرض وإدارة جميع طلبات الدورات التكوينية من الطلاب</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Search and Filter Controls */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="البحث بالاسم، البريد، أو نوع الدورة..."
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
            <option value="reviewing">قيد المراجعة</option>
            <option value="completed">مكتمل</option>
            <option value="rejected">مرفوض</option>
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 justify-end">
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

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-3xl font-bold text-gray-900">{statusCounts.total}</div>
          <div className="text-sm text-gray-600">إجمالي الطلبات</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg shadow-sm border border-yellow-200">
          <div className="text-3xl font-bold text-yellow-800">{statusCounts.pending}</div>
          <div className="text-sm text-yellow-700">قيد الانتظار</div>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200">
          <div className="text-3xl font-bold text-blue-800">{statusCounts.reviewing}</div>
          <div className="text-sm text-blue-700">قيد المراجعة</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg shadow-sm border border-green-200">
          <div className="text-3xl font-bold text-green-800">{statusCounts.completed}</div>
          <div className="text-sm text-green-700">مكتمل</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg shadow-sm border border-red-200">
          <div className="text-3xl font-bold text-red-800">{statusCounts.rejected}</div>
          <div className="text-sm text-red-700">مرفوض</div>
        </div>
      </div>

      {/* Requests Display */}
      {filteredRequests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-sm">
          <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            {searchQuery || statusFilter !== 'all' ? 'لا توجد نتائج' : 'لا توجد طلبات'}
          </h3>
          <p className="text-gray-500">
            {searchQuery || statusFilter !== 'all' 
              ? 'جرب البحث أو تغيير المرشحات' 
              : 'لم يتم إرسال أي طلبات دورات تكوينية حتى الآن'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* Table View */
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الاسم</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">البريد الإلكتروني</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">نوع الدورة</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">التاريخ المفضل</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">تاريخ الإرسال</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الحالة</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRequests.map((request) => {
                  const normalizedStatus = normalizeStatus(request.status);
                  return (
                    <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="w-5 h-5 text-gray-400 ml-3" />
                          <span className="text-sm font-medium text-gray-900">{request.name || 'غير محدد'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{request.email || 'غير محدد'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <BookOpen className="w-5 h-5 text-gray-400 ml-2" />
                          <span className="text-sm text-gray-900">{request.course || request.courseName || 'غير محدد'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {request.preferredDate || 'غير محدد'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="w-4 h-4 ml-2" />
                          {formatDate(request.createdAt)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(request.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* View Details - Always visible */}
                          <button
                            onClick={() => handleViewDetails(request)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
                            title="عرض التفاصيل"
                          >
                            <Eye className="w-4 h-4" />
                            عرض
                          </button>

                          {/* Status-specific actions */}
                          {normalizedStatus === 'pending' && (
                            <button
                              onClick={() => handleUpdateStatus(request.id, 'reviewing')}
                              disabled={processing[request.id]}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              title="بدء المراجعة"
                            >
                              <Eye className="w-4 h-4" />
                              مراجعة
                            </button>
                          )}

                          {normalizedStatus === 'reviewing' && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(request.id, 'completed')}
                                disabled={processing[request.id]}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="قبول وإكمال"
                              >
                                <Check className="w-4 h-4" />
                                قبول
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(request.id, 'rejected')}
                                disabled={processing[request.id]}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="رفض الطلب"
                              >
                                <X className="w-4 h-4" />
                                رفض
                              </button>
                            </>
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
      ) : (
        /* Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRequests.map((request) => {
            const normalizedStatus = normalizeStatus(request.status);
            return (
              <div key={request.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5 text-gray-400" />
                      <h3 className="text-lg font-semibold text-gray-900">{request.name || 'غير محدد'}</h3>
                    </div>
                    {getStatusBadge(request.status)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <Mail className="w-4 h-4" />
                    {request.email || 'غير محدد'}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="w-4 h-4" />
                    تاريخ الإرسال: {formatDate(request.createdAt)}
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                  {/* Training Topic */}
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                      <BookOpen className="w-4 h-4" />
                      نوع الدورة:
                    </div>
                    <p className="text-gray-900 mr-6">{request.course || request.courseName || 'غير محدد'}</p>
                  </div>

                  {/* Preferred Date */}
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                      <Calendar className="w-4 h-4" />
                      التاريخ المفضل:
                    </div>
                    <p className="text-gray-900 mr-6">{request.preferredDate || 'غير محدد'}</p>
                  </div>

                  {/* Additional Notes Preview */}
                  {request.message && (
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                        <MessageSquare className="w-4 h-4" />
                        ملاحظات:
                      </div>
                      <p className="text-gray-600 text-sm mr-6 line-clamp-2">{request.message}</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="p-6 bg-gray-50 border-t border-gray-200 flex gap-2 flex-wrap">
                  {/* View Details - Always visible */}
                  <button
                    onClick={() => handleViewDetails(request)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    عرض التفاصيل
                  </button>

                  {/* Status-specific actions */}
                  {normalizedStatus === 'pending' && (
                    <button
                      onClick={() => handleUpdateStatus(request.id, 'reviewing')}
                      disabled={processing[request.id]}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      بدء المراجعة
                    </button>
                  )}

                  {normalizedStatus === 'reviewing' && (
                    <>
                      <button
                        onClick={() => handleUpdateStatus(request.id, 'completed')}
                        disabled={processing[request.id]}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Check className="w-4 h-4" />
                        قبول
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(request.id, 'rejected')}
                        disabled={processing[request.id]}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <X className="w-4 h-4" />
                        رفض
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">تفاصيل الطلب</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الحالة الحالية</label>
                {getStatusBadge(selectedRequest.status)}
              </div>

              {/* Student Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <User className="w-4 h-4 inline ml-2" />
                    اسم الطالب
                  </label>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{selectedRequest.name || 'غير محدد'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Mail className="w-4 h-4 inline ml-2" />
                    البريد الإلكتروني
                  </label>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-lg break-all">{selectedRequest.email || 'غير محدد'}</p>
                </div>
              </div>

              {/* Training Details */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <BookOpen className="w-4 h-4 inline ml-2" />
                  نوع الدورة التكوينية
                </label>
                <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{selectedRequest.course || selectedRequest.courseName || 'غير محدد'}</p>
              </div>

              {/* Preferred Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline ml-2" />
                  التاريخ المفضل
                </label>
                <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{selectedRequest.preferredDate || 'غير محدد'}</p>
              </div>

              {/* Additional Notes */}
              {selectedRequest.message && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <MessageSquare className="w-4 h-4 inline ml-2" />
                    ملاحظات إضافية
                  </label>
                  <div className="text-gray-900 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap">
                    {selectedRequest.message}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">تاريخ الإرسال</label>
                  <p className="text-gray-600 text-sm">{formatDate(selectedRequest.createdAt)}</p>
                </div>
                {selectedRequest.updatedAt && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">آخر تحديث</label>
                    <p className="text-gray-600 text-sm">{formatDate(selectedRequest.updatedAt)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer - Actions */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6 flex gap-3 flex-wrap">
              {normalizeStatus(selectedRequest.status) === 'pending' && (
                <>
                  <button
                    onClick={() => handleUpdateStatus(selectedRequest.id, 'reviewing')}
                    disabled={processing[selectedRequest.id]}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    <Eye className="w-5 h-5" />
                    بدء المراجعة
                  </button>
                  <button
                    onClick={handleCloseModal}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    إغلاق
                  </button>
                </>
              )}

              {normalizeStatus(selectedRequest.status) === 'reviewing' && (
                <>
                  <button
                    onClick={() => handleUpdateStatus(selectedRequest.id, 'completed')}
                    disabled={processing[selectedRequest.id]}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    <Check className="w-5 h-5" />
                    قبول وإكمال
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedRequest.id, 'rejected')}
                    disabled={processing[selectedRequest.id]}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    <X className="w-5 h-5" />
                    رفض الطلب
                  </button>
                  <button
                    onClick={handleCloseModal}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    إغلاق
                  </button>
                </>
              )}

              {(normalizeStatus(selectedRequest.status) === 'completed' || normalizeStatus(selectedRequest.status) === 'rejected') && (
                <button
                  onClick={handleCloseModal}
                  className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
                >
                  إغلاق
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingRequestsPage;