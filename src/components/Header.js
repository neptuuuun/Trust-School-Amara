import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import LogoImage from '../assets/images/logo.png';

const Header = () => {
    const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

    const toggleMobileMenu = () => {
        setMobileMenuOpen(!isMobileMenuOpen);
    };

    const closeMobileMenu = () => {
        setMobileMenuOpen(false);
    };

    return (
        <header className="fixed top-0 left-0 w-full z-50 bg-primary shadow-primary">
            <div className="container mx-auto px-4">
                <nav className="flex items-center justify-between h-20">
                    <div className="logo">
                        <Link to="/" className="logo-link">
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
                    </ul>
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
