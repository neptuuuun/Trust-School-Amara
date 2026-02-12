import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import {
  Home,
  Users,
  FileText,
  Menu,
  X,
  ChevronRight,
  LogOut,
  CreditCard,
  BookOpen,
  GraduationCap,
  DollarSign,
  Languages,
  Database,
  BadgeCheck,
  ClipboardList,
  Clock,
} from 'lucide-react';
import useScrollToTop from '../hooks/useScrollToTop';
import { useBranch } from '../contexts/BranchContext';
import Overview from './pages/Overview';
import AnnualFees from './pages/AnnualFees';
// New branch-aware pages (top-level imports for tree-shaking)
import UsersPage from './pages/UsersPage';
import LanguagesPage from './pages/LanguagesPage';
import SupportLessonsHighPage from './pages/SupportLessonsHighPage';
import SupportLessonsMiddlePage from './pages/SupportLessonsMiddlePage';
import SupportRegisteredPage from './pages/SupportRegisteredPage';
import TrainingsPage from './pages/TrainingsPage';
// Registered list pages
import LanguageRegisteredPage from './pages/LanguageRegisteredPage';
import TrainingRegisteredPage from './pages/TrainingRegisteredPage';
// New verification pages
import PaymentsVerification from './pages/PaymentsVerification';
import AddLanguagePage from './pages/AddLanguagePage';
import AddSupportLessonPage from './pages/AddSupportLessonPage';
import AddTrainingPage from './pages/AddTrainingPage';
import TrainingRequestsPage from './pages/TrainingRequestsPage';
import AdminGuide from './pages/AdminGuide';
import UserLifecyclePage from './pages/UserLifecyclePage';
import ClockComponent from '../components/Clock';
import AdminErrorBoundary from './components/AdminErrorBoundary';

