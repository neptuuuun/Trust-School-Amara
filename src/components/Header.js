import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import LogoImage from '../assets/images/logo.png';
import { useAuth } from '../contexts/AuthContext';
import ChangeBranchButton from './ChangeBranchButton';

const NAV_ITEMS = [
    { to: '/home',            label: 'الرئيسية' },
    { to: '/support-lessons', label: 'دروس الدعم' },
    { to: '/languages',       label: 'تعليم اللغات' },
    { to: '/trainings',       label: 'الدورات التكوينية' },
    { to: '/contact',         label: 'اتصل بنا' },
];

const Header = () => {
    const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { user, role, logout, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const toggleMobileMenu = () => setMobileMenuOpen((v) => !v);
    const closeMobileMenu = () => setMobileMenuOpen(false);

    const isActive = (to) => location.pathname === to;

    // Single derivation of what the navbar should show. Mirrors the JSX below so
    // there is exactly one place that maps auth state → UI.
    //   'loading' → render nothing (auth not yet resolved)
    //   'guest'   → دخول / تسجيل
    //   'admin'   → لوحة الإدارة / خروج
    //   'student' → الملف الشخصي / خروج
    const navbarMode = loading ? 'loading' : !user ? 'guest' : role === 'admin' ? 'admin' : 'student';

    // TEMPORARY DEBUG — remove once the auth/navbar bug is confirmed fixed.
    useEffect(() => {
        console.log('Auth Loading:', loading);
        console.log('Firebase User:', user ? { uid: user.uid, email: user.email } : null);
        console.log('User Role:', role);
        console.log('Navbar Mode:', navbarMode);
    }, [loading, user, role, navbarMode]);

    return (
        <header className="sticky top-0 z-50 w-full bg-primary shadow-primary">
            {/* Backdrop — closes the mobile drawer on outside click */}
            {isMobileMenuOpen && (
                <div
                    className="fixed left-0 right-0 bottom-0 top-20 z-40 bg-black/40 transition-opacity duration-300 md:hidden"
                    onClick={closeMobileMenu}
                    aria-hidden="true"
                />
            )}
            <div className="container mx-auto px-4">
                <nav className="flex items-center justify-between h-20" role="navigation" aria-label="التنقل الرئيسي">
                    {/* Logo */}
                    <div className="logo">
                        <Link to="/home" className="logo-link" aria-label="الصفحة الرئيسية - Trust School Amara">
                            <img src={LogoImage} alt="Trust School Amara" className="logo-img" />
                            <span className="logo-text">Trust School Amara</span>
                        </Link>
                    </div>

                    {/* Desktop nav links */}
                    <ul id="mobile-nav" className={`nav-links relative z-[60] ${isMobileMenuOpen ? 'active' : ''}`} role="list">
                        {NAV_ITEMS.map(({ to, label }) => (
                            <li key={to}>
                                <Link
                                    to={to}
                                    className={`transition-colors ${
                                        isActive(to)
                                            ? 'text-warning md:!text-warning font-semibold border-b-2 border-warning pb-0.5'
                                            : 'text-primary md:!text-white hover:text-warning'
                                    }`}
                                    onClick={closeMobileMenu}
                                    aria-current={isActive(to) ? 'page' : undefined}
                                >
                                    {label}
                                </Link>
                            </li>
                        ))}
                        {/* Change Branch inside menu for mobile */}
                        <li className="md:hidden">
                            <ChangeBranchButton className="w-full text-start mt-2 border-amber-500" />
                        </li>
                    </ul>

                    {/* Auth actions — Desktop */}
                    <div className="hidden md:flex items-center gap-3">
                        <ChangeBranchButton />
                        {loading ? null : user ? (
                            <>
                                <Link
                                    to={role === 'admin' ? '/admin' : '/profile'}
                                    className="text-white border border-white/40 px-3 py-1.5 rounded-lg hover:bg-white hover:text-primary transition"
                                >
                                    {role === 'admin' ? 'لوحة الإدارة' : 'الملف الشخصي'}
                                </Link>
                                <button
                                    onClick={async () => { await logout(); navigate('/'); }}
                                    className="bg-warning text-primary font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 transition"
                                >
                                    خروج
                                </button>
                            </>
                        ) : (
                            <>
                                <Link to="/login" className="text-white hover:text-warning transition">دخول</Link>
                                <Link to="/register" className="bg-warning text-primary font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 transition">
                                    تسجيل
                                </Link>
                            </>
                        )}
                    </div>

                    {/* Auth actions — Mobile */}
                    <div className="flex md:hidden items-center gap-2">
                        {loading ? null : user ? (
                            <>
                                <button
                                    onClick={() => navigate(role === 'admin' ? '/admin' : '/profile')}
                                    className="text-white border border-white/40 px-2 py-1 rounded-md text-sm hover:bg-white hover:text-primary transition"
                                >
                                    {role === 'admin' ? 'الإدارة' : 'حسابي'}
                                </button>
                                <button
                                    onClick={async () => { await logout(); navigate('/'); setMobileMenuOpen(false); }}
                                    className="bg-warning text-primary font-semibold px-3 py-1 rounded-md text-sm hover:opacity-90 transition"
                                >
                                    خروج
                                </button>
                            </>
                        ) : (
                            <>
                                <Link onClick={closeMobileMenu} to="/login" className="text-white text-sm hover:text-warning transition">دخول</Link>
                                <Link onClick={closeMobileMenu} to="/register" className="bg-warning text-primary font-semibold px-3 py-1 rounded-md text-sm hover:opacity-90 transition">
                                    تسجيل
                                </Link>
                            </>
                        )}
                        {/* Hamburger */}
                        <button
                            className="flex flex-col justify-center gap-1.5 p-2 bg-primary hover:brightness-110 transition"
                            onClick={toggleMobileMenu}
                            aria-label="فتح القائمة"
                            aria-expanded={isMobileMenuOpen}
                            aria-controls="mobile-nav"
                        >
                            <span className="block w-6 h-0.5 rounded bg-white" aria-hidden="true"></span>
                            <span className="block w-6 h-0.5 rounded bg-white" aria-hidden="true"></span>
                            <span className="block w-6 h-0.5 rounded bg-white" aria-hidden="true"></span>
                        </button>
                    </div>
                </nav>
            </div>
        </header>
    );
};

export default Header;
