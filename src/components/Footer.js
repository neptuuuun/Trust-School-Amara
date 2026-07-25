import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, Clock, MapPin, Facebook, Instagram } from 'lucide-react';
import { useWebsiteSettings } from '../contexts/WebsiteSettingsContext';
import { SOCIAL_PLATFORMS } from '../config/websiteDefaults';

// Map the platform registry's icon names to concrete lucide components. Adding a
// new platform is just an entry in SOCIAL_PLATFORMS + one line here.
const SOCIAL_ICONS = { Facebook, Instagram };

// Build a `tel:` href from a display phone number (strip spaces/formatting).
const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;

const Footer = () => {
    const currentYear = new Date().getFullYear();
    const { settings } = useWebsiteSettings();
    const { contact, social } = settings;

    // Only platforms with a valid (non-empty) link are shown.
    const activeSocials = SOCIAL_PLATFORMS
        .map((p) => ({ ...p, url: social[p.key] }))
        .filter((p) => p.url && SOCIAL_ICONS[p.icon]);

    return (
        <footer className="footer" dir="rtl">
            <div className="container">
                <div className="footer-content">
                    {/* Contact info */}
                    <div className="footer-section">
                        <h3>معلومات الاتصال</h3>
                        {contact.address && (
                            <div className="footer-contact-item">
                                <MapPin className="footer-contact-icon" aria-hidden="true" />
                                <span>{contact.address}</span>
                            </div>
                        )}
                        {contact.phone && (
                            <div className="footer-contact-item">
                                <Phone className="footer-contact-icon" aria-hidden="true" />
                                <a href={telHref(contact.phone)} className="footer-contact-link" dir="ltr">{contact.phone}</a>
                            </div>
                        )}
                        {contact.email && (
                            <div className="footer-contact-item">
                                <Mail className="footer-contact-icon" aria-hidden="true" />
                                <a href={`mailto:${contact.email}`} className="footer-contact-link" dir="ltr">
                                    {contact.email}
                                </a>
                            </div>
                        )}

                        {/* Social icons — only rendered when a valid link exists */}
                        {activeSocials.length > 0 && (
                            <div className="footer-social" style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                                {activeSocials.map((p) => {
                                    const Icon = SOCIAL_ICONS[p.icon];
                                    return (
                                        <a
                                            key={p.key}
                                            href={p.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={p.label}
                                            className="footer-social-link"
                                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <Icon className="footer-contact-icon" aria-hidden="true" />
                                        </a>
                                    );
                                })}
                            </div>
                        )}
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
                        {contact.workingHours && (
                            <div className="footer-contact-item">
                                <Clock className="footer-contact-icon" aria-hidden="true" />
                                <span>{contact.workingHours}</span>
                            </div>
                        )}
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
