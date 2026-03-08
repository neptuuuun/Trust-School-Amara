import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import {
  getTrainings,
  createTrainingRegistration,
  isUserVerified,
  listenTrainingRegistrationStatus,
} from '../services/firestoreService';
import { uploadTrainingReceipt } from '../services/trainingReceiptUpload';
import { AlertCircle, CheckCircle, Clock, GraduationCap, Loader2, Upload } from 'lucide-react';

const MAX_RECEIPT_SIZE = 5 * 1024 * 1024;
const PAYMENT_METHODS = ['CCP', 'Baridimob'];

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
        if (slot.start && slot.end) {
          return `${day}: ${slot.start} - ${slot.end}`;
        }
        return day;
      })
      .filter(Boolean)
      .join(' | ');
  }
  if (typeof raw === 'object') {
    const day = raw.day || raw.dayOfWeek;
    if (!day) return '';
    if (raw.start && raw.end) {
      return `${day}: ${raw.start} - ${raw.end}`;
    }
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
  const [trainings, setTrainings] = useState([]);
  const [trainingDetails, setTrainingDetails] = useState(null);
  const [receiptFile, setReceiptFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [verified, setVerified] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      studentName: '',
      birthDate: '',
      birthPlace: '',
      studentPhone: '',
      paymentMethod: '',
    },
  });

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
    if (!providedSelection) {
      setTrainingDetails(null);
      return;
    }

    const match = trainings.find((training) => training.id === providedSelection.trainingId);
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
      (entry) => {
        setRegistrationStatus(entry);
      }
    );

    return () => {
      unsubscribe?.();
    };
  }, [user?.uid, selectedBranchId, trainingDetails?.trainingId]);

  const handleReceiptChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('يجب رفع صورة لإيصال الدفع.');
      return;
    }
    if (file.size > MAX_RECEIPT_SIZE) {
      setError('حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت.');
      return;
    }
    setReceiptFile(file);
    setError('');
  };

  const normalizedStatus = registrationStatus?.status
    ? String(registrationStatus.status).toLowerCase()
    : '';
  const approvedStatuses = ['approved', 'verified', 'registered'];
  const pendingStatuses = ['pending', 'submitted', 'review', 'reviewing', 'in_review', 'processing', 'awaiting'];
  const isVerified = registrationStatus?.verified === true || approvedStatuses.includes(normalizedStatus);
  const isPending =
    !isVerified &&
    registrationStatus != null &&
    (pendingStatuses.includes(normalizedStatus) || normalizedStatus === '');
  const isFormLocked = isPending || isVerified;
  const shouldDisableFields = submitting || isFormLocked;
  const getFieldClasses = () =>
    `w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary ${
      shouldDisableFields ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
    }`;

  const onSubmit = async (formValues) => {
    setError('');
    setSuccess('');

    if (isPending) {
      setError('طلبك قيد المراجعة. يرجى انتظار قرار الإدارة قبل إرسال طلب جديد.');
      return;
    }

    if (isVerified) {
      setError('لقد تم قبول طلبك لهذه الدورة بالفعل.');
      return;
    }

    if (!verified) {
      setError('يجب توثيق حسابك من طرف الإدارة قبل إرسال الطلب.');
      return;
    }
    if (!trainingDetails?.trainingId) {
      setError('لم يتم تحديد دورة صالحة. يرجى العودة لاختيار دورة متاحة.');
      return;
    }
    if (!receiptFile) {
      setError('يرجى رفع صورة الإيصال.');
      return;
    }
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
        studentName: formValues.studentName,
        birthDate: formValues.birthDate || null,
        birthPlace: formValues.birthPlace,
        studentPhone: formValues.studentPhone,
        paymentMethod: formValues.paymentMethod,
        trainingId: trainingDetails.trainingId,
        trainingName: trainingDetails.trainingName,
        trainingPrice: price,
        teacherName: trainingDetails.teacherName,
        schedule: trainingDetails.schedule,
        trainingDescription: trainingDetails.description,
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
      <div className="p-6 text-center" dir="rtl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-700">يرجى تسجيل الدخول للوصول إلى نموذج التسجيل.</p>
        </div>
      </div>
    );
  }

  if (!selectedBranchId) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-700">يرجى اختيار الفرع أولاً للمتابعة في عملية التسجيل.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-center" dir="rtl">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="mt-4 text-gray-600">جاري تحميل بيانات الدورات...</p>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="p-6" dir="rtl">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">حسابك قيد المراجعة</h3>
          <p className="text-gray-600">سيتم تفعيل إمكانية التسجيل في الدورات بعد أن يقوم فريق الإدارة بتوثيق حسابك.</p>
        </div>
      </div>
    );
  }

  if (!providedSelection) {
    return (
      <div className="p-6" dir="rtl">
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <AlertCircle className="w-10 h-10 text-yellow-500 mx-auto mb-4" />
          <p className="text-lg text-gray-700">
            يرجى العودة إلى صفحة الدورات التكوينية واختيار دورة للمتابعة في التسجيل.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">نموذج التسجيل في الدورات التكوينية</h1>
          <p className="text-gray-600">تم اختيار الدورة مسبقاً. يرجى إكمال البيانات الشخصية وإرفاق إيصال الدفع.</p>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {isPending && registrationStatus && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              <div>
                <p className="font-semibold">طلبك قيد المراجعة</p>
                <p className="text-sm text-yellow-800">لا تقم بإرسال طلب جديد. سيتم إشعارك فور التأكيد.</p>
              </div>
            </div>
            {registrationStatus?.paymentProof && (
              <div className="rounded-lg border border-yellow-200 bg-white p-3">
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

        {isVerified && (
          <div className="bg-green-50 border border-green-200 text-green-900 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5" />
            <div>
              <p className="font-semibold">تم قبول طلبك</p>
              <p className="text-sm text-green-800">لقد تم تسجيلك في هذه الدورة. لا حاجة لإرسال طلب جديد.</p>
            </div>
          </div>
        )}

        {!trainingDetails ? (
          <div className="bg-white rounded-lg shadow p-10 text-center">
            <GraduationCap className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">لا يمكن العثور على بيانات الدورة</h3>
            <p className="text-gray-600">يبدو أن هذه الدورة لم تعد متاحة. يرجى اختيار دورة أخرى من الصفحة الرئيسية.</p>
          </div>
        ) : (
          <form className="bg-white rounded-2xl shadow-lg p-6 space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">الدورة المختارة</label>
              <select
                value={trainingDetails.trainingId}
                disabled
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
              >
                <option value={trainingDetails.trainingId}>
                  {trainingDetails.trainingName}
                  {` — ${formatPriceText(trainingDetails.price)}`}
                </option>
              </select>
            </div>

            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-1 text-sm text-gray-700">
              {trainingDetails.description && <p>{trainingDetails.description}</p>}
              <p>
                <strong>المؤطر:</strong> {trainingDetails.teacherName || '—'}
              </p>
              <p>
                <strong>السعر:</strong> {formatPriceText(trainingDetails.price)}
              </p>
              {trainingDetails.schedule && (
                <p>
                  <strong>الجدول:</strong> {trainingDetails.schedule}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">اللقب والإسم *</label>
                <input
                  type="text"
                  className={getFieldClasses()}
                  placeholder="مثال: بن زاوي مروة"
                  disabled={shouldDisableFields}
                  {...register('studentName', { required: 'هذا الحقل إجباري' })}
                />
                {errors.studentName && <p className="mt-1 text-sm text-red-600">{errors.studentName.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">تاريخ الميلاد *</label>
                <input
                  type="date"
                  className={getFieldClasses()}
                  disabled={shouldDisableFields}
                  {...register('birthDate', { required: 'حدد تاريخ الميلاد' })}
                />
                {errors.birthDate && <p className="mt-1 text-sm text-red-600">{errors.birthDate.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">مكان الميلاد *</label>
                <input
                  type="text"
                  className={getFieldClasses()}
                  placeholder="مثال: بومرداس"
                  disabled={shouldDisableFields}
                  {...register('birthPlace', { required: 'أدخل مكان الميلاد' })}
                />
                {errors.birthPlace && <p className="mt-1 text-sm text-red-600">{errors.birthPlace.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">رقم الهاتف *</label>
                <input
                  type="tel"
                  className={getFieldClasses()}
                  placeholder="مثال: 0666 00 00 00"
                  disabled={shouldDisableFields}
                  {...register('studentPhone', { required: 'أدخل رقم الهاتف' })}
                />
                {errors.studentPhone && (
                  <p className="mt-1 text-sm text-red-600">{errors.studentPhone.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">طريقة الدفع *</label>
                <select
                  className={getFieldClasses()}
                  disabled={shouldDisableFields}
                  {...register('paymentMethod', { required: 'اختر طريقة الدفع' })}
                >
                  <option value="">— اختر طريقة الدفع —</option>
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
                {errors.paymentMethod && (
                  <p className="mt-1 text-sm text-red-600">{errors.paymentMethod.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">صورة الإيصال *</label>
              <div
                className={`border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors ${
                  shouldDisableFields ? 'bg-gray-50 opacity-70 cursor-not-allowed' : 'hover:border-primary'
                }`}
              >
                <input
                  type="file"
                  id="training-receipt-upload"
                  accept="image/*"
                  className="hidden"
                  disabled={shouldDisableFields}
                  onChange={handleReceiptChange}
                />
                <label
                  htmlFor="training-receipt-upload"
                  className={`flex flex-col items-center gap-2 text-gray-600 ${
                    shouldDisableFields ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <Upload className="w-10 h-10 text-gray-400" />
                  <span>{receiptFile ? receiptFile.name : 'انقر لرفع صورة واضحة لإيصال الدفع'}</span>
                  <span className="text-xs text-gray-500">الصيغ المدعومة: JPG / PNG — الحد الأقصى 5 ميجابايت</span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || isFormLocked}
              className="w-full py-3 px-6 bg-primary text-white rounded-lg font-semibold hover:bg-primary-600 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  جاري الإرسال...
                </>
              ) : isVerified ? (
                'تم تسجيلك في هذه الدورة'
              ) : isPending ? (
                'بانتظار موافقة الإدارة'
              ) : (
                'إرسال طلب التسجيل'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default TrainingRegistrationForm;
