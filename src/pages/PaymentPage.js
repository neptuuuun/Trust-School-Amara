import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreditCard, Smartphone, Building2, MessageCircle, Copy, Check } from 'lucide-react';

const PaymentPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { registrationData } = location.state || {};
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
    const [copiedField, setCopiedField] = useState('');

    const paymentInfo = {
        baridiMob: '00799999004285253305',
        ccp: '0043852533',
        key: '05',
        name: 'MAROUA BENZAOUI',
        whatsapp: '213783215507'
    };

    const copyToClipboard = (text, field) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(''), 2000);
    };

    const handleChargilyPayment = () => {
        // Here you would integrate with Chargily Pay API
        // For now, we'll simulate the process
        alert('سيتم توجيهك إلى بوابة Chargily Pay...');
        
        // Simulate redirect to Chargily Pay
        // In real implementation, you would:
        // 1. Create payment session with Chargily API
        // 2. Redirect user to Chargily checkout
        // 3. Handle callback/webhook
        
        // For demo purposes, navigate to confirmation
        setTimeout(() => {
            navigate('/registration-confirmation', {
                state: { 
                    registrationData: {
                        ...registrationData,
                        paymentMethod: 'chargily',
                        paymentStatus: 'completed'
                    }
                }
            });
        }, 2000);
    };

    const handleWhatsAppContact = () => {
        const message = `السلام عليكم، أريد إرسال إيصال الدفع للتسجيل في: ${registrationData?.selectedCourse}
        
الاسم: ${registrationData?.fullName}
البريد الإلكتروني: ${registrationData?.email}
رقم الهاتف: ${registrationData?.phone}`;
        
        const whatsappUrl = `https://wa.me/${paymentInfo.whatsapp}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    if (!registrationData) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-700 mb-4">خطأ في البيانات</h2>
                    <button 
                        onClick={() => navigate('/')}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
                    >
                        العودة للصفحة الرئيسية
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-6 md:px-12" dir="rtl">
            <div className="container mx-auto max-w-4xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl md:text-4xl font-bold text-blue-700 mb-4">الدفع</h1>
                    <p className="text-gray-600">اختر طريقة الدفع المناسبة لك</p>
                </div>

                {/* Registration Summary */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
                    <h3 className="text-xl font-bold text-blue-700 mb-4">ملخص التسجيل</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700">
                        <div><span className="font-medium">الاسم:</span> {registrationData.fullName}</div>
                        <div><span className="font-medium">البريد الإلكتروني:</span> {registrationData.email}</div>
                        <div><span className="font-medium">رقم الهاتف:</span> {registrationData.phone}</div>
                        <div><span className="font-medium">الدورة:</span> {registrationData.selectedCourse}</div>
                    </div>
                </div>

                {/* Payment Methods */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Online Payment - Chargily Pay */}
                    <div className="bg-white rounded-xl shadow-lg p-6">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CreditCard className="w-8 h-8 text-blue-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-blue-700 mb-2">الدفع الإلكتروني</h3>
                            <p className="text-gray-600">ادفع بأمان باستخدام Chargily Pay</p>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div className="flex items-center justify-center space-x-4 space-x-reverse">
                                <div className="bg-gray-100 px-4 py-2 rounded-lg">
                                    <span className="text-sm font-medium">CIB</span>
                                </div>
                                <div className="bg-gray-100 px-4 py-2 rounded-lg">
                                    <span className="text-sm font-medium">Edahabia</span>
                                </div>
                            </div>
                            <div className="text-center text-sm text-gray-600">
                                دفع آمن ومضمون عبر البطاقات المصرفية الجزائرية
                            </div>
                        </div>

                        <button
                            onClick={handleChargilyPayment}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors duration-300 flex items-center justify-center"
                        >
                            <CreditCard className="w-5 h-5 ml-2" />
                            الدفع عبر Chargily Pay
                        </button>
                    </div>

                    {/* Manual Payment */}
                    <div className="bg-white rounded-xl shadow-lg p-6">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Smartphone className="w-8 h-8 text-green-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-blue-700 mb-2">الدفع اليدوي</h3>
                            <p className="text-gray-600">BaridiMob أو CCP</p>
                        </div>

                        <div className="space-y-4 mb-6">
                            {/* BaridiMob Card */}
                            <div className="bg-gradient-to-r from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-4">
                                <div className="flex items-center mb-3">
                                    <Smartphone className="w-6 h-6 text-orange-600 ml-2" />
                                    <h4 className="font-bold text-orange-800">Baridi Mob</h4>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-600">رقم الحساب:</span>
                                        <div className="flex items-center">
                                            <span className="font-mono text-sm bg-white px-2 py-1 rounded border">
                                                {paymentInfo.baridiMob}
                                            </span>
                                            <button
                                                onClick={() => copyToClipboard(paymentInfo.baridiMob, 'baridiMob')}
                                                className="mr-2 p-1 text-gray-500 hover:text-gray-700"
                                            >
                                                {copiedField === 'baridiMob' ? 
                                                    <Check className="w-4 h-4 text-green-600" /> : 
                                                    <Copy className="w-4 h-4" />
                                                }
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CCP Card */}
                            <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
                                <div className="flex items-center mb-3">
                                    <Building2 className="w-6 h-6 text-blue-600 ml-2" />
                                    <h4 className="font-bold text-blue-800">CCP</h4>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-600">رقم الحساب:</span>
                                        <div className="flex items-center">
                                            <span className="font-mono text-sm bg-white px-2 py-1 rounded border">
                                                {paymentInfo.ccp}
                                            </span>
                                            <button
                                                onClick={() => copyToClipboard(paymentInfo.ccp, 'ccp')}
                                                className="mr-2 p-1 text-gray-500 hover:text-gray-700"
                                            >
                                                {copiedField === 'ccp' ? 
                                                    <Check className="w-4 h-4 text-green-600" /> : 
                                                    <Copy className="w-4 h-4" />
                                                }
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-600">المفتاح:</span>
                                        <div className="flex items-center">
                                            <span className="font-mono text-sm bg-white px-2 py-1 rounded border">
                                                {paymentInfo.key}
                                            </span>
                                            <button
                                                onClick={() => copyToClipboard(paymentInfo.key, 'key')}
                                                className="mr-2 p-1 text-gray-500 hover:text-gray-700"
                                            >
                                                {copiedField === 'key' ? 
                                                    <Check className="w-4 h-4 text-green-600" /> : 
                                                    <Copy className="w-4 h-4" />
                                                }
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Account Name */}
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-600">اسم صاحب الحساب:</span>
                                    <div className="flex items-center">
                                        <span className="font-semibold text-gray-800">
                                            {paymentInfo.name}
                                        </span>
                                        <button
                                            onClick={() => copyToClipboard(paymentInfo.name, 'name')}
                                            className="mr-2 p-1 text-gray-500 hover:text-gray-700"
                                        >
                                            {copiedField === 'name' ? 
                                                <Check className="w-4 h-4 text-green-600" /> : 
                                                <Copy className="w-4 h-4" />
                                            }
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Instructions */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                            <p className="text-sm text-yellow-800 text-center">
                                بعد إتمام الدفع، أرسل صورة الإيصال مع بريدك الإلكتروني إلى رقم الواتساب
                            </p>
                        </div>

                        {/* WhatsApp Button */}
                        <button
                            onClick={handleWhatsAppContact}
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors duration-300 flex items-center justify-center"
                        >
                            <MessageCircle className="w-5 h-5 ml-2" />
                            إرسال عبر الواتساب: {paymentInfo.whatsapp}
                        </button>
                    </div>
                </div>

                {/* Back Button */}
                <div className="text-center mt-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-8 py-3 rounded-lg transition-colors"
                    >
                        العودة لتعديل البيانات
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentPage;
