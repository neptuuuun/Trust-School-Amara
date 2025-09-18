import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { 
  Home, 
  BookOpen, 
  Languages, 
  GraduationCap, 
  Users, 
  FileText,
  Menu,
  X,
  ChevronRight,
  MessageSquare,
  LogOut,
} from 'lucide-react';
import useScrollToTop from '../hooks/useScrollToTop';

// Import admin pages
import Overview from './pages/Overview';
import SupportLessons from './pages/SupportLessons';
import LanguagesAdmin from './pages/LanguagesAdmin';
import Trainings from './pages/Trainings';
import SignUps from './pages/SignUps';
import TrainingRequests from './pages/TrainingRequests';

const AdminDashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Use scroll to top hook
  useScrollToTop();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/admin/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navigation = [
    { name: 'نظرة عامة', href: '/admin', icon: Home, current: location.pathname === '/admin' },
    { name: 'دروس الدعم', href: '/admin/support-lessons', icon: BookOpen, current: location.pathname === '/admin/support-lessons' },
    { name: 'اللغات', href: '/admin/languages', icon: Languages, current: location.pathname === '/admin/languages' },
    { name: 'الدورات التكوينية', href: '/admin/trainings', icon: GraduationCap, current: location.pathname === '/admin/trainings' },
    { name: 'طلبات التدريب', href: '/admin/training-requests', icon: MessageSquare, current: location.pathname === '/admin/training-requests' },
    { name: 'التسجيلات', href: '/admin/signups', icon: FileText, current: location.pathname === '/admin/signups' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex" dir="rtl">
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
        w-64 bg-primary flex-shrink-0
        lg:static lg:translate-x-0
        fixed inset-y-0 right-0 z-50 transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between h-16 px-6 bg-primary-700">
          <h1 className="text-xl font-bold text-white">لوحة الإدارة</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <nav className="mt-8 px-4 flex-1">
          <ul className="space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={`
                      flex items-center px-4 py-3 text-lg rounded-lg transition-colors duration-200
                      ${item.current 
                        ? 'bg-primary-800 text-white' 
                        : 'text-primary-100 hover:bg-primary-600 hover:text-white'
                      }
                    `}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon className="ml-3 h-6 w-6" />
                    {item.name}
                    {item.current && <ChevronRight className="mr-auto h-5 w-5" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        
        {/* Logout button */}
        <div className="px-4 pb-4">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-3 text-lg rounded-lg transition-colors duration-200 text-primary-100 hover:bg-primary-600 hover:text-white"
          >
            <LogOut className="ml-3 h-6 w-6" />
            تسجيل الخروج
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
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
              <Link 
                to="/" 
                className="text-primary hover:text-primary-600 font-medium text-lg"
              >
                العودة للموقع الرئيسي
              </Link>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-6">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="support-lessons" element={<SupportLessons />} />
            <Route path="languages" element={<LanguagesAdmin />} />
            <Route path="trainings" element={<Trainings />} />
            <Route path="training-requests" element={<TrainingRequests />} />
            <Route path="signups" element={<SignUps />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;