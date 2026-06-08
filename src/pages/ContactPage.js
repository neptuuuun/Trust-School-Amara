import React, { useState } from 'react';
import { MapPin, Phone, Mail, Clock, Send, CheckCircle, AlertCircle, MessageCircle, Wrench, Building2, ChevronDown } from 'lucide-react';
import FAQItem from '../components/FAQItem';
import { useBranch } from '../contexts/BranchContext';
import { createContactMessage } from '../services/firestoreService';

// ─── Developer contact details ─────────────────────────────────────
const DEV_WHATSAPP = '+213783215507';  
const DEV_EMAIL    = 'marouabenzaoui48@gmail.com';
const DEV_PHONE    = '0783 21 55 07';  
// ───────────────────────────────────────────────────────────────────

const ContactPage = () => {
    const { selectedBranchId } = useBranch();

    const faqItems = [
        {
            question: 'ما هي مواعيد الدوام في المدرسة؟',
            answer: 'الدوام من السبت إلى الخميس من 8 صباحاً حتى 8 مساءً. الجمعة عطلة.'
        },
        {
            question: 'كيف يمكنني التسجيل في الدورات؟',
            answer: 'يمكنك التسجيل عبر الموقع أو زيارة المدرسة مباشرة.'
        },
        {
            question: 'هل توجد إمكانية للدفع بالتقسيط؟',
            answer: 'نعم، نوفر خيارات دفع مرنة ومتنوعة لتناسب جميع الطلاب.'
        }
    ];


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
                    SECONDARY SUPPORT SECTION - الدعم التقني
                ══════════════════════════════════════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">

                    {/* ── PRIMARY : معلومات المركز (2 columns on desktop) ── */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col h-full border border-gray-100">
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
                            <div className="p-8 md:p-10 flex flex-col gap-6 flex-1">

                                {/* Intro text */}
                                <p className="text-gray-700 text-base leading-relaxed">
                                    للاستفسار عن الدورات، المواعيد، التسجيل، الرسوم، أو أي معلومات عن المركز، تواصل معنا مباشرة:
                                </p>

                                {/* Phone - Primary CTA */}
                                <a href="tel:0554562997"
                                   className="group bg-gradient-to-l from-primary/5 to-primary/10 flex items-center gap-6 p-6 rounded-2xl border-2 border-primary/20 hover:border-primary hover:bg-primary/10 transition-all duration-300 hover:shadow-lg">
                                    <div className="bg-primary rounded-xl p-4 group-hover:scale-110 transition-transform duration-300">
                                        <Phone className="w-7 h-7 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">رقم الهاتف</p>
                                        <p className="text-3xl font-bold text-primary tracking-wide" dir="ltr">0554 56 29 97</p>
                                        <p className="text-sm text-gray-600 mt-1">متاح لكلا الفرعين • اتصل مباشرة</p>
                                    </div>
                                </a>

                                {/* Email - Secondary CTA */}
                                <a href="mailto:trustschoolamara@gmail.com"
                                   className="group flex items-center gap-6 p-6 rounded-2xl border-2 border-gray-100 hover:border-primary hover:bg-primary/5 transition-all duration-300 hover:shadow-lg">
                                    <div className="bg-primary-100 group-hover:bg-primary rounded-xl p-4 transition-colors duration-300">
                                        <Mail className="w-7 h-7 text-primary group-hover:text-white transition-colors duration-300" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">البريد الإلكتروني</p>
                                        <p className="text-lg font-bold text-gray-800" dir="ltr">trustschoolamara@gmail.com</p>
                                        <p className="text-sm text-gray-600 mt-1">سنرد على رسالتك في أقرب وقت</p>
                                    </div>
                                </a>

                                {/* Hours - Highlighted */}
                                <div className="bg-gradient-to-l from-warning/10 to-warning/5 flex items-center gap-6 p-6 rounded-2xl border-2 border-warning/20">
                                    <div className="bg-warning/20 rounded-xl p-4">
                                        <Clock className="w-7 h-7 text-warning-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">ساعات العمل</p>
                                        <p className="text-base font-bold text-gray-800 mb-0.5">السبت – الخميس</p>
                                        <p className="text-2xl font-bold text-warning-600" dir="ltr">8:00 ص – 8:00 م</p>
                                    </div>
                                </div>

                                {/* Branches Section */}
                                <div className="pt-6 border-t-2 border-gray-100">
                                    <h3 className="text-lg font-bold text-gray-800 mb-5">مواقعنا</h3>
                                    <div className="space-y-4">
                                        <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 hover:bg-primary/5 transition-colors duration-200">
                                            <MapPin className="w-5 h-5 text-primary mt-1 shrink-0" />
                                            <div>
                                                <p className="font-semibold text-gray-800 mb-0.5">الفرع الأول</p>
                                                <p className="text-sm text-gray-600">إقامة يسرف، بومرداس – مركز المدينة</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 hover:bg-secondary/5 transition-colors duration-200">
                                            <MapPin className="w-5 h-5 text-secondary mt-1 shrink-0" />
                                            <div>
                                                <p className="font-semibold text-gray-800 mb-0.5">الفرع الثاني</p>
                                                <p className="text-sm text-gray-600">التعاونية العقارية الياسمين، برج منايل</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>

                    {/* ── SECONDARY : الدعم التقني (1 column on desktop) ── */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-3xl shadow-lg overflow-hidden flex flex-col h-full border border-gray-100 sticky top-6">
                            {/* Compact Header */}
                            <div className="bg-gradient-to-l from-slate-600 to-slate-700 p-6 flex items-start gap-4">
                                <div className="bg-white/10 rounded-lg p-3 shrink-0">
                                    <Wrench className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-1">الدعم التقني</h3>
                                    <p className="text-slate-200 text-xs font-medium">مساعدة تقنية</p>
                                </div>
                            </div>

                            {/* Compact Body */}
                            <div className="p-6 flex flex-col gap-4 flex-1">

                                {/* Subtle Notice */}
                                <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-lg p-3">
                                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                    <div className="text-xs text-amber-700 leading-relaxed">
                                        <p className="font-semibold mb-1">مشاكل تقنية؟</p>
                                        <ul className="space-y-0.5 list-none text-xs">
                                            {[
                                                'تسجيل الدخول',
                                                'إنشاء حساب',
                                                'أخطاء الموقع',
                                                'لوحة التحكم',
                                            ].map((item, i) => (
                                                <li key={i} className="flex items-center gap-1.5">
                                                    <span className="w-1 h-1 rounded-full bg-amber-600 shrink-0" />
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                {/* WhatsApp */}
                                <a href={`https://wa.me/${DEV_WHATSAPP}`}
                                   target="_blank" rel="noopener noreferrer"
                                   className="group flex items-center gap-3 p-4 rounded-lg border border-gray-100 hover:border-green-400 hover:bg-green-50 transition-all duration-200">
                                    <div className="bg-green-100 group-hover:bg-green-500 rounded-lg p-2 transition-colors duration-200">
                                        <MessageCircle className="w-5 h-5 text-green-600 group-hover:text-white transition-colors duration-200" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-gray-500">واتساب</p>
                                        <p className="text-sm font-bold text-gray-800 truncate" dir="ltr">{DEV_WHATSAPP}</p>
                                    </div>
                                </a>

                                {/* Dev Email */}
                                <a href={`mailto:${DEV_EMAIL}`}
                                   className="group flex items-center gap-3 p-4 rounded-lg border border-gray-100 hover:border-slate-600 hover:bg-slate-50 transition-all duration-200">
                                    <div className="bg-slate-100 group-hover:bg-slate-600 rounded-lg p-2 transition-colors duration-200">
                                        <Mail className="w-5 h-5 text-slate-600 group-hover:text-white transition-colors duration-200" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-gray-500">البريد</p>
                                        <p className="text-xs font-bold text-gray-800 truncate" dir="ltr">{DEV_EMAIL}</p>
                                    </div>
                                </a>

                                {/* Dev Phone */}
                                {DEV_PHONE && (
                                    <a href={`tel:${DEV_PHONE}`}
                                       className="group flex items-center gap-3 p-4 rounded-lg border border-gray-100 hover:border-slate-600 hover:bg-slate-50 transition-all duration-200">
                                        <div className="bg-slate-100 group-hover:bg-slate-600 rounded-lg p-2 transition-colors duration-200">
                                            <Phone className="w-5 h-5 text-slate-600 group-hover:text-white transition-colors duration-200" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-gray-500">الهاتف</p>
                                            <p className="text-sm font-bold text-gray-800" dir="ltr">{DEV_PHONE}</p>
                                        </div>
                                    </a>
                                )}

                            </div>
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
                        {/* First Location Card */}
                        <div className="bg-white rounded-3xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 border border-gray-100">
                            <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-8 md:p-10">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="bg-primary/20 rounded-2xl p-4">
                                        <MapPin className="w-8 h-8 text-primary" />
                                    </div>
                                    <h3 className="text-2xl md:text-3xl font-bold text-primary">الفرع الأول</h3>
                                </div>
                                <p className="text-lg text-gray-700 font-semibold mb-6">إقامة يسرف بومرداس مركز المدينة</p>
                                <div className="bg-white rounded-2xl p-2 mb-6 overflow-hidden shadow-md">
                                    <iframe
                                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3323.987479674473!2d3.4734!2d36.7538!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzbCsDQ1JzEzLjciTiAzwrAyOCcyNC4yIkU!5e0!3m2!1sen!2sdz!4v1620000000000!5m2!1sen!2sdz"
                                        width="100%" height="250"
                                        style={{ border: 0 }}
                                        allowFullScreen="" loading="lazy"
                                        title="Trust School Amara - الفرع الأول"
                                    />
                                </div>
                                <a
                                    href="https://maps.google.com/?q=إقامة+يسرف+بومرداس+مركز+المدينة"
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center w-full justify-center gap-2 bg-primary hover:bg-primary-600 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 hover:shadow-lg"
                                >
                                    <MapPin className="w-5 h-5" />
                                    عرض على خرائط جوجل
                                </a>
                            </div>
                        </div>

                        {/* Second Location Card */}
                        <div className="bg-white rounded-3xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 border border-gray-100">
                            <div className="bg-gradient-to-br from-secondary/10 to-secondary/5 p-8 md:p-10">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="bg-secondary/20 rounded-2xl p-4">
                                        <MapPin className="w-8 h-8 text-secondary" />
                                    </div>
                                    <h3 className="text-2xl md:text-3xl font-bold text-secondary">الفرع الثاني</h3>
                                </div>
                                <p className="text-lg text-gray-700 font-semibold mb-6">التعاونية العقارية الياسمين برج منايل</p>
                                <div className="bg-white rounded-2xl p-2 mb-6 overflow-hidden shadow-md">
                                    <iframe
                                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3323.987479674473!2d3.4734!2d36.7538!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzbCsDQ1JzEzLjciTiAzwrAyOCcyNC4yIkU!5e0!3m2!1sen!2sdz!4v1620000000001!5m2!1sen!2sdz"
                                        width="100%" height="250"
                                        style={{ border: 0 }}
                                        allowFullScreen="" loading="lazy"
                                        title="Trust School Amara - الفرع الثاني"
                                    />
                                </div>
                                <a
                                    href="https://maps.google.com/?q=التعاونية+العقارية+الياسمين+برج+منايل"
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center w-full justify-center gap-2 bg-secondary hover:bg-secondary-600 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 hover:shadow-lg"
                                >
                                    <MapPin className="w-5 h-5" />
                                    عرض على خرائط جوجل
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
                           
                {/* ── FAQ SECTION ── */}
                <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-3xl border border-gray-100 p-8 md:p-12">
                    <div className="max-w-4xl mx-auto">
                        <div className="text-center mb-12">
                            <h2 className="text-4xl md:text-5xl font-bold text-primary mb-4">الأسئلة الشائعة</h2>
                            <p className="text-gray-600 text-lg">إجابات سريعة على أكثر الأسئلة التي نتلقاها</p>
                        </div>
                        <div className="space-y-4">
                            {faqItems.map((item, index) => (
                                <FAQItem key={index} question={item.question} answer={item.answer} />
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ContactPage;