import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { UserPlus, Mail, Lock, Building2, Camera, Upload, Eye, EyeOff } from 'lucide-react';
import { registerUser } from '../services/userService';

const RegisterPage = () => {
  const { user, role, signup, loading } = useAuth();
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
  const [rulesAccepted, setRulesAccepted] = useState(false);

  useEffect(() => {
    if (user && role) {
      if (role === 'admin') navigate('/admin', { replace: true });
      else navigate('/student-dashboard', { replace: true });
    }
  }, [user, role, navigate]);

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
      
      console.log('🔵 Starting registration with:', {
        branchId: currentBranchId,
        branchName: finalBranchName,
        email: email
      });

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

      console.log('✅ Firebase Auth user created:', createdUser.uid);

      const userId = createdUser.uid;

      // Step 2: Upload photos and complete user profile in Firestore
      console.log('🔵 Calling registerUser to upload photos and save to Firestore...');
      
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

      console.log('✅ User registered successfully in Firestore');

      // Step 3: Ensure branch is selected
      selectBranch(currentBranchId);
      
      // Step 4: Clear saved form data
      sessionStorage.removeItem('registerFormData');
      
      console.log('✅ Registration complete, navigating to dashboard...');
      
      // Give Firestore a moment to propagate before navigation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      navigate('/student-dashboard', { replace: true });
      
    } catch (err) {
      console.error('❌ Registration error:', err);
      
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
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الكامل</label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <UserPlus className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="محمد علي"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الازدياد</label>
            <input
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">مكان الازدياد</label>
            <input
              type="text"
              required
              value={birthPlace}
              onChange={(e) => setBirthPlace(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="المدينة / المنطقة"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">العنوان</label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="العنوان الكامل"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
            <input
              type="tel"
              required
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="0XXXXXXXXX"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="example@email.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-3 pr-10 pl-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••"
              />
              <button
                type="button"
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 left-0 pl-3 pr-3 flex items-center text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 text-sm text-primary-800 flex items-center">
            <Building2 className="w-4 h-4 ml-2" />
            <span>
              سيتم تسجيلك في فرع: {branches.find(b => b.id === branchId)?.name || '—'}
            </span>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
            <span className="font-medium">رقم التسجيل:</span> <span className="ltr:ml-2 rtl:mr-2">{registrationNumber}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Camera className="w-4 h-4 inline ml-1" />
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
                  <p className="text-green-600 font-medium">{profilePic.name}</p>
                  <button
                    type="button"
                    onClick={() => setProfilePic(null)}
                    className="text-red-500 text-sm mt-2 hover:underline"
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
                  if (file && file.size <= 5 * 1024 * 1024) {
                    setProfilePic(file);
                  } else {
                    alert('حجم الملف يجب أن يكون أقل من 5 ميجابايت');
                  }
                }}
                className="hidden"
                id="profile-pic-upload"
              />
              <label
                htmlFor="profile-pic-upload"
                className="cursor-pointer inline-block mt-4 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors"
              >
                <Upload className="w-4 h-4 inline ml-2" />
                اختيار صورة
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Upload className="w-4 h-4 inline ml-1" />
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
                  <p className="text-green-600 font-medium">{idCard.name}</p>
                  <button
                    type="button"
                    onClick={() => setIdCard(null)}
                    className="text-red-500 text-sm mt-2 hover:underline"
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
                  if (file && file.size <= 5 * 1024 * 1024) {
                    setIdCard(file);
                  } else {
                    alert('حجم الملف يجب أن يكون أقل من 5 ميجابايت');
                  }
                }}
                className="hidden"
                id="id-card-upload"
              />
              <label
                htmlFor="id-card-upload"
                className="cursor-pointer inline-block mt-4 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors"
              >
                <Upload className="w-4 h-4 inline ml-2" />
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

          <button
            type="submit"
            disabled={submitting || loading || !rulesAccepted}
            className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'جاري المتابعة...' : 'إنشاء الحساب'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-4">
          لديك حساب بالفعل؟{' '}
          <Link to="/login" className="text-primary hover:text-primary-700 font-medium">سجل الدخول</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;