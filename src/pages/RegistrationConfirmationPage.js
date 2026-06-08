import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, User, Mail, Phone, BookOpen, GraduationCap, Calendar, CreditCard } from 'lucide-react';
import { formatDateTime } from '../utils/dateUtils';

const RegistrationConfirmationPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const registrationData = location.state?.registrationData;

    if (!registrationData) {
        navigate('/');
        return null;
    }

    const getPaymentMethodName = (method) => {
        const methods = {
            'edahabia': 'الذهبية (Edahabia)',
            'ccp': 'الحساب الجاري البريدي (CCP)',
            'baridimob': 'بريدي موب (BaridiMob)'
        };
        return methods[method] || method;
    };

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-6 md:px-12" dir="rtl">
            <div className="container mx-auto max-w-2xl">
                {/* Success Header */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-12 h-12 text-green-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-green-700 mb-2">تم التسجيل بنجاح!</h1>
                    <p className="text-gray-600 text-lg">
                        شكراً لك على التسجيل في Trust School Amara
                    </p>
                </div>

                {/* Registration Details Card */}
                <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                    <h2 className="text-2xl font-bold text-blue-700 mb-6 text-center">تفاصيل التسجيل</h2>
                    
                    <div className="space-y-4">
                        {/* Personal Information */}
                        <div className="border-b border-gray-200 pb-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-3">البيانات الشخصية</h3>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="flex items-center">
                                    <User className="w-5 h-5 text-blue-600 ml-3" />
                                    <span className="font-medium ml-2">الاسم:</span>
                                    <span>{registrationData.fullName}</span>
                                </div>
                                <div className="flex items-center">
                                    <Mail className="w-5 h-5 text-blue-600 ml-3" />
                                    <span className="font-medium ml-2">البريد الإلكتروني:</span>
                                    <span>{registrationData.email}</span>
                                </div>
                                <div className="flex items-center">
                                    <Phone className="w-5 h-5 text-blue-600 ml-3" />
                                    <span className="font-medium ml-2">رقم الهاتف:</span>
                                    <span>{registrationData.phone}</span>
                                </div>
                            </div>
                        </div>

                        {/* Course Information */}
                        <div className="border-b border-gray-200 pb-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-3">معلومات الدورة</h3>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="flex items-center">
                                    <BookOpen className="w-5 h-5 text-blue-600 ml-3" />
                                    <span className="font-medium ml-2">الدورة:</span>
                                    <span>{registrationData.course}</span>
                                </div>
                                {registrationData.level && (
                                    <div className="flex items-center">
                                        <GraduationCap className="w-5 h-5 text-blue-600 ml-3" />
                                        <span className="font-medium ml-2">المستوى:</span>
                                        <span>{registrationData.level}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Registration Information */}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-3">معلومات التسجيل</h3>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="flex items-center">
                                    <Calendar className="w-5 h-5 text-blue-600 ml-3" />
                                    <span className="font-medium ml-2">تاريخ التسجيل:</span>
                                    <span>{formatDateTime(registrationData.registrationDate)}</span>
                                </div>
                                <div className="flex items-center">
                                    <CreditCard className="w-5 h-5 text-blue-600 ml-3" />
                                    <span className="font-medium ml-2">طريقة الدفع:</span>
                                    <span>{getPaymentMethodName(registrationData.paymentMethod)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Next Steps */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
                    <h3 className="text-lg font-bold text-blue-800 mb-4">الخطوات التالية</h3>
                    <ul className="space-y-2 text-blue-700">
                        <li className="flex items-start">
                            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold ml-3 mt-0.5">1</span>
                            <span>ستتلقى رسالة تأكيد على بريدك الإلكتروني خلال 24 ساعة</span>
                        </li>
                        <li className="flex items-start">
                            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold ml-3 mt-0.5">2</span>
                            <span>سيتم التواصل معك هاتفياً لتحديد مواعيد الحصص</span>
                        </li>
                        <li className="flex items-start">
                            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold ml-3 mt-0.5">3</span>
                            <span>احتفظ بهذه الصفحة كمرجع لبيانات التسجيل</span>
                        </li>
                    </ul>
                </div>

                {/* Contact Information */}
                <div className="bg-gray-100 rounded-xl p-6 mb-8">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">للاستفسارات والمساعدة</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700">
                        <div>
                            <p className="font-medium">الهاتف:</p>
                            <p>0555 123 456</p>
                        </div>
                        <div>
                            <p className="font-medium">البريد الإلكتروني:</p>
                            <p>info@trustschoolamara.dz</p>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <button
                        onClick={() => window.print()}
                        className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        طباعة التأكيد
                    </button>
                    <button
                        onClick={() => navigate('/')}
                        className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        العودة للصفحة الرئيسية
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RegistrationConfirmationPage;
