import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Frown } from 'lucide-react';

function ErrorPage() {
  const navigate = useNavigate();

  const handleBackHome = () => {
    const branchId = localStorage.getItem('branchId');
    if (!branchId) {
      navigate('/select-branch', { replace: true });
    } else {
      // Using root to leverage existing RootRedirect logic
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4" dir="rtl">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-6xl font-extrabold text-gray-900">404</span>
          <Frown className="h-12 w-12 text-gray-400" aria-hidden="true" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          الصفحة غير موجودة
        </h1>
        <p className="text-sm text-gray-600 mb-1">Page Not Found</p>
        <p className="text-gray-700 mb-8">الصفحة التي تبحث عنها غير متوفرة.</p>

        <button
          onClick={handleBackHome}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-6 py-3 text-white font-medium shadow hover:bg-indigo-700 transition-colors"
        >
          العودة إلى الرئيسية
        </button>

        {/* Optional illustration placeholder (Bonus) */}
        {/* <div className="mt-10">
          <img src={process.env.PUBLIC_URL + '/images/illustration.png'} alt="Not found illustration" className="mx-auto w-48 opacity-90" />
        </div> */}
      </div>
    </div>
  );
}

export default ErrorPage;
