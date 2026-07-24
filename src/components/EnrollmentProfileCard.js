import { User, Mail, Phone, Calendar, MapPin, GraduationCap, AlertTriangle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUserProfile } from '../hooks/useUserProfile';

const Field = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2 min-w-0">
    <Icon className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-xs text-gray-400 leading-none mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 font-medium truncate">{value || '—'}</p>
    </div>
  </div>
);

const MISSING_LABEL = {
  name: 'الاسم الكامل',
  birthDate: 'تاريخ الميلاد',
  birthPlace: 'مكان الميلاد',
  school: 'المؤسسة التعليمية',
  guardianPhone: 'رقم الهاتف',
};

export const EnrollmentProfileCard = () => {
  const { profile, profileLoading } = useUserProfile();

  if (profileLoading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-blue-200 rounded w-1/3 mb-3" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-blue-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const missing = profile
    ? Object.entries(MISSING_LABEL)
        .filter(([key]) => !profile[key])
        .map(([, label]) => label)
    : Object.values(MISSING_LABEL);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      dir="rtl"
      style={{ borderColor: missing.length ? '#fbbf24' : '#bfdbfe' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: missing.length ? '#fffbeb' : '#eff6ff' }}
      >
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-gray-700">معلومات الطالب</span>
        </div>
        <Link
          to="/profile"
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          تعديل الملف
        </Link>
      </div>

      {/* Fields */}
      <div className="bg-white px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-3">
        <Field icon={User}     label="الاسم الكامل"    value={profile?.name} />
        <Field icon={Mail}     label="البريد الإلكتروني" value={profile?.email} />
        <Field icon={Phone}    label="هاتف ولي الأمر"  value={profile?.guardianPhone} />
        <Field icon={Phone}    label="هاتف الطالب"     value={profile?.studentPhone} />
        <Field icon={Calendar} label="تاريخ الميلاد"   value={profile?.birthDate} />
        <Field icon={MapPin}   label="مكان الميلاد"    value={profile?.birthPlace} />
        <Field icon={GraduationCap} label="المؤسسة التعليمية" value={profile?.school} />
      </div>

      {/* Incomplete warning */}
      {missing.length > 0 && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            بيانات ناقصة:{' '}
            <strong>{missing.join('، ')}</strong>
            {' — '}
            <Link to="/profile" className="underline font-semibold hover:text-amber-900">
              أكمل ملفك الشخصي
            </Link>
          </p>
        </div>
      )}
    </div>
  );
};

export default EnrollmentProfileCard;
