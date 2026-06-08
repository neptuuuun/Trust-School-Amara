import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { Book, GraduationCap, Users, AlertCircle, Clock, ArrowRight, Lock } from 'lucide-react';
import { STUDY_LEVELS, getLevelById, getYearById } from '../data/studyLevels';
import { streamClasses } from '../services/firestoreService';
import useAnnualFeeStatus from '../hooks/useAnnualFeeStatus';
import PageAnnouncements from '../components/announcements/PageAnnouncements';
import { Button } from '../components/ui/button';
import { Alert, LoadingState } from '../components/ui/feedback';

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
  const isVerified = annualFeeStatus.status === 'verified';
  const checkingFee = user && selectedBranchId ? annualFeeLoading : false;

  // Derive the student's approved academic year from their verified payment
  const approvedYearId = isVerified ? (annualFeeStatus.raw?.academicYear || annualFeeStatus.raw?.studyYear || null) : null;
  const approvedYearMeta = approvedYearId ? getYearById(approvedYearId) : null;

  // Always show all levels and all years — registration eligibility is enforced per-lesson on YearPage
  const displayLevels = STUDY_LEVELS;

  const getDisplayYears = (levelId) => {
    const level = getLevelById(levelId);
    if (!level) return [];
    return level.years;
  };

  const [selectedLevel, setSelectedLevel] = useState(null);

  // Stream support classes (branch-scoped) to show how many groups are available per year.
  const [supportClasses, setSupportClasses] = useState([]);
  useEffect(() => {
    if (!selectedBranchId) { setSupportClasses([]); return undefined; }
    const unsub = streamClasses(selectedBranchId, { serviceType: 'support', activeOnly: true }, setSupportClasses);
    return () => unsub?.();
  }, [selectedBranchId]);

  // Count classes (groups) per year for display (optional info)
  const getLessonCountForYear = (yearId) =>
    supportClasses.filter((c) => c.studyYear === yearId).length;

  // Handle year click - navigate to year page
  const handleYearClick = (levelId, yearId) => {
    navigate(`/support-lessons/${levelId}/${yearId}`);
  };

  // Show loading state while checking fee
  if (checkingFee) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  // Show helpful message if branchId is missing
  if (!selectedBranchId) {
    return (
      <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
        <div className="container mx-auto max-w-6xl">
          <div className="bg-warning-50 border border-warning-200 rounded-xl p-8 text-center">
            <AlertCircle className="w-16 h-16 text-warning-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-warning-800 mb-3">يرجى اختيار الفرع</h2>
            <p className="text-warning-700 mb-6">
              لعرض دروس الدعم، يرجى اختيار الفرع أولاً من الصفحة الرئيسية.
            </p>
            <Button onClick={() => navigate('/')}>العودة للصفحة الرئيسية</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
      <div className="container mx-auto max-w-6xl">
        {/* Page-specific announcements — hidden automatically when none exist */}
        <PageAnnouncements page="support" />

        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">دروس الدعم</h1>
          <p className="text-lg text-gray-700 max-w-3xl mx-auto leading-relaxed">
            اكتشف دروس الدعم المتاحة في جميع المواد والمستويات مع أفضل المعلمين المتخصصين
          </p>
        </div>

        {/* Info Banner - Only shown if not logged in or fee not paid */}
        {(!user || !canAccessSupportLessons) && (
          <div className="mb-8 max-w-4xl mx-auto">
            <Alert variant="warning">
              {!user
                ? 'يمكنك تصفح جميع دروس الدعم. للتسجيل، يرجى تسجيل الدخول ودفع الرسوم السنوية.'
                : 'للتسجيل في دروس الدعم، يجب دفع الرسوم السنوية أولاً.'}
            </Alert>
          </div>
        )}

        {/* Approved year banner — shown when student has a verified fee */}
        {user && isVerified && approvedYearId && (
          <div className="bg-success-50 border border-success-200 rounded-lg px-5 py-3 mb-2 flex items-center gap-3 max-w-4xl mx-auto">
            <Lock className="w-5 h-5 text-success-600 flex-shrink-0" />
            <p className="text-sm text-success-800">
              تم تفعيل رسومك السنوية لـ <strong>{approvedYearMeta?.nameShort || approvedYearMeta?.name || approvedYearId}</strong>.
              يمكنك التسجيل فقط في دروس سنتك الدراسية، بينما تبقى بقية الدروس مرئية للاطلاع.
            </p>
          </div>
        )}

        {!selectedLevel ? (
          /* Level Selection Step */
          <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
            <h2 className="text-3xl font-bold text-primary text-center mb-8">اختر المستوى الدراسي</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {displayLevels.map(level => (
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
                <Clock className="w-12 h-12 text-accent mx-auto mb-4" aria-hidden="true" />
                <h3 className="text-xl font-semibold text-accent mb-3">أوقات مرنة</h3>
                <p className="text-gray-600">مواعيد متنوعة تناسب جميع الطلاب</p>
              </div>
            </div>
          </div>
        ) : (
          /* Year Selection Step */
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-primary">
                {getLevelById(selectedLevel)?.name} - اختر الصف الدراسي
              </h2>
              <button
                onClick={() => setSelectedLevel(null)}
                className="flex items-center text-secondary hover:text-primary font-medium"
              >
                <ArrowRight className="w-5 h-5 me-2" />
                العودة للمستويات
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {getDisplayYears(selectedLevel).map(year => {
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

      </div>
    </div>
  );
}

export default SupportLessonsPage;
