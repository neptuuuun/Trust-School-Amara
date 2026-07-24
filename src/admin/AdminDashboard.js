// AdminDashboard — shell, navigation and routing for the branch admin console.
//
// NAVIGATION MODEL
// The sidebar is grouped by what an admin DOES, not by data model:
//
//   الرئيسية          — the daily console
//   الطلاب            — people: accounts, verification, annual fees
//   التسجيلات         — who is enrolled in what (the archives)
//   البرامج والمجموعات — the catalog an admin maintains (subjects → classes)
//   المالية            — the payment log + recovery desk
//   المركز             — announcements and the how-to guide
//
// The old "التحقق والموافقات" group is gone: after the Chargily migration there
// is no payment to verify — a registration only exists once money was captured.
// The one approval left (student documents) now lives with الطلاب, where it is.
//
// LIVE BADGES
// The two queues that cost the school money if ignored — paid-but-unseated
// payments and students waiting on document review — are badged in the sidebar
// from GET /api/admin/overview, so they are visible from every page, not only
// from the home screen.

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Routes, Route, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { AdminOverviewProvider, useAdminOverview } from './AdminOverviewContext';
import { BRANCH_LABELS, branchLabel as resolveBranchLabel } from '../utils/branches';
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
import PaymentOrdersPage from './pages/PaymentOrdersPage';
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
    <div className="flex min-h-[60vh] items-center justify-center px-4" dir="rtl">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-primary">404</h1>
        <h2 className="mb-2 text-2xl font-semibold text-gray-800">الصفحة غير موجودة</h2>
        <p className="mb-6 text-gray-600">الصفحة التي تبحث عنها غير موجودة في لوحة الإدارة</p>
        <div className="flex justify-center gap-3">
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

// ─── /admin/:branch alias ─────────────────────────────────────────────────────
// Historic deep links point at /admin/<branchId>. Previously this route was
// declared as a bare `:branch` param, so it matched ANY single segment and
// swallowed every typo (/admin/userss silently rendered the Overview) — the
// `*` 404 route below it could never fire for a one-segment path. It now only
// matches a real branch id and otherwise falls through to the 404.

const BranchAlias = () => {
  const { branch } = useParams();
  const { branches } = useBranch();
  // Match against the live branches list, falling back to the static labels so a
  // deep link still resolves before the Firestore snapshot has arrived.
  const known = branches.some((b) => b.id === branch) || Boolean(BRANCH_LABELS[branch]);
  return known ? <Overview /> : <AdminErrorPage />;
};

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

