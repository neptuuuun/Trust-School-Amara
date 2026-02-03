import React, { useState } from 'react';
import AnnualFeeForm from '../components/AnnualFeeForm';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { Navigate } from 'react-router-dom';
import { AlertCircle, CheckCircle } from 'lucide-react';

const AnnualFeePage = () => {
  const { user } = useAuth();
  const { selectedBranchId } = useBranch();
  const [submitted, setSubmitted] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!selectedBranchId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
          <p className="text-gray-800 font-semibold">يرجى اختيار الفرع أولاً</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center max-w-md">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">تم إرسال طلبك بنجاح</h2>
          <p className="text-gray-700 mb-4">
            سيتم مراجعة طلبك من قبل الإدارة. سيتم إشعارك عند الموافقة على الطلب.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8" dir="rtl">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-primary mb-2">دفع الرسوم السنوية</h1>
            <p className="text-gray-600">املأ النموذج التالي لإرسال طلب دفع الرسوم السنوية والاشتراك في المواد</p>
          </div>
          <AnnualFeeForm
            onSubmitted={() => setSubmitted(true)}
            onClose={() => window.history.back()}
          />
        </div>
      </div>
    </div>
  );
};

export default AnnualFeePage;

