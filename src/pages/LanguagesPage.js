import React, { useState, useEffect } from 'react';
import { Globe, Award, Users, Clock, User, ArrowRight } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import UnifiedRegistrationForm from '../components/UnifiedRegistrationForm';

const LanguagesPage = () => {
    const [selectedLanguage, setSelectedLanguage] = useState(null);
    const [languagesData, setLanguagesData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showRegistrationForm, setShowRegistrationForm] = useState(false);
    const [selectedLevel, setSelectedLevel] = useState(null);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'languages'), (snapshot) => {
            const languagesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setLanguagesData(languagesData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleRegister = (language, level) => {
        setSelectedLanguage(language);
        setSelectedLevel(level);
        setShowRegistrationForm(true);
    };

    const handleRegistrationSuccess = () => {
        setShowRegistrationForm(false);
        setSelectedLanguage(null);
        setSelectedLevel(null);
    };

    return (
        <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
            <div className="container mx-auto max-w-6xl">
                {/* Hero Section */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">تعليم اللغات</h1>
                    <p className="text-lg text-gray-700 max-w-3xl mx-auto leading-relaxed">
                        تعلم اللغات الأجنبية من المستوى المبتدئ (A1) إلى الإتقان (C2) مع أفضل المدرسين المتخصصين والمتحدثين الأصليين
                    </p>
                </div>

                {!selectedLanguage ? (
                    /* Language Selection Step */
                    <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
                        <h2 className="text-3xl font-bold text-primary text-center mb-8">اختر اللغة التي تريد تعلمها</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {languagesData.map((language) => (
                                <button
                                    key={language.id}
                                    onClick={() => setSelectedLanguage(language)}
                                    className="bg-gradient-primary hover:bg-gradient-to-br hover:from-primary-600 hover:to-primary-700 text-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                                >
                                    <Globe className="w-12 h-12 mx-auto mb-4" />
                                    <h3 className="text-2xl font-bold mb-2">{language.name}</h3>
                                    <p className="text-primary-100">{language.levels?.length || 0} مستوى متاح</p>
                                </button>
                            ))}
                        </div>
                        
                        {/* Features Section */}
                        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="text-center bg-gray-50 p-6 rounded-lg">
                                <Users className="w-12 h-12 text-primary mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-primary mb-3">مدرسون أصليون</h3>
                                <p className="text-gray-600">متحدثون أصليون مع خبرة واسعة</p>
                            </div>
                            <div className="text-center bg-gray-50 p-6 rounded-lg">
                                <Globe className="w-12 h-12 text-secondary mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-secondary mb-3">جميع المستويات</h3>
                                <p className="text-gray-600">من المبتدئ A1 إلى الإتقان C2</p>
                            </div>
                            <div className="text-center bg-gray-50 p-6 rounded-lg">
                                <Award className="w-12 h-12 text-accent mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-accent mb-3">شهادات معتمدة</h3>
                                <p className="text-gray-600">شهادات معتمدة دولياً</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Course Selection Step */
                    <div className="bg-white rounded-xl shadow-lg p-8">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-3xl font-bold text-primary">
                                {selectedLanguage.name} - جميع المستويات المتاحة
                            </h2>
                            <button
                                onClick={() => setSelectedLanguage(null)}
                                className="flex items-center text-secondary hover:text-primary font-medium"
                            >
                                <ArrowRight className="w-5 h-5 ml-2" />
                                العودة لاختيار اللغة
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {selectedLanguage.levels?.map((level, index) => (
                                <div key={index} className="bg-gray-50 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden">
                                    <div className="p-6">
                                        <div className="flex items-center mb-4">
                                            <Award className="w-8 h-8 text-primary ml-3" />
                                            <h3 className="text-xl font-bold text-primary">{level.name}</h3>
                                        </div>
                                        
                                        <div className="space-y-3 mb-6">
                                            <div className="flex items-center text-gray-700">
                                                <User className="w-5 h-5 text-gray-500 ml-2" />
                                                <span className="font-medium">{level.teacherName || 'غير محدد'}</span>
                                            </div>
                                            
                                            {level.timing && level.timing.length > 0 && (
                                                <div className="space-y-1">
                                                    {level.timing.map((time, timeIndex) => (
                                                        <div key={timeIndex} className="flex items-center text-gray-700">
                                                            <Clock className="w-5 h-5 text-gray-500 ml-2" />
                                                            <span className="text-sm">
                                                                {time.day} - من {time.start} إلى {time.end}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        
                                        <button
                                            onClick={() => handleRegister(selectedLanguage, level)}
                                            className="w-full bg-primary hover:bg-primary-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-300"
                                        >
                                            التسجيل
                                        </button>
                                    </div>
                                </div>
                            )) || (
                                <div className="col-span-full text-center py-8">
                                    <p className="text-gray-500 text-lg">لا توجد مستويات متاحة حالياً</p>
                                </div>
                            )}
                        </div>
                        
                        {/* European Framework Info */}
                        <div className="mt-8 bg-primary-50 border border-primary-200 rounded-lg p-6">
                            <h4 className="font-bold text-primary mb-2">نظام التقييم الأوروبي المعتمد (CEFR)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-700">
                                <div><strong>A1-A2:</strong> مستوى أساسي</div>
                                <div><strong>B1-B2:</strong> مستوى متوسط</div>
                                <div><strong>C1-C2:</strong> مستوى متقدم</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Registration Form Modal */}
                {showRegistrationForm && selectedLanguage && selectedLevel && (
                    <UnifiedRegistrationForm
                        courseType="language"
                        courseData={selectedLanguage}
                        onClose={() => {
                            setShowRegistrationForm(false);
                            setSelectedLanguage(null);
                            setSelectedLevel(null);
                        }}
                        onSuccess={handleRegistrationSuccess}
                    />
                )}
            </div>
        </div>
    );
};

export default LanguagesPage;
