import React, { useState, useEffect } from 'react';
import { Book, Users, Clock, User, ArrowRight } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import UnifiedRegistrationForm from '../components/UnifiedRegistrationForm';

const SupportLessonsPage = () => {
    const [selectedLevel, setSelectedLevel] = useState(null);
    const [selectedGrade, setSelectedGrade] = useState(null);
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [supportLessons, setSupportLessons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showRegistrationForm, setShowRegistrationForm] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState(null);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'supportCourses'), (snapshot) => {
            const lessonsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setSupportLessons(lessonsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);
    
    const grades = {
        secondary: [
            { id: 'sec1', name: 'السنة الأولى ثانوي', arabicName: 'السنة الأولى' },
            { id: 'sec2', name: 'السنة الثانية ثانوي', arabicName: 'السنة الثانية' },
            { id: 'sec3', name: 'السنة الثالثة ثانوي', arabicName: 'السنة الثالثة' }
        ],
        middle: [
            { id: 'mid1', name: 'السنة الأولى متوسط', arabicName: 'السنة الأولى' },
            { id: 'mid2', name: 'السنة الثانية متوسط', arabicName: 'السنة الثانية' },
            { id: 'mid3', name: 'السنة الثالثة متوسط', arabicName: 'السنة الثالثة' },
            { id: 'mid4', name: 'السنة الرابعة متوسط', arabicName: 'السنة الرابعة' }
        ]
    };


    const handleRegister = (lesson) => {
        const levelName = selectedLevel === 'secondary' ? 'الثانوي' : 'المتوسط';
        const gradeName = grades[selectedLevel].find(g => g.id === selectedGrade)?.name || '';
        
        setSelectedCourse({
            ...lesson,
            courseName: `دروس الدعم - ${lesson.name}`,
            level: levelName,
            grade: gradeName
        });
        setShowRegistrationForm(true);
    };

    const handleRegistrationSuccess = () => {
        setShowRegistrationForm(false);
        setSelectedCourse(null);
    };

    return (
        <div className="support-lessons-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
            <div className="container mx-auto max-w-6xl">
                {/* Hero Section */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">دروس الدعم</h1>
                    <p className="text-lg text-gray-700 max-w-3xl mx-auto leading-relaxed">
                        نقدم دروس دعم مكثفة ومتخصصة لطلاب جميع المراحل التعليمية مع أفضل الأساتذة
                    </p>
                </div>

                {!selectedLevel ? (
                    /* Level Selection Step */
                    <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
                        <h2 className="text-3xl font-bold text-primary text-center mb-8">اختر المستوى التعليمي</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                            <button
                                onClick={() => setSelectedLevel('secondary')}
                                className="bg-gradient-primary hover:bg-gradient-to-br hover:from-primary-600 hover:to-primary-700 text-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                            >
                                <Book className="w-12 h-12 mx-auto mb-4" />
                                <h3 className="text-2xl font-bold mb-2">الثانوي</h3>
                                <p className="text-primary-100">دروس دعم للطور الثانوي (3 سنوات)</p>
                            </button>
                            
                            <button
                                onClick={() => setSelectedLevel('middle')}
                                className="bg-gradient-to-br from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                            >
                                <Users className="w-12 h-12 mx-auto mb-4" />
                                <h3 className="text-2xl font-bold mb-2">المتوسط</h3>
                                <p className="text-secondary-100">دروس دعم للطور المتوسط (4 سنوات)</p>
                            </button>
                        </div>
                    </div>
                ) : !selectedGrade ? (
                    /* Grade Selection Step */
                    <div className="bg-white rounded-xl shadow-lg p-8">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-3xl font-bold text-primary">
                                اختر السنة الدراسية - {selectedLevel === 'secondary' ? 'الثانوي' : 'المتوسط'}
                            </h2>
                            <button
                                onClick={() => setSelectedLevel(null)}
                                className="flex items-center text-secondary hover:text-primary font-medium"
                            >
                                <ArrowRight className="w-5 h-5 ml-2" />
                                العودة لاختيار المستوى
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {grades[selectedLevel].map((grade, index) => (
                                <button
                                    key={grade.id}
                                    onClick={() => setSelectedGrade(grade.id)}
                                    className="bg-gradient-to-br from-accent-400 to-accent-500 hover:from-accent-500 hover:to-accent-600 text-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                                >
                                    <div className="text-center">
                                        <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <span className="text-2xl font-bold">{index + 1}</span>
                                        </div>
                                        <h3 className="text-lg font-bold mb-2">{grade.arabicName}</h3>
                                        <p className="text-accent-100 text-sm">{grade.name}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* Subject Selection Step */
                    <div className="bg-white rounded-xl shadow-lg p-8">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-3xl font-bold text-primary">
                                المواد المتاحة - {grades[selectedLevel].find(g => g.id === selectedGrade)?.name}
                            </h2>
                            <button
                                onClick={() => setSelectedGrade(null)}
                                className="flex items-center text-secondary hover:text-primary font-medium"
                            >
                                <ArrowRight className="w-5 h-5 ml-2" />
                                العودة لاختيار السنة
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {loading ? (
                                <div className="col-span-full flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                                </div>
                            ) : (
                                supportLessons
                                    .filter(lesson => lesson.grade === selectedGrade)
                                    .map((lesson) => (
                                        <div key={lesson.id} className="bg-gray-50 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden">
                                            <div className="p-6">
                                                <div className="flex items-center mb-4">
                                                    <Book className="w-8 h-8 text-secondary ml-3" />
                                                    <h3 className="text-xl font-bold text-primary">{lesson.name}</h3>
                                                </div>
                                                
                                                <div className="space-y-3 mb-6">
                                                    <div className="flex items-center text-gray-700">
                                                        <User className="w-5 h-5 text-gray-500 ml-2" />
                                                        <span className="font-medium">{lesson.teacher}</span>
                                                    </div>
                                                    
                                                    <div className="flex items-center text-gray-700">
                                                        <Clock className="w-5 h-5 text-gray-500 ml-2" />
                                                        <span className="text-sm">
                                                            {lesson.timing?.day && lesson.timing?.start && lesson.timing?.end
                                                                ? `${lesson.timing.day} — من ${lesson.timing.start} إلى ${lesson.timing.end}`
                                                                : 'غير محدد'
                                                            }
                                                        </span>
                                                    </div>
                                                </div>
                                                
                                                <button
                                                    onClick={() => handleRegister(lesson)}
                                                    className="w-full bg-primary hover:bg-primary-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-300"
                                                >
                                                    التسجيل
                                                </button>
                                            </div>
                                        </div>
                                    ))
                            )}
                            
                            {!loading && supportLessons.filter(lesson => lesson.grade === selectedGrade).length === 0 && (
                                <div className="col-span-full text-center py-8">
                                    <p className="text-gray-500 text-lg">لا توجد مواد متاحة لهذه السنة حالياً</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Registration Form Modal */}
                {showRegistrationForm && selectedCourse && (
                    <UnifiedRegistrationForm
                        courseType="support"
                        courseData={selectedCourse}
                        onClose={() => {
                            setShowRegistrationForm(false);
                            setSelectedCourse(null);
                        }}
                        onSuccess={handleRegistrationSuccess}
                    />
                )}
            </div>
        </div>
    );
};

export default SupportLessonsPage;
