import React, { useState } from 'react';
import { UserPlus, Loader2, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import apiCall from '../../utils/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { recordAnnualFeePayment } from '../../services/firestoreService';
import { SCHOOL_HINT_AR, isValidSchool } from '../../utils/personData';
import AdminModal from './AdminModal';

const ACADEMIC_YEARS = [
  { id: 'mid1', label: 'أولى متوسط' },
  { id: 'mid2', label: 'ثانية متوسط' },
  { id: 'mid3', label: 'ثالثة متوسط' },
  { id: 'mid4', label: 'رابعة متوسط' },
  { id: 'sec1', label: 'أولى ثانوي' },
  { id: 'sec2', label: 'ثانية ثانوي' },
  { id: 'sec3', label: 'ثالثة ثانوي' },
];

/**
 * Modal for admins to create a student account directly (physical payment / offline enrollment).
 * Calls the Express backend POST /api/admin/create-student.
 */
const AdminCreateStudentModal = ({ branchId, onClose, onSuccess }) => {
  const { user: adminUser } = useAuth();

  const [fullName,          setFullName]          = useState('');
  const [email,             setEmail]             = useState('');
  const [phone,             setPhone]             = useState('');
  const [school,            setSchool]            = useState('');
  const [password,          setPassword]          = useState('');
  const [showPassword,      setShowPassword]      = useState(false);
  const [markAnnualFee,     setMarkAnnualFee]     = useState(false);
  // The student's educational level. Saved on the PROFILE at creation whether or
  // not the annual fee is paid, so no later workflow asks for it again.
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  // Optional personal data — the same fields self-registration and the bulk
  // import collect. Left empty when unknown.
  const [birthDate,         setBirthDate]         = useState('');
  const [birthPlace,        setBirthPlace]        = useState('');
  const [address,           setAddress]           = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');

  const validate = () => {
    if (!fullName.trim())   return 'يرجى إدخال الاسم الكامل';
    if (!email.trim())      return 'يرجى إدخال البريد الإلكتروني';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return 'البريد الإلكتروني غير صالح';
    if (!isValidSchool(school))
      return 'يرجى إدخال المؤسسة التعليمية (اكتب «حر» إن لم يكن منتسباً إلى مدرسة)';
    if (!password)          return 'يرجى إدخال كلمة مرور مؤقتة';
    if (password.length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
    if (markAnnualFee && !selectedAcademicYear)
      return 'يرجى اختيار المستوى الدراسي عند تسجيل الرسوم السنوية';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSubmitting(true);
    try {
      const result = await apiCall('/api/admin/create-student', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          fullName:  fullName.trim(),
          email:     email.trim().toLowerCase(),
          phone:     phone.trim(),
          school:    school.trim(),
          password,
          adminUid:  adminUser?.uid ?? null,
          studyYear:  selectedAcademicYear || null,
          birthDate:  birthDate || null,
          birthPlace: birthPlace.trim() || null,
          address:    address.trim() || null,
        }),
      });

      const newUserId = result?.userId;

      // Optionally record the annual fee as paid for this student. Routes through
      // the SAME centralized endpoint the Annual Fees page uses — so the record is
      // a standalone financial entry (amount from owner config, ledger + audit +
      // flags), identical to a self-registered student's. Not a side effect of
      // account creation beyond this explicit, opt-in call.
      if (markAnnualFee && newUserId) {
        await recordAnnualFeePayment(branchId, newUserId, {
          studyYear: selectedAcademicYear || null,
          notes: 'تم تسجيل الرسوم السنوية عند إنشاء الحساب',
        });
      }

      const yearLabel = ACADEMIC_YEARS.find(y => y.id === selectedAcademicYear)?.label || '';
      setSuccess(
        `تم إنشاء حساب الطالب بنجاح${yearLabel ? ` (المستوى: ${yearLabel})` : ''}${markAnnualFee ? ' وتم تسجيل الرسوم السنوية' : ''}.`
      );
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      console.error('createStudent error:', err);

      if (err.code === 'already-exists') {
        setError('البريد الإلكتروني مستخدم بالفعل. جرب بريداً آخر.');
      } else if (err.code === 'permission-denied') {
        setError('ليس لديك صلاحية إنشاء حسابات الطلاب.');
      } else if (!navigator.onLine || err.message?.toLowerCase().includes('fetch')) {
        setError('تعذر الوصول إلى الخادم. تحقق من اتصالك بالإنترنت.');
      } else {
        setError(err.message || 'حدث خطأ أثناء إنشاء الحساب.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
      >
        إلغاء
      </button>
      <button
        type="submit"
        form="admin-create-student-form"
        disabled={submitting || !!success}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري الإنشاء...
          </span>
        ) : 'إنشاء الحساب'}
      </button>
    </>
  );

  return (
    <AdminModal open onClose={onClose} size="md" icon={UserPlus} title="إنشاء حساب طالب" footer={footer}>
      <form id="admin-create-student-form" onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
        {error && (
          <div className="flex gap-2.5 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex gap-2.5 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">
            <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Full name */}
        <div>
          <label htmlFor="acs-fullname" className="mb-1.5 block text-sm font-medium text-gray-700">
            الاسم الكامل <span className="text-danger-500">*</span>
          </label>
          <input
            type="text"
            id="acs-fullname"
            name="acs-fullname"
            autoComplete="off"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="مثال: أحمد بن علي"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            required
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="acs-email" className="mb-1.5 block text-sm font-medium text-gray-700">
            البريد الإلكتروني <span className="text-danger-500">*</span>
          </label>
          <input
            type="email"
            id="acs-email"
            name="acs-email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            dir="ltr"
            required
          />
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="acs-phone" className="mb-1.5 block text-sm font-medium text-gray-700">
            رقم الهاتف
          </label>
          <input
            type="tel"
            id="acs-phone"
            name="acs-phone"
            autoComplete="off"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0555 000 000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            dir="ltr"
          />
        </div>

        {/* Educational institution / school */}
        <div>
          <label htmlFor="acs-school" className="mb-1.5 block text-sm font-medium text-gray-700">
            المؤسسة التعليمية / المدرسة <span className="text-danger-500">*</span>
          </label>
          <input
            type="text"
            id="acs-school"
            name="acs-school"
            autoComplete="off"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="اسم المؤسسة التعليمية"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            required
          />
          <p className="mt-1 text-xs text-gray-500">{SCHOOL_HINT_AR}</p>
        </div>

        {/* Optional personal data (same fields as self-registration / bulk import) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="acs-birthdate" className="mb-1.5 block text-sm font-medium text-gray-700">
              تاريخ الازدياد <span className="text-xs font-normal text-gray-400">(اختياري)</span>
            </label>
            <input
              type="date"
              id="acs-birthdate"
              value={birthDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              dir="ltr"
            />
          </div>
          <div>
            <label htmlFor="acs-birthplace" className="mb-1.5 block text-sm font-medium text-gray-700">
              مكان الازدياد <span className="text-xs font-normal text-gray-400">(اختياري)</span>
            </label>
            <input
              type="text"
              id="acs-birthplace"
              autoComplete="off"
              value={birthPlace}
              onChange={(e) => setBirthPlace(e.target.value)}
              placeholder="المدينة / المنطقة"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <div>
          <label htmlFor="acs-address" className="mb-1.5 block text-sm font-medium text-gray-700">
            العنوان <span className="text-xs font-normal text-gray-400">(اختياري)</span>
          </label>
          <input
            type="text"
            id="acs-address"
            autoComplete="off"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="العنوان الكامل"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Educational level — saved on the profile, reused by every later workflow */}
        <div>
          <label htmlFor="acs-level" className="mb-1.5 block text-sm font-medium text-gray-700">
            المستوى الدراسي{' '}
            {markAnnualFee
              ? <span className="text-danger-500">*</span>
              : <span className="text-xs font-normal text-gray-400">(اختياري)</span>}
          </label>
          <select
            id="acs-level"
            value={selectedAcademicYear}
            onChange={(e) => setSelectedAcademicYear(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">-- غير محدد --</option>
            <optgroup label="متوسط">
              {ACADEMIC_YEARS.filter(y => y.id.startsWith('mid')).map(y => (
                <option key={y.id} value={y.id}>{y.label}</option>
              ))}
            </optgroup>
            <optgroup label="ثانوي">
              {ACADEMIC_YEARS.filter(y => y.id.startsWith('sec')).map(y => (
                <option key={y.id} value={y.id}>{y.label}</option>
              ))}
            </optgroup>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            يُحفظ في ملف الطالب للسنة الدراسية الحالية، ولن يُطلب مرة أخرى عند تسجيل الرسوم أو دروس الدعم.
          </p>
        </div>

        {/* Temporary password */}
        <div>
          <label htmlFor="acs-temp-password" className="mb-1.5 block text-sm font-medium text-gray-700">
            كلمة مرور مؤقتة <span className="text-danger-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="acs-temp-password"
              name="acs-temp-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6 أحرف على الأقل"
              className="w-full rounded-lg border border-gray-300 py-2.5 ps-3 pe-10 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              dir="ltr"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            يجب إبلاغ الطالب بكلمة المرور المؤقتة لتسجيل الدخول لأول مرة، وسيُطلب منه تغييرها عند أول دخول.
          </p>
        </div>

        {/* Annual fee checkbox */}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3.5 transition-colors hover:bg-gray-100">
          <input
            type="checkbox"
            checked={markAnnualFee}
            onChange={(e) => setMarkAnnualFee(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-primary focus:ring-primary/30"
          />
          <div>
            <p className="text-sm font-medium text-gray-800">تسجيل الرسوم السنوية كمدفوعة</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              تحقق من هذا الخيار إذا دفع الطالب الرسوم السنوية نقداً في المكتب.
              يُستعمل المستوى الدراسي المحدد أعلاه — وهو إلزامي في هذه الحالة.
              إن لم يدفع بعد، يبقى مستواه محفوظاً ويمكن تسجيل الرسوم لاحقاً دون إعادة إدخاله.
            </p>
          </div>
        </label>
      </form>
    </AdminModal>
  );
};

export default AdminCreateStudentModal;
