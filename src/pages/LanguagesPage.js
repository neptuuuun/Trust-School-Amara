import React, { useState, useEffect } from 'react';
import { Globe, Award, Users, Clock, User, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';
import LanguageRegistrationForm from '../components/LanguageRegistrationForm';

const normalizeLevel = (level, fallbackId = '') => {
    if (level == null) return null;

    if (typeof level === 'string' || typeof level === 'number') {
        const value = String(level);
        return {
            id: fallbackId || value,
            name: value,
        };
    }

    if (typeof level === 'object') {
        const id = level.id || level.levelId || fallbackId || level.name || level.label || '';
        const name = level.name || level.label || level.levelLabel || id || 'مستوى';
        return {
            ...level,
            id,
            name,
        };
    }

    return null;
};

const normalizeLevels = (rawLevels) => {
    if (!rawLevels) return [];

    if (Array.isArray(rawLevels)) {
        return rawLevels.map((lvl, index) => normalizeLevel(lvl, `lvl-${index}`)).filter(Boolean);
    }

    if (typeof rawLevels === 'object') {
        return Object.entries(rawLevels)
            .map(([key, value]) => normalizeLevel(value, key))
            .filter(Boolean);
    }

    return normalizeLevels([rawLevels]);
};

const extractLevels = (languageDoc) => {
    const rawLevels = languageDoc?.levels ?? languageDoc?.lev ?? languageDoc?.levelList ?? languageDoc?.levelData ?? null;
    return normalizeLevels(rawLevels);
};

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

const LanguagesPage = () => {
    const [selectedLanguage, setSelectedLanguage] = useState(null);
    const [languagesData, setLanguagesData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showRegistrationForm, setShowRegistrationForm] = useState(false);
    const [selectedLevel, setSelectedLevel] = useState(null);
    const [formSelection, setFormSelection] = useState(null);
    const [allForms, setAllForms] = useState([]);
    const [verifiedLanguages, setVerifiedLanguages] = useState([]);
    const { selectedBranchId } = useBranch();
    const { user } = useAuth();

    // Fetch languages data
    useEffect(() => {
        if (!selectedBranchId) {
            setLanguagesData([]);
            setLoading(false);
            return;
        }
        const unsubscribe = onSnapshot(collection(db, 'branches', selectedBranchId, 'languages'), (snapshot) => {
            const languagesData = snapshot.docs.map((doc) => {
                const data = doc.data();
                const normalizedLevels = extractLevels(data);
                const languageName = data?.languageName || data?.name || data?.language || '';
                return {
                    id: doc.id,
                    ...data,
                    name: languageName,
                    languageName,
                    normalizedLevels,
                    levelsCount: normalizedLevels.length,
                };
            });
            setLanguagesData(languagesData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedBranchId]);

    // Fetch ALL language forms (both pending and verified)
    useEffect(() => {
        if (!selectedBranchId || !user) {
            setAllForms([]);
            return;
        }

        const formsQuery = collection(
            db,
            'branches',
            selectedBranchId,
            'languagesForms',
            user.uid,
            'languageFormEntries'
        );

        const unsubscribe = onSnapshot(formsQuery, (snapshot) => {
            const forms = snapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                };
            });
            // Ensure stable evaluation when multiple attempts exist
            forms.sort((a, b) => {
                const dateA = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt || 0);
                const dateB = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(b.submittedAt || 0);
                return dateB - dateA;
            });
            setAllForms(forms);
            console.log('Language Forms:', forms); // Debug log
        });

        return () => unsubscribe();
    }, [selectedBranchId, user]);

    // Keep legacy profile summary state but it is NOT used for status gating.
    useEffect(() => {
        setVerifiedLanguages([]);
    }, [user, selectedBranchId]);

    const deriveLevelId = (level) => level?.id || level?.levelId || level?.name || '';

    const getRegistrationStatus = (languageId, level) => {
        const levelId = deriveLevelId(level);

        // SINGLE SOURCE OF TRUTH for language registrations:
        // branches/{branchId}/languagesForms/{uid}/languageFormEntries/{entryId}.status
        const relevant = allForms.filter((form) => form.languageId === languageId && form.levelId === levelId);
        const latest = relevant[0];
        if (!latest) return null;

        const normalized = String(latest.status || '').toLowerCase();
        if (['approved', 'verified', 'registered'].includes(normalized)) {
            return { type: 'verified', data: latest, source: 'form' };
        }
        if (normalized === 'rejected') {
            return { type: 'rejected', data: latest, source: 'form' };
        }
        // Default to pending for unknown/empty statuses
        return { type: 'pending', data: latest, source: 'form' };

        return null;
    };

    const handleRegister = (language, level) => {
        if (!language || !level) return;
        setSelectedLanguage(language);
        setSelectedLevel(level);
        setFormSelection({
            languageId: language.id,
            languageName: language.name,
            levelId: deriveLevelId(level),
            levelLabel: level.name,
        });
        setShowRegistrationForm(true);
    };

    const handleRegistrationSuccess = () => {
        setShowRegistrationForm(false);
        setSelectedLanguage(null);
        setSelectedLevel(null);
        setFormSelection(null);
    };

    return (
        <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
            <div className="container mx-auto max-w-6xl">
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">تعليم اللغات</h1>
                    <p className="text-lg text-gray-700 max-w-3xl mx-auto leading-relaxed">
                        تعلم اللغات الأجنبية من المستوى المبتدئ (A1) إلى الإتقان (C2) مع أفضل المدرسين المتخصصين
                    </p>
                </div>

                {!selectedLanguage ? (
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
                                    <p className="text-primary-100">{language.levelsCount ?? language.normalizedLevels?.length ?? 0} مستوى متاح</p>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
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
                            {(Array.isArray(selectedLanguage?.normalizedLevels) ? selectedLanguage.normalizedLevels : []).map((level, index) => {
                                const registrationStatus = getRegistrationStatus(selectedLanguage.id, level);
                                const isVerified = registrationStatus?.type === 'verified';
                                const isPending = registrationStatus?.type === 'pending';
                                const isRegistered = isVerified || isPending;
                                const rawPrice = level?.price ?? selectedLanguage?.price;

                                return (
                                    <div key={index} className="bg-gray-50 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden">
                                        <div className="p-6">
                                            <div className="flex items-center mb-4">
                                                <Award className="w-8 h-8 text-primary ml-3" />
                                                <h3 className="text-xl font-bold text-primary">{level?.name || `مستوى ${index + 1}`}</h3>
                                            </div>
                                            
                                            <div className="space-y-3 mb-6">
                                                <div className="flex items-center text-gray-700">
                                                    <User className="w-5 h-5 text-gray-500 ml-2" />
                                                    <span className="font-medium">{level?.teacherName || level?.teacher || 'غير محدد'}</span>
                                                </div>
                                                
                                                {typeof level?.schedule === 'string' && level.schedule ? (
                                                    <div className="flex items-center text-gray-700">
                                                        <Clock className="w-5 h-5 text-gray-500 ml-2" />
                                                        <span className="text-sm">{level.schedule}</span>
                                                    </div>
                                                ) : Array.isArray(level?.timing) && level.timing.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {level.timing.map((time, timeIndex) => (
                                                            <div key={timeIndex} className="flex items-center text-gray-700">
                                                                <Clock className="w-5 h-5 text-gray-500 ml-2" />
                                                                <span className="text-sm">
                                                                    {(time?.day || time?.dayOfWeek || 'اليوم')} - من {time?.start || '—'} إلى {time?.end || '—'}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="text-gray-700 mb-4">
                                                <span className="font-semibold">السعر:</span> {formatPriceText(rawPrice)}
                                            </div>

                                            {isVerified && (
                                                <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                                    <span className="text-green-700 font-medium text-sm">✔ مسجل ومفعّل</span>
                                                </div>
                                            )}

                                            {isPending && (
                                                <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
                                                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                                                    <span className="text-yellow-700 font-medium text-sm">⏳ بانتظار التحقق من الإدارة</span>
                                                </div>
                                            )}
                                            
                                            <button
                                                onClick={() => handleRegister(selectedLanguage, level)}
                                                disabled={isRegistered}
                                                className={`w-full font-semibold py-3 px-6 rounded-lg transition-colors duration-300 ${
                                                    isVerified
                                                        ? 'bg-green-100 text-green-700 cursor-not-allowed'
                                                        : isPending
                                                        ? 'bg-yellow-100 text-yellow-700 cursor-not-allowed'
                                                        : 'bg-primary hover:bg-primary-600 text-white'
                                                }`}
                                            >
                                                {isVerified 
                                                    ? '✔ مسجل ومفعّل' 
                                                    : isPending 
                                                    ? '⏳ بانتظار التحقق' 
                                                    : 'التسجيل'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {(!selectedLanguage?.normalizedLevels || selectedLanguage.normalizedLevels.length === 0) && (
                                <div className="col-span-full text-center py-8">
                                    <p className="text-gray-500 text-lg">لا توجد مستويات متاحة حالياً</p>
                                </div>
                            )}
                        </div>
                        
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

                {showRegistrationForm && selectedLanguage && selectedLevel && formSelection && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                        <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-y-auto max-h-[95vh]">
                            <button
                                onClick={() => {
                                    setShowRegistrationForm(false);
                                    setSelectedLanguage(null);
                                    setSelectedLevel(null);
                                    setFormSelection(null);
                                }}
                                className="absolute top-4 left-4 text-gray-500 hover:text-gray-800 text-3xl font-bold"
                                aria-label="إغلاق"
                            >
                                ×
                            </button>
                            <LanguageRegistrationForm
                                initialSelection={formSelection}
                                lockSelection
                                onSuccess={handleRegistrationSuccess}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LanguagesPage;