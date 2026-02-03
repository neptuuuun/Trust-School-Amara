import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { User, Mail, Phone, BookOpen, GraduationCap, X, CreditCard, Copy, MessageCircle, CheckSquare } from 'lucide-react';
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';

const UnifiedRegistrationForm = ({ 
    courseType, // 'language' | 'support' | 'training'
    courseData, // course/language/training object
    onClose,
    onSuccess 
}) => {
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const { selectedBranchId } = useBranch();
    // FIX: Changed from { user } to { currentUser }
    const { currentUser } = useAuth();
    const [blocked, setBlocked] = useState(null); // { reason: string }

    const { register, handleSubmit, formState: { errors }, watch } = useForm();
    const watchPaymentMethod = watch('paymentMethod');

    const onSubmit = async (formData) => {
        setLoading(true);
        try {
            if (!selectedBranchId) {
                throw new Error('يرجى اختيار الفرع أولاً.');
            }
            
            // FIX: Changed from user?.uid to currentUser?.uid
            if (!currentUser?.uid) {
                throw new Error('يرجى تسجيل الدخول كطالب.');
            }

            // Verification gate: require verified=true under branch users
            const userRef = doc(db, 'branches', selectedBranchId, 'users', currentUser.uid);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
                setBlocked({ reason: 'not_verified' });
                setLoading(false);
                return;
            }
            
            const userDoc = userSnap.data();
            
            // Block if not verified
            const isVerified = userDoc.isVerified === true || userDoc.verified === true;
            if (!userDoc || !isVerified) {
                setBlocked({ reason: 'not_verified' });
                setLoading(false);
                return;
            }
            
            // For support lessons, also require yearly fee to be paid AND at least one subject paid
            if (courseType === 'support') {
                const yearlyFeePaid = userDoc.yearlyFeePaid === true || userDoc.paymentVerified === true;
                const hasPaidSubjects = userDoc.paidSubjects && Array.isArray(userDoc.paidSubjects) && userDoc.paidSubjects.length > 0;
                
                if (!yearlyFeePaid || !hasPaidSubjects) {
                    setBlocked({ reason: 'yearly_fee_not_paid' });
                    setLoading(false);
                    return;
                }
            }

            // Build registration data - only include defined fields
            const registrationData = {
                type: courseType, // 'language', 'support', or 'training'
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                courseType: courseType,
                // FIX: Use courseData.id instead of courseData.trainingId
                courseId: courseData.id,
                courseName: getCourseName(formData),
                paymentMethod: formData.paymentMethod,
                paymentConfirmed: formData.paymentConfirmed || false,
                branchId: selectedBranchId,
                userId: currentUser.uid, // FIX: Changed from user.uid
                createdAt: serverTimestamp(),
                status: 'pending',
                processed: false
            };

            // Add optional level field only if it has a value
            if (formData.level) {
                registrationData.level = formData.level;
            }

            // Add training-specific data if available
            if (courseType === 'training') {
                // FIX: Use courseData.id as trainingId
                registrationData.trainingId = courseData.id;
                
                // Add teacher/trainer name if available
                if (courseData.teacherName || courseData.trainerName || courseData.teacher) {
                    registrationData.teacherName = courseData.teacherName || courseData.trainerName || courseData.teacher;
                }
                
                // Add timing info if available
                if (courseData.timing) {
                    const timingData = {};
                    
                    if (courseData.timing.day) {
                        timingData.day = courseData.timing.day;
                    }
                    
                    if (courseData.timing.start) {
                        timingData.start = courseData.timing.start.toDate 
                            ? courseData.timing.start.toDate().toISOString() 
                            : courseData.timing.start;
                    }
                    
                    if (courseData.timing.end) {
                        timingData.end = courseData.timing.end.toDate 
                            ? courseData.timing.end.toDate().toISOString() 
                            : courseData.timing.end;
                    }

                    // Only add timing if it has at least one field
                    if (Object.keys(timingData).length > 0) {
                        registrationData.timing = timingData;
                    }
                }

                // Add description if available
                if (courseData.description) {
                    registrationData.description = courseData.description;
                }
            }
            
            // Write to branch-scoped registrations
            await addDoc(collection(db, 'branches', selectedBranchId, 'registrations'), registrationData);
            
            setSubmitted(true);
            
            if (onSuccess) {
                onSuccess(registrationData);
            }
        } catch (error) {
            console.error('Error submitting registration:', error);
            alert('حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى.');
        } finally {
            setLoading(false);
        }
    };

    const getCourseName = (formData) => {
        switch (courseType) {
            case 'language':
                return `${courseData.name} - ${formData.level}`;
            case 'support':
                return `${courseData.name} - ${courseData.grade}`;
            case 'training':
                return courseData.title;
            default:
                return courseData.title || courseData.name;
        }
    };

    const getAvailableLevels = () => {
        if (courseType === 'language' && courseData.levels) {
            return courseData.levels.map(level => ({
                value: level.name,
                label: `${level.name} - ${level.teacherName || 'غير محدد'}`
            }));
        }
        return [];
    };

    if (submitted) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-green-600 mb-2">تم التسجيل بنجاح!</h3>
                    <p className="text-gray-600 mb-6">
                        شكراً لك على التسجيل. سنتواصل معك قريباً لتأكيد التفاصيل.
                    </p>
                    <button
                        onClick={onClose}
                        className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
                    >
                        إغلاق
                    </button>
                </div>
            </div>
        );
    }

    // Blocked UI when verification not satisfied
    if (blocked) {
        const isYearlyFeeIssue = blocked.reason === 'yearly_fee_not_paid';
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
                    <div className={`w-16 h-16 ${isYearlyFeeIssue ? 'bg-red-100' : 'bg-yellow-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
                        <svg className={`w-8 h-8 ${isYearlyFeeIssue ? 'text-red-600' : 'text-yellow-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"></path>
                        </svg>
                    </div>
                    <h3 className={`text-2xl font-bold ${isYearlyFeeIssue ? 'text-red-700' : 'text-yellow-700'} mb-2`}>
                        {isYearlyFeeIssue ? 'الرسوم السنوية غير مدفوعة' : 'الحساب غير موثق بعد'}
                    </h3>
                    <p className="text-gray-600 mb-6">
                        {isYearlyFeeIssue 
                            ? '⚠️ يجب دفع الرسوم السنوية والاشتراك في مادة واحدة على الأقل قبل التسجيل في الدروس. يرجى الذهاب إلى صفحة دفع الرسوم السنوية.'
                            : 'حسابك غير موثق بعد. يرجى الانتظار حتى يقوم الإداري بمراجعة بطاقة الهوية والصورة الشخصية الخاصة بك.'}
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            إغلاق
                        </button>
                        {isYearlyFeeIssue ? (
                            <button
                                onClick={() => { window.location.href = '/annual-fee'; }}
                                className="flex-1 bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary-600 transition-colors"
                            >
                                دفع الرسوم السنوية
                            </button>
                        ) : (
                            <button
                                onClick={() => { window.location.href = '/student-dashboard'; }}
                                className="flex-1 bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary-600 transition-colors"
                            >
                                الذهاب إلى صفحة الطالب
                            </button>
                        )}
                    </div>
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
                        <h2 className="text-2xl font-bold text-primary">التسجيل في الدورة</h2>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <X className="h-5 w-5 text-gray-500" />
                        </button>
                    </div>

                    {/* Course Info */}
                    <div className="bg-primary-50 rounded-lg p-4 mb-6">
                        <h3 className="font-semibold text-primary mb-1">
                            {courseType === 'language' && courseData.name}
                            {courseType === 'support' && courseData.name}
                            {courseType === 'training' && courseData.title}
                        </h3>
                        <p className="text-sm text-gray-600">
                            {courseType === 'language' && 'دورة تعلم اللغة'}
                            {courseType === 'support' && `دروس الدعم - ${courseData.level}`}
                            {courseType === 'training' && courseData.description}
                        </p>
                        {courseType === 'training' && (
                            <div className="mt-2 space-y-1">
                                {(courseData.teacherName || courseData.trainerName || courseData.teacher) && (
                                    <p className="text-sm text-gray-600">
                                        <span className="font-medium">المدرب:</span> {courseData.teacherName || courseData.trainerName || courseData.teacher}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" dir="rtl">
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

                        {/* Level Selection for Languages */}
                        {courseType === 'language' && getAvailableLevels().length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <GraduationCap className="w-4 h-4 inline ml-2" />
                                    المستوى *
                                </label>
                                <select
                                    {...register('level', { required: 'يجب اختيار المستوى' })}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-right"
                                >
                                    <option value="">اختر المستوى</option>
                                    {getAvailableLevels().map((level, index) => (
                                        <option key={index} value={level.value}>{level.label}</option>
                                    ))}
                                </select>
                                {errors.level && (
                                    <p className="mt-1 text-sm text-red-600">{errors.level.message}</p>
                                )}
                            </div>
                        )}

                        {/* Payment Method */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <CreditCard className="w-4 h-4 inline ml-2" />
                                طريقة الدفع *
                            </label>
                            <select
                                {...register('paymentMethod', { required: 'يجب اختيار طريقة الدفع' })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-right"
                            >
                                <option value="">اختر طريقة الدفع</option>
                                <option value="CCP">CCP</option>
                                <option value="Baridimob">Baridimob</option>
                            </select>
                            {errors.paymentMethod && (
                                <p className="mt-1 text-sm text-red-600">{errors.paymentMethod.message}</p>
                            )}
                        </div>

                        {/* Payment Reference */}
                        {watchPaymentMethod && (
                            <div className="bg-blue-50 rounded-lg p-4 space-y-4">
                                <h4 className="font-semibold text-blue-800 mb-3">تفاصيل الدفع</h4>
                
                                {watchPaymentMethod === 'Baridimob' && (
                                    <div className="bg-white rounded-lg p-4 border border-blue-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-gray-700">رقم BaridiMob:</span>
                                            <button
                                                type="button"
                                                onClick={() => navigator.clipboard.writeText('00799999004038547094')}
                                                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                                            >
                                                <Copy className="w-4 h-4" />
                                                نسخ
                                            </button>
                                        </div>
                                        <p className="text-lg font-mono bg-gray-100 p-2 rounded text-center">00799999004038547094</p>
                                    </div>
                                )}
                
                                {watchPaymentMethod === 'CCP' && (
                                    <div className="bg-white rounded-lg p-4 border border-blue-200 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-gray-700">رقم CCP:</span>
                                            <button
                                                type="button"
                                                onClick={() => navigator.clipboard.writeText('0040385470')}
                                                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                                            >
                                                <Copy className="w-4 h-4" />
                                                نسخ
                                            </button>
                                        </div>
                                        <p className="text-lg font-mono bg-gray-100 p-2 rounded text-center">0040385470</p>
                                        
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-gray-700">المفتاح:</span>
                                            <button
                                                type="button"
                                                onClick={() => navigator.clipboard.writeText('94')}
                                                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                                            >
                                                <Copy className="w-4 h-4" />
                                                نسخ
                                            </button>
                                        </div>
                                        <p className="text-lg font-mono bg-gray-100 p-2 rounded text-center">94</p>
                                        
                                        <div className="text-center">
                                            <span className="font-medium text-gray-700">الاسم: </span>
                                            <span className="font-mono"></span>
                                        </div>
                                    </div>
                                )}
                
                                {/* WhatsApp Contact Section */}
                                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                                    <div className="flex items-center justify-between mb-3">
                                        <h5 className="font-semibold text-green-800">تعليمات الواتساب</h5>
                                        <MessageCircle className="w-5 h-5 text-green-600" />
                                    </div>
                                    <p className="text-sm text-green-700 mb-3">
                                        بعد إتمام عملية الدفع، يرجى إرسال لقطة شاشة (screenshot) لإثبات الدفع مع بريدك الإلكتروني إلى رقم الواتساب التالي:
                                    </p>
                                    <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-green-200">
                                        <span className="font-medium text-green-700">رقم الواتساب:</span>
                                        <span className="font-mono text-lg font-bold text-green-800">+213797706549</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Payment Confirmation Checkbox */}
                        {watchPaymentMethod && (
                            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        {...register('paymentConfirmed')}
                                        className="mt-1 w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded"
                                    />
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">
                                            <CheckSquare className="w-4 h-4 inline ml-1" />
                                            أرسلت لقطة شاشة لإثبات الدفع عبر واتساب
                                        </span>
                                    </div>
                                </label>
                            </div>
                        )}

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
                                disabled={loading}
                            >
                                {loading ? 'جاري التسجيل...' : 'التسجيل في الدورة'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default UnifiedRegistrationForm;