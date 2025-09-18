import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { User, Mail, Phone, BookOpen, GraduationCap, CreditCard } from 'lucide-react';

const CourseRegistrationForm = ({ 
    courseName = '', 
    courseType = '', 
    onSubmit, 
    onClose 
}) => {
    const [step, setStep] = useState(1); // 1: Form, 2: Confirmation, 3: Payment
    const [formData, setFormData] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('');

    const { register, handleSubmit, formState: { errors }, watch } = useForm({
        defaultValues: {
            course: courseName,
            level: courseType === 'languages' ? 'A1' : ''
        }
    });

    const courses = {
        'support-lessons': [
            'دروس الدعم - الطور الثانوي',
            'دروس الدعم - الطور المتوسط'
        ],
        'languages': [
            'اللغة الإنجليزية',
            'اللغة الفرنسية', 
            'اللغة الإسبانية',
            'اللغة الألمانية',
            'اللغة الإيطالية'
        ],
        'trainings': [
            'دورة تكوينية مخصصة'
        ]
    };

    const languageLevels = [
        'A1 - مبتدئ',
        'A2 - أساسي', 
        'B1 - متوسط',
        'B2 - متوسط متقدم',
        'C1 - متقدم',
        'C2 - إتقان'
    ];

    const paymentMethods = [
        { id: 'edahabia', name: 'الذهبية (Edahabia)', icon: '💳' },
        { id: 'ccp', name: 'الحساب الجاري البريدي (CCP)', icon: '🏦' },
        { id: 'baridimob', name: 'بريدي موب (BaridiMob)', icon: '📱' }
    ];

    const onFormSubmit = (data) => {
        setFormData(data);
        setStep(2);
    };

    const handleConfirmation = () => {
        setStep(3);
    };

    const handlePayment = () => {
        // Here you would integrate with Algerian payment gateway
        const registrationData = {
            ...formData,
            paymentMethod,
            registrationDate: new Date().toISOString(),
            status: 'pending_payment'
        };
        
        onSubmit(registrationData);
    };

    const renderStep1 = () => (
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6" dir="rtl">
            <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-blue-700 mb-2">تسجيل في الدورة</h2>
                <p className="text-gray-600">املأ البيانات المطلوبة للتسجيل</p>
            </div>

            {/* الاسم الكامل */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    <User className="w-4 h-4 inline ml-2" />
                    الاسم الكامل *
                </label>
                <input
                    type="text"
                    {...register('fullName', { 
                        required: 'الاسم الكامل مطلوب',
                        minLength: { value: 2, message: 'الاسم يجب أن يكون أكثر من حرفين' }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                    placeholder="أدخل اسمك الكامل"
                />
                {errors.fullName && (
                    <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>
                )}
            </div>

            {/* البريد الإلكتروني */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Mail className="w-4 h-4 inline ml-2" />
                    البريد الإلكتروني *
                </label>
                <input
                    type="email"
                    {...register('email', { 
                        required: 'البريد الإلكتروني مطلوب',
                        pattern: {
                            value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                            message: 'البريد الإلكتروني غير صحيح'
                        }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                    placeholder="example@email.com"
                />
                {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                )}
            </div>

            {/* رقم الهاتف */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Phone className="w-4 h-4 inline ml-2" />
                    رقم الهاتف *
                </label>
                <input
                    type="tel"
                    {...register('phone', { 
                        required: 'رقم الهاتف مطلوب',
                        pattern: {
                            value: /^[0-9+\-\s()]{8,15}$/,
                            message: 'رقم الهاتف غير صحيح'
                        }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                    placeholder="0555123456"
                />
                {errors.phone && (
                    <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                )}
            </div>

            {/* اختيار الدورة */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    <BookOpen className="w-4 h-4 inline ml-2" />
                    اختيار الدورة *
                </label>
                <select
                    {...register('course', { required: 'يجب اختيار الدورة' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                >
                    <option value="">اختر الدورة</option>
                    {courseType && courses[courseType]?.map((course, index) => (
                        <option key={index} value={course}>{course}</option>
                    ))}
                    {!courseType && Object.values(courses).flat().map((course, index) => (
                        <option key={index} value={course}>{course}</option>
                    ))}
                </select>
                {errors.course && (
                    <p className="mt-1 text-sm text-red-600">{errors.course.message}</p>
                )}
            </div>

            {/* المستوى (للغات فقط) */}
            {(courseType === 'languages' || watch('course')?.includes('اللغة')) && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        <GraduationCap className="w-4 h-4 inline ml-2" />
                        المستوى *
                    </label>
                    <select
                        {...register('level', { required: 'يجب اختيار المستوى' })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                    >
                        <option value="">اختر المستوى</option>
                        {languageLevels.map((level, index) => (
                            <option key={index} value={level}>{level}</option>
                        ))}
                    </select>
                    {errors.level && (
                        <p className="mt-1 text-sm text-red-600">{errors.level.message}</p>
                    )}
                </div>
            )}

            <div className="flex gap-4 pt-4">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                    إلغاء
                </button>
                <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    التالي
                </button>
            </div>
        </form>
    );

    const renderStep2 = () => (
        <div className="space-y-6" dir="rtl">
            <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-blue-700 mb-2">تأكيد البيانات</h2>
                <p className="text-gray-600">تأكد من صحة البيانات قبل المتابعة للدفع</p>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg space-y-4">
                <div className="flex justify-between">
                    <span className="font-medium">الاسم الكامل:</span>
                    <span>{formData?.fullName}</span>
                </div>
                <div className="flex justify-between">
                    <span className="font-medium">البريد الإلكتروني:</span>
                    <span>{formData?.email}</span>
                </div>
                <div className="flex justify-between">
                    <span className="font-medium">رقم الهاتف:</span>
                    <span>{formData?.phone}</span>
                </div>
                <div className="flex justify-between">
                    <span className="font-medium">الدورة:</span>
                    <span>{formData?.course}</span>
                </div>
                {formData?.level && (
                    <div className="flex justify-between">
                        <span className="font-medium">المستوى:</span>
                        <span>{formData?.level}</span>
                    </div>
                )}
            </div>

            <div className="flex gap-4 pt-4">
                <button
                    onClick={() => setStep(1)}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                    تعديل البيانات
                </button>
                <button
                    onClick={handleConfirmation}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    تأكيد والمتابعة للدفع
                </button>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="space-y-6" dir="rtl">
            <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-blue-700 mb-2">الدفع الإلكتروني</h2>
                <p className="text-gray-600">اختر طريقة الدفع المناسبة لك</p>
            </div>

            <div className="space-y-4">
                {paymentMethods.map((method) => (
                    <div
                        key={method.id}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                            paymentMethod === method.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setPaymentMethod(method.id)}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <span className="text-2xl ml-3">{method.icon}</span>
                                <span className="font-medium">{method.name}</span>
                            </div>
                            <div className={`w-4 h-4 rounded-full border-2 ${
                                paymentMethod === method.id
                                    ? 'border-blue-500 bg-blue-500'
                                    : 'border-gray-300'
                            }`}>
                                {paymentMethod === method.id && (
                                    <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                <p className="text-sm text-yellow-800">
                    <CreditCard className="w-4 h-4 inline ml-2" />
                    سيتم توجيهك إلى بوابة الدفع الآمنة لإتمام عملية الدفع
                </p>
            </div>

            <div className="flex gap-4 pt-4">
                <button
                    onClick={() => setStep(2)}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                    رجوع
                </button>
                <button
                    onClick={handlePayment}
                    disabled={!paymentMethod}
                    className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    متابعة الدفع
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    {/* Progress indicator */}
                    <div className="flex items-center justify-center mb-6">
                        <div className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                            }`}>
                                1
                            </div>
                            <div className={`w-12 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                            }`}>
                                2
                            </div>
                            <div className={`w-12 h-1 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                            }`}>
                                3
                            </div>
                        </div>
                    </div>

                    {step === 1 && renderStep1()}
                    {step === 2 && renderStep2()}
                    {step === 3 && renderStep3()}
                </div>
            </div>
        </div>
    );
};

export default CourseRegistrationForm;
