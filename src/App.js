import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { BranchProvider, useBranch } from './contexts/BranchContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import ErrorPage from './components/ErrorPage';
import HomePage from './pages/HomePage';
import ContactPage from './pages/ContactPage';
import LanguagesPage from './pages/LanguagesPage';
import SupportLessonsPage from './pages/SupportLessonsPage';
import YearPage from './pages/YearPage';
import TrainingsPage from './pages/TrainingsPage';
import CourseRegistrationPage from './pages/CourseRegistrationPage';
import PaymentPage from './pages/PaymentPage';
import RegistrationConfirmationPage from './pages/RegistrationConfirmationPage';
import BranchSelector from './pages/BranchSelector';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './admin/AdminDashboard';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminLogin from './admin/AdminLogin';
import InternalRulesPage from './pages/InternalRulesPage';
// New student registration forms
import LanguageRegistrationForm from './components/LanguageRegistrationForm';
import SupportLessonRegistrationForm from './components/SupportLessonRegistrationForm';
import TrainingRegistrationForm from './components/TrainingRegistrationForm';
import AnnualFeePage from './pages/AnnualFeePage';
import './App.css';

// Component to handle scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Shared layout for public pages
function PublicLayout() {
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

// Root redirect component
function RootRedirect() {
  const branchId = localStorage.getItem('branchId');
  
  if (!branchId) {
    return <Navigate to="/select-branch" replace />;
  }
  
  return <Navigate to="/home" replace />;
}

// Branch selection guard
function BranchGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedBranchId } = useBranch();
  const { user, branch } = useAuth();
  
  useEffect(() => {
    const branchId = localStorage.getItem('branchId');
    const isSelectingBranch = location.pathname === '/select-branch' || location.pathname === '/branch-selector';
    const isAdminRoute = location.pathname.startsWith('/admin');
    const isLoginRoute = location.pathname === '/login';
    const isProfileRoute = location.pathname === '/profile';
    
    // Don't require branch for admin routes, login, or profile (profile has its own auth guard)
    if (!branchId && !isSelectingBranch && !isAdminRoute && !isLoginRoute && !isProfileRoute) {
      navigate('/select-branch', { replace: true, state: { from: location } });
    }

    // If a user is logged in but their profile branch doesn't match selected branch, force login
    if (user && selectedBranchId && branch && branch !== selectedBranchId) {
      navigate('/login', { replace: true });
    }
  }, [navigate, location]);
  
  return <Outlet />;
}

// Admin route guard - only allows authenticated admin users
function RequireAdmin() {
  const { user, role, loading, branch } = useAuth();
  const { selectedBranchId } = useBranch();
  const location = useLocation();

  // Debug log
  console.log('RequireAdmin Check:', { user: !!user, role, loading, path: location.pathname });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2 space-x-reverse">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-primary text-lg">جاري التحميل...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Enforce branch match: user must belong to selected branch
  if (branch && selectedBranchId && branch !== selectedBranchId) {
    return <Navigate to="/login" replace />;
  }

  if (role !== 'admin') {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}

// Student route guard - only allows authenticated student users
function RequireStudent() {
  const { user, role, verificationStatus, profileDoc, profileDocPath, loading, branch, authEmailVerified, emailVerificationSyncing, resendVerificationEmail } = useAuth();
  const { selectedBranchId } = useBranch();
  const location = useLocation();

  // Debug log - THIS WILL HELP YOU SEE WHAT'S HAPPENING
  console.log('RequireStudent Check:', { 
    user: !!user, 
    role, 
    loading, 
    path: location.pathname 
  });

  console.log('[RequireStudent] Canonical user doc (from AuthContext listener):', {
    path: profileDocPath,
    verificationStatus: profileDoc?.verificationStatus,
    status: profileDoc?.status,
    doc: profileDoc,
  });

  // CRITICAL: Wait for loading to complete
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2 space-x-reverse">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-primary text-lg">جاري التحميل...</span>
        </div>
      </div>
    );
  }

  // No user logged in
  if (!user) {
    console.log('No user, redirecting to login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Wait until AuthContext finishes determining the role
  if (!loading && role == null) {
    console.log('Role not loaded yet, staying on page temporarily');
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2 space-x-reverse">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-primary text-lg">جاري تحميل الملف الشخصي...</span>
        </div>
      </div>
    );
  }

  // Enforce branch match: user must belong to selected branch
  if (branch && selectedBranchId && branch !== selectedBranchId) {
    return <Navigate to="/login" replace />;
  }

  if (role !== 'student') {
    console.log('Role is not student:', role);
    if (role === 'admin') return <Navigate to="/admin" replace />;
    return <Navigate to="/home" replace />;
  }

  // Block if not verified yet (email verification gate stays as-is)
  if (authEmailVerified === false) {
    const handleResend = async () => {
      try {
        await resendVerificationEmail();
        alert('تم إعادة إرسال رسالة تأكيد البريد الإلكتروني. يرجى التحقق من البريد الوارد أو مجلد الرسائل غير المرغوب فيها.');
      } catch (e) {
        alert(e?.message || 'Failed to resend.');
      }
    };

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center mx-4 max-w-xl">
          <p className="text-gray-800 font-semibold mb-3">يرجى تأكيد البريد الإلكتروني للمتابعة.</p>
          <p className="text-gray-700 text-sm leading-6">
            في حال لم تجد رسالة التأكيد، يرجى التحقق من مجلد الرسائل غير المرغوب فيها (Spam / Junk) ووضع الرسالة ضمن "ليست رسائل غير مرغوب فيها".
          </p>
          <button
            onClick={handleResend}
            className="mt-3 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            إعادة إرسال رسالة تأكيد البريد الإلكتروني
          </button>
        </div>
      </div>
    );
  }

  const normalizedVerificationStatus = String(verificationStatus || '').toLowerCase();

  // Show pending only when the DB explicitly says pending.
  if (normalizedVerificationStatus === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center mx-4 max-w-xl">
          <p className="text-gray-800 font-semibold mb-2">تم تأكيد البريد الإلكتروني بنجاح.</p>
          <p className="text-gray-800 font-semibold">حسابك قيد المراجعة من طرف الإدارة.</p>
        </div>
      </div>
    );
  }

  if (emailVerificationSyncing === true) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center mx-4 max-w-xl">
          <p className="text-gray-800 font-semibold mb-2">جاري تحديث حالة الحساب...</p>
          <p className="text-gray-600">يرجى الانتظار لحظات.</p>
        </div>
      </div>
    );
  }

  console.log('User is authenticated student, showing profile');
  return <Outlet />;
}

