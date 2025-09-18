import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { User, Mail, Phone, BookOpen, ArrowRight } from 'lucide-react';

const CourseRegistrationPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { courseType, courseName, subject, level } = location.state || {};
    
    const { register, handleSubmit, formState: { errors } } = useForm({
        defaultValues: {
            selectedCourse: `${courseName} - ${subject?.name || ''}`,
            level: level || ''
        }
    });

    const onSubmit = (data) => {
        const registrationData = {
            ...data,
            courseType,
            courseName,
            subject,
            level,
            registrationDate: new Date().toISOString()
        };
        
        // Navigate to payment page
        navigate('/payment', {
            state: { registrationData }
        });
    };

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-6 md:px-12" dir="rtl">
            <div className="container mx-auto max-w-2xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl md:text-4xl font-bold text-blue-700 mb-4">تسجيل في الدورة</h1>
                    <p className="text-gray-600">املأ البيانات المطلوبة لإتمام التسجيل</p>
                </div>

                {/* Course Info Card */}
                <div className="bg-blue-50 rounded-xl p-6 mb-8">
                    <h3 className="text-xl font-bold text-blue-700 mb-2">تفاصيل الدورة المختارة</h3>
                    <div className="space-y-2 text-gray-700">
                        <p><span className="font-medium">الدورة:</span> {courseName}</p>
                        {subject && (
                            <>
                                <p><span className="font-medium">المادة:</span> {subject.name}</p>
                                <p><span className="font-medium">الأستاذ:</span> {subject.teacher}</p>
                                <p><span className="font-medium">التوقيت:</span> {subject.timing}</p>
                            </>
                        )}
                        {level && <p><span className="font-medium">المستوى:</span> {level}</p>}
                    </div>
                </div>

                {/* Registration Form */}
                <div className="bg-white rounded-xl shadow-lg p-8">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

                        {/* الدورة المختارة */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <BookOpen className="w-4 h-4 inline ml-2" />
                                الدورة المختارة
                            </label>
                            <input
                                type="text"
                                {...register('selectedCourse')}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-right"
                                readOnly
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-4 pt-6">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="flex-1 flex items-center justify-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                <ArrowRight className="w-5 h-5 ml-2" />
                                العودة
                            </button>
                            <button
                                type="submit"
                                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                            >
                                المتابعة للدفع
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CourseRegistrationPage;
