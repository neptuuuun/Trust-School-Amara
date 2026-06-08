import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useUserProfile } from '../hooks/useUserProfile';
import {
  getTrainings,
  createTrainingRegistration,
  isUserVerified,
  listenTrainingRegistrationStatus,
  updateUserProfile,
} from '../services/firestoreService';
import { uploadTrainingReceipt } from '../services/trainingReceiptUpload';
import { Clock, GraduationCap } from 'lucide-react';
import EnrollmentProfileCard from './EnrollmentProfileCard';
import PaymentInstructions from './payments/PaymentInstructions';
import { Button } from './ui/button';
import { Select, Label } from './ui/input';
import { Alert, LoadingState, Spinner } from './ui/feedback';


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

const formatSchedule = (raw) => {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((slot) => {
        if (!slot) return null;
        const day = slot.day || slot.dayOfWeek;
        if (!day) return null;
        if (slot.start && slot.end) return `${day}: ${slot.start} - ${slot.end}`;
        return day;
      })
      .filter(Boolean)
      .join(' | ');
  }
  if (typeof raw === 'object') {
    const day = raw.day || raw.dayOfWeek;
    if (!day) return '';
    if (raw.start && raw.end) return `${day}: ${raw.start} - ${raw.end}`;
    return day;
  }
  return '';
};

const normalizeTrainingCourse = (trainingDoc = {}) => {
  const displayName = trainingDoc.title || trainingDoc.name || 'دورة تكوينية';
  const rawPrice = trainingDoc.price;
  const parsedPrice = typeof rawPrice === 'number' ? rawPrice : Math.round(Number(rawPrice));
  return {
    id: trainingDoc.id,
    displayName,
    description: trainingDoc.description || '',
    price: Number.isFinite(parsedPrice) ? parsedPrice : null,
    teacherName: trainingDoc.teacherName || trainingDoc.trainerName || '',
    schedule: formatSchedule(trainingDoc.schedule || trainingDoc.timing),
  };
};

