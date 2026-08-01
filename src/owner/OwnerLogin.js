import React, { useState, useEffect, useRef } from 'react';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, BarChart3 } from 'lucide-react';
import { getOwnerByUid } from '../services/ownerAuthService';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { Alert, Spinner } from '../components/ui/feedback';
import { getFriendlyLoginError, LOGIN_ERROR_MESSAGES } from '../utils/authErrors';

/**
 * Owner sign-in. Mirrors AdminLogin but resolves the cross-branch `owners/{uid}`
 * doc and routes to /owner. Non-owners are signed out with a clear message.
 */
const OwnerLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const navigate = useNavigate();
  const navigateRef = useRef(navigate);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const ownerInfo = await getOwnerByUid(user.uid);
          if (ownerInfo && ownerInfo.role === 'owner') {
            navigateRef.current('/owner', { replace: true });
            return;
          }
        } catch (err) {
          console.error('Error checking owner status:', err);
        }
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const ownerInfo = await getOwnerByUid(user.uid);
      if (!ownerInfo || ownerInfo.role !== 'owner') {
        await auth.signOut();
        setError('غير مصرح لك بالوصول إلى لوحة المالك');
        setLoading(false);
        return;
      }

      navigate('/owner', { replace: true });
    } catch (err) {
      // Log the real Firebase error for debugging; show a friendly message only.
      console.error('[owner-login] sign-in failed:', err?.code, err?.message, err);
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
            <BarChart3 className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">لوحة المالك</h2>
          <p className="mt-2 text-sm text-gray-600">تسجيل الدخول للوصول إلى ذكاء الأعمال عبر جميع الفروع</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && <Alert variant="danger">{error}</Alert>}

          <div className="space-y-4">
            <div>
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email" name="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading}
                placeholder="أدخل البريد الإلكتروني" startIcon={<Mail className="h-5 w-5" />}
              />
            </div>
            <div>
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password" name="password" type={showPassword ? 'text' : 'password'}
                autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading}
                placeholder="أدخل كلمة المرور" startIcon={<Lock className="h-5 w-5" />}
                endAdornment={
                  <button type="button" className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                    onClick={() => setShowPassword(!showPassword)} disabled={loading}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                }
              />
            </div>
          </div>

          <Button type="submit" variant="primary" fullWidth disabled={loading}>
            {loading ? (<><Spinner size="sm" className="text-white" /><span>جاري تسجيل الدخول...</span></>) : 'تسجيل الدخول'}
          </Button>

          <div className="text-center">
            <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/')} disabled={loading}>
              العودة إلى الموقع الرئيسي
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OwnerLogin;
