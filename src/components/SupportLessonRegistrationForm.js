import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import {
  getAnnualFeeStatusForYear,
  getUser,
} from '../services/firestoreService';
import apiCall from '../utils/apiClient';
import useSupportLessonRegistrationStatus from '../hooks/useSupportLessonRegistrationStatus';
import { supabase } from '../supabase';
import { optimizeImage } from '../utils/imageOptimizer';
import { isRegistrationBlocking, isRenewalCandidate, addMonthsKeepingDay, ANNUAL_FEE_DZD } from '../utils/registrationUtils';
import { formatDate } from '../utils/dateUtils';
import { BookOpen, DollarSign } from 'lucide-react';
import PaymentInstructions from './payments/PaymentInstructions';
import { Button } from './ui/button';
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


const getAcademicYearLabel = (date) => {
  const year = date.getFullYear();
  return date.getMonth() >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const SupportLessonRegistrationForm = () => {
  const { user } = useAuth();
  const { selectedBranchId } = useBranch();
  const location = useLocation();

  const [lessons] = useState([]); // legacy dropdown source (unused — class arrives via navigation state)
  const [selectedLesson, setSelectedLesson] = useState('');
  const [paymentProof, setPaymentProof] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentMethodError, setPaymentMethodError] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // annualFeeStatus: { status: 'loading' | 'unpaid' | 'pending' | 'verified' | 'rejected', paymentId: string|null }
  const [annualFeeStatus, setAnnualFeeStatus] = useState({ status: 'loading', paymentId: null });
  const [userData, setUserData] = useState(null);

  // Support lessons are always 1-month subscriptions — no user choice needed.
  const DURATION_MONTHS = 1;

  // Estimated subscription window (official dates are set by admin on verification).
  const now = new Date();
  const estimatedStart = now;
  const estimatedEnd   = addMonthsKeepingDay(now, DURATION_MONTHS);

  const stateLesson     = location.state?.lesson;
  const lessonIdFromState = stateLesson?.id;
  const effectiveLessonId = selectedLesson || lessonIdFromState;

  const lessonOptions = useMemo(() => lessons || [], [lessons]);

  const selectedLessonData = useMemo(
    () => lessonOptions.find((l) => l.id === selectedLesson) || stateLesson || null,
    [lessonOptions, selectedLesson, stateLesson]
  );

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

  // Annual-fee case (academic-year aware): CASE 2 = first support reg of the year.
  const monthlyPriceNum  = parseNumericPrice(pricePerMonth) ?? 0;
  const needsAnnualFee   = annualFeeStatus.status === 'unpaid';   // bundle annual + first month
  const annualFeePending = annualFeeStatus.status === 'pending';  // first reg already under review
  const annualFeeAmount  = needsAnnualFee ? ANNUAL_FEE_DZD : 0;
  const bundledTotal     = monthlyPriceNum + annualFeeAmount;

  const { loading: checkingExisting, registration: existingRegistration } =
    useSupportLessonRegistrationStatus(selectedBranchId, user?.uid, effectiveLessonId || '');

  const registrationBlocked = isRegistrationBlocking(existingRegistration);
  const isRenewal = isRenewalCandidate(existingRegistration);

  useEffect(() => {
    if (selectedBranchId && user) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [feeStatus, userSnap] = await Promise.all([
        getAnnualFeeStatusForYear(selectedBranchId, user.uid),
        getUser(selectedBranchId, user.uid),
      ]);
      setAnnualFeeStatus(feeStatus);
      if (userSnap.exists()) setUserData(userSnap.data());
      // The class to register into is passed via navigation state from YearPage.
      if (location.state?.lesson?.id) setSelectedLesson(location.state.lesson.id);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setPaymentMethodError('');
    setReceiptError('');

    if (!selectedLesson) {
      setError('يرجى اختيار الدرس المراد الاشتراك فيه');
      return;
    }
    if (isSelectedLessonMismatched) {
      setError('غير متاح لهذا المستوى (سنتك الدراسية لا تطابق سنة الدرس).');
      return;
    }
    if (!paymentMethod) {
      setPaymentMethodError('يرجى اختيار طريقة الدفع');
      return;
    }
    if (!paymentProof) {
      setReceiptError('يرجى رفع صورة إيصال الدفع');
      return;
    }
    if (registrationBlocked) {
      setError('لديك اشتراك نشط لهذا الدرس. لا يمكن إرسال طلب جديد حالياً.');
      return;
    }

    const lesson      = selectedLessonData;
    const studyYearId = lesson?.studyYear || lesson?.year || lesson?.grade || null;
    const studyLevelId = lesson?.level || null;

    if (!studyYearId) {
      setError('يجب تحديد السنة الدراسية لهذا الدرس قبل التسجيل. يرجى التواصل مع الإدارة.');
      return;
    }

    try {
      setSubmitting(true);

      // Upload payment proof
      let paymentProofURL = '';
      if (paymentProof) {
        if (!supabase) throw new Error('خدمة رفع الملفات غير متاحة حالياً. يرجى إبلاغ الإدارة.');

        // Optimize (resize → WebP → compress) before upload. Falls back to original.
        const optimizedProof = await optimizeImage(paymentProof);

        const filePath = `support-lessons/${user.uid}/${Date.now()}.webp`;
        const { error: uploadError } = await supabase.storage
          .from('support-lesson-payments')
          .upload(filePath, optimizedProof, {
            contentType: optimizedProof.type || 'image/webp',
          });

        if (uploadError) throw new Error('تعذر رفع صورة الإيصال. يرجى المحاولة مرة أخرى.');

        const { data: publicUrlData } = supabase.storage
          .from('support-lesson-payments')
          .getPublicUrl(filePath);

        if (!publicUrlData?.publicUrl) throw new Error('تعذر الحصول على رابط لصورة الإيصال.');
        paymentProofURL = publicUrlData.publicUrl;
      }

      const submissionDate = new Date();

      // Route through the Express backend — the Firestore rule explicitly denies
      // all client writes to supportLessonRegistrations (allow create,update,delete: if false).
      // The backend validates annual fee, study year, and duplicates server-side.
      await apiCall('/api/registrations/support', {
        method: 'POST',
        body: JSON.stringify({
          branchId:        selectedBranchId,
          lessonId:        lesson?.id || selectedLesson,
          studyYearLabel:  lesson?.studyYearLabel || lesson?.yearLabel || '',
          durationInMonths: DURATION_MONTHS,
          startDate:       submissionDate.toISOString(),
          endDate:         addMonthsKeepingDay(submissionDate, DURATION_MONTHS).toISOString(),
          academicYear:    getAcademicYearLabel(submissionDate),
          paymentProofUrl: paymentProofURL,
          paymentMethod:   paymentMethod,
          monthlyPrice:    monthlyPriceNum,
          totalPrice:      monthlyPriceNum,
          // Annual fee bundling — only on the first support registration of the year.
          includesAnnualFee: needsAnnualFee,
          annualFeeAmount:   annualFeeAmount,
          totalAmount:       bundledTotal,
          source:          'manual',
        }),
      });

      setSuccess('تم إرسال طلب الاشتراك بنجاح! سيتم مراجعته من قبل الإدارة.');
      setPaymentProof(null);
      setPaymentMethod('');
      setError('');
      const fileInput = document.getElementById('payment-proof');
      if (fileInput) fileInput.value = '';
      // Refresh annual fee status so the form reflects the new 'pending' state
      // and prevents a stale 'unpaid' status from triggering a duplicate bundle.
      loadData();
    } catch (err) {
      console.error('Error submitting registration:', err);
      if (err?.code === 'class-full') {
        setError('المجموعة مكتملة. لم يعد بالإمكان التسجيل في هذه المجموعة.');
      } else if (err?.code === 'yearly-fee-required') {
        setError('الرسوم السنوية مطلوبة للتسجيل في دروس الدعم.');
      } else if (err?.code === 'duplicate-annual-fee-bundle') {
        setError('الرسوم السنوية قيد المراجعة بالفعل. لا يمكن إرسال طلب آخر يتضمنها في انتظار اعتماد الطلب الأول.');
        loadData(); // refresh so the UI switches to the 'pending' warning state
      } else if (err?.code === 'study-year-mismatch') {
        setError('غير متاح لهذا المستوى (سنتك الدراسية لا تطابق سنة المجموعة).');
      } else {
        setError(err.message || 'حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">التسجيل في درس الدعم</h1>
          <p className="text-gray-600">راجع تفاصيل المجموعة وأرفق إيصال الدفع.</p>
        </div>

        {isRenewal && (
          <Alert variant="info" className="mb-6">اشتراكك السابق منتهٍ. يمكنك تجديده بإرسال طلب جديد أدناه.</Alert>
        )}

        {error && <Alert variant="danger" className="mb-6">{error}</Alert>}
        {success && <Alert variant="success" className="mb-6">{success}</Alert>}

        {!selectedLessonData && lessons.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">لا توجد دروس متاحة حالياً</h3>
            <p className="text-gray-600">يرجى التحقق لاحقاً</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-6">
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
                        .filter(Boolean)
                        .join('، ')}
                    </p>
                  )}
                  {isSelectedLessonMismatched && (
                    <p className="text-danger font-medium">غير متاح لهذا المستوى</p>
                  )}
                  <p className="text-gray-500 text-xs">محدد تلقائياً من صفحة دروس الدعم.</p>
                </div>
              ) : (
                <Select
                  value={selectedLesson}
                  onChange={(e) => setSelectedLesson(e.target.value)}
                  required
                >
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

            {/* Subscription info (read-only) */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-blue-900">تفاصيل الاشتراك</p>
              <div className="grid grid-cols-2 gap-3 text-sm text-blue-800">
                <div>
                  <span className="text-blue-600">المدة:</span>
                  <span className="font-semibold ms-1">شهر واحد</span>
                </div>
                <div>
                  <span className="text-blue-600">السنة الدراسية:</span>
                  <span className="font-semibold ms-1">
                    {userStudyYear || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-blue-600">تاريخ البداية المتوقع:</span>
                  <span className="font-semibold ms-1">{formatDate(estimatedStart)}</span>
                </div>
                <div>
                  <span className="text-blue-600">تاريخ الانتهاء المتوقع:</span>
                  <span className="font-semibold ms-1">{formatDate(estimatedEnd)}</span>
                </div>
              </div>
              <p className="text-xs text-blue-600 pt-1">
                التواريخ الفعلية تُحدَّد عند تأكيد الإدارة للدفع.
              </p>
            </div>

            {/* Payment breakdown (CASE 2 bundles annual fee + first month) */}
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
                    <span>اشتراك الشهر الأول</span>
                    <span className="font-semibold">{formatPriceText(monthlyPriceNum)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between border-t border-gray-200 pt-1.5">
                    <span className="font-bold text-gray-900">الإجمالي</span>
                    <span className="font-bold text-primary">{formatPriceText(bundledTotal)}</span>
                  </div>
                </div>
                <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
                  هذا أول تسجيل لك في دروس الدعم هذا العام. تُدفع الرسوم السنوية مرة واحدة فقط في السنة الدراسية، وبعدها تكفيك المدفوعات الشهرية. أرفق إيصالاً واحداً يشمل المبلغ الإجمالي.
                </p>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-gray-500 shrink-0" />
                <div className="text-sm">
                  <p className="text-gray-600">السعر الشهري</p>
                  <p className="font-bold text-gray-900 text-base">{formatPriceText(monthlyPriceNum)}</p>
                </div>
              </div>
            ))}

            {/* Payment Method & Receipt */}
            <PaymentInstructions
              selectedMethod={paymentMethod}
              onMethodChange={(m) => { setPaymentMethod(m); setPaymentMethodError(''); }}
              receiptFile={paymentProof}
              onReceiptChange={(f) => { setPaymentProof(f); setReceiptError(''); }}
              methodError={paymentMethodError}
              receiptError={receiptError}
              disabled={submitting}
              inputId="support-lesson-payment-proof"
            />

            {/* Fee status note */}
            {annualFeeStatus.status === 'verified' && (
              <Alert variant="success">الرسوم السنوية مدفوعة لهذا العام ✓ — هذا الطلب للدفع الشهري فقط.</Alert>
            )}
            {annualFeePending && (
              <Alert variant="warning">رسومك السنوية قيد المراجعة. يمكنك إرسال هذا الطلب الآن، وسيتم تفعيله بعد اعتماد الرسوم السنوية.</Alert>
            )}

            {/* Submit */}
            <Button type="submit" fullWidth disabled={submitting || registrationBlocked || checkingExisting || !paymentMethod || !paymentProof}>
              {submitting
                ? 'جاري الإرسال...'
                : isRenewal
                ? 'تجديد الاشتراك'
                : 'إرسال طلب التسجيل'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default SupportLessonRegistrationForm;
