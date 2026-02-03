import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import {
  getLanguages,
  createLanguageRegistration,
  isUserVerified
} from '../services/firestoreService';
import { supabase } from '../supabase';
import {
  AlertCircle,
  CheckCircle,
  GraduationCap,
  Languages,
  Loader2,
  Upload
} from 'lucide-react';

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

const normalizeLanguageCourse = (languageDoc) => {
  const displayName = languageDoc.languageName || languageDoc.name || 'دورة لغة';
  const levelEntries = [];

  const pushEntry = (levelId, payload = {}) => {
    if (!levelId) return;
    levelEntries.push({
      levelId,
      levelLabel: payload.label || payload.name || levelId,
      price: parseNumericPrice(payload.price ?? languageDoc.price),
      teacherName: payload.teacher || payload.teacherName || languageDoc.teacherName || '',
      schedule: formatSchedule(payload.days || payload.schedule || payload.timing),
    });
  };

  const rawLevels = languageDoc.levels;
  if (Array.isArray(rawLevels)) {
    rawLevels.forEach((level) => {
      if (!level) return;
      pushEntry(level.id || level.levelId || level.name, level);
    });
  } else if (rawLevels && typeof rawLevels === 'object') {
    Object.entries(rawLevels).forEach(([key, levelData]) => {
      if (!levelData) return;
      pushEntry(key, levelData);
    });
  }

  return {
    id: languageDoc.id,
    displayName,
    description: languageDoc.description || '',
    levelEntries,
  };
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
  return '';
};

const extractLevelOptions = (languages) => {
  const map = new Map();
  languages.forEach((language) => {
    language.levelEntries.forEach((entry) => {
      if (!map.has(entry.levelId)) {
        map.set(entry.levelId, entry.levelLabel || entry.levelId);
      }
    });
  });
  return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
};

