import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, Clock, MapPin } from 'lucide-react';

const Footer = () => {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="footer" dir="rtl">
            <div className="container">
                <div className="footer-content">
                    {/* Contact info */}
                    <div className="footer-section">
                        <h3>معلومات الاتصال</h3>
                        <div className="footer-contact-item">
                            <MapPin className="footer-contact-icon" aria-hidden="true" />
                            <span>الجزائر، بومرداس / برج منايل</span>
                        </div>
                        <div className="footer-contact-item">
                            <Phone className="footer-contact-icon" aria-hidden="true" />
                            <a href="tel:0554562997" className="footer-contact-link" dir="ltr">0554 56 29 97</a>
                        </div>
                        <div className="footer-contact-item">
                            <Mail className="footer-contact-icon" aria-hidden="true" />
                            <a href="mailto:trustschoolamara@gmail.com" className="footer-contact-link" dir="ltr">
                                trustschoolamara@gmail.com
                            </a>
                        </div>
                    </div>

                    {/* Quick links */}
                    <div className="footer-section">
                        <h3>روابط سريعة</h3>
                        <ul>
                            <li><Link to="/home">الرئيسية</Link></li>
                            <li><Link to="/support-lessons">دروس الدعم</Link></li>
                            <li><Link to="/languages">تعليم اللغات</Link></li>
                            <li><Link to="/trainings">الدورات التكوينية</Link></li>
                            <li><Link to="/contact">اتصل بنا</Link></li>
                        </ul>
                    </div>

                    {/* Working hours */}
                    <div className="footer-section">
                        <h3>ساعات العمل</h3>
                        <div className="footer-contact-item">
                            <Clock className="footer-contact-icon" aria-hidden="true" />
                            <span>السبت – الخميس: 8:00 ص – 8:00 م</span>
                        </div>
                        <p className="footer-closed">الجمعة: مغلق</p>
                        <div className="footer-account-cta">
                            <Link to="/register" className="footer-cta-link">إنشاء حساب </Link>
                            <span className="footer-cta-sep">|</span>
                            <Link to="/login" className="footer-cta-link">تسجيل الدخول</Link>
                        </div>
                    </div>
                </div>

                <div className="footer-bottom">
                    <p>&copy; {currentYear} Trust School Amara. جميع الحقوق محفوظة</p>
                    <Link to="/internal-rules" className="footer-rules-link">القواعد الداخلية</Link>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
