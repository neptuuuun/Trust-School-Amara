import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { User, Phone, MessageSquare, X, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useBranch } from '../contexts/BranchContext';

const TrainingRequestForm = ({ onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submitStatus, setSubmitStatus] = useState('');
    const { selectedBranchId } = useBranch();

    const { register, handleSubmit, formState: { errors } } = useForm();

    const onSubmit = async (formData) => {
        if (loading || submitted) return;

        setLoading(true);
        setSubmitStatus('');
        try {
            if (!selectedBranchId) {
                throw new Error('يرجى اختيار الفرع أولاً.');
            }
            const requestData = {
                name: formData.name,
                phone: formData.phone,
                email: formData.email,
                course: formData.course,
                message: formData.message || '',
                branchId: selectedBranchId,
                createdAt: serverTimestamp(),
                status: 'جديد'
            };

            // New path: branches/{branchId}/registrations with type='training_request'
            requestData.type = 'training_request';
            await addDoc(collection(db, 'branches', selectedBranchId, 'registrations'), requestData);
            setSubmitted(true);
            setSubmitStatus('success');
            
            if (onSuccess) {
                onSuccess(requestData);
            }
        } catch (error) {
            console.error('Error submitting training request:', error);
            setSubmitStatus('error');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-blue-600 mb-2">تم إرسال طلبك بنجاح!</h3>
                    <p className="text-gray-600 mb-6">
                        شكراً لك على اهتمامك. سنتواصل معك قريباً لمناقشة إمكانية توفير المدرب المطلوب.
                    </p>
                    <button
                        onClick={onClose}
                        className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        إغلاق
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-primary">طلب مدرب</h2>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <X className="h-5 w-5 text-gray-500" />
                        </button>
                    </div>

                    {/* Info Message */}
                    <div className="bg-blue-50 rounded-lg p-4 mb-6">
                        <p className="text-blue-800 text-sm">
                            لا توجد دورات متاحة حالياً. يمكنك طلب مدرب في المجال الذي تريده وسنتواصل معك
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" dir="rtl">
                        {submitStatus === 'success' && (
                            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                                تم إرسال طلب التدريب بنجاح
                            </div>
                        )}

                        {submitStatus === 'error' && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                                حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى
                            </div>
                        )}

                        {/* Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <User className="w-4 h-4 inline ml-2" />
                                الاسم الكامل *
                            </label>
                            <input
                                type="text"
                                {...register('name', { 
                                    required: 'الاسم الكامل مطلوب',
                                    minLength: { value: 2, message: 'الاسم يجب أن يكون أكثر من حرفين' }
                                })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-right"
                                placeholder="أدخل اسمك الكامل"
                            />
                            {errors.name && (
                                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                            )}
                        </div>

                        {/* Email */}
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
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-right"
                                placeholder="example@email.com"
                                dir="ltr"
                            />
                            {errors.email && (
                                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                            )}
                        </div>

                        {/* Phone */}
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
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-right"
                                placeholder="0555123456"
                            />
                            {errors.phone && (
                                <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                            )}
                        </div>

                        {/* Course */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <MessageSquare className="w-4 h-4 inline ml-2" />
                                المجال المطلوب *
                            </label>
                            <input
                                type="text"
                                {...register('course', { 
                                    required: 'المجال المطلوب مطلوب',
                                    minLength: { value: 3, message: 'المجال يجب أن يكون أكثر من 3 أحرف' }
                                })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-right"
                                placeholder="مثال: تطوير المواقع، التصميم الجرافيكي، التسويق الرقمي..."
                            />
                            {errors.course && (
                                <p className="mt-1 text-sm text-red-600">{errors.course.message}</p>
                            )}
                        </div>

                        {/* Additional Message */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                رسالة إضافية (اختياري)
                            </label>
                            <textarea
                                {...register('message')}
                                rows="4"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-right resize-none"
                                placeholder="أضف أي تفاصيل إضافية حول ما تريد تعلمه..."
                            />
                        </div>

                        {/* Submit Button */}
                        <div className="flex gap-4 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                                disabled={loading}
                            >
                                إلغاء
                            </button>
                            <button
                                type="submit"
                                className="flex-1 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                disabled={loading || submitted}
                            >
                                {submitted ? 'تم الإرسال' : loading ? 'جاري الإرسال...' : 'إرسال'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default TrainingRequestForm;