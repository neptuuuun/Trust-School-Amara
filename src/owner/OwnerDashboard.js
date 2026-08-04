import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Home, Bell, Building2, PieChart, LineChart, GraduationCap, FileBarChart2, ShieldCheck, Globe, Menu, X, ChevronRight, LogOut, BarChart3, LifeBuoy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from '../components/notifications/NotificationBell';
import useScrollToTop from '../hooks/useScrollToTop';
import { getAcademicYearLabel, listAcademicYears } from '../utils/academicYear';
import { OwnerFiltersProvider, useOwnerFilters } from './ownerFilters';
import OwnerHome from './pages/OwnerHome';
import BranchAnalytics from './pages/BranchAnalytics';
import RevenueBreakdown from './pages/RevenueBreakdown';
import GroupAnalytics from './pages/GroupAnalytics';
import Retention from './pages/Retention';
import StudentLifecycle from './pages/StudentLifecycle';
import TeacherPerformance from './pages/TeacherPerformance';
import Reports from './pages/Reports';
import WeeklyReport from './pages/WeeklyReport';
import Governance from './pages/Governance';
import Team from './pages/Team';
import AuditLog from './pages/AuditLog';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import WebsiteManagement from './pages/website/WebsiteManagement';
import { Button } from '../components/ui/button';

// Executive navigation. Operational registers (students, groups) live under
// "التقارير"; oversight tools (team, audit, settings) live under "الحوكمة".
// Their routes stay mounted below so alert deep-links and bookmarks keep working;
// the `match` funcs keep the parent item highlighted while on a drill-down page.
const NAV = [
  { name: 'نظرة عامة',       href: '/owner',            icon: Home,          match: (p) => p === '/owner' || p === '/owner/' },
  { name: 'التقرير الأسبوعي', href: '/owner/weekly-report', icon: BarChart3,  match: (p) => p.startsWith('/owner/weekly-report') },
  { name: 'التنبيهات',        href: '/owner/alerts',     icon: Bell,          match: (p) => p.startsWith('/owner/alerts') },
  { name: 'تحليل الفروع',     href: '/owner/branches',   icon: Building2,      match: (p) => p.startsWith('/owner/branches') },
  { name: 'الإيرادات',        href: '/owner/revenue',    icon: PieChart,      match: (p) => p.startsWith('/owner/revenue') },
  { name: 'الاحتفاظ والنمو',  href: '/owner/retention',  icon: LineChart,     match: (p) => p.startsWith('/owner/retention') },
  { name: 'أداء الأساتذة',    href: '/owner/teachers',   icon: GraduationCap, match: (p) => p.startsWith('/owner/teachers') },
  { name: 'إدارة الموقع',     href: '/owner/website',    icon: Globe,         match: (p) => p.startsWith('/owner/website') },
  { name: 'التقارير',         href: '/owner/reports',    icon: FileBarChart2, match: (p) => ['/owner/reports', '/owner/students', '/owner/groups'].some((x) => p.startsWith(x)) },
  { name: 'الحوكمة',          href: '/owner/governance', icon: ShieldCheck,   match: (p) => ['/owner/governance', '/owner/team', '/owner/audit', '/owner/settings', '/owner/admins', '/owner/admin-activity'].some((x) => p.startsWith(x)) },
];

const NavItem = ({ item, active, onClick }) => {
  const Icon = item.icon;
  return (
    <li className="relative">
      <Link
        to={item.href}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`relative flex items-center px-4 py-3 text-base rounded-xl transition-colors duration-200 overflow-hidden
          ${active ? 'text-white' : 'text-primary-100 hover:bg-primary-600 hover:text-white'}`}
      >
        {active && (
          <motion.span layoutId="ownerActiveNav" className="absolute inset-0 rounded-xl bg-primary-800"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }} />
        )}
        <span className="relative flex items-center w-full gap-3">
          <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 text-start">{item.name}</span>
          {active && <ChevronRight className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
        </span>
      </Link>
    </li>
  );
};

// Global academic-year picker (PRIMARY reporting dimension) shown in the top bar.
// Defaults to the current year; selecting another year is a read-only history view.
const YearPicker = () => {
  const { academicYear, setAcademicYear } = useOwnerFilters();
  const current = getAcademicYearLabel();
  const options = listAcademicYears({ count: 6, future: 1 });
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      <span className="hidden sm:inline">السنة الدراسية</span>
      <select
        value={academicYear}
        onChange={(e) => setAcademicYear(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
      >
        {options.map((y) => (
          <option key={y} value={y}>{y}{y === current ? ' (الحالية)' : ''}</option>
        ))}
      </select>
    </label>
  );
};

// Global month picker — the monthly drill-down for month-based analytics.
const MonthPicker = () => {
  const { month, setMonth } = useOwnerFilters();
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      <span className="hidden sm:inline">الشهر</span>
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
      />
    </label>
  );
};

const OwnerDashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, ownerData, user } = useAuth();
  useScrollToTop();

  const handleLogout = async () => {
    try { await logout(); navigate('/owner/login'); }
    catch (e) { console.error('Logout error:', e); }
  };

  const closeSidebar = () => setSidebarOpen(false);
  const path = location.pathname;

  return (
    <OwnerFiltersProvider>
      <div className="min-h-screen bg-gray-50 flex" dir="rtl">
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden bg-black/50" onClick={closeSidebar} aria-hidden="true" />
        )}

        {/* Sidebar */}
        <div className={`w-64 bg-primary flex-shrink-0 fixed lg:static inset-y-0 start-0 z-50
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
          role="navigation" aria-label="قائمة المالك">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between h-16 px-5 bg-primary-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-white" />
                <div>
                  <h1 className="text-base font-bold text-white leading-tight">لوحة المالك</h1>
                  <p className="text-xs text-primary-200 mt-0.5">جميع الفروع</p>
                </div>
              </div>
              <button onClick={closeSidebar} className="lg:hidden text-white hover:text-gray-300 p-1.5 rounded-lg hover:bg-primary-600" aria-label="إغلاق القائمة">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 px-3">
              <ul className="space-y-1">
                {NAV.map((item) => (
                  <NavItem key={item.href} item={item} active={item.match(path)} onClick={closeSidebar} />
                ))}
              </ul>
            </div>

            <div className="px-3 pb-4 flex-shrink-0 border-t border-primary-700 pt-3">
              <button onClick={handleLogout}
                className="flex items-center w-full gap-3 px-4 py-3 text-base rounded-xl transition-colors text-primary-100 hover:bg-primary-600 hover:text-white">
                <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="sticky top-0 z-40 bg-white shadow-sm border-b border-gray-200">
            <div className="flex items-center justify-between h-16 px-4 sm:px-6">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100" aria-label="فتح القائمة">
                <Menu className="h-6 w-6" />
              </button>
              <div className="flex items-center gap-4 ms-auto">
                <YearPicker />
                <MonthPicker />
                {ownerData?.email && (
                  <span className="hidden sm:inline-flex items-center px-3 py-1.5 bg-primary-50 text-primary text-sm font-medium rounded-lg border border-primary-100">
                    {ownerData.name || ownerData.email}
                  </span>
                )}
                <NotificationBell userId={user?.uid} />
                <a
                  href="/help/owner"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary-100 bg-white px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-50"
                  title="فتح مركز المساعدة في تبويب جديد"
                >
                  <LifeBuoy className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">مركز المساعدة</span>
                </a>
                <Link to="/home" className="text-primary hover:text-primary-600 font-medium text-sm">العودة للموقع</Link>
              </div>
            </div>
          </div>

          <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
            <Routes>
              <Route index element={<OwnerHome />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="branches" element={<BranchAnalytics />} />
              <Route path="revenue" element={<RevenueBreakdown />} />
              <Route path="retention" element={<Retention />} />
              <Route path="teachers" element={<TeacherPerformance />} />

              {/* Website management — owner-only public-site content editor. */}
              <Route path="website" element={<WebsiteManagement />} />

              {/* Reports — detailed registers reached from alerts or the Reports hub. */}
              <Route path="reports" element={<Reports />} />
              <Route path="weekly-report" element={<WeeklyReport />} />
              <Route path="groups" element={<GroupAnalytics />} />
              <Route path="students" element={<StudentLifecycle />} />

              {/* Governance — oversight tools used on-exception. */}
              <Route path="governance" element={<Governance />} />
              <Route path="team" element={<Team />} />
              <Route path="audit" element={<AuditLog />} />
              <Route path="settings" element={<Settings />} />
              {/* Legacy admin routes now merged into Team (kept for bookmarks/deep-links). */}
              <Route path="admins" element={<Navigate to="/owner/team" replace />} />
              <Route path="admin-activity" element={<Navigate to="/owner/team" replace />} />

              <Route path="*" element={<OwnerNotFound />} />
            </Routes>
          </main>
        </div>
      </div>
    </OwnerFiltersProvider>
  );
};

const OwnerNotFound = () => {
  const navigate = useNavigate();
  return (
    <div className="text-center py-20" dir="rtl">
      <h1 className="text-5xl font-bold text-primary mb-3">404</h1>
      <p className="text-gray-600 mb-6">الصفحة غير موجودة في لوحة المالك</p>
      <Button variant="primary" onClick={() => navigate('/owner')}>العودة للوحة المالك</Button>
    </div>
  );
};

export default OwnerDashboard;