function App() {
  return (
    <BranchProvider>
      <AuthProvider>
        <Router>
          <div className="App" dir="rtl">
            <ScrollToTop />
            <Routes>
              {/* Root route */}
              <Route path="/" element={<RootRedirect />} />
              
              {/* Branch selection */}
              <Route path="/select-branch" element={<BranchSelector />} />
              <Route path="/branch-selector" element={<Navigate to="/select-branch" replace />} />

              {/* Simple branch alias routes to quickly select a branch and redirect
                  Branch A → boumerdes, Branch B → bordj_menaiel */}
              <Route path="/branchA" element={<BranchAlias branchId="boumerdes" />} />
              <Route path="/branchB" element={<BranchAlias branchId="bordj_menaiel" />} />

              {/* Routes guarded by branch selection */}
              <Route element={<BranchGuard />}>
                {/* Student Auth Routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/internal-rules" element={<InternalRulesPage />} />
                <Route path="/register" element={<RegisterPage />} />

                {/* Admin Login Route - Public access */}
                <Route path="/admin/login" element={<AdminLogin />} />

                {/* Admin Routes - Protected by RequireAdmin guard */}
                <Route element={<RequireAdmin />}>
                  <Route path="/admin/*" element={<AdminDashboard />} />
                </Route>

                {/* Student Dashboard - Protected by RequireStudent guard */}
                <Route element={<RequireStudent />}>
                  <Route path="/profile" element={<StudentDashboard />} />
                  <Route path="/student-dashboard" element={<Navigate to="/profile" replace />} />
                  <Route element={<PublicLayout />}>
                    <Route path="course-registration" element={<CourseRegistrationPage />} />
                    <Route path="payment" element={<PaymentPage />} />
                    <Route path="registration-confirmation" element={<RegistrationConfirmationPage />} />
                    <Route path="language-registration" element={<LanguageRegistrationForm />} />
                    <Route path="support-lesson-registration" element={<SupportLessonRegistrationForm />} />
                    <Route path="annual-fee" element={<AnnualFeePage />} />
                    <Route path="training-registration" element={<TrainingRegistrationForm />} />
                  </Route>
                </Route>

                {/* Public Routes with shared layout */}
                <Route element={<PublicLayout />}>
                  <Route path="/home" element={<HomePage />} />
                  <Route path="contact" element={<ContactPage />} />
                  <Route path="languages" element={<LanguagesPage />} />
                  <Route path="support-lessons" element={<SupportLessonsPage />} />
                  <Route path="support-lessons/:level/:year" element={<YearPage />} />
                  <Route path="trainings" element={<TrainingsPage />} />
                  <Route path="formation" element={<TrainingsPage />} />
                  <Route path="support" element={<SupportLessonsPage />} />
                </Route>
              </Route>
              
              {/* Fallback 404 */}
              <Route path="*" element={<ErrorPage />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </BranchProvider>
  );
}

// Helper component to set a branch by path and redirect to home
function BranchAlias({ branchId }) {
  const { selectBranch } = useBranch();
  const navigate = useNavigate();
  useEffect(() => {
    if (branchId) {
      // Selecting a branch through this alias will also sign the user out (handled in BranchContext)
      // so that each branch has an isolated session.
      selectBranch(branchId);
      navigate('/home', { replace: true });
    }
  }, [branchId]);
  return null;
}

export default App;