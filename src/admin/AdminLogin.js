import React, { useState, useEffect, useRef } from 'react';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { getAdminByUid } from '../services/adminService';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { Alert, Spinner } from '../components/ui/feedback';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

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
          if (adminInfo && adminInfo.role === 'admin') {
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
        branchId = adminInfo.branchId;
        console.log('Admin login successful for branch:', branchId);
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
      console.error('Login error:', err);

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
          setError('تم تجاوز عدد المحاولات المسموح. حاول مرة أخرى لاحقاً');
          break;
        case 'auth/invalid-credential':
          setError('بيانات الدخول غير صحيحة');
          break;
        default:
          setError('حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى');
      }
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