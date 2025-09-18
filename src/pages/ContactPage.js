import React from 'react';
import { MapPin, Phone, Mail, Clock } from 'lucide-react';
import FAQItem from '../components/FAQItem';

const ContactPage = () => {
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
                {/* Hero Section */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">اتصل بنا</h1>
                    <p className="text-lg text-gray-700 max-w-3xl mx-auto leading-relaxed">
                        نحن هنا لمساعدتك في رحلتك التعليمية. تواصل معنا في أي من فروعنا أو عبر وسائل التواصل المختلفة
                    </p>
                </div>

                {/* Main Contact Section - School Addresses */}
                <div className="bg-white rounded-xl shadow-lg p-8 md:p-12 mb-12">
                    <h2 className="text-3xl font-bold text-primary text-center mb-12">مواقعنا</h2>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                        {/* First Location */}
                        <div className="bg-gradient-to-br from-primary-50 to-primary-100 p-8 rounded-xl shadow-md hover:shadow-lg transition-all duration-300">
                            <div className="text-center mb-6">
                                <MapPin className="w-16 h-16 text-primary mx-auto mb-4" />
                                <h3 className="text-2xl font-bold text-primary mb-3">الفرع الأول</h3>
                                <p className="text-lg text-gray-700 mb-4 font-medium">إقامة يسرف بومرداس مركز المدينة</p>
                                
                                <div className="bg-white rounded-lg p-4 mb-4">
                                    <iframe 
                                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3323.987479674473!2d3.4734!2d36.7538!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzbCsDQ1JzEzLjciTiAzwrAyOCcyNC4yIkU!5e0!3m2!1sen!2sdz!4v1620000000000!5m2!1sen!2sdz" 
                                        width="100%" 
                                        height="200" 
                                        style={{ border: 0, borderRadius: '8px' }} 
                                        allowFullScreen="" 
                                        loading="lazy"
                                        title="Trust School Amara - الفرع الأول"
                                    ></iframe>
                                </div>
                                
                                <a 
                                    href="https://maps.google.com/?q=إقامة+يسرف+بومرداس+مركز+المدينة" 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
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
                                        width="100%" 
                                        height="200" 
                                        style={{ border: 0, borderRadius: '8px' }} 
                                        allowFullScreen="" 
                                        loading="lazy"
                                        title="Trust School Amara - الفرع الثاني"
                                    ></iframe>
                                </div>
                                
                                <a 
                                    href="https://maps.google.com/?q=التعاونية+العقارية+الياسمين+برج+منايل" 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="inline-flex items-center bg-secondary hover:bg-secondary-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-300"
                                >
                                    <MapPin className="w-5 h-5 ml-2" />
                                    عرض على خرائط جوجل
                                </a>
                            </div>
                        </div>
                    </div>
                    
                    {/* Contact Information */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                        <div className="bg-accent-50 p-6 rounded-xl text-center">
                            <Phone className="w-12 h-12 text-accent mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-gray-800 mb-2">الهاتف</h3>
                            <p className="text-2xl font-bold text-accent">0554562997</p>
                            <p className="text-gray-600 text-sm mt-2">متاح لكلا الفرعين</p>
                        </div>
                        
                        <div className="bg-primary-50 p-6 rounded-xl text-center">
                            <Mail className="w-12 h-12 text-primary mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-gray-800 mb-2">البريد الإلكتروني</h3>
                            <p className="text-lg font-semibold text-primary">trustschoolamara@gmail.com</p>
                        </div>
                        
                        <div className="bg-warning-50 p-6 rounded-xl text-center">
                            <Clock className="w-12 h-12 text-warning mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-gray-800 mb-2">ساعات العمل</h3>
                            <p className="text-gray-700 font-medium">السبت - الخميس</p>
                            <p className="text-lg font-bold text-warning">8:00 ص - 8:00 م</p>
                        </div>
                    </div>
                </div>

                {/* FAQ Section */}
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
