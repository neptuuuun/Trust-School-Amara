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
import CompleteRegistrationPage from './pages/CompleteRegistrationPage';
// New student registration forms
import LanguageRegistrationForm from './components/LanguageRegistrationForm';
import SupportLessonRegistrationForm from './components/SupportLessonRegistrationForm';
import TrainingRegistrationForm from './components/TrainingRegistrationForm';
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
      <a href="#main-content" className="skip-to-content">انتقل إلى المحتوى الرئيسي</a>
      <Header />
      <main id="main-content">
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
  const location = useLocation();
  const { selectedBranchId } = useBranch();
  const { user, branch, role } = useAuth();

  const isSelectingBranch = location.pathname === '/select-branch' || location.pathname === '/branch-selector';
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isLoginRoute = location.pathname === '/login';
  const isProfileRoute = location.pathname === '/profile';

  // Require a branch for non-exempt routes.
  // Read from selectedBranchId (context) — kept in sync with localStorage by
  // selectBranch() and setBranchFromAuth(), so no direct localStorage reads needed.
  if (!selectedBranchId && !isSelectingBranch && !isAdminRoute && !isLoginRoute && !isProfileRoute) {
    return <Navigate to="/select-branch" replace state={{ from: location }} />;
  }

  // Branch mismatch for non-admin users only.
  if (user && role !== 'admin' && selectedBranchId && branch && branch !== selectedBranchId) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}



// Reusable loading/blocked screen shown by route guards
function LoadingScreen({ message = 'جاري التحميل...' }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center space-x-2 space-x-reverse">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="text-primary text-lg">{message}</span>
      </div>
    </div>
  );
}

function BlockedScreen({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center mx-4 max-w-xl">
        {children}
      </div>
    </div>
  );
}

// Admin route guard - only allows authenticated admin users
function RequireAdmin() {
  const { user, role, loading, branch } = useAuth();
  const { selectedBranchId } = useBranch();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (!user) {
    // Redirect to the admin login page, NOT the student login page
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  // Enforce branch match: user must belong to selected branch
  if (branch && selectedBranchId && branch !== selectedBranchId) {
    return <Navigate to="/admin/login" replace />;
  }

  if (role !== 'admin') {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}

// Email verification screen with inline feedback (no alert())
function EmailVerificationScreen({ resendVerificationEmail }) {
  const [resendStatus, setResendStatus] = React.useState('');

  const handleResend = async () => {
    setResendStatus('sending');
    try {
      await resendVerificationEmail();
      setResendStatus('success');
    } catch {
      setResendStatus('error');
    }
  };

  return (
    <BlockedScreen>
      <p className="text-gray-800 font-semibold mb-3">يرجى تأكيد البريد الإلكتروني للمتابعة.</p>
      <p className="text-gray-700 text-sm leading-6 mb-3">
        في حال لم تجد رسالة التأكيد، يرجى التحقق من مجلد الرسائل غير المرغوب فيها (Spam / Junk).
      </p>
      {resendStatus === 'success' && (
        <p className="text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm mb-3">
          تم إرسال رابط التأكيد. تحقق من بريدك الإلكتروني.
        </p>
      )}
      {resendStatus === 'error' && (
        <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm mb-3">
          تعذر الإرسال. حاول مرة أخرى.
        </p>
      )}
      <button
        onClick={handleResend}
        disabled={resendStatus === 'sending' || resendStatus === 'success'}
        className="mt-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
      >
        {resendStatus === 'sending' ? 'جاري الإرسال...' : 'إعادة إرسال رسالة التأكيد'}
      </button>
    </BlockedScreen>
  );
}

// Student route guard - only allows authenticated student users
function RequireStudent() {
  const { user, role, verificationStatus, loading, branch, authEmailVerified, emailVerificationSyncing, resendVerificationEmail, completedProfile } = useAuth();
  const { selectedBranchId } = useBranch();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Wait until AuthContext finishes determining the role
  if (!loading && role == null) {
    return <LoadingScreen message="جاري تحميل الملف الشخصي..." />;
  }

  // Enforce branch match: user must belong to selected branch
  if (branch && selectedBranchId && branch !== selectedBranchId) {
    return <Navigate to="/login" replace />;
  }

  if (role !== 'student') {
    if (role === 'admin') return <Navigate to={branch ? `/admin/${branch}` : '/admin/login'} replace />;
    return <Navigate to="/home" replace />;
  }

  // Google users who signed up but haven't completed the registration form yet
  // must fill in their mandatory school data before accessing any student page.
  if (completedProfile === false) {
    return <Navigate to="/complete-registration" replace />;
  }

  if (authEmailVerified === false) {
    return <EmailVerificationScreen resendVerificationEmail={resendVerificationEmail} />;
  }

  // Admin approval is NOT required for dashboard access.
  // verificationStatus ('pending', 'verified', 'rejected') only affects
  // enrollment / document status displayed inside the dashboard.
  // A student who verified their email has immediate dashboard access.

  if (emailVerificationSyncing === true) {
    return (
      <BlockedScreen>
        <p className="text-gray-800 font-semibold mb-2">جاري تحديث حالة الحساب...</p>
        <p className="text-gray-600">يرجى الانتظار لحظات.</p>
      </BlockedScreen>
    );
  }

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
                {/* Google registration completion — requires auth but NOT completedProfile */}
                <Route path="/complete-registration" element={<CompleteRegistrationPage />} />

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
  const { selectBranch } = useBranch();  // selectBranch now exported from BranchContext
  const navigate = useNavigate();
  useEffect(() => {
    if (branchId) {
      selectBranch(branchId);
      navigate('/home', { replace: true });
    }
  }, [branchId, selectBranch, navigate]);
  return null;
}

export default App;