const NavItem = ({ item, onClick }) => {
  const Icon = item.icon;
  const badge = item.badge;
  return (
    <li className="relative">
      <Link
        to={item.href}
        className={`relative flex items-center overflow-hidden rounded-xl px-4 py-3 text-base transition-colors duration-200
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
        <span className="relative flex w-full items-center gap-3">
          <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 text-start">{item.name}</span>
          {badge > 0 && (
            <span
              className={`flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                item.badgeTone === 'danger' ? 'bg-danger-500 text-white' : 'bg-warning-400 text-warning-900'
              }`}
              title={item.badgeTitle}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}
          {item.current && !badge && <ChevronRight className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
        </span>
      </Link>
    </li>
  );
};

// ─── Collapsible nav group ────────────────────────────────────────────────────

const NavGroup = ({ label, children, defaultOpen = false, hasActive = false, badge = 0 }) => {
  const [open, setOpen] = useState(defaultOpen || hasActive);

  // A group that gains work while collapsed must open itself — otherwise the
  // badge is hidden behind a chevron and the queue goes unnoticed.
  useEffect(() => {
    if (hasActive || badge > 0) setOpen(true);
  }, [hasActive, badge]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-300 transition-colors hover:text-primary-100"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {label}
          {!open && badge > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white">
              {badge}
            </span>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <ul className="mt-1 space-y-1">{children}</ul>}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

// The shell itself. It must render INSIDE AdminOverviewProvider (see the default
// export below) because the sidebar badges read the shared overview snapshot.
const AdminShell = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedBranchId } = useBranch();

  useScrollToTop();

  const { logout } = useAuth();

  // Queue badges come from the SAME snapshot the Overview page renders — one
  // fetch, one truth, no chance of the sidebar and the page disagreeing.
  const { queues } = useAdminOverview();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/admin/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const currentPath = location.pathname;
  const at = (path) => currentPath === path;

  // ── Nav groups ────────────────────────────────────────────────────────────
  const groups = [
    {
      label: 'الرئيسية',
      alwaysOpen: true,
      items: [
        {
          name: 'نظرة عامة',
          href: '/admin',
          icon: Home,
          current: at('/admin') || at(`/admin/${selectedBranchId}`),
        },
      ],
    },
    {
      label: 'الطلاب',
      items: [
        {
          name: 'الطلاب',
          href: '/admin/users',
          icon: Users,
          current: at('/admin/users'),
          badge: queues.documentVerification,
          badgeTone: 'warning',
          badgeTitle: 'وثائق بانتظار المراجعة',
        },
        { name: 'الرسوم السنوية', href: '/admin/annual-fees', icon: DollarSign, current: at('/admin/annual-fees') },
      ],
    },
    {
      label: 'التسجيلات',
      items: [
        { name: 'تسجيلات اللغات',            href: '/admin/languages-registered', icon: BadgeCheck, current: at('/admin/languages-registered') },
        { name: 'تسجيلات دروس الدعم',        href: '/admin/support-registered',   icon: BadgeCheck, current: at('/admin/support-registered') },
        { name: 'تسجيلات الدورات التكوينية', href: '/admin/trainings-registered', icon: BadgeCheck, current: at('/admin/trainings-registered') },
        {
          name: 'طلبات الدورات التكوينية',
          href: '/admin/training-requests',
          icon: FileText,
          current: at('/admin/training-requests'),
          badge: queues.trainingRequests,
          badgeTone: 'warning',
          badgeTitle: 'طلبات لم تتم مراجعتها',
        },
      ],
    },
    {
      label: 'البرامج والمجموعات',
      items: [
        { name: 'دورات اللغات',         href: '/admin/languages-branch', icon: Languages,     current: at('/admin/languages-branch') },
        { name: 'دروس الدعم — الثانوي', href: '/admin/support-high',     icon: BookOpen,      current: at('/admin/support-high') },
        { name: 'دروس الدعم — المتوسط', href: '/admin/support-middle',   icon: BookOpen,      current: at('/admin/support-middle') },
        { name: 'الدورات التكوينية',    href: '/admin/trainings-branch', icon: GraduationCap, current: at('/admin/trainings-branch') },
      ],
    },
    {
      label: 'المالية',
      items: [
        {
          name: 'سجل المدفوعات',
          href: '/admin/payment-orders',
          icon: CreditCard,
          current: at('/admin/payment-orders'),
          badge: queues.stuckPayments,
          badgeTone: 'danger',
          badgeTitle: 'مدفوعات لم يكتمل تسجيلها',
        },
      ],
    },
    {
      label: 'المركز',
      items: [
        { name: 'الإعلانات',    href: '/admin/announcements', icon: Megaphone,     current: at('/admin/announcements') },
        { name: 'دليل المسؤول', href: '/admin/admin-guide',   icon: ClipboardList, current: at('/admin/admin-guide') },
      ],
    },
  ];

  const closeSidebar = () => setSidebarOpen(false);

  const branchLabel = selectedBranchId ? resolveBranchLabel(selectedBranchId) : '';
  const totalQueue = (queues.documentVerification || 0) + (queues.stuckPayments || 0) + (queues.trainingRequests || 0);

  return (
    <div className="admin-dashboard flex min-h-screen bg-gray-50" dir="rtl">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          admin-sidebar w-64 flex-shrink-0 bg-primary
          fixed inset-y-0 start-0 z-50 lg:static
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
        role="navigation"
        aria-label="القائمة الرئيسية"
      >
        <div className="flex h-full flex-col">
          {/* Sidebar header */}
          <div className="flex h-16 flex-shrink-0 items-center justify-between bg-primary-700 px-5">
            <div>
              <h1 className="text-base font-bold leading-tight text-white">لوحة الإدارة</h1>
              {branchLabel && <p className="mt-0.5 text-xs text-primary-200">{branchLabel}</p>}
            </div>
            <button
              onClick={closeSidebar}
              className="rounded-lg p-1.5 text-white hover:bg-primary-600 hover:text-gray-300 lg:hidden"
              aria-label="إغلاق القائمة"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable nav */}
          <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
            {groups.map((group) => {
              const groupHasActive = group.items.some((i) => i.current);
              const groupBadge = group.items.reduce((s, i) => s + (i.badge || 0), 0);
              if (group.alwaysOpen) {
                return (
                  <div key={group.label}>
                    <p className="px-4 py-1 text-xs font-bold uppercase tracking-wider text-primary-300">
                      {group.label}
                    </p>
                    <ul className="mt-1 space-y-1">
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
                  badge={groupBadge}
                >
                  {group.items.map((item) => (
                    <NavItem key={item.href} item={item} onClick={closeSidebar} />
                  ))}
                </NavGroup>
              );
            })}
          </div>

          {/* Logout */}
          <div className="flex-shrink-0 border-t border-primary-700 px-3 pb-4 pt-3">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-base text-primary-100 transition-colors hover:bg-primary-600 hover:text-white"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="admin-main-content flex min-w-0 flex-1 flex-col lg:ms-0">

        {/* Top bar */}
        <div className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <button
              onClick={() => setSidebarOpen(true)}
              className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden"
              aria-label="فتح القائمة"
            >
              <Menu className="h-6 w-6" />
              {/* On mobile the sidebar is hidden, so the pending-work signal
                  has to ride on the only always-visible control. */}
              {totalQueue > 0 && (
                <span className="absolute end-1 top-1 h-2.5 w-2.5 rounded-full bg-danger-500 ring-2 ring-white" />
              )}
            </button>

            <div className="flex items-center gap-4">
              <div className="hidden text-sm text-gray-600 sm:block">
                <ClockComponent format="24-hour" showDate={true} size="medium" />
              </div>
              {branchLabel && (
                <span className="hidden items-center gap-1.5 rounded-lg border border-primary-100 bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary sm:inline-flex">
                  {branchLabel}
                </span>
              )}
              <Link to="/home" className="text-sm font-medium text-primary hover:text-primary-600">
                العودة للموقع
              </Link>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="admin-page-content flex-1 overflow-y-auto p-4 sm:p-6">
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
            <Route path="payment-orders" element={<PaymentOrdersPage />} />
            <Route path="annual-fees" element={<AnnualFees />} />
            <Route path="training-requests" element={<TrainingRequestsPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="admin-guide" element={<AdminGuide />} />
            {/* Branch alias LAST among single-segment routes: it validates the
                param itself and renders the 404 for anything that isn't a
                real branch, so unknown paths are no longer swallowed. */}
            <Route path=":branch" element={<BranchAlias />} />
            <Route path="*" element={<AdminErrorPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

// Provider order matters: the error boundary must be outermost so a crash inside
// any provider still renders a recovery screen; toasts must be available to every
// page; the overview snapshot is keyed on the branch so switching branches
// refetches rather than showing the previous branch's queues.
const AdminDashboard = () => {
  const { selectedBranchId } = useBranch();
  return (
    <AdminErrorBoundary>
      <ToastProvider>
        <AdminOverviewProvider branchId={selectedBranchId}>
          <AdminShell />
        </AdminOverviewProvider>
      </ToastProvider>
    </AdminErrorBoundary>
  );
};

export default AdminDashboard;
