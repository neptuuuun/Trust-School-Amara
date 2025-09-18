import React, { useState, useEffect } from 'react';
import { 
  collection, 
  deleteDoc, 
  doc, 
  onSnapshot,
  query,
  orderBy 
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Download, Trash2, Filter, Search, Mail, Phone, FileText } from 'lucide-react';

// Helper functions moved above components
const getTypeLabel = (type) => {
  switch (type) {
    case 'support': return 'دروس الدعم';
    case 'language': return 'اللغات';
    case 'training': return 'الدورات التكوينية';
    default: return 'غير معروف';
  }
};

const getPaymentStatusLabel = (paymentConfirmed) => {
  return paymentConfirmed === true ? 'مدفوع' : 'غير مدفوع';
};

const SignUps = () => {
  const [signups, setSignups] = useState([]);
  const [filteredSignups, setFilteredSignups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');

  const signupTypes = [
    { value: 'all', label: 'جميع الأنواع' },
    { value: 'support', label: 'دروس الدعم' },
    { value: 'language', label: 'اللغات' },
    { value: 'training', label: 'الدورات التكوينية' }
  ];

  const paymentStatuses = [
    { value: 'all', label: 'جميع حالات الدفع' },
    { value: 'paid', label: 'مدفوع' },
    { value: 'unpaid', label: 'غير مدفوع' }
  ];

  useEffect(() => {
    const q = query(collection(db, 'signups'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const signupsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSignups(signupsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let filtered = signups;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(signup => 
        signup.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        signup.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        signup.phone?.includes(searchTerm) ||
        signup.courseName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(signup => signup.courseType === filterType);
    }

    // Filter by payment status
    if (filterPayment !== 'all') {
      if (filterPayment === 'paid') {
        filtered = filtered.filter(signup => signup.paymentConfirmed === true);
      } else if (filterPayment === 'unpaid') {
        filtered = filtered.filter(signup => signup.paymentConfirmed !== true);
      }
    }

    setFilteredSignups(filtered);
  }, [signups, searchTerm, filterType, filterPayment]);

  const handleDeleteSignup = async (signupId) => {
    if (window.confirm('هل أنت متأكد من حذف هذا التسجيل؟')) {
      try {
        await deleteDoc(doc(db, 'signups', signupId));
      } catch (error) {
        console.error('Error deleting signup:', error);
      }
    }
  };

  const exportToCSV = () => {
    const headers = [
      'الاسم',
      'البريد الإلكتروني',
      'رقم الهاتف',
      'النوع',
      'المادة/اللغة/الدورة',
      'المستوى',
      'المدرب',
      'حالة الدفع',
      'تاريخ التسجيل'
    ];

    const csvData = filteredSignups.map(signup => [
      signup.name || '',
      signup.email || '',
      signup.phone || '',
      getTypeLabel(signup.courseType),
      signup.courseName || '',
      signup.level || '',
      '',
      getPaymentStatusLabel(signup.paymentConfirmed),
      signup.createdAt?.toDate?.()?.toLocaleDateString('ar-EG') || ''
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `signups_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary mb-1 sm:mb-2">التسجيلات</h1>
          <p className="text-base sm:text-lg lg:text-xl text-gray-600">إدارة جميع التسجيلات من الموقع</p>
        </div>
        <button
          onClick={exportToCSV}
          className="btn btn-secondary btn-sm sm:btn-md lg:btn-lg w-full sm:w-auto"
        >
          <Download className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
          تصدير CSV
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg sm:rounded-xl shadow-md p-4 sm:p-6 border border-gray-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-base sm:text-lg font-medium text-gray-700 mb-2">
              <Search className="inline h-4 w-4 sm:h-5 sm:w-5 ml-1" />
              البحث
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input text-base sm:text-lg w-full"
              placeholder="ابحث بالاسم، البريد، الهاتف..."
            />
          </div>
          
          <div>
            <label className="block text-base sm:text-lg font-medium text-gray-700 mb-2">
              <Filter className="inline h-4 w-4 sm:h-5 sm:w-5 ml-1" />
              نوع التسجيل
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="input text-base sm:text-lg w-full"
            >
              {signupTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-base sm:text-lg font-medium text-gray-700 mb-2">
              حالة الدفع
            </label>
            <select
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value)}
              className="input text-base sm:text-lg w-full"
            >
              {paymentStatuses.map(status => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <div className="text-base sm:text-lg font-medium text-gray-700">
              النتائج: <span className="text-primary">{filteredSignups.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block bg-white rounded-xl shadow-md border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-4 text-right text-lg font-medium text-gray-900 whitespace-nowrap min-w-[200px]">المتقدم</th>
                <th className="px-4 py-4 text-right text-lg font-medium text-gray-900 whitespace-nowrap min-w-[120px]">النوع</th>
                <th className="px-4 py-4 text-right text-lg font-medium text-gray-900 whitespace-nowrap min-w-[200px]">التفاصيل</th>
                <th className="px-4 py-4 text-right text-lg font-medium text-gray-900 whitespace-nowrap min-w-[120px]">المدرب</th>
                <th className="px-4 py-4 text-right text-lg font-medium text-gray-900 whitespace-nowrap min-w-[120px]">حالة الدفع</th>
                <th className="px-4 py-4 text-right text-lg font-medium text-gray-900 whitespace-nowrap min-w-[120px]">التاريخ</th>
                <th className="px-4 py-4 text-right text-lg font-medium text-gray-900 whitespace-nowrap min-w-[100px]">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSignups.map((signup) => (
                <DesktopRow 
                  key={signup.id}
                  signup={signup}
                  onDelete={() => handleDeleteSignup(signup.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-4">
        {filteredSignups.map((signup) => (
          <div key={signup.id} className="bg-white rounded-lg shadow-md border border-gray-100 p-4">
            <MobileCard 
              signup={signup}
              onDelete={() => handleDeleteSignup(signup.id)}
            />
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredSignups.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <Search className="h-12 w-12 sm:h-16 sm:w-16 mx-auto" />
          </div>
          <h3 className="text-lg sm:text-xl font-medium text-gray-900 mb-2">
            {searchTerm || filterType !== 'all' || filterPayment !== 'all' 
              ? 'لا توجد نتائج مطابقة' 
              : 'لا توجد تسجيلات'
            }
          </h3>
          <p className="text-gray-600 text-sm sm:text-base">
            {searchTerm || filterType !== 'all' || filterPayment !== 'all'
              ? 'جرب تغيير معايير البحث أو الفلترة'
              : 'ستظهر التسجيلات هنا عندما يقوم الطلاب بالتسجيل من الموقع'
            }
          </p>
        </div>
      )}

      {/* Stats Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {/* Paid */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow-md p-4 sm:p-6 border border-gray-100">
          <p className="text-base sm:text-lg font-medium text-gray-600 mb-2">التسجيلات المدفوعة</p>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-green-600">
            {signups.filter(s => s.paymentConfirmed === true).length.toLocaleString('ar-EG')}
          </p>
        </div>

        {/* Not Paid */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow-md p-4 sm:p-6 border border-gray-100">
          <p className="text-base sm:text-lg font-medium text-gray-600 mb-2">التسجيلات غير المدفوعة</p>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-red-600">
            {signups.filter(s => s.paymentConfirmed !== true).length.toLocaleString('ar-EG')}
          </p>
        </div>
      </div>
    </div>
  );
}

// Desktop Row Component
const DesktopRow = ({ signup, onDelete }) => (
  <tr className="hover:bg-gray-50">
    <td className="px-4 py-4">
      <div className="min-w-0">
        <div className="text-lg font-medium text-gray-900 truncate">{signup.name}</div>
        <div className="text-sm text-gray-600 truncate">{signup.email}</div>
        <div className="text-sm text-gray-600">{signup.phone}</div>
      </div>
    </td>
    <td className="px-4 py-4">
      <span className="badge badge-primary text-sm whitespace-nowrap">
        {getTypeLabel(signup.courseType)}
      </span>
    </td>
    <td className="px-4 py-4">
      <div className="min-w-0">
        <div className="text-lg font-medium text-gray-900 truncate">
          {signup.courseName}
        </div>
        {signup.level && (
          <div className="text-sm text-gray-600">المستوى: {signup.level}</div>
        )}
      </div>
    </td>
    <td className="px-4 py-4">
      <span className="text-lg text-gray-900">غير محدد</span>
    </td>
    <td className="px-4 py-4">
      <div className="flex items-center gap-2">
        {signup.paymentConfirmed ? (
          <>
            <span className="text-green-600 text-lg">✅</span>
            <span className="px-2 py-1 rounded-full text-xs font-medium text-success bg-success-50 whitespace-nowrap">مدفوع</span>
          </>
        ) : (
          <>
            <span className="text-red-500 text-lg">❌</span>
            <span className="px-2 py-1 rounded-full text-xs font-medium text-warning bg-warning-50 whitespace-nowrap">غير مدفوع</span>
          </>
        )}
      </div>
    </td>
    <td className="px-4 py-4">
      <span className="text-sm text-gray-900 whitespace-nowrap">
        {signup.createdAt?.toDate?.()?.toLocaleDateString('ar-EG') || 'غير محدد'}
      </span>
    </td>
    <td className="px-4 py-4">
      <button
        onClick={onDelete}
        className="btn btn-danger btn-sm"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </td>
  </tr>
);

// Mobile Card Component
const MobileCard = ({ signup, onDelete }) => (
  <div className="space-y-3">
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-medium text-gray-900 truncate">{signup.name}</h3>
        <span className="inline-block mt-1 px-2 py-1 text-xs font-medium rounded-full badge badge-primary">
          {getTypeLabel(signup.courseType)}
        </span>
      </div>
      <div className="ml-2">
        <button onClick={onDelete} className="btn btn-danger btn-sm">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
    
    <div className="space-y-2 text-sm">
      <div className="flex items-center text-gray-600">
        <Mail className="h-4 w-4 ml-2 flex-shrink-0" />
        <span className="truncate">{signup.email}</span>
      </div>
      <div className="flex items-center text-gray-600">
        <Phone className="h-4 w-4 ml-2 flex-shrink-0" />
        <span>{signup.phone}</span>
      </div>
      <div className="flex items-center text-gray-600">
        <FileText className="h-4 w-4 ml-2 flex-shrink-0" />
        <span className="truncate">{signup.courseName}</span>
        {signup.level && <span className="mr-2 text-gray-400">({signup.level})</span>}
      </div>
    </div>
    
    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
      <div className="flex items-center gap-2">
        {signup.paymentConfirmed ? (
          <>
            <span className="text-green-600">✅</span>
            <span className="px-2 py-1 rounded-full text-xs font-medium text-success bg-success-50">مدفوع</span>
          </>
        ) : (
          <>
            <span className="text-red-500">❌</span>
            <span className="px-2 py-1 rounded-full text-xs font-medium text-warning bg-warning-50">غير مدفوع</span>
          </>
        )}
      </div>
      <span className="text-xs text-gray-500">
        {signup.createdAt?.toDate?.()?.toLocaleDateString('ar-EG') || 'غير محدد'}
      </span>
    </div>
  </div>
);

export default SignUps;