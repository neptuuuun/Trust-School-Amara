import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
  BadgeCheck,
  ClipboardList,
  Megaphone,
  ChevronDown,
} from 'lucide-react';
import useScrollToTop from '../hooks/useScrollToTop';
import { useBranch } from '../contexts/BranchContext';
import { ToastProvider } from './components/ToastNotifications';
import Overview from './pages/Overview';
import AnnualFees from './pages/AnnualFees';
import UsersPage from './pages/UsersPage';
import LanguagesPage from './pages/LanguagesPage';
import SupportLessonsHighPage from './pages/SupportLessonsHighPage';
import SupportLessonsMiddlePage from './pages/SupportLessonsMiddlePage';
import SupportRegisteredPage from './pages/SupportRegisteredPage';
import TrainingsPage from './pages/TrainingsPage';
import LanguageRegisteredPage from './pages/LanguageRegisteredPage';
import TrainingRegisteredPage from './pages/TrainingRegisteredPage';
import PaymentsVerification from './pages/PaymentsVerification';
import TrainingRequestsPage from './pages/TrainingRequestsPage';
import AdminGuide from './pages/AdminGuide';
import AnnouncementsPage from './pages/AnnouncementsPage';
import ClockComponent from '../components/Clock';
import AdminErrorBoundary from './components/AdminErrorBoundary';
import { Button } from '../components/ui/button';

// ─── 404 page ─────────────────────────────────────────────────────────────────

const AdminErrorPage = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4" dir="rtl">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">الصفحة غير موجودة</h2>
        <p className="text-gray-600 mb-6">الصفحة التي تبحث عنها غير موجودة في لوحة الإدارة</p>
        <div className="flex gap-3 justify-center">
          <Button variant="primary" onClick={() => navigate('/admin')}>
            العودة للوحة الإدارة
          </Button>
          <Button variant="neutral" onClick={() => navigate('/home')}>
            العودة للصفحة الرئيسية
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

