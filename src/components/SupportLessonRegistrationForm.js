import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import {
  getSupportLessons,
  createSupportLessonRegistration,
  canAccessSupportLessons,
  getUser
} from '../services/firestoreService';
import { uploadSupportLessonPaymentProof } from '../services/userService';
import useSupportLessonRegistrationStatus from '../hooks/useSupportLessonRegistrationStatus';
import { BookOpen, Upload, DollarSign, AlertCircle, CheckCircle, Calendar, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

const SUMMER_MONTHS = [5, 6, 7]; // June, July, August

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

const formatDate = (date) => {
  if (!date) return '—';
  const d = date.toDate ? date.toDate() : date;
  return d.toLocaleDateString('ar-DZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const isSummerMonth = (monthIndex) => SUMMER_MONTHS.includes(monthIndex);

const addMonthsKeepingDay = (date, months) => {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
};

const getAcademicYearLabel = (date) => {
  const year = date.getFullYear();
  return date.getMonth() >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const getAcademicYearEndBoundary = (date) => {
  const year = date.getFullYear();
  const boundaryYear = date.getMonth() >= 8 ? year + 1 : year;
  return new Date(boundaryYear, 4, 31, 23, 59, 59, 999); // May 31
};

const calculateSubscriptionWindow = (startDate, durationInMonths) => {
  if (!startDate || durationInMonths < 1) {
    return { valid: false, message: 'مدة الاشتراك غير صالحة' };
  }

  if (isSummerMonth(startDate.getMonth())) {
    return {
      valid: false,
      message: 'لا يمكن بدء اشتراك جديد خلال أشهر العطلة الصيفية (يونيو، يوليو، أغسطس).'
    };
  }

  const endDate = addMonthsKeepingDay(startDate, durationInMonths);
  const academicYearEnd = getAcademicYearEndBoundary(startDate);

  if (endDate > academicYearEnd) {
    return {
      valid: false,
      message: 'لا يمكن أن يتجاوز الاشتراك نهاية السنة الدراسية (31 ماي). يرجى تقليل المدة.'
    };
  }

  return {
    valid: true,
    endDate,
    academicYear: getAcademicYearLabel(startDate)
  };
};

/**
 * Student form for registering for support lessons (monthly)
 * User must be verified AND have paid yearly fee (1000 DZD)
 */
const SupportLessonRegistrationForm = () => {
  const { user } = useAuth();
  const { selectedBranchId } = useBranch();
  const location = useLocation();
  const navigate = useNavigate();
  
  // State variables - define all state first
  const [lessons, setLessons] = useState([]);
  const [selectedLesson, setSelectedLesson] = useState('');
  const [durationMonths, setDurationMonths] = useState(1);
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => addMonthsKeepingDay(new Date(), 1));
  const [academicYear, setAcademicYear] = useState(() => getAcademicYearLabel(new Date()));
  const [durationError, setDurationError] = useState('');
  const [paymentProof, setPaymentProof] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [canAccess, setCanAccess] = useState(false);
  const [userData, setUserData] = useState(null);
  
  // Get lesson from navigation state
  const stateLesson = location.state?.lesson;
  const lessonIdFromState = stateLesson?.id;
  const effectiveLessonId = selectedLesson || lessonIdFromState;
  
  // Memoized values - now after state is defined
  const lessonOptions = useMemo(() => lessons || [], [lessons]);

  const selectedLessonData = useMemo(
    () => lessonOptions.find((l) => l.id === selectedLesson) || null,
    [lessonOptions, selectedLesson]
  );

  const durationOptions = useMemo(() => Array.from({ length: 3 }, (_, idx) => idx + 1), []);

  // CRITICAL: ONLY use studyYear as the source of truth. Do NOT fallback to schoolLevel.
  // schoolLevel is the level (middle/high), not the year (mid1/sec2).
  const userStudyYear = useMemo(() => {
    const raw = userData?.studyYear || '';
    return String(raw || '').trim() || null;
  }, [userData]);

  const selectedLessonStudyYear = useMemo(() => {
    const raw = selectedLessonData?.studyYear || selectedLessonData?.year || selectedLessonData?.grade || '';
    return String(raw || '').trim() || null;
  }, [selectedLessonData]);

  const isSelectedLessonMismatched = Boolean(
    userStudyYear && selectedLessonStudyYear && userStudyYear !== selectedLessonStudyYear
  );

  const pricePerMonth = selectedLessonData?.priceMonthly ?? selectedLessonData?.price ?? null;
  const totalPrice =
    pricePerMonth != null && durationMonths
      ? pricePerMonth * durationMonths
      : null;
  
  // Check if registration already exists (edge case protection)
  const { status: existingRegistrationStatus, loading: checkingExisting } = useSupportLessonRegistrationStatus(
    selectedBranchId,
    user?.uid,
    effectiveLessonId || ''
  );
  const registrationBlocked =
    existingRegistrationStatus && existingRegistrationStatus !== 'none';

  useEffect(() => {
    const start = new Date();
    const window = calculateSubscriptionWindow(start, durationMonths);
    setStartDate(start);

    if (window.valid) {
      setEndDate(window.endDate);
      setAcademicYear(window.academicYear);
      setDurationError('');
    } else {
      setEndDate(null);
      setAcademicYear(null);
      setDurationError(window.message || 'مدة الاشتراك غير صالحة');
    }
  }, [durationMonths]);

  useEffect(() => {
    if (selectedBranchId && user) {
      loadData();
    }
  }, [selectedBranchId, user]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Check if user can access support lessons (verified + yearly fee paid)
      const hasAccess = await canAccessSupportLessons(selectedBranchId, user.uid);
      setCanAccess(hasAccess);

      // Get user data to show status
      const userSnap = await getUser(selectedBranchId, user.uid);
      if (userSnap.exists()) {
        setUserData(userSnap.data());
      }

      // Load available lessons with dynamic price from admin
      const lessonsData = await getSupportLessons(selectedBranchId);
      setLessons(lessonsData);

      // Prefill lesson from navigation state (YearPage → registration)
      const stateLesson = location.state?.lesson;
      if (stateLesson?.id) {
        setSelectedLesson(stateLesson.id);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('يرجى تحميل صورة فقط');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('حجم الملف كبير جداً (الحد الأقصى 5 ميجابايت)');
        return;
      }
      setPaymentProof(file);
      setError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!canAccess) {
      setError('يجب أن يتم التحقق من حسابك ودفع الرسوم السنوية أولاً');
      return;
    }

    if (!selectedLesson) {
      setError('يرجى اختيار الدرس المراد الاشتراك فيه');
      return;
    }

    if (isSelectedLessonMismatched) {
      setError('غير متاح لهذا المستوى (سنتك الدراسية لا تطابق سنة الدرس).');
      return;
    }

    if (!paymentProof) {
      setError('يرجى رفع إثبات الدفع');
      return;
    }

    if (registrationBlocked) {
      setError('لديك اشتراك قائم لهذا الدرس. لا يمكن إرسال طلب جديد حالياً.');
      return;
    }

    const lesson = lessons.find((l) => l.id === selectedLesson);
    const pricePerMonth = lesson?.priceMonthly ?? lesson?.price ?? null;
    const studyYearId = lesson?.studyYear || lesson?.year || lesson?.grade || null;
    const studyYearLabel = lesson?.studyLevel || '';
    const studyLevelId = lesson?.level || null;

    if (!studyYearId) {
      setError('يجب تحديد السنة الدراسية لهذا الدرس قبل التسجيل. يرجى التواصل مع الإدارة.');
      return;
    }
    const submissionStartDate = new Date();
    const subscriptionWindow = calculateSubscriptionWindow(submissionStartDate, durationMonths);

    if (!subscriptionWindow.valid) {
      setError(subscriptionWindow.message || 'مدة الاشتراك غير صالحة');
      return;
    }

    try {
      setSubmitting(true);

      const { publicUrl: paymentProofUrl } = await uploadSupportLessonPaymentProof(
        paymentProof,
        user.uid
      );

      // Get Firebase ID token for authentication
      const authToken = await user.getIdToken();

      // Call Vercel Serverless Function (same domain in dev & prod)
      const response = await fetch('/api/createSupportLessonRegistration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          branchId: selectedBranchId,
          lessonId: lesson?.id || selectedLesson,
          durationInMonths: durationMonths,
          startDate: submissionStartDate,
          endDate: subscriptionWindow.endDate,
          academicYear: subscriptionWindow.academicYear,
          paymentProofUrl,
          monthlyPrice: pricePerMonth ?? null,
          totalPrice: pricePerMonth != null ? pricePerMonth * durationMonths : null,
          source: 'manual'
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('API Error:', result);
        // Map API error codes to form error messages
        const errorCode = result?.code || 'unknown';
        const mappedError = new Error(result?.message || 'فشل في إرسال الطلب');
        mappedError.code = errorCode;
        throw mappedError;
      }

      console.log('Registration successful:', result);
      setSuccess('تم إرسال طلب الاشتراك بنجاح! سيتم مراجعته من قبل الإدارة.');
      setPaymentProof(null);
      setDurationMonths(1);

      const fileInput = document.getElementById('payment-proof');
      if (fileInput) fileInput.value = '';
    } catch (err) {
      console.error('Error submitting registration:', err);
      switch (err?.code) {
        case 'user-already-registered-support-lesson':
          setError('لديك اشتراك نشط أو قيد المراجعة لهذا الدرس.');
          break;
        case 'study-year-mismatch':
          setError('غير متاح لهذا المستوى (سنتك الدراسية لا تطابق سنة الدرس).');
          break;
        case 'yearly-fee-required':
          setError('يجب دفع الرسوم السنوية أولاً قبل التسجيل في دروس الدعم.');
          break;
        case 'missing-study-year':
          setError('يجب تحديد السنة الدراسية لهذا الدرس قبل التسجيل. يرجى التواصل مع الإدارة.');
          break;
        case 'missing-user-study-year':
          setError('سنتك الدراسية غير محددة في حسابك. يرجى التواصل مع الإدارة.');
          break;
        case 'duration-exceeds-academic-year':
          setError('لا يمكن تمديد الاشتراك بعد نهاية السنة الدراسية (31 ماي). يرجى تقليل المدة.');
          break;
        case 'summer-registration-forbidden':
          setError('لا يمكن إنشاء اشتراك جديد خلال أشهر العطلة الصيفية (يونيو، يوليو، أغسطس).');
          break;
        case 'unauthenticated':
          setError('يجب تسجيل الدخول أولاً.');
          break;
        case 'permission-denied':
          setError('ليس لديك الإذن لإجراء هذه العملية.');
          break;
        default:
          setError('حدث خطأ أثناء إرسال الطلب');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-gray-600">جاري التحميل...</p>
      </div>
    );
  }

  // Show status if user doesn't have access
  if (!canAccess) {
    const verified = userData?.verified || false;
    const yearlyFeePaid = userData?.yearlyFeePaid || false;

    return (
      <div className="p-6" dir="rtl">
        <div className="max-w-2xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-4 text-center">
              يجب استكمال المتطلبات التالية
            </h3>
            
            <div className="space-y-3">
              <div className={`flex items-center gap-3 p-3 rounded-lg ${
                verified ? 'bg-green-100' : 'bg-red-100'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  verified ? 'bg-green-600' : 'bg-red-600'
                }`}>
                  {verified ? (
                    <CheckCircle className="w-4 h-4 text-white" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-white" />
                  )}
                </div>
                <span className="font-medium">
                  {verified ? 'تم التحقق من حسابك ✓' : 'يجب التحقق من حسابك من قبل الإدارة'}
                </span>
              </div>

              <div className={`flex items-center gap-3 p-3 rounded-lg ${
                yearlyFeePaid ? 'bg-green-100' : 'bg-red-100'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  yearlyFeePaid ? 'bg-green-600' : 'bg-red-600'
                }`}>
                  {yearlyFeePaid ? (
                    <CheckCircle className="w-4 h-4 text-white" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-white" />
                  )}
                </div>
                <span className="font-medium">
                  {yearlyFeePaid ? 'تم دفع الرسوم السنوية ✓' : 'يجب دفع الرسوم السنوية (1000 دج)'}
                </span>
              </div>
            </div>

            {!yearlyFeePaid && verified && (
              <div className="mt-6 text-center">
                <Link
                  to="/yearly-fee"
                  className="inline-block px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-semibold"
                >
                  دفع الرسوم السنوية الآن
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">التسجيل في درس الدعم</h1>
          <p className="text-gray-600">اختر الدرس والشهر وأرفق إثبات الدفع الشهري</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="w-6 h-6" />
            <span>{success}</span>
          </div>
        )}

        {lessons.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">لا توجد دروس متاحة حالياً</h3>
            <p className="text-gray-600">يرجى التحقق لاحقاً</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-6">
            {/* Lesson Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                درس الدعم <span className="text-red-500">*</span>
              </label>
              {location.state?.lesson && selectedLessonData ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800">
                  <p className="font-semibold mb-1">
                    {selectedLessonData.name || selectedLessonData.subject || 'درس غير معروف'}
                  </p>
                  {isSelectedLessonMismatched && (
                    <p className="text-red-600 font-medium mt-2">
                      غير متاح لهذا المستوى
                    </p>
                  )}
                  <p className="text-gray-600">
                    هذا الحقل محدد تلقائياً من صفحة دروس الدعم ولا يمكن تغييره هنا.
                  </p>
                </div>
              ) : (
                <select
                  value={selectedLesson}
                  onChange={(e) => setSelectedLesson(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  required
                >
                  <option value="">-- اختر درس --</option>
                  {lessonOptions.map((lesson) => {
                    const lessonStudyYear = String(lesson?.studyYear || lesson?.year || lesson?.grade || '').trim() || null;
                    const mismatched = Boolean(userStudyYear && lessonStudyYear && userStudyYear !== lessonStudyYear);
                    const title = lesson.name || lesson.subject || 'درس بدون اسم';
                    return (
                      <option key={lesson.id} value={lesson.id} disabled={mismatched}>
                        {mismatched ? `${title} - غير متاح لهذا المستوى` : title}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* Duration selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                مدة الاشتراك (بالأشهر) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(Number(e.target.value))}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary appearance-none"
                >
                  {durationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option} {option === 1 ? 'شهر' : 'أشهر'}
                    </option>
                  ))}
                </select>
                <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                الاشتراك يبدأ من تاريخ اليوم ويستمر لأشهر متتالية.
              </p>
            </div>

            {/* Subscription summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-blue-900">
                <Calendar className="w-5 h-5" />
                <div>
                  <p className="text-sm text-blue-800">تاريخ البداية</p>
                  <p className="font-semibold">{formatDate(startDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-blue-900">
                <Clock className="w-5 h-5" />
                <div>
                  <p className="text-sm text-blue-800">تاريخ الانتهاء</p>
                  <p className="font-semibold">{endDate ? formatDate(endDate) : '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-blue-900">
                <BookOpen className="w-5 h-5" />
                <div>
                  <p className="text-sm text-blue-800">السنة الدراسية</p>
                  <p className="font-semibold">{academicYear || '—'}</p>
                </div>
              </div>
              {durationError && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  {durationError}
                </p>
              )}
            </div>

            {/* Selected lesson details & pricing */}
            {selectedLessonData && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-blue-900">
                  {selectedLessonData.name || selectedLessonData.subject || 'درس غير معروف'}
                </h4>
                {selectedLessonData.subject && (
                  <p className="text-sm text-blue-800">المادة: {selectedLessonData.subject}</p>
                )}
                <div className="flex items-center gap-2 text-blue-900 font-bold">
                  <DollarSign className="w-5 h-5" />
                  <span>
                    السعر الشهري:{' '}
                    {`${formatPriceText(pricePerMonth)} / شهر`}
                  </span>
                </div>
                <div className="mt-2 text-sm text-blue-900">
                  <p>
                    مدة الاشتراك: <span className="font-semibold">{durationMonths} شهر</span>
                  </p>
                  <p>
                    المجموع الكلي:{' '}
                    <span className="font-semibold">
                      {formatPriceText(totalPrice)}
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* Payment Proof Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                إثبات الدفع الشهري <span className="text-red-500">*</span>
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
                <input
                  type="file"
                  id="payment-proof"
                  accept="image/*"
                  onChange={handleFileChange} 
                  className="hidden"
                  required
                />
                <label
                  htmlFor="payment-proof"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <Upload className="w-12 h-12 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-600">
                    {paymentProof ? paymentProof.name : 'انقر لرفع صورة إثبات الدفع'}
                  </span>
                  <span className="text-xs text-gray-500 mt-1">
                    (الحد الأقصى: 5 ميجابايت)
                  </span>
                </label>
              </div>
            </div>

            {/* Info box */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-900 mb-2">ملاحظة:</h4>
              <p className="text-sm text-green-800">
                الرسوم السنوية (1000 دج) تم دفعها مسبقاً ✓
                <br />
                هذا الطلب هو للدفع الشهري فقط.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {submitting ? 'جاري الإرسال...' : 'إرسال طلب التسجيل'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default SupportLessonRegistrationForm;