const LanguageRegistrationForm = ({ initialSelection = null, lockSelection = false, onSuccess }) => {
  const { user } = useAuth();
  const { selectedBranchId } = useBranch();
  const [languages, setLanguages] = useState([]);
  const [levelOptions, setLevelOptions] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedLanguageId, setSelectedLanguageId] = useState('');
  const [selectedLevelDetails, setSelectedLevelDetails] = useState(null);
  const [receiptFile, setReceiptFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [verified, setVerified] = useState(false);
  const [initialSelectionApplied, setInitialSelectionApplied] = useState(false);

  const initialSelectionLevelId = initialSelection?.levelId || '';
  const initialSelectionLanguageId = initialSelection?.languageId || '';
  const initialSelectionKey = `${initialSelectionLevelId}::${initialSelectionLanguageId}`;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    defaultValues: {
      studentName: '',
      birthDate: '',
      birthPlace: '',
      guardianPhone: '',
      studentPhone: '',
      paymentMethod: '',
    },
  });

  useEffect(() => {
    if (!user || !selectedBranchId) {
      setLanguages([]);
      setLevelOptions([]);
      setVerified(false);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const [verifiedStatus, languagesData] = await Promise.all([
          isUserVerified(selectedBranchId, user.uid),
          getLanguages(selectedBranchId),
        ]);

        const normalizedLanguages = languagesData.map(normalizeLanguageCourse);
        setVerified(verifiedStatus);
        setLanguages(normalizedLanguages);
        setLevelOptions(extractLevelOptions(normalizedLanguages));
      } catch (err) {
        console.error('Error loading language form data:', err);
        setError('فشل في تحميل بيانات اللغات. يرجى المحاولة لاحقاً.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedBranchId, user]);

  useEffect(() => {
    setSelectedLanguageId('');
    setSelectedLevelDetails(null);
  }, [selectedLevel]);

  useEffect(() => {
    setInitialSelectionApplied(false);
  }, [initialSelectionKey]);

  const availableLanguagesForLevel = useMemo(() => {
    if (!selectedLevel) return [];
    return languages.reduce((acc, language) => {
      const entry = language.levelEntries.find((lvl) => lvl.levelId === selectedLevel);
      if (entry) {
        acc.push({
          id: language.id,
          name: language.displayName,
          description: language.description,
          level: entry,
        });
      }
      return acc;
    }, []);
  }, [languages, selectedLevel]);

  const applyLanguageSelection = (languageId, options = availableLanguagesForLevel) => {
    if (!languageId) {
      setSelectedLanguageId('');
      setSelectedLevelDetails(null);
      return;
    }

    const match = options.find((option) => option.id === languageId);
    setSelectedLanguageId(languageId);
    setSelectedLevelDetails(
      match
        ? {
            ...match.level,
            languageName: match.name,
            languageDescription: match.description,
          }
        : null
    );
  };

  const handleLanguageChange = (event) => {
    applyLanguageSelection(event.target.value);
  };

  useEffect(() => {
    if (initialSelectionApplied) return;
    if (!initialSelectionLevelId) return;
    setSelectedLevel(initialSelectionLevelId);
  }, [initialSelectionApplied, initialSelectionLevelId]);

  useEffect(() => {
    if (initialSelectionApplied) return;
    if (!initialSelectionLanguageId) return;
    if (!selectedLevel || selectedLevel !== initialSelectionLevelId) return;

    const matchExists = availableLanguagesForLevel.some((option) => option.id === initialSelectionLanguageId);
    if (!matchExists) return;

    applyLanguageSelection(initialSelectionLanguageId);
    setInitialSelectionApplied(true);
  }, [
    initialSelectionApplied,
    initialSelectionLanguageId,
    initialSelectionLevelId,
    selectedLevel,
    availableLanguagesForLevel,
  ]);

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

  const uploadReceiptToSupabase = async () => {
    if (!supabase) {
      throw new Error('خدمة رفع الملفات غير متاحة حالياً. يرجى إبلاغ الإدارة.');
    }
    if (!receiptFile) {
      throw new Error('يرجى إرفاق صورة الإيصال.');
    }

    const extension = receiptFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    const objectPath = `language-forms/${selectedBranchId}/${user.uid}/${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('annual-fee')
      .upload(objectPath, receiptFile, { upsert: false });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      throw new Error('تعذر رفع صورة الإيصال. يرجى المحاولة مرة أخرى.');
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('annual-fee').getPublicUrl(objectPath);

    if (!publicUrl) {
      throw new Error('تعذر الحصول على رابط لصورة الإيصال.');
    }

    return { publicUrl, path: objectPath };
  };

  const onSubmit = async (formValues) => {
    setError('');
    setSuccess('');

    if (!verified) {
      setError('يجب توثيق حسابك من طرف الإدارة قبل إرسال الطلب.');
      return;
    }
    if (!selectedLevel) {
      setError('يرجى اختيار المستوى أولاً.');
      return;
    }
    if (!selectedLanguageId || !selectedLevelDetails) {
      setError('يرجى اختيار اللغة المرتبطة بالمستوى.');
      return;
    }
    if (!receiptFile) {
      setError('يرجى رفع صورة الإيصال.');
      return;
    }

    try {
      setSubmitting(true);
      const { publicUrl, path } = await uploadReceiptToSupabase();

      await createLanguageRegistration(selectedBranchId, {
        userId: user.uid,
        userEmail: user.email,
        studentName: formValues.studentName,
        birthDate: formValues.birthDate || null,
        birthPlace: formValues.birthPlace,
        guardianPhone: formValues.guardianPhone,
        studentPhone: formValues.studentPhone,
        paymentMethod: formValues.paymentMethod,
        levelId: selectedLevel,
        levelLabel: selectedLevelDetails.levelLabel,
        languageId: selectedLanguageId,
        languageName: selectedLevelDetails.languageName,
        languagePrice: selectedLevelDetails.price,
        teacherName: selectedLevelDetails.teacherName,
        receiptUrl: publicUrl,
        receiptPath: path,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      setSuccess('تم استلام طلبك بنجاح. سيتم تفعيله فور التحقق من طرف الإدارة.');
      onSuccess?.();
      reset();
      if (!lockSelection) {
        setSelectedLevel('');
        setSelectedLanguageId('');
        setSelectedLevelDetails(null);
      }
      setReceiptFile(null);
    } catch (err) {
      console.error('Error submitting language form:', err);
      setError(err.message || 'حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى.');
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
          <p className="text-gray-600">
            سيتم تفعيل إمكانية التسجيل في الدورات بعد أن يقوم فريق الإدارة بتوثيق حسابك.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">نموذج التسجيل في دورات اللغات</h1>
          <p className="text-gray-600">
            اختر المستوى، ثم اختر اللغة المناسبة، واملأ البيانات الشخصية مع إرفاق إيصال الدفع.
          </p>
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

        {languages.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-10 text-center">
            <Languages className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">لا توجد دورات لغة مفعّلة حالياً</h3>
            <p className="text-gray-600">يرجى العودة لاحقاً أو التواصل مع الإدارة لمزيد من التفاصيل.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <span className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" />
                  اختر المستوى <span className="text-red-500">*</span>
                </span>
              </label>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                disabled={lockSelection && Boolean(initialSelectionLevelId)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">— اختر المستوى (A1, A2, ... ) —</option>
                {levelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {selectedLevel && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  اختر اللغة <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedLanguageId}
                  onChange={handleLanguageChange}
                  disabled={lockSelection && Boolean(initialSelectionLanguageId)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">— اختر اللغة الخاصة بهذا المستوى —</option>
                  {availableLanguagesForLevel.map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.name}
                      {` — ${formatPriceText(language.level.price)}`}
                    </option>
                  ))}
                </select>
                {availableLanguagesForLevel.length === 0 && (
                  <p className="mt-2 text-sm text-yellow-700 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                    لا توجد لغات مرتبطة بهذا المستوى حالياً.
                  </p>
                )}
              </div>
            )}

            {selectedLevelDetails && (
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-2">
                <h4 className="text-lg font-semibold text-primary">
                  {selectedLevelDetails.languageName} · {selectedLevelDetails.levelLabel}
                </h4>
                <div className="text-sm text-gray-700 space-y-1">
                  {selectedLevelDetails.languageDescription && <p>{selectedLevelDetails.languageDescription}</p>}
                  <p>
                    <strong>الأستاذ:</strong> {selectedLevelDetails.teacherName || '—'}
                  </p>
                  <p>
                    <strong>السعر:</strong> {formatPriceText(selectedLevelDetails.price)}
                  </p>
                  {selectedLevelDetails.schedule && (
                    <p>
                      <strong>الجدول:</strong> {selectedLevelDetails.schedule}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">اللقب والإسم *</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="مثال: بن زاوي مروة"
                  {...register('studentName', { required: 'هذا الحقل إجباري' })}
                />
                {errors.studentName && <p className="mt-1 text-sm text-red-600">{errors.studentName.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">تاريخ الميلاد *</label>
                <input
                  type="date"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  {...register('birthDate', { required: 'حدد تاريخ الميلاد' })}
                />
                {errors.birthDate && <p className="mt-1 text-sm text-red-600">{errors.birthDate.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">مكان الميلاد *</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="مثال: بومرداس"
                  {...register('birthPlace', { required: 'أدخل مكان الميلاد' })}
                />
                {errors.birthPlace && <p className="mt-1 text-sm text-red-600">{errors.birthPlace.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">رقم الهاتف للولي *</label>
                <input
                  type="tel"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="مثال: 0555 00 00 00"
                  {...register('guardianPhone', { required: 'أدخل رقم الهاتف' })}
                />
                {errors.guardianPhone && <p className="mt-1 text-sm text-red-600">{errors.guardianPhone.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">رقم هاتف الطالب *</label>
                <input
                  type="tel"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="مثال: 0666 00 00 00"
                  {...register('studentPhone', { required: 'أدخل رقم الهاتف' })}
                />
                {errors.studentPhone && <p className="mt-1 text-sm text-red-600">{errors.studentPhone.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">طريقة الدفع *</label>
                <select
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  {...register('paymentMethod', { required: 'اختر طريقة الدفع' })}
                >
                  <option value="">— اختر طريقة الدفع —</option>
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
                {errors.paymentMethod && <p className="mt-1 text-sm text-red-600">{errors.paymentMethod.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">صورة الإيصال *</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
                <input
                  type="file"
                  id="receipt-upload"
                  accept="image/*"
                  className="hidden"
                  onChange={handleReceiptChange}
                />
                <label htmlFor="receipt-upload" className="cursor-pointer flex flex-col items-center gap-2 text-gray-600">
                  <Upload className="w-10 h-10 text-gray-400" />
                  <span>{receiptFile ? receiptFile.name : 'انقر لرفع صورة واضحة لإيصال الدفع'}</span>
                  <span className="text-xs text-gray-500">الصيغ المدعومة: JPG / PNG — الحد الأقصى 5 ميجابايت</span>
                </label>
              </div>
            </div>

            <button
              onClick={handleSubmit(onSubmit)}
              disabled={submitting}
              className="w-full py-3 px-6 bg-primary text-white rounded-lg font-semibold hover:bg-primary-600 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                'إرسال طلب التسجيل'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LanguageRegistrationForm;