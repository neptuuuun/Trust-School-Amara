import React, { useState } from 'react';
import { MapPin, Phone, Mail, Clock, MessageCircle, Wrench, Building2 } from 'lucide-react';
import FAQItem from '../components/FAQItem';
import { useBranch } from '../contexts/BranchContext';
import { createContactMessage } from '../services/firestoreService';
import { useWebsiteSettings } from '../contexts/WebsiteSettingsContext';

// ─── Developer contact details ─────────────────────────────────────
const DEV_WHATSAPP = '+213783215507';
const DEV_EMAIL    = 'marouabenzaoui48@gmail.com';
const DEV_PHONE    = '0783 21 55 07';
// ───────────────────────────────────────────────────────────────────

// Build a `tel:` href from a display phone number, and a Google Maps embed URL
// from a free-text address (reliable for any query, unlike a stored share link).
const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
const mapEmbed = (q) => `https://www.google.com/maps?q=${encodeURIComponent(q || '')}&output=embed`;

// Alternate the two brand accents across branch cards. Full literal class strings
// (not `bg-${accent}`) so Tailwind's JIT keeps them in the compiled CSS.
const ACCENTS = [
    {
        panel: 'bg-gradient-to-br from-primary/10 to-primary/5',
        iconWrap: 'bg-primary/20',
        icon: 'text-primary',
        title: 'text-primary',
        button: 'bg-primary hover:bg-primary-600',
    },
    {
        panel: 'bg-gradient-to-br from-secondary/10 to-secondary/5',
        iconWrap: 'bg-secondary/20',
        icon: 'text-secondary',
        title: 'text-secondary',
        button: 'bg-secondary hover:bg-secondary-600',
    },
];

