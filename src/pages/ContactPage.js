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
        <div className="contact-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
            <div className="container mx-auto max-w-6xl">

                {/* ── Hero ── */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">اتصل بنا</h1>
                    <p className="text-lg text-gray-700 max-w-3xl mx-auto leading-relaxed">
                        نحن هنا لمساعدتك في رحلتك التعليمية. تواصل معنا في أي من فروعنا أو عبر وسائل التواصل المختلفة
                    </p>
                </div>

                {/* ══════════════════════════════════════════
                    TWO-COLUMN CONTACT CARDS
                ══════════════════════════════════════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">

                    {/* ── Card 1 : معلومات المركز ── */}
                    <div className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
                        {/* Card header */}
                        <div className="bg-gradient-to-l from-primary to-primary-700 p-6 flex items-center gap-4">
                            <div className="bg-white/20 rounded-xl p-3">
                                <Building2 className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">معلومات المركز</h2>
                                <p className="text-primary-100 text-sm mt-1">للاستفسار عن الدورات، المواعيد، والتسجيل</p>
                            </div>
                        </div>

                        {/* Card body */}
                        <div className="p-6 flex flex-col gap-5 flex-1">
                            {/* Phone */}
                            <a href="tel:0554562997"
                               className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-primary hover:bg-primary-50 transition-all duration-200">
                                <div className="bg-primary-100 group-hover:bg-primary rounded-lg p-3 transition-colors duration-200">
                                    <Phone className="w-6 h-6 text-primary group-hover:text-white transition-colors duration-200" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">الهاتف</p>
                                    <p className="text-xl font-bold text-gray-800 tracking-wide" dir="ltr">0554 56 29 97</p>
                                    <p className="text-xs text-gray-400 mt-0.5">متاح لكلا الفرعين</p>
                                </div>
                            </a>

                            {/* Email */}
                            <a href="mailto:trustschoolamara@gmail.com"
                               className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-primary hover:bg-primary-50 transition-all duration-200">
                                <div className="bg-primary-100 group-hover:bg-primary rounded-lg p-3 transition-colors duration-200">
                                    <Mail className="w-6 h-6 text-primary group-hover:text-white transition-colors duration-200" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">البريد الإلكتروني</p>
                                    <p className="text-base font-semibold text-gray-800" dir="ltr">trustschoolamara@gmail.com</p>
                                </div>
                            </a>

                            {/* Hours */}
                            <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-warning-50">
                                <div className="bg-warning-100 rounded-lg p-3">
                                    <Clock className="w-6 h-6 text-warning" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">ساعات العمل</p>
                                    <p className="font-semibold text-gray-800">السبت – الخميس</p>
                                    <p className="text-lg font-bold text-warning" dir="ltr">8:00 ص – 8:00 م</p>
                                </div>
                            </div>

                            {/* Branches summary */}
                            <div className="mt-auto pt-4 border-t border-gray-100">
                                <p className="text-sm font-semibold text-gray-600 mb-3">فروعنا</p>
                                <div className="space-y-2">
                                    <div className="flex items-start gap-2">
                                        <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                                        <p className="text-sm text-gray-700">إقامة يسرف، بومرداس – مركز المدينة</p>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <MapPin className="w-4 h-4 text-secondary mt-0.5 shrink-0" />
                                        <p className="text-sm text-gray-700">التعاونية العقارية الياسمين، برج منايل</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Card 2 : الدعم التقني ── */}
                    <div className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
                        {/* Card header */}
                        <div className="bg-gradient-to-l from-slate-700 to-slate-900 p-6 flex items-center gap-4">
                            <div className="bg-white/20 rounded-xl p-3">
                                <Wrench className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">الدعم التقني</h2>
                                <p className="text-slate-300 text-sm mt-1">لمشاكل الموقع، تسجيل الدخول، ولوحة التحكم</p>
                            </div>
                        </div>

                        {/* Card body */}
                        <div className="p-6 flex flex-col gap-5 flex-1">

                            {/* Notice banner */}
                            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                                <div className="text-sm text-amber-800 leading-relaxed">
                                    <p className="font-semibold mb-1">تواصل مع الدعم التقني إذا واجهتَ:</p>
                                    <ul className="space-y-1 list-none">
                                        {[
                                            'مشاكل في التسجيل أو إنشاء حساب',
                                            'مشاكل في تسجيل الدخول',
                                            'أخطاء أو عطل في الموقع',
                                            'مشكلة في لوحة التحكم',
                                        ].map((item, i) => (
                                            <li key={i} className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* WhatsApp */}
                            <a href={`https://wa.me/${DEV_WHATSAPP}`}
                               target="_blank" rel="noopener noreferrer"
                               className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-green-500 hover:bg-green-50 transition-all duration-200">
                                <div className="bg-green-100 group-hover:bg-green-500 rounded-lg p-3 transition-colors duration-200">
                                    <MessageCircle className="w-6 h-6 text-green-600 group-hover:text-white transition-colors duration-200" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">واتساب</p>
                                    <p className="text-base font-bold text-gray-800" dir="ltr">{DEV_WHATSAPP}</p>
                                    <p className="text-xs text-green-600 mt-0.5">تواصل مباشر عبر واتساب</p>
                                </div>
                            </a>

                            {/* Dev Email */}
                            <a href={`mailto:${DEV_EMAIL}`}
                               className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-slate-700 hover:bg-slate-50 transition-all duration-200">
                                <div className="bg-slate-100 group-hover:bg-slate-700 rounded-lg p-3 transition-colors duration-200">
                                    <Mail className="w-6 h-6 text-slate-600 group-hover:text-white transition-colors duration-200" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">البريد الإلكتروني</p>
                                    <p className="text-base font-semibold text-gray-800" dir="ltr">{DEV_EMAIL}</p>
                                </div>
                            </a>

                            {/* Optional dev phone */}
                            {DEV_PHONE && (
                                <a href={`tel:${DEV_PHONE}`}
                                   className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-slate-700 hover:bg-slate-50 transition-all duration-200">
                                    <div className="bg-slate-100 group-hover:bg-slate-700 rounded-lg p-3 transition-colors duration-200">
                                        <Phone className="w-6 h-6 text-slate-600 group-hover:text-white transition-colors duration-200" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">الهاتف</p>
                                        <p className="text-xl font-bold text-gray-800" dir="ltr">{DEV_PHONE}</p>
                                    </div>
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Locations / Maps ── */}
                <div className="bg-white rounded-xl shadow-lg p-8 md:p-12 mb-12">
                    <h2 className="text-3xl font-bold text-primary text-center mb-12">مواقعنا</h2>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* First Location */}
                        <div className="bg-gradient-to-br from-primary-50 to-primary-100 p-8 rounded-xl shadow-md hover:shadow-lg transition-all duration-300">
                            <div className="text-center mb-6">
                                <MapPin className="w-16 h-16 text-primary mx-auto mb-4" />
                                <h3 className="text-2xl font-bold text-primary mb-3">الفرع الأول</h3>
                                <p className="text-lg text-gray-700 mb-4 font-medium">إقامة يسرف بومرداس مركز المدينة</p>
                                <div className="bg-white rounded-lg p-4 mb-4">
                                    <iframe
                                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3323.987479674473!2d3.4734!2d36.7538!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzbCsDQ1JzEzLjciTiAzwrAyOCcyNC4yIkU!5e0!3m2!1sen!2sdz!4v1620000000000!5m2!1sen!2sdz"
                                        width="100%" height="200"
                                        style={{ border: 0, borderRadius: '8px' }}
                                        allowFullScreen="" loading="lazy"
                                        title="Trust School Amara - الفرع الأول"
                                    />
                                </div>
                                <a
                                    href="https://maps.google.com/?q=إقامة+يسرف+بومرداس+مركز+المدينة"
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center bg-primary hover:bg-primary-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-300"
                                >
                                    <MapPin className="w-5 h-5 ml-2" />
                                    عرض على خرائط جوجل
                                </a>
                            </div>
                        </div>

                        {/* Second Location */}
                        <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 p-8 rounded-xl shadow-md hover:shadow-lg transition-all duration-300">
                            <div className="text-center mb-6">
                                <MapPin className="w-16 h-16 text-secondary mx-auto mb-4" />
                                <h3 className="text-2xl font-bold text-secondary mb-3">الفرع الثاني</h3>
                                <p className="text-lg text-gray-700 mb-4 font-medium">التعاونية العقارية الياسمين برج منايل</p>
                                <div className="bg-white rounded-lg p-4 mb-4">
                                    <iframe
                                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3323.987479674473!2d3.4734!2d36.7538!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzbCsDQ1JzEzLjciTiAzwrAyOCcyNC4yIkU!5e0!3m2!1sen!2sdz!4v1620000000001!5m2!1sen!2sdz"
                                        width="100%" height="200"
                                        style={{ border: 0, borderRadius: '8px' }}
                                        allowFullScreen="" loading="lazy"
                                        title="Trust School Amara - الفرع الثاني"
                                    />
                                </div>
                                <a
                                    href="https://maps.google.com/?q=التعاونية+العقارية+الياسمين+برج+منايل"
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center bg-secondary hover:bg-secondary-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-300"
                                >
                                    <MapPin className="w-5 h-5 ml-2" />
                                    عرض على خرائط جوجل
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
                           
                {/* ── FAQ ── */}
                <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
                    <h2 className="text-3xl font-bold text-primary text-center mb-8">الأسئلة الشائعة</h2>
                    <div className="max-w-4xl mx-auto space-y-4">
                        {faqItems.map((item, index) => (
                            <FAQItem key={index} question={item.question} answer={item.answer} />
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ContactPage;