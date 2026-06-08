import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { completeGoogleProfile } from '../services/googleAuthService';
import { uploadToSupabase } from '../services/userService';
import { validateImageFile } from '../utils/imageOptimizer';
import UploadGuide from '../components/UploadGuide';
import { Camera, Upload, Building2, CheckCircle } from 'lucide-react';
import { Button, buttonClasses } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { Alert, LoadingState, Spinner } from '../components/ui/feedback';

const CompleteRegistrationPage = () => {
  const { user, profileDoc, loading, completedProfile } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [profilePic, setProfilePic] = useState(null);
  const [idCard, setIdCard] = useState(null);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Pre-fill name from the Google stub once profileDoc loads
  useEffect(() => {
    if (profileDoc?.fullName) setFullName(profileDoc.fullName);
  }, [profileDoc?.fullName]);

  // Guards
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login', { replace: true }); return; }
    if (completedProfile === true) { navigate('/profile', { replace: true }); return; }
  }, [user, loading, completedProfile, navigate]);

  const branchId = profileDoc?.branchId;
  const branchName = profileDoc?.branchName || branchId;

  const registrationNumber = useMemo(() => {
    if (!user?.uid) return '';
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const prefix = (branchId || 'BR').slice(0, 4).toUpperCase();
    return `${prefix}-${y}${m}-${rand}`;
  }, [user?.uid, branchId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!rulesAccepted) {
      setError('يرجى قراءة وقبول القواعد الداخلية للمدرسة قبل المتابعة');
      return;
    }
    if (!fullName || !birthDate || !birthPlace || !address || !phoneNumber) {
      setError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    if (!profilePic) {
      setError('الرجاء رفع صورة شخصية');
      return;
    }
    if (!idCard) {
      setError('الرجاء رفع صورة بطاقة الهوية');
      return;
    }
    if (!branchId || !user?.uid) {
      setError('معلومات الحساب غير مكتملة. يرجى تسجيل الخروج والمحاولة مجدداً.');
      return;
    }

    setSubmitting(true);

    try {
      // Upload profile photo
      const { publicUrl: photoUrl } = await uploadToSupabase(
        profilePic, user.uid, 'userPhoto'
      );

      // Upload ID card
      const { publicUrl: idCardUrl } = await uploadToSupabase(
        idCard, user.uid, 'idPhoto'
      );

      // Write complete profile to Firestore
      await completeGoogleProfile(branchId, user.uid, {
        fullName,
        name: fullName,
        birthDate,
        birthPlace,
        address,
        phoneNumber,
        phone: phoneNumber,
        photoUrl,
        idCardUrl,
        registrationNumber,
        internalRulesAccepted: true,
      });

      setDone(true);
      // Small pause so the success message is visible before navigation
      setTimeout(() => navigate('/profile', { replace: true }), 2000);
    } catch (err) {
      console.error('CompleteRegistration error:', err);
      if (err.message?.includes('upload') || err.message?.includes('Supabase')) {
        setError('فشل رفع الصور. يرجى التحقق من حجم الملفات والمحاولة مرة أخرى.');
      } else {
        setError('حدث خطأ أثناء حفظ البيانات. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <LoadingState />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center" dir="rtl">
        <div className="bg-white rounded-2xl shadow-md p-10 text-center max-w-sm mx-4">
          <CheckCircle className="h-16 w-16 text-success-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">تم إرسال الطلب بنجاح</h2>
          <p className="text-gray-600 text-sm">
            سيتم مراجعة حسابك من طرف الإدارة. سيتم إشعارك عند الموافقة.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center py-12 px-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto h-16 w-16 bg-primary rounded-full flex items-center justify-center">
            <Upload className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">إكمال التسجيل</h1>
          <p className="text-gray-600 mt-1 text-sm">
            يرجى استكمال بياناتك للحصول على موافقة الإدارة
          </p>
        </div>

        {/* Branch badge */}
        {branchName && (
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 mb-4 text-sm text-primary-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 flex-shrink-0" />
            <span>الفرع: <strong>{branchName}</strong></span>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <Alert variant="danger" className="mb-4">{error}</Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Full name */}
          <div>
            <Label htmlFor="cr-fullname" required>الاسم الكامل</Label>
            <Input
              id="cr-fullname"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="محمد علي"
            />
          </div>

          {/* Birth date */}
          <div>
            <Label htmlFor="cr-birthdate" required>تاريخ الازدياد</Label>
            <Input
              id="cr-birthdate"
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>

          {/* Birth place */}
          <div>
            <Label htmlFor="cr-birthplace" required>مكان الازدياد</Label>
            <Input
              id="cr-birthplace"
              type="text"
              required
              value={birthPlace}
              onChange={(e) => setBirthPlace(e.target.value)}
              placeholder="المدينة / المنطقة"
            />
          </div>

          {/* Address */}
          <div>
            <Label htmlFor="cr-address" required>العنوان</Label>
            <Input
              id="cr-address"
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="العنوان الكامل"
            />
          </div>

          {/* Phone */}
          <div>
            <Label htmlFor="cr-phone" required>رقم الهاتف</Label>
            <Input
              id="cr-phone"
              type="tel"
              required
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="0XXXXXXXXX"
            />
          </div>

          {/* Registration number (display only) */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
            <span className="font-medium">رقم التسجيل:</span>{' '}
            <span className="font-mono">{registrationNumber}</span>
          </div>

          {/* Profile photo upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Camera className="w-4 h-4 inline me-1" />
              الصورة الشخصية <span className="text-red-500">*</span>
            </label>
            <UploadGuide compact className="mb-3" />
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-primary transition-colors">
              {profilePic ? (
                <div>
                  <img
                    src={URL.createObjectURL(profilePic)}
                    alt="الصورة الشخصية"
                    className="max-w-full h-32 object-cover mx-auto mb-3 rounded"
                  />
                  <p className="text-success-600 text-sm font-medium">{profilePic.name}</p>
                  <button
                    type="button"
                    onClick={() => setProfilePic(null)}
                    className="text-danger hover:text-danger-700 text-xs mt-2 hover:underline"
                  >
                    إزالة الصورة
                  </button>
                </div>
              ) : (
                <div>
                  <Camera className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 text-sm mb-1">اضغط لرفع الصورة الشخصية</p>
                  <p className="text-xs text-gray-400">JPG, PNG أقل من 5MB</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                id="profile-pic-upload"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const { valid, error: imgError } = validateImageFile(file);
                  if (!valid) {
                    setError(imgError);
                    e.target.value = '';
                    return;
                  }
                  setError('');
                  setProfilePic(file);
                }}
              />
              <label
                htmlFor="profile-pic-upload"
                className={buttonClasses({ size: 'sm', className: 'mt-3 cursor-pointer' })}
              >
                اختيار صورة
              </label>
            </div>
          </div>

          {/* ID card upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Upload className="w-4 h-4 inline me-1" />
              صورة بطاقة الهوية <span className="text-red-500">*</span>
            </label>
            <UploadGuide compact className="mb-3" />
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-primary transition-colors">
              {idCard ? (
                <div>
                  <img
                    src={URL.createObjectURL(idCard)}
                    alt="بطاقة الهوية"
                    className="max-w-full h-32 object-cover mx-auto mb-3 rounded"
                  />
                  <p className="text-success-600 text-sm font-medium">{idCard.name}</p>
                  <button
                    type="button"
                    onClick={() => setIdCard(null)}
                    className="text-danger hover:text-danger-700 text-xs mt-2 hover:underline"
                  >
                    إزالة الصورة
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 text-sm mb-1">اضغط لرفع صورة بطاقة الهوية</p>
                  <p className="text-xs text-gray-400">JPG, PNG أقل من 5MB</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                id="id-card-upload"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const { valid, error: imgError } = validateImageFile(file);
                  if (!valid) {
                    setError(imgError);
                    e.target.value = '';
                    return;
                  }
                  setError('');
                  setIdCard(file);
                }}
              />
              <label
                htmlFor="id-card-upload"
                className={buttonClasses({ size: 'sm', className: 'mt-3 cursor-pointer' })}
              >
                اختيار صورة
              </label>
            </div>
          </div>

          {/* Internal rules */}
          <div className="flex items-start gap-2 mt-2">
            <input
              type="checkbox"
              id="accept-rules"
              checked={rulesAccepted}
              onChange={(e) => setRulesAccepted(e.target.checked)}
              className="mt-1 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
              required
            />
            <label htmlFor="accept-rules" className="text-sm text-gray-700">
              لقد قرأت وأوافق على{' '}
              <a
                href="/internal-rules"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary-700 font-medium underline"
              >
                القواعد الداخلية لمدرسة Trust School
              </a>
            </label>
          </div>

          <Button type="submit" fullWidth disabled={submitting || !rulesAccepted}>
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size="sm" className="text-white" />
                جاري الحفظ...
              </span>
            ) : (
              'إرسال الطلب'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CompleteRegistrationPage;
