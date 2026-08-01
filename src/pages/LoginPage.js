import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { Mail, Lock, LogIn, Eye, EyeOff } from 'lucide-react';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { Alert } from '../components/ui/feedback';
import { getFriendlyLoginError } from '../utils/authErrors';

const LoginPage = () => {
  const { user, role, login, loginWithGoogle, loading: authLoading, completedProfile } = useAuth();
  const { selectedBranchId } = useBranch();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState('');

  // Redirect once auth + branch are both resolved.
  useEffect(() => {
    if (!user || !role || !selectedBranchId) return;

    if (role === 'admin') {
      navigate(`/admin/${selectedBranchId}`, { replace: true });
    } else if (completedProfile === false) {
      // Google user who registered but hasn't filled in mandatory fields yet
      navigate('/complete-registration', { replace: true });
    } else {
      navigate('/profile', { replace: true });
    }
  }, [user, role, selectedBranchId, completedProfile, navigate]);

  // ── Email / password sign-in ──────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      // Redirect is handled by the useEffect above once context updates
    } catch (err) {
      // Log the real Firebase error for debugging; only a friendly message
      // (never a raw `auth/...` code) is shown to the user.
      console.error('[login] sign-in failed:', err?.code, err?.message, err);
      setError(await getFriendlyLoginError(err, { email }));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Google sign-in ────────────────────────────────────────────────────────

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      // Redirect handled by the useEffect above once context updates
    } catch (err) {
      switch (err.code) {
        case 'google/popup-closed':
          // User voluntarily closed the popup — no error message needed
          break;

        case 'google/no-account':
          // Google account exists but no Firestore profile found in any branch.
          // The student must complete the full registration form first.
          setError('لا يوجد حساب مرتبط بهذا البريد الإلكتروني. يرجى إنشاء حساب جديد أولاً.');
          break;

        case 'google/account-exists':
          setError(
            'هذا البريد الإلكتروني مرتبط بحساب آخر. يرجى تسجيل الدخول بكلمة المرور.'
          );
          break;

        default:
          setError('حدث خطأ أثناء تسجيل الدخول بـ Google. حاول مرة أخرى.');
          console.error('Google sign-in error:', err);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── Password reset ────────────────────────────────────────────────────────

  const handlePasswordReset = async () => {
    if (!resetEmail) return;
    setResetError('');
    setResetSuccess(false);
    try {
      setResetLoading(true);
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSuccess(true);
    } catch (err) {
      setResetError('تعذر إرسال الرابط. تأكد من صحة البريد الإلكتروني وحاول مرة أخرى.');
    } finally {
      setResetLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center py-12 px-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto h-16 w-16 bg-primary rounded-full flex items-center justify-center">
            <LogIn className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">تسجيل الدخول</h1>
          <p className="text-gray-600 mt-1">ادخل بريدك الإلكتروني وكلمة المرور</p>
        </div>

        {/* Error banner */}
        {error && (
          <Alert variant="danger" className="mb-4">
            {error}
            {error.includes('إنشاء حساب جديد') && (
              <>
                {' '}
                <Link to="/register" className="font-medium underline hover:opacity-80">
                  سجل الآن
                </Link>
              </>
            )}
          </Alert>
        )}

        {/* Email/password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="login-email">البريد الإلكتروني</Label>
            <Input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              startIcon={<Mail className="h-5 w-5" />}
            />
          </div>

          <div>
            <Label htmlFor="login-password">كلمة المرور</Label>
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              startIcon={<Lock className="h-5 w-5" />}
              endAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              }
            />
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="mt-2 text-xs text-primary hover:text-primary-700 hover:underline focus:outline-none"
            >
              نسيت كلمة المرور؟
            </button>
          </div>

          <Button type="submit" fullWidth disabled={submitting || authLoading || googleLoading}>
            {submitting ? 'جاري الدخول...' : 'دخول'}
          </Button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-5">
          <div className="flex-1 border-t border-gray-200" />
          <span className="mx-3 text-sm text-gray-400">أو</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Google sign-in */}
        <GoogleSignInButton
          onClick={handleGoogleSignIn}
          loading={googleLoading}
          disabled={submitting || authLoading}
        />

        {/* Register link */}
        <p className="text-center text-sm text-gray-600 mt-4">
          ليس لديك حساب؟{' '}
          <Link to="/register" className="text-primary hover:text-primary-700 font-medium">سجل الآن</Link>
        </p>
      </div>

      {/* Password reset modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm" dir="rtl">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">إعادة تعيين كلمة المرور</h2>
            <p className="text-sm text-gray-600 mb-4">
              أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور.
            </p>

            {resetSuccess ? (
              <Alert variant="success" className="mb-4">
                تم إرسال رابط إعادة التعيين. تحقق من بريدك الوارد أو مجلد البريد غير المرغوب فيه.
              </Alert>
            ) : (
              <>
                {resetError && (
                  <Alert variant="danger" className="mb-3">{resetError}</Alert>
                )}
                <div className="mb-4">
                  <Label htmlFor="reset-email">البريد الإلكتروني</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="example@email.com"
                    startIcon={<Mail className="h-5 w-5" />}
                  />
                </div>
                <Button
                  type="button"
                  fullWidth
                  onClick={handlePasswordReset}
                  disabled={resetLoading || !resetEmail}
                  className="mb-2"
                >
                  {resetLoading ? 'جاري الإرسال...' : 'إرسال رابط إعادة التعيين'}
                </Button>
              </>
            )}

            <Button
              type="button"
              variant="neutral"
              fullWidth
              onClick={() => {
                if (!resetLoading) {
                  setShowResetModal(false);
                  setResetEmail('');
                  setResetSuccess(false);
                  setResetError('');
                }
              }}
            >
              {resetSuccess ? 'إغلاق' : 'إلغاء'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
