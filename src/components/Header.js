import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LogoImage from '../assets/images/logo.png';
import { useAuth } from '../contexts/AuthContext';
import ChangeBranchButton from './ChangeBranchButton';

const Header = () => {
    const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { user, role, logout, loading } = useAuth();
    const navigate = useNavigate();

    const toggleMobileMenu = () => {
        setMobileMenuOpen(!isMobileMenuOpen);
    };

    const closeMobileMenu = () => {
        setMobileMenuOpen(false);
    };

    return (
        <header className="sticky top-0 left-0 w-full z-50 bg-primary shadow-primary">
            <div className="container mx-auto px-4">
                <nav className="flex items-center justify-between h-20">
                    <div className="logo">
                        <Link to="/home" className="logo-link">
                            <img src={LogoImage} alt="Trust School Amara" className="logo-img" />
                            <span className="logo-text">Trust School Amara</span>
                        </Link>
                    </div>
                    <ul className={`nav-links ${isMobileMenuOpen ? 'active' : ''}`}>
                        <li>
                            <Link 
                            to="/" 
                            className="text-primary md:!text-white hover:text-warning transition-colors"
                            onClick={closeMobileMenu}
                            >
                            الرئيسية
                            </Link>
                        </li>
                        <li>
                            <Link 
                            to="/support-lessons" 
                            className="text-primary md:!text-white hover:text-warning transition-colors"
                            onClick={closeMobileMenu}
                            >
                            دروس الدعم
                            </Link>
                        </li>
                        <li>
                            <Link 
                            to="/languages" 
                            className="text-primary md:!text-white hover:text-warning transition-colors"
                            onClick={closeMobileMenu}
                            >
                            تعليم اللغات
                            </Link>
                        </li>
                        <li>
                            <Link 
                            to="/trainings" 
                            className="text-primary md:!text-white hover:text-warning transition-colors"
                            onClick={closeMobileMenu}
                            >
                            الدورات التكوينية
                            </Link>
                        </li>
                        <li>
                            <Link 
                            to="/contact" 
                            className="text-primary md:!text-white hover:text-warning transition-colors"
                            onClick={closeMobileMenu}
                            >
                            اتصل بنا
                            </Link>
                        </li>
                        {/* Change Branch inside menu for mobile */}
                        <li className="md:hidden">
                            <ChangeBranchButton className="w-full text-right mt-2 border-amber-500" />
                        </li>
                    </ul>
                    {/* Auth actions - Desktop */}
                    <div className="hidden md:flex items-center space-x-3 space-x-reverse">
                        {/* Change Branch button - Desktop (top-right) */}
                        <ChangeBranchButton className="border-red-500" />
                        {loading ? null : user ? (
                            <>
                                <Link
                                    to={role === 'admin' ? '/admin' : '/profile'}
                                    className="text-white border border-white/40 px-3 py-1.5 rounded-lg hover:bg-white hover:text-primary transition"
                                >
                                    {role === 'admin' ? 'لوحة الإدارة' : 'الملف الشخصي'}
                                </Link>
                                <button
                                    onClick={async () => {
                                        await logout();
                                        navigate('/');
                                    }}
                                    className="bg-warning text-primary font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 transition"
                                >
                                    خروج
                                </button>
                            </>
                        ) : (
                            <>
                                <Link to="/login" className="text-white hover:text-warning transition">دخول</Link>
                                <Link to="/register" className="bg-warning text-primary font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 transition">تسجيل</Link>
                            </>
                        )}
                    </div>
                    {/* Auth actions - Mobile */}
                    <div className="flex md:hidden items-center space-x-2 space-x-reverse">
                        {loading ? null : user ? (
                            <>
                                <button
                                    onClick={() => {
                                        navigate(role === 'admin' ? '/admin' : '/profile');
                                    }}
                                    className="text-white border border-white/40 px-2 py-1 rounded-md text-sm hover:bg-white hover:text-primary transition"
                                >
                                    {role === 'admin' ? 'الإدارة' : 'حسابي'}
                                </button>
                                <button
                                    onClick={async () => {
                                        await logout();
                                        navigate('/');
                                        setMobileMenuOpen(false);
                                    }}
                                    className="bg-warning text-primary font-semibold px-3 py-1 rounded-md text-sm hover:opacity-90 transition"
                                >
                                    خروج
                                </button>
                            </>
                        ) : (
                            <>
                                <Link onClick={closeMobileMenu} to="/login" className="text-white text-sm hover:text-warning transition">دخول</Link>
                                <Link onClick={closeMobileMenu} to="/register" className="bg-warning text-primary font-semibold px-3 py-1 rounded-md text-sm hover:opacity-90 transition">تسجيل</Link>
                            </>
                        )}
                    </div>
                    {/* Mobile menu icon */}
                    <div className="mobile-menu" onClick={toggleMobileMenu}>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </nav>
            </div>
        </header>
    );
};

export default Header;
