import React, { useState, useEffect, useRef } from 'react';
import { signInWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { getAdminByUid } from '../services/adminService';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { Alert, Spinner } from '../components/ui/feedback';
import { getFriendlyLoginError, LOGIN_ERROR_MESSAGES } from '../utils/authErrors';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [resetSent, setResetSent] = useState(false);

  const navigate = useNavigate();
  const navigateRef = useRef(navigate); // ✅ stable ref — never causes re-runs

  // ✅ FIX 1: Empty dependency array [] — runs exactly once on mount.
  // Root cause of the loop: [navigate] in deps caused this effect to re-run
  // every render → navigate('/admin') → AdminDashboard mounted → auth state
  // changed → AdminLogin re-mounted → infinite loop.
  // Using a ref for navigate means we can safely use [] here.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const adminInfo = await getAdminByUid(user.uid);
          if (adminInfo && adminInfo.role === 'admin' && adminInfo.active !== false) {
            navigateRef.current(`/admin/${adminInfo.branchId}`, { replace: true });
            return; // leave before setting authLoading — we're navigating away
          }
        } catch (err) {
          console.error('Error checking admin status:', err);
        }
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []); // ✅ empty deps

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Spinner size="md" />
          <span className="text-primary text-lg">جاري التحقق...</span>
        </div>
      </div>
    );
  }

  // Send a Firebase password-reset email to the address typed in the form.
  // Resets are account-level, so this works for any admin account.
  const handlePasswordReset = async () => {
    setError('');
    setResetSent(false);
    if (!email) {
      setError('أدخل بريدك الإلكتروني أولاً لإعادة تعيين كلمة المرور.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err) {
      setError('تعذر إرسال رابط إعادة التعيين. تأكد من صحة البريد الإلكتروني.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      let branchId;
      try {
        const adminInfo = await getAdminByUid(user.uid);
        if (!adminInfo || adminInfo.role !== 'admin') {
          await auth.signOut();
          setError('غير مصرح لك بالوصول إلى لوحة الإدارة');
          setLoading(false);
          return;
        }
        if (adminInfo.active === false) {
          await auth.signOut();
          setError('تم تعطيل هذا الحساب. يرجى التواصل مع الإدارة.');
          setLoading(false);
          return;
        }
        branchId = adminInfo.branchId;
      } catch (err) {
        console.error('Error verifying admin status:', err);
        await auth.signOut();
        setError('فشل التحقق من صلاحيات المدير');
        setLoading(false);
        return;
      }

      // ✅ FIX 2: Navigate directly to the admin's branch dashboard.
      // onAuthStateChanged above will also fire and navigate with replace:true,
      // which is safe and idempotent.
      navigate(`/admin/${branchId}`, { replace: true });

    } catch (err) {
      // Log the real Firebase error for debugging; show a friendly message only.
      console.error('[admin-login] sign-in failed:', err?.code, err?.message, err);
      setError(
        await getFriendlyLoginError(err, {
          email,
          notFoundMessage: LOGIN_ERROR_MESSAGES.userNotFoundStaff,
        })
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" dir="rtl">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-primary rounded-full flex items-center justify-center">
            <Lock className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            تسجيل دخول الإدارة
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            قم بتسجيل الدخول للوصول إلى لوحة الإدارة
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && <Alert variant="danger">{error}</Alert>}
          {resetSent && <Alert variant="success">تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.</Alert>}

          <div className="space-y-4">
            <div>
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="أدخل البريد الإلكتروني"
                startIcon={<Mail className="h-5 w-5" />}
              />
            </div>

            <div>
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="أدخل كلمة المرور"
                startIcon={<Lock className="h-5 w-5" />}
                endAdornment={
                  <button
                    type="button"
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                }
              />
            </div>

            <div className="text-start">
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={loading}
                className="text-sm text-primary hover:text-primary-600 hover:underline disabled:opacity-50"
              >
                نسيت كلمة المرور؟
              </button>
            </div>
          </div>

          <Button type="submit" variant="primary" fullWidth disabled={loading}>
            {loading ? (
              <>
                <Spinner size="sm" className="text-white" />
                <span>جاري تسجيل الدخول...</span>
              </>
            ) : (
              'تسجيل الدخول'
            )}
          </Button>

          <div className="text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              disabled={loading}
            >
              العودة إلى الموقع الرئيسي
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;