const ContactPage = () => {
    const { selectedBranchId } = useBranch();
    const { settings } = useWebsiteSettings();
    const { contact, branches, faq } = settings;

    // FAQ is fully CMS-driven (owner-managed, stored in Firestore). Only VISIBLE
    // items (isVisible === true) count — the section below renders solely when at
    // least one exists, so an all-hidden or empty list hides the section entirely.
    // The public endpoint already returns visible items sorted by `order`; we
    // filter/sort again defensively so nothing hidden or out-of-order slips through.
    const faqItems = (Array.isArray(faq) ? faq : [])
        .filter((f) => f && f.isVisible === true && f.question && f.answer)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));


    return (
        <div className="contact-page py-16 px-6 md:px-12 bg-gradient-to-b from-gray-50 to-white min-h-screen" dir="rtl">
            <div className="container mx-auto max-w-7xl">

                {/* ── Enhanced Hero Section ── */}
                <div className="text-center mb-16 md:mb-20">
                    <h1 className="text-5xl md:text-6xl font-bold text-primary mb-6 leading-tight">اتصل بنا</h1>
                    <p className="text-xl text-gray-600 max-w-4xl mx-auto leading-relaxed font-medium">
                        نحن هنا لمساعدتك في رحلتك التعليمية. تواصل معنا مباشرة في أي من فروعنا أو عبر القنوات المتاحة
                    </p>
                </div>

                {/* ══════════════════════════════════════════
                    PRIMARY CONTACT SECTION - معلومات المركز
                    (full width — the single dominant focal point)
                ══════════════════════════════════════════ */}
                <div className="mb-16">
                    <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col border border-gray-100">
                        {/* Prominent Header */}
                        <div className="bg-gradient-to-l from-primary via-primary to-primary-700 p-8 md:p-10 flex items-start gap-6">
                            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 shrink-0">
                                <Building2 className="w-10 h-10 text-white" />
                            </div>
                            <div>
                                <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">معلومات المركز</h2>
                                <p className="text-primary-50 text-base md:text-lg font-medium">تواصل مباشر مع إدارة المدرسة</p>
                            </div>
                        </div>

                        {/* Rich Contact Body */}
                        <div className="p-8 md:p-10 flex flex-col gap-6">

                            {/* Intro text */}
                            <p className="text-gray-700 text-base md:text-lg leading-relaxed">
                                للاستفسار عن الدورات، المواعيد، التسجيل، الرسوم، أو أي معلومات عن المركز، تواصل معنا مباشرة:
                            </p>

                            {/* Contact items grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Phone - Primary CTA */}
                                {contact.phone && (
                                    <a href={telHref(contact.phone)}
                                       className="group bg-gradient-to-l from-primary/5 to-primary/10 flex items-center gap-6 p-6 rounded-2xl border-2 border-primary/20 hover:border-primary hover:bg-primary/10 transition-all duration-300 hover:shadow-lg">
                                        <div className="bg-primary rounded-xl p-4 group-hover:scale-110 transition-transform duration-300">
                                            <Phone className="w-7 h-7 text-white" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">رقم الهاتف</p>
                                            <p className="text-3xl font-bold text-primary tracking-wide" dir="ltr">{contact.phone}</p>
                                            <p className="text-sm text-gray-600 mt-1">متاح لكلا الفرعين • اتصل مباشرة</p>
                                        </div>
                                    </a>
                                )}

                                {/* Email - Secondary CTA */}
                                {contact.email && (
                                    <a href={`mailto:${contact.email}`}
                                       className="group flex items-center gap-6 p-6 rounded-2xl border-2 border-gray-100 hover:border-primary hover:bg-primary/5 transition-all duration-300 hover:shadow-lg">
                                        <div className="bg-primary-100 group-hover:bg-primary rounded-xl p-4 transition-colors duration-300">
                                            <Mail className="w-7 h-7 text-primary group-hover:text-white transition-colors duration-300" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">البريد الإلكتروني</p>
                                            <p className="text-lg font-bold text-gray-800 truncate" dir="ltr">{contact.email}</p>
                                            <p className="text-sm text-gray-600 mt-1">سنرد على رسالتك في أقرب وقت</p>
                                        </div>
                                    </a>
                                )}
                            </div>

                            {/* Hours - Highlighted */}
                            {contact.workingHours && (
                                <div className="bg-gradient-to-l from-warning/10 to-warning/5 flex items-center gap-6 p-6 rounded-2xl border-2 border-warning/20">
                                    <div className="bg-warning/20 rounded-xl p-4">
                                        <Clock className="w-7 h-7 text-warning-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">ساعات العمل</p>
                                        <p className="text-2xl font-bold text-warning-600">{contact.workingHours}</p>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>

                {/* ── LOCATIONS SECTION ── */}
                <div className="mb-16">
                    <div className="text-center mb-12">
                        <h2 className="text-4xl md:text-5xl font-bold text-primary mb-4">مواقعنا</h2>
                        <p className="text-gray-600 text-lg">زر أحد فروعنا الآن</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {branches.map((branch, index) => {
                            const accent = ACCENTS[index % ACCENTS.length];
                            const mapsLink = branch.mapsLink || `https://maps.google.com/?q=${encodeURIComponent(branch.address || branch.name)}`;
                            return (
                                <div key={branch.id || index} className="bg-white rounded-3xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 border border-gray-100">
                                    <div className={`${accent.panel} p-8 md:p-10`}>
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className={`${accent.iconWrap} rounded-2xl p-4`}>
                                                <MapPin className={`w-8 h-8 ${accent.icon}`} />
                                            </div>
                                            <h3 className={`text-2xl md:text-3xl font-bold ${accent.title}`}>{branch.name}</h3>
                                        </div>
                                        {branch.address && (
                                            <p className="text-lg text-gray-700 font-semibold mb-4">{branch.address}</p>
                                        )}
                                        {branch.phone && (
                                            <a href={telHref(branch.phone)} className="inline-flex items-center gap-2 text-gray-700 font-semibold mb-6 hover:text-primary transition-colors" dir="ltr">
                                                <Phone className="w-5 h-5" />
                                                {branch.phone}
                                            </a>
                                        )}
                                        <div className="bg-white rounded-2xl p-2 mb-6 overflow-hidden shadow-md">
                                            <iframe
                                                src={mapEmbed(branch.address || branch.name)}
                                                width="100%" height="250"
                                                style={{ border: 0 }}
                                                allowFullScreen="" loading="lazy"
                                                title={`Trust School Amara - ${branch.name}`}
                                            />
                                        </div>
                                        <a
                                            href={mapsLink}
                                            target="_blank" rel="noopener noreferrer"
                                            className={`inline-flex items-center w-full justify-center gap-2 ${accent.button} text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 hover:shadow-lg`}
                                        >
                                            <MapPin className="w-5 h-5" />
                                            عرض على خرائط جوجل
                                        </a>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                           
                {/* ── FAQ SECTION (fully CMS-driven from Firestore) ──
                    Rendered ONLY when at least one VISIBLE FAQ exists. With zero
                    visible items the entire section — title, subtitle, and card —
                    is omitted from the tree, so the page flows as if it never
                    existed (no empty state, no reserved whitespace). It reappears
                    automatically once the owner adds/shows a FAQ. */}
                {faqItems.length > 0 && (
                    <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-3xl border border-gray-100 p-8 md:p-12 mb-12">
                        <div className="max-w-4xl mx-auto">
                            <div className="text-center mb-12">
                                <h2 className="text-4xl md:text-5xl font-bold text-primary mb-4">الأسئلة الشائعة</h2>
                                <p className="text-gray-600 text-lg">إجابات سريعة على أكثر الأسئلة التي نتلقاها</p>
                            </div>
                            <div className="space-y-4">
                                {faqItems.map((item) => (
                                    <FAQItem key={item.id} question={item.question} answer={item.answer} />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════
                    AUXILIARY : الدعم التقني
                    (compact helper block — minimal visual weight,
                     deliberately placed last; not a primary contact path)
                ══════════════════════════════════════════ */}
                <div className="max-w-3xl mx-auto">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 md:p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            {/* Label */}
                            <div className="flex items-start gap-3 flex-1">
                                <Wrench className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                                <div>
                                    <h3 className="text-sm font-bold text-gray-700 mb-1">الدعم التقني للموقع</h3>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        تواجه مشكلة في تسجيل الدخول، إنشاء حساب، أو خطأ في الموقع؟ تواصل مع الدعم التقني.
                                    </p>
                                </div>
                            </div>

                            {/* Compact text links */}
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
                                <a href={`https://wa.me/${DEV_WHATSAPP}`}
                                   target="_blank" rel="noopener noreferrer"
                                   className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-green-600 transition-colors">
                                    <MessageCircle className="w-4 h-4" />
                                    واتساب
                                </a>
                                <span className="text-gray-300">•</span>
                                <a href={`mailto:${DEV_EMAIL}`}
                                   className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors">
                                    <Mail className="w-4 h-4" />
                                    البريد
                                </a>
                                {DEV_PHONE && (
                                    <>
                                        <span className="text-gray-300">•</span>
                                        <a href={`tel:${DEV_PHONE}`}
                                           className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors">
                                            <Phone className="w-4 h-4" />
                                            <span dir="ltr">{DEV_PHONE}</span>
                                        </a>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ContactPage;