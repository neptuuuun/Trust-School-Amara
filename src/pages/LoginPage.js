import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react';

const LoginPage = () => {
  const { user, role, login, loading: authLoading } = useAuth();
  const { selectedBranchId } = useBranch();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && role) {
      // Admins: go to /admin and show welcome message
      if (role === 'admin') {
        navigate('/admin', { replace: true });
        // Friendly message after redirect
        setTimeout(() => {
          try {
            alert('مرحبًا بك في لوحة تحكم الإدارة 🎓');
          } catch (_) {}
        }, 0);
        return;
      }

      // Non-admins: redirect to profile page if branch set, else choose branch
      if (selectedBranchId) {
        navigate('/profile', { replace: true });
      } else {
        navigate('/select-branch', { replace: true });
      }
    }
  }, [user, role, selectedBranchId, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      // Redirect will be handled by effect above
    } catch (err) {
      console.error(err);
      if (typeof err.message === 'string' && err.message.includes('غير مسجل في هذا الفرع')) {
        setError(err.message);
      } else {
        switch (err.code) {
          case 'auth/user-not-found':
            setError('المستخدم غير موجود');
            break;
          case 'auth/wrong-password':
            setError('كلمة المرور غير صحيحة');
            break;
          case 'auth/invalid-email':
            setError('البريد الإلكتروني غير صالح');
            break;
          case 'auth/too-many-requests':
            setError('عدد محاولات كبير. حاول لاحقاً');
            break;
          default:
            setError('حدث خطأ أثناء تسجيل الدخول');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail) return;

    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, resetEmail);
      alert('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني');
      setShowResetModal(false);
      setResetEmail('');
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center py-12 px-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <div className="text-center mb-6">
          <div className="mx-auto h-16 w-16 bg-primary rounded-full flex items-center justify-center">
            <LogIn className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">تسجيل الدخول</h1>
          <p className="text-gray-600 mt-1">ادخل بريدك الإلكتروني وكلمة المرور</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
                className="w-full px-3 py-3 pr-10 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 left-0 pl-3 flex items-center"
              >
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 hover:underline focus:outline-none"
            >
              نسيت كلمة المرور؟
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting || authLoading}
            className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            {submitting ? 'جاري الدخول...' : 'دخول'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-4">
          ليس لديك حساب؟{' '}
          <Link to="/register" className="text-primary hover:text-primary-700 font-medium">سجل الآن</Link>
        </p>

        {showResetModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm" dir="rtl">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">إعادة تعيين كلمة المرور</h2>
              <p className="text-sm text-gray-600 mb-4">
                أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="example@email.com"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={loading || !resetEmail}
                  className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 text-sm"
                >
                  {loading ? 'جاري الإرسال...' : 'Send Reset Link'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!loading) {
                      setShowResetModal(false);
                      setResetEmail('');
                    }
                  }}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;