const TrainingRegistrationForm = ({ initialSelection = null, onSuccess }) => {
  const location = useLocation();
  const navigationSelection = location.state?.trainingSelection || null;
  const providedSelection = initialSelection || navigationSelection || null;

  const { user } = useAuth();
  const { selectedBranchId } = useBranch();
  const { profile } = useUserProfile();

  const [trainings, setTrainings] = useState([]);
  const [trainingDetails, setTrainingDetails] = useState(null);
  const [receiptFile, setReceiptFile] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentMethodError, setPaymentMethodError] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [verified, setVerified] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState(null);


  useEffect(() => {
    if (!user || !selectedBranchId) {
      setTrainings([]);
      setVerified(false);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const [verifiedStatus, trainingsData] = await Promise.all([
          isUserVerified(selectedBranchId, user.uid),
          getTrainings(selectedBranchId),
        ]);
        setVerified(verifiedStatus);
        setTrainings(trainingsData.map(normalizeTrainingCourse));
      } catch (err) {
        console.error('Error loading training form data:', err);
        setError('فشل في تحميل بيانات الدورات. يرجى المحاولة لاحقاً.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedBranchId, user]);

  const selectionKey = providedSelection
    ? `${providedSelection.trainingId || ''}-${providedSelection.trainingName || ''}-${providedSelection.price ?? ''}`
    : 'none';

  useEffect(() => {
    if (!providedSelection) { setTrainingDetails(null); return; }
    const match = trainings.find((t) => t.id === providedSelection.trainingId);
    const resolvedPrice = (() => {
      const raw = match?.price ?? providedSelection.price;
      const parsed = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    })();
    setTrainingDetails({
      trainingId: providedSelection.trainingId || match?.id || '',
      trainingName: match?.displayName || providedSelection.trainingName || 'دورة تكوينية',
      price: resolvedPrice,
      teacherName: match?.teacherName || providedSelection.teacherName || '',
      schedule: match?.schedule || providedSelection.schedule || '',
      description: match?.description || providedSelection.description || '',
      // Subject → Class snapshot (new flow; falls back gracefully for legacy selections)
      subjectId: providedSelection.subjectId || '',
      classId: providedSelection.classId || providedSelection.trainingId || '',
      groupName: providedSelection.groupName || '',
      schedules: Array.isArray(providedSelection.schedules) ? providedSelection.schedules : [],
    });
  }, [selectionKey, trainings, providedSelection]);

  useEffect(() => {
    if (!user?.uid || !selectedBranchId || !trainingDetails?.trainingId) {
      setRegistrationStatus(null);
      return;
    }
    const unsubscribe = listenTrainingRegistrationStatus(
      selectedBranchId,
      user.uid,
      trainingDetails.trainingId,
      (entry) => setRegistrationStatus(entry)
    );
    return () => unsubscribe?.();
  }, [user?.uid, selectedBranchId, trainingDetails?.trainingId]);


  const normalizedStatus = registrationStatus?.status
    ? String(registrationStatus.status).toLowerCase()
    : '';
  const approvedStatuses = ['approved', 'verified', 'registered'];
  const pendingStatuses = ['pending', 'submitted', 'review', 'reviewing', 'in_review', 'processing', 'awaiting'];
  const isVerifiedStatus = registrationStatus?.verified === true || approvedStatuses.includes(normalizedStatus);
  const isPending =
    !isVerifiedStatus &&
    registrationStatus != null &&
    (pendingStatuses.includes(normalizedStatus) || normalizedStatus === '');
  const isFormLocked = isPending || isVerifiedStatus;
  const shouldDisableFields = submitting || isFormLocked;

  const getFieldClasses = (prefilled = false) =>
    `w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary ${
      shouldDisableFields
        ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-300'
        : prefilled
        ? 'bg-blue-50 border-blue-300 text-gray-900'
        : 'border-gray-300'
    }`;

  const onSubmit = async () => {
    setError('');
    setSuccess('');
    setPaymentMethodError('');
    setReceiptError('');

    if (isPending) { setError('طلبك قيد المراجعة. يرجى انتظار قرار الإدارة قبل إرسال طلب جديد.'); return; }
    if (isVerifiedStatus) { setError('لقد تم قبول طلبك لهذه الدورة بالفعل.'); return; }
    if (!verified) { setError('يجب توثيق حسابك من طرف الإدارة قبل إرسال الطلب.'); return; }
    if (!trainingDetails?.trainingId) { setError('لم يتم تحديد دورة صالحة. يرجى العودة لاختيار دورة متاحة.'); return; }
    if (!paymentMethod) { setPaymentMethodError('يرجى اختيار طريقة الدفع'); return; }
    if (!receiptFile) { setReceiptError('يرجى رفع صورة إيصال الدفع'); return; }

    try {
      setSubmitting(true);
      let receiptPath = '';
      if (receiptFile) {
        const { publicUrl, path } = await uploadTrainingReceipt(receiptFile, selectedBranchId, user.uid);
        receiptPath = publicUrl || path || '';
      }
      const price = trainingDetails.price ?? null;

      await createTrainingRegistration(selectedBranchId, {
        userId: user.uid,
        userEmail: user.email,
        studentName: profile?.name || '',
        birthDate: profile?.birthDate || null,
        birthPlace: profile?.birthPlace || '',
        studentPhone: profile?.studentPhone || profile?.guardianPhone || '',
        paymentMethod: paymentMethod,
        trainingId: trainingDetails.trainingId,
        trainingName: trainingDetails.trainingName,
        trainingPrice: price,
        teacherName: trainingDetails.teacherName,
        schedule: trainingDetails.schedule,
        trainingDescription: trainingDetails.description,
        // Subject → Class snapshot
        subjectId: trainingDetails.subjectId,
        subjectName: trainingDetails.trainingName,
        classId: trainingDetails.classId,
        groupName: trainingDetails.groupName,
        schedules: trainingDetails.schedules,
        paymentProof: receiptPath,
        paymentProofPath: receiptPath,
        status: 'pending',
      });

      setSuccess('تم استلام طلبك بنجاح. سيتم تفعيله فور التحقق من طرف الإدارة.');
      setRegistrationStatus((prev) =>
        prev ?? {
          status: 'pending',
          verified: false,
          paymentProof: receiptPath,
          trainingId: trainingDetails.trainingId,
        }
      );
      onSuccess?.();
    } catch (err) {
      console.error('Error submitting training form:', err);
      if (err?.message === 'user-already-registered-training') {
        setError('لقد قمت بالتسجيل في هذه الدورة مسبقاً. يرجى انتظار تأكيد الإدارة.');
      } else {
        setError(err.message || 'حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="p-6" dir="rtl">
        <Alert variant="danger">يرجى تسجيل الدخول للوصول إلى نموذج التسجيل.</Alert>
      </div>
    );
  }

  if (!selectedBranchId) {
    return (
      <div className="p-6" dir="rtl">
        <Alert variant="warning">يرجى اختيار الفرع أولاً للمتابعة في عملية التسجيل.</Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div dir="rtl">
        <LoadingState label="جاري تحميل بيانات الدورات…" />
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="p-6" dir="rtl">
        <Alert variant="warning" title="حسابك قيد المراجعة">
          سيتم تفعيل إمكانية التسجيل في الدورات بعد أن يقوم فريق الإدارة بتوثيق حسابك.
        </Alert>
      </div>
    );
  }

  if (!providedSelection) {
    return (
      <div className="p-6" dir="rtl">
        <Alert variant="warning">
          يرجى العودة إلى صفحة الدورات التكوينية واختيار دورة للمتابعة في التسجيل.
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">نموذج التسجيل في الدورات التكوينية</h1>
          <p className="text-gray-600">تم اختيار الدورة مسبقاً. يرجى مراجعة بياناتك وإرفاق إيصال الدفع.</p>
        </header>

        <EnrollmentProfileCard />

        {error && <Alert variant="danger">{error}</Alert>}

        {success && <Alert variant="success">{success}</Alert>}

        {isPending && registrationStatus && (
          <div className="bg-warning-50 border border-warning-200 text-warning-900 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              <div>
                <p className="font-semibold">طلبك قيد المراجعة</p>
                <p className="text-sm text-warning-800">لا تقم بإرسال طلب جديد. سيتم إشعارك فور التأكيد.</p>
              </div>
            </div>
            {registrationStatus?.paymentProof && (
              <div className="rounded-lg border border-warning-200 bg-white p-3">
                <p className="text-sm font-semibold text-gray-700 mb-2">إيصال الدفع المرفوع</p>
                <img
                  src={registrationStatus.paymentProof}
                  alt="إيصال الدفع"
                  className="max-h-48 w-full object-contain rounded"
                />
              </div>
            )}
          </div>
        )}

        {isVerifiedStatus && (
          <Alert variant="success" title="تم قبول طلبك">
            لقد تم تسجيلك في هذه الدورة. لا حاجة لإرسال طلب جديد.
          </Alert>
        )}

        {!trainingDetails ? (
          <div className="bg-white rounded-lg shadow p-10 text-center">
            <GraduationCap className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">لا يمكن العثور على بيانات الدورة</h3>
            <p className="text-gray-600">يبدو أن هذه الدورة لم تعد متاحة. يرجى اختيار دورة أخرى من الصفحة الرئيسية.</p>
          </div>
        ) : (
          <form className="bg-white rounded-2xl shadow-lg p-6 space-y-6" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
            {/* Training summary (read-only) */}
            <div>
              <Label htmlFor="training-selected">الدورة المختارة</Label>
              <Select id="training-selected" value={trainingDetails.trainingId} disabled>
                <option value={trainingDetails.trainingId}>
                  {trainingDetails.trainingName}
                  {` — ${formatPriceText(trainingDetails.price)}`}
                </option>
              </Select>
            </div>

            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-1 text-sm text-gray-700">
              {trainingDetails.description && <p>{trainingDetails.description}</p>}
              <p><strong>المؤطر:</strong> {trainingDetails.teacherName || '—'}</p>
              {trainingDetails.groupName && <p><strong>المجموعة:</strong> {trainingDetails.groupName}</p>}
              <p><strong>السعر:</strong> {formatPriceText(trainingDetails.price)}</p>
              {trainingDetails.schedule && (
                <p><strong>الجدول:</strong> {trainingDetails.schedule}</p>
              )}
            </div>

            {/* Payment Method & Receipt */}
            <PaymentInstructions
              selectedMethod={paymentMethod}
              onMethodChange={(m) => { setPaymentMethod(m); setPaymentMethodError(''); }}
              receiptFile={receiptFile}
              onReceiptChange={(f) => { setReceiptFile(f); setReceiptError(''); }}
              methodError={paymentMethodError}
              receiptError={receiptError}
              disabled={shouldDisableFields}
              inputId="training-receipt-upload"
            />

            <Button type="submit" fullWidth disabled={submitting || isFormLocked}>
              {submitting ? (
                <><Spinner size="sm" className="text-white" />جاري الإرسال...</>
              ) : isVerifiedStatus ? (
                'تم تسجيلك في هذه الدورة'
              ) : isPending ? (
                'بانتظار موافقة الإدارة'
              ) : (
                'إرسال طلب التسجيل'
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default TrainingRegistrationForm;
