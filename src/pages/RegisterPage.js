import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { UserPlus, Mail, Lock, Building2, Camera, Upload, Eye, EyeOff } from 'lucide-react';
import { registerUser } from '../services/userService';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { Button, buttonClasses } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { Alert } from '../components/ui/feedback';

const RegisterPage = () => {
  const { user, role, signup, registerWithGoogle, loading, completedProfile } = useAuth();
  const { branches, selectBranch, selectedBranchId, selectedBranch } = useBranch();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [profilePic, setProfilePic] = useState(null);
  const [idCard, setIdCard] = useState(null);
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);

  useEffect(() => {
    if (user && role) {
      if (role === 'admin') navigate('/admin', { replace: true });
      // Don't redirect incomplete Google users — let handleGoogleSignUp do it explicitly
      else if (completedProfile !== false) navigate('/student-dashboard', { replace: true });
    }
  }, [user, role, completedProfile, navigate]);

  // Preload branchId from BranchContext/localStorage
  useEffect(() => {
    const savedId = selectedBranchId || localStorage.getItem('branchId');
    if (savedId) {
      setBranchId(savedId);
    } else {
      navigate('/branch-selector', { replace: true });
    }
  }, [selectedBranchId, navigate]);

  // Restore form data from sessionStorage
  useEffect(() => {
    try {
      const savedData = sessionStorage.getItem('registerFormData');
      if (savedData) {
        const formData = JSON.parse(savedData);
        setFullName(formData.fullName || '');
        setEmail(formData.email || '');
        setPassword(formData.password || '');
        setBirthDate(formData.birthDate || '');
        setBirthPlace(formData.birthPlace || '');
        setAddress(formData.address || '');
        setPhoneNumber(formData.phoneNumber || '');
        setRulesAccepted(formData.rulesAccepted || false);
      }
    } catch (error) {
      console.error('Failed to restore form data:', error);
    }
  }, []);

  // Save form data to sessionStorage
  useEffect(() => {
    const formData = {
      fullName,
      email,
      password,
      birthDate,
      birthPlace,
      address,
      phoneNumber,
      rulesAccepted,
    };

    if (fullName || email || password || birthDate || birthPlace || address || phoneNumber) {
      sessionStorage.setItem('registerFormData', JSON.stringify(formData));
    }
  }, [fullName, email, password, birthDate, birthPlace, address, phoneNumber, rulesAccepted]);

  // Generate registration number
  const registrationNumber = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const prefix = (branchId || 'BR').slice(0, 4).toUpperCase();
    return `${prefix}-${y}${m}-${rand}`;
  }, [branchId]);

  // ── Google sign-up ────────────────────────────────────────────────────────

  const handleGoogleSignUp = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const result = await registerWithGoogle();
      // New or incomplete-profile user must complete the registration form
      if (result.isNewUser || result.completedProfile === false) {
        navigate('/complete-registration', { replace: true });
        return;
      }
      // Existing complete user — useEffect handles redirect
    } catch (err) {
      switch (err.code) {
        case 'google/popup-closed':
          break;
        case 'google/needs-branch':
          navigate('/branch-selector', {
            replace: false,
            state: { message: 'يرجى اختيار الفرع أولاً ثم المتابعة بحساب Google.' },
          });
          break;
        case 'google/account-exists':
          setError('هذا البريد الإلكتروني مرتبط بحساب آخر. يرجى تسجيل الدخول بكلمة المرور.');
          break;
        default:
          setError('حدث خطأ أثناء إنشاء الحساب بـ Google. حاول مرة أخرى.');
          console.error('Google sign-up error:', err);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── Email / password sign-up ──────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!rulesAccepted) {
      setError('يرجى قراءة وقبول القواعد الداخلية للمدرسة قبل المتابعة');
      return;
    }

    // CRITICAL: Ensure we have a valid branchId
    const currentBranchId = selectedBranchId || branchId;
    if (!currentBranchId) {
      setError('الرجاء اختيار الفرع');
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

    setSubmitting(true);
    
    try {
      // Get branch info
      const branch = branches.find(b => b.id === currentBranchId) || selectedBranch;
      
      // Determine branchName
      const finalBranchName = branch?.name || 
        (currentBranchId === 'boumerdes' ? 'بومرداس' : 
         currentBranchId === 'bordj_menaiel' ? 'برج منايل' : currentBranchId);
      
      // Step 1: Create Firebase Auth user with COMPLETE data
      const createdUser = await signup(email, password, {
        fullName,
        name: fullName,
        branchId: currentBranchId,
        branchName: finalBranchName,
        internalRulesAccepted: true,
        registrationNumber,
        birthDate,
        birthPlace,
        address,
        phoneNumber,
      });

      const userId = createdUser.uid;

      // Step 2: Upload photos and complete user profile in Firestore
      await registerUser(
        {
          fullName,
          email,
          birthDate,
          birthPlace,
          address,
          phoneNumber,
          branchId: currentBranchId,
          branchName: finalBranchName,
          registrationNumber,
        },
        userId,
        profilePic,
        idCard
      );

      // Step 3: Ensure branch is selected
      selectBranch(currentBranchId);

      // Step 4: Clear saved form data
      sessionStorage.removeItem('registerFormData');
      
      // Give Firestore a moment to propagate before navigation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      navigate('/student-dashboard', { replace: true });
      
    } catch (err) {
      console.error('Registration error:', err);
      
      // Handle permission errors
      if (err.code === 'permission-denied' || 
          err.message?.toLowerCase().includes('permission')) {
        setError('فشل التسجيل بسبب مشكلة في الصلاحيات. يرجى المحاولة مرة أخرى أو الاتصال بالإدارة.');
        return;
      }

      // Handle Firebase Auth errors
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('هذا البريد مستخدم بالفعل');
          break;
        case 'auth/invalid-email':
          setError('البريد الإلكتروني غير صالح');
          break;
        case 'auth/weak-password':
          setError('كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل');
          break;
        default:
          setError(err.message || 'حدث خطأ أثناء إنشاء الحساب');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center py-12 px-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <div className="text-center mb-6">
          <div className="mx-auto h-16 w-16 bg-primary rounded-full flex items-center justify-center">
            <UserPlus className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">إنشاء حساب طالب</h1>
          <p className="text-gray-600 mt-1">قم بملء البيانات للبدء</p>
        </div>

        {error && (
          <Alert variant="danger" className="mb-4">{error}</Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="reg-fullname">الاسم الكامل</Label>
            <Input
              id="reg-fullname"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="محمد علي"
              startIcon={<UserPlus className="h-5 w-5" />}
            />
          </div>

          <div>
            <Label htmlFor="reg-birthdate">تاريخ الازدياد</Label>
            <Input
              id="reg-birthdate"
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="reg-birthplace">مكان الازدياد</Label>
            <Input
              id="reg-birthplace"
              type="text"
              required
              value={birthPlace}
              onChange={(e) => setBirthPlace(e.target.value)}
              placeholder="المدينة / المنطقة"
            />
          </div>

          <div>
            <Label htmlFor="reg-address">العنوان</Label>
            <Input
              id="reg-address"
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="العنوان الكامل"
            />
          </div>

          <div>
            <Label htmlFor="reg-phone">رقم الهاتف</Label>
            <Input
              id="reg-phone"
              type="tel"
              required
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="0XXXXXXXXX"
            />
          </div>

          <div>
            <Label htmlFor="reg-email">البريد الإلكتروني</Label>
            <Input
              id="reg-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              startIcon={<Mail className="h-5 w-5" />}
            />
          </div>

          <div>
            <Label htmlFor="reg-password">كلمة المرور</Label>
            <Input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              startIcon={<Lock className="h-5 w-5" />}
              endAdornment={
                <button
                  type="button"
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="flex items-center text-gray-500 hover:text-gray-700 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              }
            />
          </div>

          <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 text-sm text-primary-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span>
              سيتم تسجيلك في فرع: {branches.find(b => b.id === branchId)?.name || '—'}
            </span>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
            <span className="font-medium">رقم التسجيل:</span> <span className="ms-2">{registrationNumber}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Camera className="w-4 h-4 inline me-1" />
              الصورة الشخصية *
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-primary transition-colors">
              {profilePic ? (
                <div>
                  <img
                    src={URL.createObjectURL(profilePic)}
                    alt="Profile"
                    className="max-w-full h-32 object-cover mx-auto mb-4 rounded"
                  />
                  <p className="text-success-600 font-medium">{profilePic.name}</p>
                  <button
                    type="button"
                    onClick={() => setProfilePic(null)}
                    className="text-danger hover:text-danger-700 text-sm mt-2 hover:underline"
                  >
                    إزالة الصورة
                  </button>
                </div>
              ) : (
                <div>
                  <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">اضغط لرفع الصورة الشخصية</p>
                  <p className="text-sm text-gray-500">JPG, PNG أقل من 5MB</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) {
                    setError('حجم الصورة الشخصية يجب أن يكون أقل من 5 ميجابايت');
                    e.target.value = '';
                    return;
                  }
                  setProfilePic(file);
                }}
                className="hidden"
                id="profile-pic-upload"
              />
              <label
                htmlFor="profile-pic-upload"
                className={buttonClasses({ size: 'sm', className: 'mt-4 cursor-pointer' })}
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                اختيار صورة
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Upload className="w-4 h-4 inline me-1" />
              صورة بطاقة الهوية *
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-primary transition-colors">
              {idCard ? (
                <div>
                  <img
                    src={URL.createObjectURL(idCard)}
                    alt="ID Card"
                    className="max-w-full h-32 object-cover mx-auto mb-4 rounded"
                  />
                  <p className="text-success-600 font-medium">{idCard.name}</p>
                  <button
                    type="button"
                    onClick={() => setIdCard(null)}
                    className="text-danger hover:text-danger-700 text-sm mt-2 hover:underline"
                  >
                    إزالة الصورة
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">اضغط لرفع صورة بطاقة الهوية</p>
                  <p className="text-sm text-gray-500">JPG, PNG أقل من 5MB</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) {
                    setError('حجم صورة البطاقة يجب أن يكون أقل من 5 ميجابايت');
                    e.target.value = '';
                    return;
                  }
                  setIdCard(file);
                }}
                className="hidden"
                id="id-card-upload"
              />
              <label
                htmlFor="id-card-upload"
                className={buttonClasses({ size: 'sm', className: 'mt-4 cursor-pointer' })}
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                اختيار صورة
              </label>
            </div>
          </div>

          <div className="flex items-start gap-2 mt-4">
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

          <Button type="submit" fullWidth disabled={submitting || loading || googleLoading || !rulesAccepted}>
            {submitting ? 'جاري المتابعة...' : 'إنشاء الحساب'}
          </Button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-5">
          <div className="flex-1 border-t border-gray-200" />
          <span className="mx-3 text-sm text-gray-400">أو</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Google sign-up */}
        <div className="mb-1">
          <p className="text-center text-xs text-gray-500 mb-3">
            التسجيل بـ Google يُنشئ حساباً مبدئياً — ستُكمل بياناتك في الخطوة التالية.
          </p>
          <GoogleSignInButton
            onClick={handleGoogleSignUp}
            loading={googleLoading}
            disabled={submitting || loading}
            label="التسجيل بحساب Google"
          />
        </div>

        <p className="text-center text-sm text-gray-600 mt-4">
          لديك حساب بالفعل؟{' '}
          <Link to="/login" className="text-primary hover:text-primary-700 font-medium">سجل الدخول</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;