import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';
import { GraduationCap, User, Clock, MessageSquare, Send, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { streamUserTrainingSignIns } from '../services/firestoreService';

const TRAINING_APPROVED_STATUSES = ['approved', 'verified', 'registered'];
const TRAINING_PENDING_STATUSES = ['pending', 'submitted', 'review', 'reviewing', 'in_review', 'processing', 'awaiting'];

const parseNumericPrice = (raw) => {
    if (raw == null) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw === 'string') {
        const cleaned = raw.trim().replace(/[^0-9.]/g, '');
        if (!cleaned) return null;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const formatPriceText = (raw) => {
    const price = parseNumericPrice(raw);
    if (price == null) return 'السعر غير متوفر';
    if (price === 0) return 'مجاني';
    return `${price.toLocaleString('en-US')} دج`;
};

const TrainingsPage = () => {
    const [activeTrainings, setActiveTrainings] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [view, setView] = useState('options');
    const didLogTrainingRef = useRef(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        course: '',
        message: '',
        topics: []
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState('');
    const [hasSubmittedRequest, setHasSubmittedRequest] = useState(false);
    const { selectedBranchId } = useBranch();
    const authContext = useAuth();
    const currentUser = authContext?.currentUser || authContext?.user;
    
    const [trainingForms, setTrainingForms] = useState([]);
    const [verifiedTrainingSummaries, setVerifiedTrainingSummaries] = useState([]);

    const resolveTeacherName = (training) => {
        const teacher = training?.teacher;
        if (typeof teacher === 'string') {
            const trimmed = teacher.trim();
            return trimmed ? trimmed : null;
        }
        if (teacher && typeof teacher === 'object') {
            const nestedName = teacher?.name || teacher?.fullName || teacher?.displayName;
            if (typeof nestedName === 'string' && nestedName.trim()) return nestedName.trim();
        }

        const fallback = training?.teacherName || training?.trainerName;
        if (typeof fallback === 'string' && fallback.trim()) return fallback.trim();
        return null;
    };

    const resolveSchedules = (training) => {
        // New structure: schedules: [{ dayOfWeek, startTime, endTime }]
        if (Array.isArray(training?.schedules) && training.schedules.length > 0) {
            return training.schedules
                .map((s) => {
                    const day = (s.dayOfWeek || s.day || '').trim();
                    const start = (s.startTime || s.start || '').trim();
                    const end = (s.endTime || s.end || '').trim();
                    if (!day || !start || !end) return null;
                    return `${day} ${start} - ${end}`;
                })
                .filter(Boolean);
        }

        // Fallback: single schedule string
        const rawSchedule = training?.schedule;
        if (typeof rawSchedule === 'string' && rawSchedule.trim()) {
            return [rawSchedule.trim()];
        }

        // Legacy flat fields
        const day = training?.dayOfWeek || training?.day || training?.timing?.day;
        const start = training?.startTime || training?.timing?.start;
        const end = training?.endTime || training?.timing?.end;

        const normalizedDay = typeof day === 'string' ? day.trim() : '';
        const normalizedStart = typeof start === 'string' ? start.trim() : '';
        const normalizedEnd = typeof end === 'string' ? end.trim() : '';

        if (normalizedDay && normalizedStart && normalizedEnd) {
            return [`${normalizedDay} ${normalizedStart} - ${normalizedEnd}`];
        }

        return [];
    };

    // Fetch active trainings
    useEffect(() => {
        if (!selectedBranchId) {
            setActiveTrainings([]);
            setLoading(false);
            return;
        }

        let unsubscribe = null;
        const timeoutId = setTimeout(() => {
            try {
                const trainingsQuery = query(
                    collection(db, 'branches', selectedBranchId, 'trainings'),
                    where('active', '==', true)
                );
                unsubscribe = onSnapshot(
                    trainingsQuery,
                    (snapshot) => {
                        const trainingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        if (!didLogTrainingRef.current && trainingsData.length > 0) {
                            didLogTrainingRef.current = true;
                            console.log('Public trainings sample:', trainingsData[0]);
                        }
                        setActiveTrainings(trainingsData);
                        setLoading(false);
                    },
                    (error) => {
                        console.error('Error fetching trainings:', error);
                        setLoading(false);
                    }
                );
            } catch (error) {
                console.error('Error setting up listener:', error);
                setLoading(false);
            }
        }, 100);

        return () => {
            clearTimeout(timeoutId);
            if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, [selectedBranchId]);

    // Stream training form entries for the current user
    useEffect(() => {
        if (!selectedBranchId || !currentUser?.uid) {
            setTrainingForms([]);
            return;
        }

        const unsubscribe = streamUserTrainingSignIns(
            selectedBranchId,
            currentUser.uid,
            (entries) => {
                setTrainingForms(entries || []);
            }
        );

        return () => unsubscribe?.();
    }, [selectedBranchId, currentUser?.uid]);

    // Listen for verified trainings in the student's profile
    useEffect(() => {
        if (!selectedBranchId || !currentUser?.uid) {
            setVerifiedTrainingSummaries([]);
            return;
        }

        const userDocRef = doc(db, 'branches', selectedBranchId, 'users', currentUser.uid);
        const unsubscribe = onSnapshot(
            userDocRef,
            (snapshot) => {
                if (!snapshot.exists()) {
                    setVerifiedTrainingSummaries([]);
                    return;
                }
                const data = snapshot.data() || {};
                const registeredTrainings = Array.isArray(data?.registrations?.trainings)
                    ? data.registrations.trainings
                    : [];
                setVerifiedTrainingSummaries(registeredTrainings);
            },
            () => setVerifiedTrainingSummaries([])
        );

        return () => unsubscribe();
    }, [selectedBranchId, currentUser?.uid]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const getTrainingStatus = (trainingId) => {
        if (!trainingId) return null;

        const relatedForms = trainingForms.filter((entry) => entry.trainingId === trainingId);

        const hasVerifiedForm = relatedForms.some(
            (entry) =>
                entry?.verified === true ||
                TRAINING_APPROVED_STATUSES.includes(String(entry?.status || '').toLowerCase())
        );
        if (hasVerifiedForm) return 'verified';

        const hasPendingForm = relatedForms.some((entry) => {
            const normalized = String(entry?.status || '').toLowerCase();
            return TRAINING_PENDING_STATUSES.includes(normalized) || normalized === '';
        });
        if (hasPendingForm) return 'pending';

        const profileMatch = verifiedTrainingSummaries.find(
            (entry) =>
                entry?.trainingId === trainingId ||
                entry?.training?.id === trainingId
        );
        if (profileMatch) return 'verified';

        return null;
    };

    const handleRegisterForTraining = (training) => {
        const status = getTrainingStatus(training.id);
        
        if (status === 'pending') {
            alert('طلب التسجيل الخاص بك قيد المراجعة');
            return;
        }
        
        if (status === 'verified') {
            alert('أنت مسجل بالفعل في هذه الدورة');
            return;
        }

        const derivedLevelId =
            training.defaultLevelId ||
            training.levelId ||
            (Array.isArray(training.levels) && (training.levels[0]?.id || training.levels[0]?.levelId || training.levels[0]?.name)) ||
            '';

        const derivedTeacherName = resolveTeacherName(training) || '';
        const derivedSchedule = (resolveSchedules(training)[0] || '');

        navigate('/training-registration', {
            state: {
                trainingSelection: {
                    levelId: derivedLevelId,
                    trainingId: training.id,
                    trainingName: training.title || training.name || 'دورة تكوينية',
                    price: parseNumericPrice(training.price),
                    teacherName: derivedTeacherName,
                    schedule: derivedSchedule,
                    description: training.description || '',
                },
            },
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (isSubmitting || hasSubmittedRequest) {
            return;
        }

        setIsSubmitting(true);
        setSubmitStatus('');

        try {
            if (!selectedBranchId) {
                alert('يرجى اختيار الفرع أولاً.');
                setIsSubmitting(false);
                return;
            }

            // Let users submit even if not logged in.

            const registrationData = {
                type: 'training_request',
                name: formData.name,
                phone: formData.phone,
                email: formData.email,
                courseName: formData.course,
                branchId: selectedBranchId,
                createdAt: serverTimestamp(),
                status: 'جديد',
                processed: false
            };

            if (currentUser?.uid) {
                registrationData.userId = currentUser.uid;
            }

            if (formData.message) {
                registrationData.message = formData.message;
            }

            if (formData.topics && formData.topics.length > 0) {
                registrationData.topics = formData.topics;
            }

            await addDoc(collection(db, 'branches', selectedBranchId, 'registrations'), registrationData);
            
            setSubmitStatus('success');
            setHasSubmittedRequest(true);

            // Redirect user to a confirmation section.
            setTimeout(() => {
                setView('requestConfirmation');
            }, 400);

        } catch (error) {
            console.error('Error submitting training request:', error);
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="trainings-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
            <div className="container mx-auto max-w-6xl">
                {/* Hero Section */}
                <div className="text-center mb-12">
                    <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">الدورات التكوينية</h1>
                    <p className="text-xl text-gray-600">
                        {view === 'options' && 'اختر ما تريد القيام به'}
                        {view === 'available' && (activeTrainings.length > 0 ? 'اكتشف دوراتنا التكوينية المتاحة حالياً' : 'لا توجد دورات متاحة حالياً')}
                        {view === 'request' && 'أرسل طلب تدريب مخصص وسنتواصل معك'}
                    </p>
                </div>

                {/* Navigation Options */}
                {view === 'options' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                        <button
                            onClick={() => setView('request')}
                            className="group bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-right hover:shadow-xl transition-all"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <MessageSquare className="h-10 w-10 text-primary" />
                                <span className="text-sm text-gray-500">طلب تدريب</span>
                            </div>
                            <h3 className="text-2xl font-bold text-primary mb-3">طلب تدريب مخصص</h3>
                            <p className="text-gray-600 mb-6">صف لنا التدريب الذي تود أن نقدمه، مع المواضيع المفضلة والتواصل معك لاحقاً.</p>
                            <div className="flex items-center justify-between">
                                <span className="text-primary font-semibold group-hover:underline">ابدأ الطلب</span>
                                <span aria-hidden>→</span>
                            </div>
                        </button>

                        <button
                            onClick={() => setView('available')}
                            className="group bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-right hover:shadow-xl transition-all"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <GraduationCap className="h-10 w-10 text-primary" />
                                <span className="text-sm text-gray-500">التسجيل في دورة</span>
                            </div>
                            <h3 className="text-2xl font-bold text-primary mb-3">التسجيل في الدورات المتاحة</h3>
                            <p className="text-gray-600 mb-6">استعرض الدورات الحالية بالتفاصيل (العنوان، الوصف، التاريخ، المدة) وسجل مباشرة.</p>
                            <div className="flex items-center justify-between">
                                <span className="text-primary font-semibold group-hover:underline">استعراض الدورات</span>
                                <span aria-hidden>→</span>
                            </div>
                        </button>
                    </div>
                )}

                {/* Available Trainings View */}
                {view === 'available' && (
                    <div className="mb-12">
                        <div className="mb-6">
                            <button onClick={() => setView('options')} className="text-sm text-gray-600 hover:underline">← عودة للاختيارات</button>
                        </div>
                        {activeTrainings.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {activeTrainings.map((training) => {
                                    const status = getTrainingStatus(training.id);
                                    const isVerified = status === 'verified';
                                    const isPending = status === 'pending';
                                    const alreadyRegistered = isVerified || isPending;

                                    const teacherName = resolveTeacherName(training);
                                    const scheduleText = resolveSchedules(training);
                                    
                                    return (
                                        <div key={training.id} className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-shadow">
                                            <div className="flex items-start justify-between mb-4">
                                                <GraduationCap className="h-8 w-8 text-primary flex-shrink-0" />
                                                <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                                                    isVerified
                                                        ? 'bg-green-100 text-green-800'
                                                        : isPending
                                                        ? 'bg-yellow-100 text-yellow-800' 
                                                        : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {isVerified ? 'مسجل' : isPending ? 'قيد المراجعة' : 'متاح'}
                                                </span>
                                            </div>

                                            <h3 className="text-xl font-bold text-primary mb-3">{training.title}</h3>
                                            <p className="text-gray-600 mb-4 line-clamp-3">{training.description}</p>

                                            <div className="space-y-2 mb-6">
                                                <div className="flex items-center">
                                                    <User className="h-4 w-4 text-secondary ml-2" />
                                                    <span className="text-sm">{teacherName || 'غير محدد'}</span>
                                                </div>
                                                <div className="flex items-center">
                                      <Clock className="h-4 w-4 text-accent ml-2" />
                                                    <span className="text-sm">
                                                        {scheduleText && Array.isArray(scheduleText)
                                                            ? scheduleText.join('، ')
                                                            : scheduleText || 'غير محدد'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="text-gray-700 mb-4">
                                                <span className="font-semibold">السعر:</span> {formatPriceText(training?.price)}
                                            </div>

                                            {isVerified && (
                                                <div className="mb-4 bg-green-50 border-2 border-green-300 rounded-lg p-3 flex items-center gap-2">
                                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                                    <span className="text-green-700 font-semibold text-sm">✔ مسجل ومفعّل</span>
                                                </div>
                                            )}

                                            {isPending && (
                                                <div className="mb-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg p-3 flex items-center gap-2">
                                                    <AlertCircle className="w-5 h-5 text-yellow-700" />
                                                    <span className="text-yellow-800 font-semibold text-sm">⏳ بانتظار التحقق من الإدارة</span>
                                                </div>
                                            )}

                                            <button
                                                onClick={() => handleRegisterForTraining(training)}
                                                disabled={alreadyRegistered}
                                                className={`w-full font-bold py-3 px-4 rounded-lg transition-all duration-300 text-base ${
                                                    isVerified
                                                        ? 'bg-green-100 text-green-700 cursor-not-allowed border-2 border-green-300'
                                                        : isPending
                                                        ? 'bg-yellow-100 text-yellow-800 cursor-not-allowed border-2 border-yellow-400'
                                                        : 'bg-primary hover:bg-primary-600 text-white shadow-md hover:shadow-lg'
                                                }`}
                                            >
                                                {isVerified
                                                    ? '✔ مسجل ومفعّل'
                                                    : isPending
                                                    ? '⏳ بانتظار التحقق'
                                                    : 'التسجيل في الدورة'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="max-w-2xl mx-auto text-center bg-white rounded-xl shadow-lg p-8 border border-gray-200">
                                <MessageSquare className="h-16 w-16 text-primary mx-auto mb-4" />
                                <h2 className="text-2xl font-bold text-primary mb-2">لا توجد دورات متاحة حالياً</h2>
                                <p className="text-gray-600 mb-6">يمكنك إرسال طلب تدريب مخصص بالمجال الذي تريده.</p>
                                <button onClick={() => setView('request')} className="bg-primary hover:bg-primary-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors">طلب تدريب</button>
                            </div>
                        )}
                    </div>
                )}

                {/* Custom Training Request View */}
                {view === 'request' && (
                    <div className="max-w-2xl mx-auto">
                        <div className="mb-6">
                            <button onClick={() => setView('options')} className="text-sm text-gray-600 hover:underline">← عودة للاختيارات</button>
                        </div>
                        <div className="bg-white rounded-xl shadow-lg p-8">
                            <div className="text-center mb-8">
                                <MessageSquare className="h-16 w-16 text-primary mx-auto mb-4" />
                                <h2 className="text-2xl font-bold text-primary mb-2">طلب تدريب</h2>
                                <p className="text-gray-600">صف لنا التدريب الذي تريده وسنتواصل معك</p>
                            </div>

                            {submitStatus === 'success' && (
                                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">✅ تم إرسال طلب التدريب بنجاح</div>
                            )}

                            {submitStatus === 'error' && (
                                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">❌ حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى</div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div>
                                    <label htmlFor="name" className="flex items-center text-lg font-medium text-gray-700 mb-2">
                                        <User className="h-4 w-4 ml-2" />
                                        الاسم الكامل *
                                    </label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors text-lg text-right"
                                        placeholder="أدخل اسمك الكامل"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="email" className="flex items-center text-lg font-medium text-gray-700 mb-2">
                                        <Mail className="h-4 w-4 ml-2" />
                                        البريد الإلكتروني *
                                    </label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors text-lg"
                                        placeholder="example@email.com"
                                        dir="ltr"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="phone" className="flex items-center text-lg font-medium text-gray-700 mb-2">
                                        <MessageSquare className="h-4 w-4 ml-2" />
                                        رقم الهاتف *
                                    </label>
                                    <input
                                        type="tel"
                                        id="phone"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors text-lg text-right"
                                        placeholder="0555123456"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="course" className="flex items-center text-lg font-medium text-gray-700 mb-2">
                                        <GraduationCap className="h-4 w-4 ml-2" />
                                        المجال المطلوب *
                                    </label>
                                    <input
                                        type="text"
                                        id="course"
                                        name="course"
                                        value={formData.course}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors text-lg text-right"
                                        placeholder="مثال: تطوير المواقع، التصميم الجرافيكي، التسويق الرقمي..."
                                    />
                                </div>

                                <div>
                                    <label htmlFor="message" className="block text-lg font-medium text-gray-700 mb-2">رسالة إضافية (اختياري)</label>
                                    <textarea
                                        id="message"
                                        name="message"
                                        value={formData.message}
                                        onChange={handleInputChange}
                                        rows="4"
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors text-lg resize-vertical text-right"
                                        placeholder="أضف أي تفاصيل إضافية حول ما تريد تعلمه..."
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting || hasSubmittedRequest}
                                    className="w-full bg-primary hover:bg-primary-600 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-lg transition-all duration-300 text-lg flex items-center justify-center"
                                >
                                    {hasSubmittedRequest ? (
                                        'تم الإرسال'
                                    ) : isSubmitting ? (
                                        'جاري الإرسال...'
                                    ) : (
                                        <>
                                            <Send className="h-5 w-5 ml-2" />
                                            إرسال
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {view === 'requestConfirmation' && (
                    <div className="max-w-2xl mx-auto">
                        <div className="mb-6">
                            <button onClick={() => setView('options')} className="text-sm text-gray-600 hover:underline">← عودة للاختيارات</button>
                        </div>
                        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                            <h2 className="text-2xl font-bold text-primary mb-3">تم استلام طلب التدريب</h2>
                            <p className="text-gray-700">شكرًا لك، تم حفظ طلبك بنجاح وسيتم التواصل معك قريبًا</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TrainingsPage;