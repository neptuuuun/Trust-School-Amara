import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';
import { GraduationCap, MessageSquare } from 'lucide-react';
import {
  streamSubjects,
  streamClasses,
  streamUserTrainingSignIns,
  streamRegisteredTrainingsForStudent,
} from '../services/firestoreService';
import { getAcademicYearLabel } from '../utils/academicYear';
import { scheduleSlotLabel } from '../components/academic/academicDisplay';
import SubjectGrid from '../components/academic/SubjectGrid';
import ClassList from '../components/academic/ClassList';
import PageAnnouncements from '../components/announcements/PageAnnouncements';
import TrainingRequestPanel from '../components/trainings/TrainingRequestPanel';
import { Button } from '../components/ui/button';
import { LoadingState } from '../components/ui/feedback';

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

    // ── Catalog streams (branch-scoped) ─────────────────────────────────────────
    useEffect(() => {
        if (!selectedBranchId) { setSubjects([]); setClasses([]); setLoading(false); return undefined; }
        setLoading(true);
        const unsubSubjects = streamSubjects(selectedBranchId, 'training', (rows) => {
            setSubjects(rows.filter((s) => (s.status || 'active') !== 'inactive'));
            setLoading(false);
        });
        const unsubClasses = streamClasses(selectedBranchId, { serviceType: 'training', activeOnly: true, academicYear: getAcademicYearLabel() }, setClasses);
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
                        {view === 'request' && 'أخبرنا بالدورة التي ترغب بها وسنتواصل معك'}
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
                            <p className="text-gray-600 mb-6">لم تجد ما تبحث عنه؟ أخبرنا بالمجال الذي تريده وسنعمل على توفيره والتواصل معك.</p>
                            <div className="flex items-center justify-between">
                                <span className="text-primary font-semibold group-hover:underline">ابدأ الطلب</span>
                                <span aria-hidden>←</span>
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
                                <span aria-hidden>←</span>
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
                                → عودة للاختيارات
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

                {/* Custom Training Request View — account-driven, minimal input */}
                {view === 'request' && (
                    <div>
                        <div className="mb-6 max-w-2xl mx-auto">
                            <button onClick={() => setView('options')} className="text-sm text-gray-600 hover:underline">→ عودة للاختيارات</button>
                        </div>
                        <TrainingRequestPanel branchId={selectedBranchId} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default TrainingsPage;