// Admin error page for unknown routes
const AdminErrorPage = () => {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4" dir="rtl">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">الصفحة غير موجودة</h2>
        <p className="text-gray-600 mb-6">الصفحة التي تبحث عنها غير موجودة في لوحة الإدارة</p>
        <div className="space-x-4 space-x-reverse">
          <button
            onClick={() => navigate('/admin')}
            className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            العودة للوحة الإدارة
          </button>
          <button
            onClick={() => navigate('/home')}
            className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { branches, selectedBranchId, selectBranch } = useBranch();
  
  // Use scroll to top hook
  useScrollToTop();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navigation = [
    {
      name: 'نظرة عامة',
      href: '/admin',
      icon: Home,
      current: location.pathname === '/admin'
    },
    {
      name: '--- لوحة الفرع ---',
      isSection: true
    },
    {
      name: 'المستخدمون',
      href: '/admin/users',
      icon: Users,
      current: location.pathname === '/admin/users'
    },
    {
      name: 'دورة حياة المستخدمين',
      href: '/admin/user-lifecycle',
      icon: Clock,
      current: location.pathname === '/admin/user-lifecycle'
    },
    {
      name: 'اللغات',
      href: '/admin/languages-branch',
      icon: Languages,
      current: location.pathname === '/admin/languages-branch'
    },
    {
      name: 'اللغات · المسجلون',
      href: '/admin/languages-registered',
      icon: BadgeCheck,
      current: location.pathname === '/admin/languages-registered'
    },
    {
      name: 'دروس الدعم - الثانوي',
      href: '/admin/support-high',
      icon: BookOpen,
      current: location.pathname === '/admin/support-high'
    },
    {
      name: 'دروس الدعم - المتوسط',
      href: '/admin/support-middle',
      icon: BookOpen,
      current: location.pathname === '/admin/support-middle'
    },
    {
      name: 'دروس الدعم المسجلون',
      href: '/admin/support-registered',
      icon: BadgeCheck,
      current: location.pathname === '/admin/support-registered'
    },
    {
      name: 'الدورات التكوينية',
      href: '/admin/trainings-branch',
      icon: GraduationCap,
      current: location.pathname === '/admin/trainings-branch'
    },
    {
      name: 'الدورات · المسجلون',
      href: '/admin/trainings-registered',
      icon: BadgeCheck,
      current: location.pathname === '/admin/trainings-registered'
    },
    {
      name: '--- التحقق والموافقات ---',
      isSection: true
    },
    {
      name: 'التحقق من المدفوعات',
      href: '/admin/payments-verification',
      icon: DollarSign,
      current: location.pathname === '/admin/payments-verification'
    },
    {
      name: 'الرسوم السنوية',
      href: '/admin/annual-fees',
      icon: CreditCard,
      current: location.pathname === '/admin/annual-fees'
    },
    {
      name: '--- طلبات الدورات التكوينية ---',
      isSection: true
    },
    {
      name: 'طلبات الدورات التكوينية',
      href: '/admin/training-requests',
      icon: FileText,
      current: location.pathname === '/admin/training-requests'
    },
    {
      name: '--- الإدارة والتكوين ---',
      isSection: true
    },
    {
      name: 'دليل المسؤول',
      href: '/admin/admin-guide',
      icon: ClipboardList,
      current: location.pathname === '/admin/admin-guide'
    },
  ];

  return (
    <AdminErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex admin-dashboard" dir="rtl">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="absolute inset-0 bg-gray-600 opacity-75"></div>
        </div>
      )}

      {/* Sidebar */}
      <div className={`
        w-64 bg-primary flex-shrink-0 admin-sidebar
        fixed lg:static inset-y-0 right-0 z-50 
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-6 bg-primary-700 flex-shrink-0">
            <h1 className="text-xl font-bold text-white">لوحة الإدارة</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-white hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          {/* Scrollable Navigation */}
          <div className="flex-1 overflow-y-auto">
            <nav className="py-8 px-4">
              <ul className="space-y-2">
                {navigation.map((item, index) => {
                  // Section headers
                  if (item.isSection) {
                    return (
                      <li key={`section-${index}`} className="px-4 py-2 text-xs font-semibold text-primary-200 uppercase tracking-wider mt-4 first:mt-0">
                        {item.name}
                      </li>
                    );
                  }
                  
                  const Icon = item.icon;
                  return (
                    <li key={item.name} className="relative">
                      <Link
                        to={item.href}
                        className={`relative flex items-center px-4 py-3 text-lg rounded-lg transition-colors duration-200 overflow-hidden
                          ${item.current 
                            ? 'text-white' 
                            : 'text-primary-100 hover:bg-primary-600 hover:text-white'
                          }
                        `}
                        onClick={() => setSidebarOpen(false)}
                      >
                        {item.current && (
                          <motion.span
                            layoutId="activeNav"
                            className="absolute inset-0 rounded-lg bg-primary-800"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}
                        <span className="relative flex items-center w-full">
                          <Icon className="ml-3 h-6 w-6" />
                          {item.name}
                          {item.current && <ChevronRight className="mr-auto h-5 w-5" />}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
          
          {/* Logout button - fixed at bottom */}
          <div className="px-4 pb-4 flex-shrink-0">
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-4 py-3 text-lg rounded-lg transition-colors duration-200 text-primary-100 hover:bg-primary-600 hover:text-white"
            >
              <LogOut className="ml-3 h-6 w-6" />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:mr-0 admin-main-content">
        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-6">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <Menu className="h-6 w-6" />
            </button>
            
            <div className="flex items-center space-x-4 space-x-reverse">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">الفرع</span>
                <select
                  className="input min-w-[160px]"
                  value={selectedBranchId || ''}
                  onChange={(e) => selectBranch(e.target.value)}
                >
                  <option value="" disabled>اختر الفرع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <ClockComponent format="24-hour" showDate={true} size="medium" />
              </div>
              <Link 
                to="/home" 
                className="text-primary hover:text-primary-600 font-medium text-lg"
              >
                العودة للموقع
              </Link>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-y-auto admin-page-content">
          <Routes>
            <Route index element={<Overview />} />
            {/* Branch-aware pages */}
            <Route path="users" element={<UsersPage />} />
            <Route path="user-lifecycle" element={<UserLifecyclePage />} />
            <Route path="languages-branch" element={<LanguagesPage />} />
            <Route path="languages-registered" element={<LanguageRegisteredPage />} />
            <Route path="support-high" element={<SupportLessonsHighPage />} />
            <Route path="support-middle" element={<SupportLessonsMiddlePage />} />
            <Route path="support-registered" element={<SupportRegisteredPage />} />
            <Route path="trainings-branch" element={<TrainingsPage />} />
            <Route path="trainings-registered" element={<TrainingRegisteredPage />} />
            
            {/* Verification pages */}
            <Route path="payments-verification" element={<PaymentsVerification />} />
            <Route path="annual-fees" element={<AnnualFees />} />
            
            {/* Add pages */}
            <Route path="add-language" element={<AddLanguagePage />} />
            <Route path="add-support-lesson" element={<AddSupportLessonPage />} />
            <Route path="add-training" element={<AddTrainingPage />} />
            <Route path="training-requests" element={<TrainingRequestsPage />} />
            
            {/* Management pages */}
            <Route path="admin-guide" element={<AdminGuide />} />
            
            {/* 404 handler for unknown admin routes */}
            <Route path="*" element={<AdminErrorPage />} />
          </Routes>
        </main>
      </div>
    </div>
    </AdminErrorBoundary>
  );
};

export default AdminDashboard;