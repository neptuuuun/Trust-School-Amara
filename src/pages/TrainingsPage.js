import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';
import { GraduationCap, User, MessageSquare, Send, Mail, CheckCircle, AlertCircle, Phone as PhoneIcon } from 'lucide-react';
import {
  streamSubjects,
  streamClasses,
  streamUserTrainingSignIns,
  streamRegisteredTrainingsForStudent,
} from '../services/firestoreService';
import { scheduleSlotLabel } from '../components/academic/academicDisplay';
import SubjectGrid from '../components/academic/SubjectGrid';
import ClassList from '../components/academic/ClassList';
import PageAnnouncements from '../components/announcements/PageAnnouncements';
import { Button } from '../components/ui/button';
import { Input, Textarea, Label } from '../components/ui/input';
import { Alert, LoadingState } from '../components/ui/feedback';

const TRAINING_APPROVED_STATUSES = ['approved', 'verified', 'registered'];
const TRAINING_PENDING_STATUSES = ['pending', 'submitted', 'review', 'reviewing', 'in_review', 'processing', 'awaiting'];

const TrainingsPage = () => {
    const navigate = useNavigate();
    const { selectedBranchId } = useBranch();
    const authContext = useAuth();
    const currentUser = authContext?.currentUser || authContext?.user;

    const [view, setView] = useState('options');

    // New Subject → Class catalog
    const [subjects, setSubjects] = useState([]);
    const [classes, setClasses] = useState([]);
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [loading, setLoading] = useState(true);

    // Student registration status sources
    const [trainingForms, setTrainingForms] = useState([]);
    const [adminRegisteredTrainings, setAdminRegisteredTrainings] = useState([]);

    // Custom-training-request form (lead-gen — unrelated to the catalog)
    const [formData, setFormData] = useState({ name: '', email: '', phone: '', course: '', message: '', topics: [] });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState('');
    const [hasSubmittedRequest, setHasSubmittedRequest] = useState(false);

    // ── Catalog streams (branch-scoped) ─────────────────────────────────────────
    useEffect(() => {
        if (!selectedBranchId) { setSubjects([]); setClasses([]); setLoading(false); return undefined; }
        setLoading(true);
        const unsubSubjects = streamSubjects(selectedBranchId, 'training', (rows) => {
            setSubjects(rows.filter((s) => (s.status || 'active') !== 'inactive'));
            setLoading(false);
        });
        const unsubClasses = streamClasses(selectedBranchId, { serviceType: 'training', activeOnly: true }, setClasses);
        return () => { unsubSubjects?.(); unsubClasses?.(); };
    }, [selectedBranchId]);

    // Student's own training form entries
    useEffect(() => {
        if (!selectedBranchId || !currentUser?.uid) { setTrainingForms([]); return undefined; }
        const unsub = streamUserTrainingSignIns(selectedBranchId, currentUser.uid, (entries) => setTrainingForms(entries || []));
        return () => unsub?.();
    }, [selectedBranchId, currentUser?.uid]);

    // Admin-registered trainings (trainingsRegistered)
    useEffect(() => {
        if (!selectedBranchId || !currentUser?.uid) { setAdminRegisteredTrainings([]); return undefined; }
        const unsub = streamRegisteredTrainingsForStudent(selectedBranchId, currentUser.uid, (docs) => setAdminRegisteredTrainings(docs || []));
        return () => unsub?.();
    }, [selectedBranchId, currentUser?.uid]);

    const classCountBySubject = useMemo(() => {
        const map = {};
        classes.forEach((c) => { map[c.subjectId] = (map[c.subjectId] || 0) + 1; });
        return map;
    }, [classes]);

    const classesForSelected = useMemo(
        () => (selectedSubject ? classes.filter((c) => c.subjectId === selectedSubject.id) : []),
        [classes, selectedSubject],
    );

    // Status for a given class — keyed on classId (stored as trainingId in the entry).
    const getClassStatus = (cls) => {
        if (adminRegisteredTrainings.some((r) => r.trainingId === cls.id || r.classId === cls.id)) return { type: 'verified' };
        const related = trainingForms.filter((e) => e.trainingId === cls.id || e.classId === cls.id);
        if (related.some((e) => e?.verified === true || TRAINING_APPROVED_STATUSES.includes(String(e?.status || '').toLowerCase()))) {
            return { type: 'verified' };
        }
        if (related.some((e) => { const s = String(e?.status || '').toLowerCase(); return TRAINING_PENDING_STATUSES.includes(s) || s === ''; })) {
            return { type: 'pending' };
        }
        const cap = Number(cls.capacity) || 0;
        if (cap > 0 && (Number(cls.enrollmentCount) || 0) >= cap) return { type: 'full' };
        return { type: 'none' };
    };

    const handleRegisterForClass = (cls) => {
        const status = getClassStatus(cls);
        if (status.type === 'pending' || status.type === 'verified') return;
        if (!currentUser?.uid) { navigate('/login'); return; }
        navigate('/training-registration', {
            state: {
                trainingSelection: {
                    trainingId: cls.id,                 // class id keeps status/dedup/verify keyed correctly
                    trainingName: cls.subjectName || selectedSubject?.name || 'دورة تكوينية',
                    price: cls.price ?? null,
                    teacherName: cls.teacherName || '',
                    schedule: (Array.isArray(cls.schedules) ? cls.schedules.map(scheduleSlotLabel).filter(Boolean).join('  |  ') : ''),
                    description: selectedSubject?.description || '',
                    // Subject → Class snapshot
                    subjectId: cls.subjectId,
                    classId: cls.id,
                    groupName: cls.groupName || '',
                    schedules: Array.isArray(cls.schedules) ? cls.schedules : [],
                },
            },
        });
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
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
                setSubmitStatus('error');
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

    return (
        <div className="trainings-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
            <div className="container mx-auto max-w-6xl">
                {/* Page-specific announcements — hidden automatically when none exist */}
                <PageAnnouncements page="trainings" />

                {/* Hero Section */}
                <div className="text-center mb-12">
                    <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">الدورات التكوينية</h1>
                    <p className="text-xl text-gray-600">
                        {view === 'options' && 'اختر ما تريد القيام به'}
                        {view === 'available' && (subjects.length > 0 ? 'اكتشف دوراتنا التكوينية المتاحة حالياً' : 'لا توجد دورات متاحة حالياً')}
                        {view === 'request' && 'أرسل طلب تدريب مخصص وسنتواصل معك'}
                    </p>
                </div>

                {/* Navigation Options */}
                {view === 'options' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                        <button
                            onClick={() => setView('request')}
                            className="group bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-start hover:shadow-xl transition-all"
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
                            className="group bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-start hover:shadow-xl transition-all"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <GraduationCap className="h-10 w-10 text-primary" />
                                <span className="text-sm text-gray-500">التسجيل في دورة</span>
                            </div>
                            <h3 className="text-2xl font-bold text-primary mb-3">التسجيل في الدورات المتاحة</h3>
                            <p className="text-gray-600 mb-6">استعرض الدورات الحالية بالتفاصيل (المؤطر، المجموعات، المواعيد) وسجل مباشرة.</p>
                            <div className="flex items-center justify-between">
                                <span className="text-primary font-semibold group-hover:underline">استعراض الدورات</span>
                                <span aria-hidden>→</span>
                            </div>
                        </button>
                    </div>
                )}

                {/* Available Trainings View — Subject → Class */}
                {view === 'available' && (
                    <div className="mb-12">
                        <div className="mb-6">
                            <button
                                onClick={() => { setView('options'); setSelectedSubject(null); }}
                                className="text-sm text-gray-600 hover:underline"
                            >
                                ← عودة للاختيارات
                            </button>
                        </div>

                        {loading ? (
                            <LoadingState />
                        ) : !selectedSubject ? (
                            subjects.length > 0 ? (
                                <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
                                    <SubjectGrid
                                        subjects={subjects}
                                        getClassCount={(id) => classCountBySubject[id] || 0}
                                        onSelect={setSelectedSubject}
                                        icon={GraduationCap}
                                        emptyText="لا توجد دورات متاحة حالياً"
                                    />
                                </div>
                            ) : (
                                <div className="max-w-2xl mx-auto text-center bg-white rounded-xl shadow-lg p-8 border border-gray-200">
                                    <MessageSquare className="h-16 w-16 text-primary mx-auto mb-4" />
                                    <h2 className="text-2xl font-bold text-primary mb-2">لا توجد دورات متاحة حالياً</h2>
                                    <p className="text-gray-600 mb-6">يمكنك إرسال طلب تدريب مخصص بالمجال الذي تريده.</p>
                                    <Button onClick={() => setView('request')}>طلب تدريب</Button>
                                </div>
                            )
                        ) : (
                            <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
                                <ClassList
                                    subject={selectedSubject}
                                    classes={classesForSelected}
                                    getStatus={getClassStatus}
                                    onRegister={handleRegisterForClass}
                                    onBack={() => setSelectedSubject(null)}
                                    backLabel="العودة للدورات"
                                    emptyText="لا توجد مجموعات متاحة لهذه الدورة بعد."
                                />
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
                                <Alert variant="success" className="mb-6">تم إرسال طلب التدريب بنجاح</Alert>
                            )}

                            {submitStatus === 'error' && (
                                <Alert variant="danger" className="mb-6">حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى</Alert>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div>
                                    <Label htmlFor="name" required className="flex items-center gap-2 text-lg">
                                        <User className="h-4 w-4" aria-hidden="true" />
                                        الاسم الكامل
                                    </Label>
                                    <Input
                                        type="text"
                                        id="name"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        required
                                        className="text-lg"
                                        placeholder="أدخل اسمك الكامل"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="email" required className="flex items-center gap-2 text-lg">
                                        <Mail className="h-4 w-4" aria-hidden="true" />
                                        البريد الإلكتروني
                                    </Label>
                                    <Input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        required
                                        className="text-lg"
                                        placeholder="example@email.com"
                                        dir="ltr"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="phone" required className="flex items-center gap-2 text-lg">
                                        <PhoneIcon className="h-4 w-4" aria-hidden="true" />
                                        رقم الهاتف
                                    </Label>
                                    <Input
                                        type="tel"
                                        id="phone"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleInputChange}
                                        required
                                        className="text-lg"
                                        placeholder="0555123456"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="course" required className="flex items-center gap-2 text-lg">
                                        <GraduationCap className="h-4 w-4" aria-hidden="true" />
                                        المجال المطلوب
                                    </Label>
                                    <Input
                                        type="text"
                                        id="course"
                                        name="course"
                                        value={formData.course}
                                        onChange={handleInputChange}
                                        required
                                        className="text-lg"
                                        placeholder="مثال: تطوير المواقع، التصميم الجرافيكي، التسويق الرقمي..."
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="message" className="text-lg">رسالة إضافية (اختياري)</Label>
                                    <Textarea
                                        id="message"
                                        name="message"
                                        value={formData.message}
                                        onChange={handleInputChange}
                                        rows={4}
                                        className="text-lg"
                                        placeholder="أضف أي تفاصيل إضافية حول ما تريد تعلمه..."
                                    />
                                </div>

                                <Button type="submit" size="lg" fullWidth disabled={isSubmitting || hasSubmittedRequest}>
                                    {hasSubmittedRequest ? (
                                        'تم الإرسال'
                                    ) : isSubmitting ? (
                                        'جاري الإرسال...'
                                    ) : (
                                        <>
                                            <Send className="h-5 w-5" />
                                            إرسال
                                        </>
                                    )}
                                </Button>
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