const NavItem = ({ item, onClick }) => {
  const Icon = item.icon;
  return (
    <li className="relative">
      <Link
        to={item.href}
        className={`relative flex items-center px-4 py-3 text-base rounded-xl transition-colors duration-200 overflow-hidden
          ${item.current
            ? 'text-white'
            : 'text-primary-100 hover:bg-primary-600 hover:text-white'
          }`}
        onClick={onClick}
        aria-current={item.current ? 'page' : undefined}
      >
        {item.current && (
          <motion.span
            layoutId="activeNav"
            className="absolute inset-0 rounded-xl bg-primary-800"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          />
        )}
        <span className="relative flex items-center w-full gap-3">
          <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 text-start">{item.name}</span>
          {item.current && <ChevronRight className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
        </span>
      </Link>
    </li>
  );
};

// ─── Collapsible nav group ────────────────────────────────────────────────────

const NavGroup = ({ label, children, defaultOpen = false, hasActive = false }) => {
  const [open, setOpen] = useState(defaultOpen || hasActive);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-primary-300 uppercase tracking-wider hover:text-primary-100 transition-colors"
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="space-y-1 mt-1">
          {children}
        </ul>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const AdminDashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location  = useLocation();
  const navigate  = useNavigate();
  const { branches, selectedBranchId, selectBranch } = useBranch();

  useScrollToTop();

  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/admin/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const is = (path) => location.pathname === path || location.pathname === `/admin${path}`;
  const currentPath = location.pathname;

  // ── Nav groups ────────────────────────────────────────────────────────────
  const groups = [
    {
      label: 'الرئيسية',
      alwaysOpen: true,
      items: [
        { name: 'نظرة عامة',  href: '/admin',            icon: Home,         current: currentPath === '/admin' || currentPath === `/admin/${selectedBranchId}` },
        { name: 'المستخدمون', href: '/admin/users',       icon: Users,        current: currentPath === '/admin/users' },
      ],
    },
    {
      label: 'الدورات والمواد',
      items: [
        { name: 'دورات اللغات',             href: '/admin/languages-branch',    icon: Languages,    current: currentPath === '/admin/languages-branch' },
        { name: 'تسجيلات اللغات',           href: '/admin/languages-registered', icon: BadgeCheck,  current: currentPath === '/admin/languages-registered' },
        { name: 'دروس الدعم — الثانوي',      href: '/admin/support-high',         icon: BookOpen,    current: currentPath === '/admin/support-high' },
        { name: 'دروس الدعم — المتوسط',      href: '/admin/support-middle',        icon: BookOpen,    current: currentPath === '/admin/support-middle' },
        { name: 'تسجيلات دروس الدعم',       href: '/admin/support-registered',   icon: BadgeCheck,  current: currentPath === '/admin/support-registered' },
        { name: 'الدورات التكوينية',          href: '/admin/trainings-branch',     icon: GraduationCap, current: currentPath === '/admin/trainings-branch' },
        { name: 'تسجيلات الدورات التكوينية', href: '/admin/trainings-registered', icon: BadgeCheck,  current: currentPath === '/admin/trainings-registered' },
      ],
    },
    {
      label: 'التحقق والموافقات',
      items: [
        { name: 'التحقق من المدفوعات',       href: '/admin/payments-verification', icon: CreditCard, current: currentPath === '/admin/payments-verification' },
        { name: 'الرسوم السنوية',             href: '/admin/annual-fees',           icon: DollarSign, current: currentPath === '/admin/annual-fees' },
        { name: 'طلبات الدورات التكوينية',    href: '/admin/training-requests',     icon: FileText,   current: currentPath === '/admin/training-requests' },
      ],
    },
    {
      label: 'الاتصالات والإدارة',
      items: [
        { name: 'الإعلانات',   href: '/admin/announcements', icon: Megaphone,    current: currentPath === '/admin/announcements' },
        { name: 'دليل المسؤول', href: '/admin/admin-guide',   icon: ClipboardList, current: currentPath === '/admin/admin-guide' },
      ],
    },
  ];

  const closeSidebar = () => setSidebarOpen(false);

  // Determine which branch label to show
  const branchLabel = selectedBranchId === 'boumerdes'
    ? 'بومرداس'
    : selectedBranchId === 'bordj_menaiel'
    ? 'برج منايل'
    : selectedBranchId || '';

  return (
    <AdminErrorBoundary>
      <ToastProvider>
        <div className="min-h-screen bg-gray-50 flex admin-dashboard" dir="rtl">

          {/* Mobile backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 lg:hidden bg-black/50"
              onClick={closeSidebar}
              aria-hidden="true"
            />
          )}

          {/* Sidebar */}
          <div
            className={`
              w-64 bg-primary flex-shrink-0 admin-sidebar
              fixed lg:static inset-y-0 start-0 z-50
              transform transition-transform duration-300 ease-in-out
              ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
            `}
            role="navigation"
            aria-label="القائمة الرئيسية"
          >
            <div className="flex flex-col h-full">
              {/* Sidebar header */}
              <div className="flex items-center justify-between h-16 px-5 bg-primary-700 flex-shrink-0">
                <div>
                  <h1 className="text-base font-bold text-white leading-tight">لوحة الإدارة</h1>
                  {branchLabel && (
                    <p className="text-xs text-primary-200 mt-0.5">{branchLabel}</p>
                  )}
                </div>
                <button
                  onClick={closeSidebar}
                  className="lg:hidden text-white hover:text-gray-300 p-1.5 rounded-lg hover:bg-primary-600"
                  aria-label="إغلاق القائمة"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable nav */}
              <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
                {groups.map((group) => {
                  const groupHasActive = group.items.some((i) => i.current);
                  if (group.alwaysOpen) {
                    return (
                      <div key={group.label}>
                        <p className="px-4 py-1 text-xs font-bold text-primary-300 uppercase tracking-wider">
                          {group.label}
                        </p>
                        <ul className="space-y-1 mt-1">
                          {group.items.map((item) => (
                            <NavItem key={item.href} item={item} onClick={closeSidebar} />
                          ))}
                        </ul>
                      </div>
                    );
                  }
                  return (
                    <NavGroup
                      key={group.label}
                      label={group.label}
                      hasActive={groupHasActive}
                    >
                      {group.items.map((item) => (
                        <NavItem key={item.href} item={item} onClick={closeSidebar} />
                      ))}
                    </NavGroup>
                  );
                })}
              </div>

              {/* Logout */}
              <div className="px-3 pb-4 flex-shrink-0 border-t border-primary-700 pt-3">
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full gap-3 px-4 py-3 text-base rounded-xl transition-colors text-primary-100 hover:bg-primary-600 hover:text-white"
                >
                  <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                  تسجيل الخروج
                </button>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col lg:ms-0 admin-main-content min-w-0">

            {/* Top bar */}
            <div className="sticky top-0 z-40 bg-white shadow-sm border-b border-gray-200">
              <div className="flex items-center justify-between h-16 px-4 sm:px-6">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100"
                  aria-label="فتح القائمة"
                >
                  <Menu className="h-6 w-6" />
                </button>

                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600 hidden sm:block">
                    <ClockComponent format="24-hour" showDate={true} size="medium" />
                  </div>
                  {branchLabel && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary text-sm font-medium rounded-lg border border-primary-100">
                      {branchLabel}
                    </span>
                  )}
                  <Link
                    to="/home"
                    className="text-primary hover:text-primary-600 font-medium text-sm"
                  >
                    العودة للموقع
                  </Link>
                </div>
              </div>
            </div>

            {/* Page content */}
            <main className="flex-1 p-4 sm:p-6 overflow-y-auto admin-page-content">
              <Routes>
                <Route index element={<Overview />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="languages-branch" element={<LanguagesPage />} />
                <Route path="languages-registered" element={<LanguageRegisteredPage />} />
                <Route path="support-high" element={<SupportLessonsHighPage />} />
                <Route path="support-middle" element={<SupportLessonsMiddlePage />} />
                <Route path="support-registered" element={<SupportRegisteredPage />} />
                <Route path="trainings-branch" element={<TrainingsPage />} />
                <Route path="trainings-registered" element={<TrainingRegisteredPage />} />
                <Route path="payments-verification" element={<PaymentsVerification />} />
                <Route path="annual-fees" element={<AnnualFees />} />
                <Route path="training-requests" element={<TrainingRequestsPage />} />
                <Route path="announcements" element={<AnnouncementsPage />} />
                <Route path="admin-guide" element={<AdminGuide />} />
                <Route path=":branch" element={<Overview />} />
                <Route path="*" element={<AdminErrorPage />} />
              </Routes>
            </main>
          </div>

        </div>
      </ToastProvider>
    </AdminErrorBoundary>
  );
};

export default AdminDashboard;
