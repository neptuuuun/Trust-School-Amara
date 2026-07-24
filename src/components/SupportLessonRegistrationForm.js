import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import {
  getAnnualFeeStatusForYear,
  getAnnualFeeAmount,
  getUser,
} from '../services/firestoreService';
import apiCall from '../utils/apiClient';
import useSupportLessonRegistrationStatus from '../hooks/useSupportLessonRegistrationStatus';
import { isRegistrationBlocking, isRenewalCandidate, startOfMonth, endOfMonth, ANNUAL_FEE_DZD } from '../utils/registrationUtils';
import { getAcademicYearLabel } from '../utils/academicYear';
import { formatDate } from '../utils/dateUtils';
import { BookOpen, DollarSign } from 'lucide-react';
import ChargilyPayButton from './payments/ChargilyPayButton';
import AverageGateModal from './academic/AverageGateModal';
import { classificationFromProfile, REASONS } from '../utils/supportClassification';
import { DEFAULT_SCHOOL } from '../utils/personData';
import { Select, Label } from './ui/input';
import { Alert, LoadingState } from './ui/feedback';

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

const SupportLessonRegistrationForm = () => {
  const { user } = useAuth();
  const { selectedBranchId } = useBranch();
  const location = useLocation();

  const [lessons] = useState([]);
  const [selectedLesson, setSelectedLesson] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [annualFeeStatus, setAnnualFeeStatus] = useState({ status: 'loading', paymentId: null });
  const [userData, setUserData] = useState(null);
  const [quote, setQuote] = useState(null);
  const [showAverageGate, setShowAverageGate] = useState(false);
  // Owner-configured annual fee amount (falls back to the historical default).
  const [configuredFee, setConfiguredFee] = useState(ANNUAL_FEE_DZD);

  useEffect(() => {
    let mounted = true;
    getAnnualFeeAmount()
      .then((amt) => { if (mounted && Number.isFinite(Number(amt))) setConfiguredFee(Number(amt)); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const classification = classificationFromProfile(userData);

  // Support is a CALENDAR-month subscription: the cycle always covers the full
  // current month (1st → last day) and resets on the 1st — never "today + 30d".
  const now               = new Date();
  const cycleStart        = startOfMonth(now);
  const cycleEnd          = endOfMonth(now);
  const academicYearLabel = getAcademicYearLabel(now);

  const stateLesson       = location.state?.lesson;
  const lessonIdFromState = stateLesson?.id;
  const effectiveLessonId = selectedLesson || lessonIdFromState;

  const lessonOptions = useMemo(() => lessons || [], [lessons]);

  const selectedLessonData = useMemo(
    () => lessonOptions.find((l) => l.id === selectedLesson) || stateLesson || null,
    [lessonOptions, selectedLesson, stateLesson]
  );

  const userStudyYear = useMemo(() => String(userData?.studyYear || '').trim() || null, [userData]);

  const selectedLessonStudyYear = useMemo(() => {
    const raw = selectedLessonData?.studyYear || selectedLessonData?.year || selectedLessonData?.grade || '';
    return String(raw || '').trim() || null;
  }, [selectedLessonData]);

  const isSelectedLessonMismatched = Boolean(
    userStudyYear && selectedLessonStudyYear && userStudyYear !== selectedLessonStudyYear
  );

  const pricePerMonth     = selectedLessonData?.priceMonthly ?? selectedLessonData?.price ?? null;
  const monthlyPriceNum   = parseNumericPrice(pricePerMonth) ?? 0;
  const needsAnnualFee    = annualFeeStatus.status === 'unpaid';
  const annualFeePending  = annualFeeStatus.status === 'pending';
  const annualFeeAmount   = needsAnnualFee ? configuredFee : 0;

  const proratedMonthly = quote && Number.isFinite(Number(quote.amountDue))
    ? Number(quote.amountDue)
    : monthlyPriceNum;

  const isProrated = Boolean(
    quote && quote.totalSessions != null && quote.remainingSessions != null
    && quote.remainingSessions < quote.totalSessions
  );

  const bundledTotal = proratedMonthly + annualFeeAmount;
  const chargeAmount = selectedLessonData ? bundledTotal : 0;

  const { loading: checkingExisting, registration: existingRegistration } =
    useSupportLessonRegistrationStatus(selectedBranchId, user?.uid, effectiveLessonId || '');

  const registrationBlocked = isRegistrationBlocking(existingRegistration);
  const isRenewal           = isRenewalCandidate(existingRegistration);

  useEffect(() => {
    if (selectedBranchId && user) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, user]);

  useEffect(() => {
    if (!loading && user && userData && classification == null) setShowAverageGate(true);
  }, [loading, user, userData, classification]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [feeStatus, userSnap] = await Promise.all([
        getAnnualFeeStatusForYear(selectedBranchId, user.uid),
        getUser(selectedBranchId, user.uid),
      ]);
      setAnnualFeeStatus(feeStatus);
      if (userSnap.exists()) setUserData(userSnap.data());
      if (location.state?.lesson?.id) setSelectedLesson(location.state.lesson.id);

      const lessonIdForQuote = location.state?.lesson?.id || selectedLesson;
      if (lessonIdForQuote) {
        try {
          const params = new URLSearchParams({ branchId: selectedBranchId, classId: lessonIdForQuote });
          setQuote(await apiCall(`/api/support-sessions/quote?${params.toString()}`));
        } catch {
          setQuote(null);
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  // Build serviceData for the payment order. All data the backend needs to create
  // the supportLessonRegistration document on webhook confirmation.
  const buildServiceData = () => {
    const lesson = selectedLessonData;
    if (!lesson) return null;
    return {
      studentName:  userData?.name || '',
      school:       userData?.school || DEFAULT_SCHOOL,
      classId:      lesson.id,
      subjectId:    lesson.subjectId    || null,
      subjectName:  lesson.subjectName  || lesson.name || '',
      lessonName:   lesson.lessonName   || lesson.subjectName || lesson.name || '',
      groupName:    lesson.groupName    || '',
      teacherName:  lesson.teacherName  || lesson.teacher || '',
      schedules:    lesson.schedules    || [],
      studyYear:    userStudyYear       || '',
      groupType:    lesson.groupType    || 'normal_support',
      monthlyPrice: monthlyPriceNum,
      proratedAmount: proratedMonthly,
      totalPrice:   bundledTotal,
      includesAnnualFee: needsAnnualFee,
      annualFeeAmount:   annualFeeAmount,
      distinguishedSubjectsAverage: userData?.distinguishedSubjectsAverage ?? null,
      startDate:    now.toISOString(),
      academicYear: getAcademicYearLabel(now),
      serviceName:  lesson.subjectName || lesson.name || 'درس الدعم',
    };
  };

  if (loading) return <div className="p-6"><LoadingState /></div>;

  return (
    <div className="p-6" dir="rtl">
      {showAverageGate && (
        <AverageGateModal
          branchId={selectedBranchId}
          onClose={() => setShowAverageGate(false)}
          onClassified={({ average, classification: c }) => {
            setUserData((prev) => ({ ...(prev || {}), distinguishedSubjectsAverage: average, supportClassification: c }));
            setShowAverageGate(false);
          }}
        />
      )}

      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">التسجيل في درس الدعم</h1>
          <p className="text-gray-600">راجع تفاصيل المجموعة وأتمّ الدفع.</p>
        </div>

        {isRenewal && (
          <Alert variant="info" className="mb-6">اشتراكك السابق منتهٍ. يمكنك تجديده بالدفع أدناه.</Alert>
        )}

        {error   && <Alert variant="danger"  className="mb-6">{error}</Alert>}

        {!selectedLessonData && lessons.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">لا توجد دروس متاحة حالياً</h3>
            <p className="text-gray-600">يرجى التحقق لاحقاً</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
            {/* Lesson selection */}
            <div>
              <Label required>درس الدعم</Label>
              {stateLesson && selectedLessonData ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 space-y-1">
                  <p className="font-semibold">
                    {selectedLessonData.subjectName || selectedLessonData.name || selectedLessonData.subject || 'درس غير معروف'}
                  </p>
                  {selectedLessonData.groupName && (
                    <p><span className="text-gray-500">المجموعة:</span> {selectedLessonData.groupName}</p>
                  )}
                  {(selectedLessonData.teacherName || selectedLessonData.teacher) && (
                    <p><span className="text-gray-500">الأستاذ:</span> {selectedLessonData.teacherName || selectedLessonData.teacher}</p>
                  )}
                  {Array.isArray(selectedLessonData.schedules) && selectedLessonData.schedules.length > 0 && (
                    <p>
                      <span className="text-gray-500">المواعيد:</span>{' '}
                      {selectedLessonData.schedules
                        .map((s) => `${s.day || ''} ${s.start || ''}${s.end ? `-${s.end}` : ''}`.trim())
                        .filter(Boolean).join('، ')}
                    </p>
                  )}
                  {isSelectedLessonMismatched && (
                    <p className="text-danger font-medium">غير متاح لهذا المستوى</p>
                  )}
                </div>
              ) : (
                <Select value={selectedLesson} onChange={(e) => setSelectedLesson(e.target.value)} required>
                  <option value="">-- اختر درس --</option>
                  {lessonOptions.map((lesson) => {
                    const lsy = String(lesson?.studyYear || lesson?.year || lesson?.grade || '').trim() || null;
                    const mismatched = Boolean(userStudyYear && lsy && userStudyYear !== lsy);
                    const title = lesson.name || lesson.subject || 'درس بدون اسم';
                    return (
                      <option key={lesson.id} value={lesson.id} disabled={mismatched}>
                        {mismatched ? `${title} — غير متاح لهذا المستوى` : title}
                      </option>
                    );
                  })}
                </Select>
              )}
            </div>

            {/* Subscription info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-blue-900">تفاصيل الاشتراك</p>
              <div className="grid grid-cols-2 gap-3 text-sm text-blue-800">
                <div><span className="text-blue-600">المدة:</span><span className="font-semibold ms-1">شهر واحد</span></div>
                <div><span className="text-blue-600">السنة الدراسية:</span><span className="font-semibold ms-1">{academicYearLabel}</span></div>
                <div><span className="text-blue-600">بداية الشهر:</span><span className="font-semibold ms-1">{formatDate(cycleStart)}</span></div>
                <div><span className="text-blue-600">نهاية الشهر:</span><span className="font-semibold ms-1">{formatDate(cycleEnd)}</span></div>
              </div>
              <p className="border-t border-blue-200 pt-2 text-xs text-blue-700">
                الاشتراك يغطّي الشهر الحالي كاملاً (من أول الشهر إلى آخره). عند الانضمام في منتصف الشهر تدفع فقط مقابل الحصص المتبقية.
              </p>
            </div>

            {/* Proration note */}
            {selectedLessonData && isProrated && (
              <Alert variant="info" className="text-xs">
                انضمامك في منتصف الشهر: تدفع فقط مقابل الحصص المتبقية.{' '}
                <strong>{quote.remainingSessions}</strong> من {quote.totalSessions} حصة ×{' '}
                {formatPriceText(quote.pricePerSession)} = <strong>{formatPriceText(proratedMonthly)}</strong>
                {' '}(بدلاً من {formatPriceText(monthlyPriceNum)} للشهر الكامل).
              </Alert>
            )}

            {/* Payment breakdown */}
            {selectedLessonData && (needsAnnualFee ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <DollarSign className="w-5 h-5 text-gray-500" /> المدفوعات المطلوبة
                </p>
                <div className="space-y-1.5 text-sm text-gray-700">
                  <div className="flex items-center justify-between">
                    <span>الرسوم السنوية (مرة واحدة في السنة)</span>
                    <span className="font-semibold">{formatPriceText(annualFeeAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{isProrated ? 'اشتراك الشهر (حسب الحصص المتبقية)' : 'اشتراك الشهر الأول'}</span>
                    <span className="font-semibold">{formatPriceText(proratedMonthly)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between border-t border-gray-200 pt-1.5">
                    <span className="font-bold text-gray-900">الإجمالي</span>
                    <span className="font-bold text-primary">{formatPriceText(bundledTotal)}</span>
                  </div>
                </div>
                <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
                  هذا أول تسجيل لك في دروس الدعم هذا العام. تُدفع الرسوم السنوية مرة واحدة فقط في السنة الدراسية.
                </p>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-gray-500 shrink-0" />
                <div className="text-sm">
                  <p className="text-gray-600">{isProrated ? 'المبلغ المستحق هذا الشهر' : 'السعر الشهري'}</p>
                  <p className="font-bold text-gray-900 text-base">{formatPriceText(proratedMonthly)}</p>
                </div>
              </div>
            ))}

            {/* Annual fee status notes */}
            {annualFeeStatus.status === 'verified' && (
              <Alert variant="success">الرسوم السنوية مدفوعة لهذا العام — هذا الطلب للدفع الشهري فقط.</Alert>
            )}
            {annualFeePending && (
              <Alert variant="warning">رسومك السنوية مدفوعة وقيد التأكيد.</Alert>
            )}

            {/* Classification gate note */}
            {classification == null && (
              <Alert variant="warning">
                يجب إدخال معدل المواد المميزة قبل المتابعة.
                <button
                  type="button"
                  onClick={() => setShowAverageGate(true)}
                  className="underline font-semibold mr-2"
                >
                  إدخال المعدل
                </button>
              </Alert>
            )}

            {/* Chargily Pay Button */}
            <ChargilyPayButton
              amount={chargeAmount}
              branchId={selectedBranchId}
              serviceType="support"
              serviceData={buildServiceData() || {}}
              disabled={
                !selectedLessonData ||
                isSelectedLessonMismatched ||
                registrationBlocked ||
                checkingExisting ||
                classification == null
              }
            />

            {registrationBlocked && (
              <Alert variant="info">لديك اشتراك نشط لهذا الدرس. لا يمكن إرسال طلب جديد حالياً.</Alert>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportLessonRegistrationForm;
