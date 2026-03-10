import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="container">
                <div className="footer-content">
                    <div className="footer-section">
                        <h3>معلومات الاتصال</h3>
                        <p>العنوان: الجزائر, بومرداس</p>
                        <p>الهاتف: 0554562997</p>
                        <p>البريد الإلكتروني: trustschoolamara@gmail.com</p>
                    </div>
                    <div className="footer-section">
                        <h3>روابط سريعة</h3>
                        <ul>
                            <li><Link to="/">الرئيسية</Link></li>
                            <li><Link to="/support">دروس الدعم</Link></li>
                            <li><Link to="/languages">تعليم اللغات</Link></li>
                            <li><Link to="/formation">الدورات التكوينية</Link></li>
                        </ul>
                    </div>
                    <div className="footer-section">
                        <h3>ساعات العمل</h3>
                        <p>السبت - الخميس: 8 صباحاً - 8 مساءً</p>
                        <p>الجمعة: مغلق</p>
                    </div>
                </div>
                <div className="footer-bottom">
                    <p>&copy; 2026 مدرسة التميز. جميع الحقوق محفوظة</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
