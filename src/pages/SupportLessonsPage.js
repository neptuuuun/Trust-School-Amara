import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { Book, GraduationCap, Users, AlertCircle, X, ArrowRight } from 'lucide-react';
import { STUDY_LEVELS, getLevelById } from '../data/studyLevels';
import useBranchSupportLessons from '../hooks/useBranchSupportLessons';
import useAnnualFeeStatus from '../hooks/useAnnualFeeStatus';

/**
 * Support Lessons Main Page
 * 
 * This page ALWAYS displays all hard-coded study levels and years,
 * regardless of whether there are lessons in Firestore.
 * 
 * Navigation: Clicking a year navigates to /support-lessons/:level/:year
 */
function SupportLessonsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedBranchId } = useBranch();
  const { annualFeeStatus, loading: annualFeeLoading } = useAnnualFeeStatus(user?.uid, selectedBranchId);
  const canAccessSupportLessons = annualFeeStatus.status === 'pending' || annualFeeStatus.status === 'verified';
  const checkingFee = user && selectedBranchId ? annualFeeLoading : false;

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(null);

  // Fetch all lessons to count how many are available per year (for display only)
  const { lessons } = useBranchSupportLessons(selectedBranchId);

  // Count lessons per year for display (optional info)
  const getLessonCountForYear = (yearId) => {
    return lessons.filter(lesson => (lesson.studyYear || lesson.year || lesson.grade) === yearId).length;
  };

  // Handle year click - navigate to year page
  const handleYearClick = (levelId, yearId) => {
    navigate(`/support-lessons/${levelId}/${yearId}`);
  };

  // Show loading state while checking fee
  if (checkingFee) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2 space-x-reverse">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <span className="text-primary text-xl font-semibold">جاري التحميل...</span>
        </div>
      </div>
    );
  }

  // Show helpful message if branchId is missing
  if (!selectedBranchId) {
    return (
      <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
        <div className="container mx-auto max-w-6xl">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
            <AlertCircle className="w-16 h-16 text-yellow-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-yellow-800 mb-3">يرجى اختيار الفرع</h2>
            <p className="text-yellow-700 mb-6">
              لعرض دروس الدعم، يرجى اختيار الفرع أولاً من الصفحة الرئيسية.
            </p>
            <button
              onClick={() => navigate('/')}
              className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-600 transition-colors"
            >
              العودة للصفحة الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
      <div className="container mx-auto max-w-6xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">دروس الدعم</h1>
          <p className="text-lg text-gray-700 max-w-3xl mx-auto leading-relaxed">
            اكتشف دروس الدعم المتاحة في جميع المواد والمستويات مع أفضل المعلمين المتخصصين
          </p>
        </div>

        {/* Info Banner - Only shown if not logged in or fee not paid */}
        {(!user || !canAccessSupportLessons) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8 max-w-4xl mx-auto">
            <div className="flex items-start space-x-3 space-x-reverse">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-yellow-800 text-sm font-medium">
                  {!user 
                    ? "يمكنك تصفح جميع دروس الدعم. للتسجيل، يرجى تسجيل الدخول ودفع الرسوم السنوية."
                    : "للتسجيل في دروس الدعم، يجب دفع الرسوم السنوية أولاً."}
                </p>
              </div>
            </div>
          </div>
        )}

        {!selectedLevel ? (
          /* Level Selection Step - Always show all hard-coded levels */
          <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
            <h2 className="text-3xl font-bold text-primary text-center mb-8">اختر المستوى الدراسي</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {STUDY_LEVELS.map(level => (
                <button
                  key={level.id}
                  onClick={() => setSelectedLevel(level.id)}
                  className="bg-gradient-primary hover:bg-gradient-to-br hover:from-primary-600 hover:to-primary-700 text-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                >
                  <GraduationCap className="w-12 h-12 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-2">{level.name}</h3>
                  <p className="text-primary-100">{level.years.length} صفوف دراسية</p>
                </button>
              ))}
            </div>

            {/* Features Section */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center bg-gray-50 p-6 rounded-lg">
                <Users className="w-12 h-12 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-primary mb-3">معلمون متخصصون</h3>
                <p className="text-gray-600">نخبة من المعلمين ذوي الخبرة الواسعة</p>
              </div>
              <div className="text-center bg-gray-50 p-6 rounded-lg">
                <Book className="w-12 h-12 text-secondary mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-secondary mb-3">جميع المواد</h3>
                <p className="text-gray-600">دروس دعم في جميع المواد الدراسية</p>
              </div>
              <div className="text-center bg-gray-50 p-6 rounded-lg">
                <AlertCircle className="w-12 h-12 text-accent mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-accent mb-3">أوقات مرنة</h3>
                <p className="text-gray-600">مواعيد متنوعة تناسب جميع الطلاب</p>
              </div>
            </div>
          </div>
        ) : (
          /* Year Selection Step - Always show all hard-coded years for selected level */
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-primary">
                {getLevelById(selectedLevel)?.name} - اختر الصف الدراسي
              </h2>
              <button
                onClick={() => setSelectedLevel(null)}
                className="flex items-center text-secondary hover:text-primary font-medium"
              >
                <ArrowRight className="w-5 h-5 ml-2" />
                العودة للمستويات
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {getLevelById(selectedLevel)?.years.map(year => {
                const lessonCount = getLessonCountForYear(year.id);
                return (
                  <button
                    key={year.id}
                    onClick={() => handleYearClick(selectedLevel, year.id)}
                    className="bg-gray-50 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 p-8 text-center transform hover:-translate-y-1"
                  >
                    <Users className="w-10 h-10 text-primary mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-primary mb-2">{year.nameShort}</h3>
                    <p className="text-gray-600">
                      {lessonCount > 0 ? `${lessonCount} درس متاح` : 'انقر للعرض'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Login/Payment Required Modal */}
        {showLoginModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative">
              <button
                onClick={() => setShowLoginModal(false)}
                className="absolute top-4 left-4 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="text-center">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-yellow-600" />
                </div>
                
                <h3 className="text-2xl font-bold text-gray-900 mb-3">
                  التسجيل غير متاح
                </h3>
                
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {!user 
                    ? "يجب تسجيل الدخول ودفع الرسوم السنوية قبل التسجيل في دروس الدعم."
                    : "يجب دفع الرسوم السنوية قبل التسجيل في دروس الدعم."}
                </p>

                <div className="space-y-3">
                  {!user ? (
                    <>
                      <button
                        onClick={() => navigate('/login')}
                        className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-600 transition-colors"
                      >
                        تسجيل الدخول
                      </button>
                      <button
                        onClick={() => navigate('/register')}
                        className="w-full bg-white text-primary border-2 border-primary py-3 rounded-lg font-semibold hover:bg-primary/5 transition-colors"
                      >
                        إنشاء حساب جديد
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => navigate('/annual-fee')}
                      className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-600 transition-colors"
                    >
                      دفع الرسوم السنوية
                    </button>
                  )}
                  
                  <button
                    onClick={() => setShowLoginModal(false)}
                    className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SupportLessonsPage;
