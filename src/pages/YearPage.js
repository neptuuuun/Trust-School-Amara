import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { Book, AlertCircle, X, ArrowRight, Clock, User } from 'lucide-react';
import { getYearById, getLevelById } from '../data/studyLevels';
import useBranchSupportLessons from '../hooks/useBranchSupportLessons';
import useAnnualFeeStatus from '../hooks/useAnnualFeeStatus';
import useSupportLessonRegistrationStatus from '../hooks/useSupportLessonRegistrationStatus';

const parseNumericPrice = (raw) => {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const cleaned = raw.trim().replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatPriceText = (raw) => {
  const price = parseNumericPrice(raw);
  if (price == null) return 'السعر غير متوفر';
  if (price === 0) return 'مجاني';
  return `${price.toLocaleString('en-US')} دج`;
};

/**
 * Year Page - Shows all lessons for a specific level and year
 * 
 * Route: /support-lessons/:level/:year
 * 
 * This page:
 * - Always shows the year header (even if no lessons)
 * - Fetches lessons from current branch only
 * - Filters by level + year
 * - Supports multiple lessons per year
 * - Updates in real-time using onSnapshot
 * - Displays multiple time slots per lesson
 * 
 * Integration:
 * - Uses useBranchSupportLessons hook with level and year filters
 * - Shows "لا توجد دروس مضافة بعد" if no lessons exist
 */
function YearPage() {
  // ============================================
  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY AT TOP LEVEL
  // ============================================
  const { level: levelParam, year: yearParam } = useParams();
  const navigate = useNavigate();
  const { user, profileDoc } = useAuth();
  const { selectedBranchId } = useBranch();
  
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { annualFeeStatus, loading: annualFeeLoading } = useAnnualFeeStatus(user?.uid, selectedBranchId);
  
  // Fetch lessons for this specific level and year from current branch
  // Hook handles null/undefined branchId safely, so we can call it unconditionally
  const { lessons, loading: lessonsLoading, error: lessonsError } = useBranchSupportLessons(
    selectedBranchId,
    levelParam,
    yearParam
  );

  // ============================================
  // CONDITIONAL LOGIC AND EARLY RETURNS AFTER HOOKS
  // ============================================
  const canAccessSupportLessons = annualFeeStatus.status === 'pending' || annualFeeStatus.status === 'verified';
  const checkingFee = user && selectedBranchId ? annualFeeLoading : false;

  // CRITICAL: ONLY use studyYear as the source of truth. Do NOT fallback to schoolLevel.
  // schoolLevel is the level (middle/high), not the year (mid1/sec2).
  const userStudyYear = String(profileDoc?.studyYear || '').trim() || null;
  const userYearlyFeePaid = profileDoc?.yearlyFeePaid === true || profileDoc?.paymentVerified === true;

  // Get year and level data from hard-coded structure
  const yearData = getYearById(yearParam);
  const levelData = getLevelById(levelParam);

  // Validate route parameters
  if (!yearData || !levelData || yearData.level.id !== levelParam) {
    return (
      <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
        <div className="container mx-auto max-w-6xl">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-800 mb-3">مسار غير صحيح</h2>
            <p className="text-red-700 mb-6">
              المستوى أو الصف الدراسي غير موجود.
            </p>
            <button
              onClick={() => navigate('/support-lessons')}
              className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
              العودة لصفحة دروس الدعم
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Format day name in Arabic
  const formatDay = (day) => {
    const dayMap = {
      'Monday': 'الإثنين',
      'Tuesday': 'الثلاثاء',
      'Wednesday': 'الأربعاء',
      'Thursday': 'الخميس',
      'Friday': 'الجمعة',
      'Saturday': 'السبت',
      'Sunday': 'الأحد'
    };
    return dayMap[day] || day;
  };

  // Handle registration button click: open the registration form only. Do NOT create any Firestore document.
  const handleRegisterClick = (lesson, registrationStatus) => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }

    if (!canAccessSupportLessons) {
      setShowLoginModal(true);
      return;
    }

    if (registrationStatus && registrationStatus !== 'none') {
      return;
    }

    const lessonStudyYear = String(lesson?.studyYear || lesson?.year || lesson?.grade || '').trim() || null;
    if (userStudyYear && lessonStudyYear && userStudyYear !== lessonStudyYear) {
      return;
    }

    navigate('/support-lesson-registration', { state: { lesson } });
  };

  // Show loading state while checking fee or loading lessons
  if (lessonsLoading || checkingFee) {
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

  // Show error state if there was an error fetching lessons
  if (lessonsError) {
    return (
      <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
        <div className="container mx-auto max-w-6xl">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-800 mb-3">حدث خطأ</h2>
            <p className="text-red-700 mb-6">
              حدث خطأ أثناء جلب دروس الدعم. يرجى المحاولة مجدداً.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/support-lessons')}
            className="flex items-center text-secondary hover:text-primary font-medium mb-4"
          >
            <ArrowRight className="w-5 h-5 ml-2" />
            العودة لصفحة دروس الدعم
          </button>
          <h1 className="text-4xl md:text-5xl font-bold text-primary mb-2">
            {yearData.name}
          </h1>
          <p className="text-lg text-gray-700">
            {levelData.name} - {yearData.nameShort}
          </p>
        </div>

        {/* Info Banner - Only shown if not logged in or fee not paid */}
        {(!user || !canAccessSupportLessons) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
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

        {/* Lessons Display */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {lessons.length === 0 ? (
            /* No lessons message */
            <div className="text-center py-12">
              <Book className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-xl text-gray-600 mb-2">لا توجد دروس مضافة بعد</p>
              <p className="text-sm text-gray-500">
                سيتم إضافة دروس جديدة قريباً
              </p>
            </div>
          ) : (
            /* Lessons Grid */
            <>
              <h2 className="text-2xl font-bold text-primary mb-6">
                الدروس المتاحة ({lessons.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {lessons.map((lesson) => {
                  // Handle multiple subjects per lesson
                  const subjects = lesson.subjects && lesson.subjects.length > 0
                    ? lesson.subjects
                    : lesson.subject
                    ? [lesson.subject]
                    : lesson.name
                    ? [lesson.name]
                    : ['غير محدد'];

                  return subjects.map((subject, subjectIndex) => {
                    const displayName = lesson.name || subject || 'غير محدد';
                    const uniqueKey = `${lesson.id}-${subjectIndex}`;

                    return (
                      <LessonCard
                        key={uniqueKey}
                        lesson={lesson}
                        displayName={displayName}
                        formatDay={formatDay}
                        user={user}
                        canAccessSupportLessons={canAccessSupportLessons}
                        userStudyYear={userStudyYear}
                        userYearlyFeePaid={userYearlyFeePaid}
                        selectedBranchId={selectedBranchId}
                        yearId={yearParam}
                        onRegisterClick={handleRegisterClick}
                        setShowLoginModal={setShowLoginModal}
                      />
                    );
                  });
                })}
              </div>
            </>
          )}
        </div>

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

/**
 * Lesson Card Component with Registration Status Check
 * Button state depends ONLY on Firestore (global supportLessonRegistrations) via onSnapshot.
 * No optimistic UI: no document is created on button click; form submit creates the doc.
 */
function LessonCard({ 
  lesson, 
  displayName, 
  formatDay, 
  user, 
  canAccessSupportLessons, 
  userStudyYear,
  userYearlyFeePaid,
  selectedBranchId,
  yearId,
  onRegisterClick,
  setShowLoginModal
}) {
  const { status: registrationStatus, loading: statusLoading } = useSupportLessonRegistrationStatus(
    selectedBranchId,
    user?.uid ?? '',
    lesson?.id ?? ''
  );
  const rawPrice = lesson?.priceMonthly ?? lesson?.price;

  // Determine button state and text
  const getButtonConfig = () => {
    if (!user) {
      return {
        text: 'سجّل الدخول للتسجيل',
        disabled: false,
        className: 'bg-gray-200 text-gray-600 hover:bg-gray-200 cursor-not-allowed',
        onClickOverride: () => setShowLoginModal(true),
        ariaDisabled: true
      };
    }

    if (!canAccessSupportLessons || !userYearlyFeePaid) {
      return {
        text: 'يجب دفع الرسوم السنوية',
        disabled: true,
        className: 'bg-gray-200 text-gray-600 cursor-not-allowed border border-gray-300'
      };
    }

    const lessonStudyYear = String(lesson?.studyYear || lesson?.year || lesson?.grade || '').trim() || null;
    if (!userStudyYear) {
      return {
        text: 'سنتك الدراسية غير محددة',
        disabled: true,
        className: 'bg-gray-200 text-gray-600 cursor-not-allowed border border-gray-300'
      };
    }

    if (!lessonStudyYear) {
      return {
        text: 'غير متاح لهذا المستوى',
        disabled: true,
        className: 'bg-gray-200 text-gray-600 cursor-not-allowed border border-gray-300'
      };
    }

    const isStudyYearMismatch = Boolean(userStudyYear && lessonStudyYear && userStudyYear !== lessonStudyYear);
    if (isStudyYearMismatch) {
      return {
        text: 'غير متاح لهذا المستوى',
        disabled: true,
        className: 'bg-gray-200 text-gray-600 cursor-not-allowed border border-gray-300'
      };
    }

    if (statusLoading) {
      return {
        text: 'جاري التحقق...',
        disabled: true,
        className: 'bg-gray-300 text-gray-500 cursor-not-allowed'
      };
    }

        // Button state from Firestore only: none → التسجيل, pending → قيد الانتظار, verified → مسجل
        switch (registrationStatus) {
          case 'none':
            return {
              text: 'التسجيل',
              disabled: false,
              className: 'bg-primary hover:bg-primary-600 text-white'
            };
          case 'pending':
            return {
              text: 'قيد الانتظار',
              disabled: true,
              className: 'bg-yellow-100 text-yellow-800 cursor-not-allowed border border-yellow-300'
            };
          case 'verified':
            return {
              text: 'مسجل',
              disabled: true,
              className: 'bg-green-100 text-green-800 cursor-not-allowed border border-green-300'
            };
          default:
            return {
              text: 'التسجيل',
              disabled: false,
              className: 'bg-primary hover:bg-primary-600 text-white'
            };
        }
  };

  const buttonConfig = getButtonConfig();
  const handleButtonClick = () => {
    if (buttonConfig.onClickOverride) {
      buttonConfig.onClickOverride();
      return;
    }
    onRegisterClick(lesson, registrationStatus);
  };

  return (
    <div className="bg-gray-50 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden">
      <div className="p-6">
        <div className="flex items-center mb-4">
          <Book className="w-8 h-8 text-primary ml-3" />
          <h3 className="text-xl font-bold text-primary">{displayName}</h3>
        </div>

        <div className="space-y-3 mb-6">
          {lesson.teacher && (
            <div className="flex items-center text-gray-700">
              <User className="w-5 h-5 text-gray-500 ml-2" />
              <span className="font-medium">{lesson.teacher}</span>
            </div>
          )}

          {/* Multiple Time Slots Display */}
          {lesson.times && lesson.times.length > 0 ? (
            <div className="space-y-2">
              {lesson.times.map((time, timeIndex) => (
                <div key={timeIndex} className="flex items-start text-gray-700">
                  <Clock className="w-5 h-5 text-gray-500 ml-2 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm block">
                      {formatDay(time.day)}: {time.start || time.startTime} - {time.end || time.endTime}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="text-gray-700">
            <span className="font-medium">السعر: </span>
            <span>{formatPriceText(rawPrice)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleButtonClick}
          disabled={buttonConfig.disabled && !buttonConfig.onClickOverride}
          aria-disabled={buttonConfig.ariaDisabled || undefined}
          className={`w-full font-semibold py-3 px-6 rounded-lg transition-colors duration-300 ${buttonConfig.className}`}
        >
          {buttonConfig.text}
        </button>

        {buttonConfig.text === 'غير متاح لهذا المستوى' && userStudyYear && (
          <p className="mt-3 text-sm text-gray-600">
            يمكنك التسجيل فقط في الدروس الخاصة بسنتك الدراسية: {userStudyYear}
          </p>
        )}

        {buttonConfig.text === 'سنتك الدراسية غير محددة' && (
          <p className="mt-3 text-sm text-gray-600">
            سنتك الدراسية غير محددة في حسابك. يرجى التواصل مع الإدارة.
          </p>
        )}
      </div>
    </div>
  );
}

export default YearPage;

