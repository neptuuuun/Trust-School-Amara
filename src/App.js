import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import ContactPage from './pages/ContactPage';
import FormationPage from './pages/FormationPage';
import LanguagesPage from './pages/LanguagesPage';
import SupportLessonsPage from './pages/SupportLessonsPage';
import TrainingsPage from './pages/TrainingsPage';
import CourseRegistrationPage from './pages/CourseRegistrationPage';
import PaymentPage from './pages/PaymentPage';
import RegistrationConfirmationPage from './pages/RegistrationConfirmationPage';
import AdminDashboard from './admin/AdminDashboard';
import AdminLogin from './admin/AdminLogin';
import ProtectedRoute from './admin/ProtectedRoute';
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
      <main className="pt-20">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}


function App() {
  return (
    <Router>
      <div className="App" dir="rtl">
        <ScrollToTop />
        <Routes>
          {/* Admin Routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/*" element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          } />

          {/* Public Routes with shared layout */}
          <Route path="/" element={<PublicLayout />}>
            <Route index element={<HomePage />} />
            <Route path="contact" element={<ContactPage />} />
            <Route path="languages" element={<LanguagesPage />} />
            <Route path="support-lessons" element={<SupportLessonsPage />} />
            <Route path="trainings" element={<TrainingsPage />} />
            <Route path="course-registration" element={<CourseRegistrationPage />} />
            <Route path="payment" element={<PaymentPage />} />
            <Route path="registration-confirmation" element={<RegistrationConfirmationPage />} />
            {/* Legacy routes */}
            <Route path="formation" element={<TrainingsPage />} />
            <Route path="support" element={<SupportLessonsPage />} />
          </Route>
        </Routes>
      </div>
    </Router>
  );
}

export default App;
