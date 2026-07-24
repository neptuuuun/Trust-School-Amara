import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { getLanguages, isUserVerified, getStudentLanguageRegistrations } from '../services/firestoreService';
import { GraduationCap, Languages } from 'lucide-react';
import EnrollmentProfileCard from './EnrollmentProfileCard';
import ChargilyPayButton from './payments/ChargilyPayButton';
import EnrolledNotice from './payments/EnrolledNotice';
import { scheduleRows } from './academic/academicDisplay';
import { Button } from './ui/button';
import { Select, Label } from './ui/input';
import { Alert, LoadingState } from './ui/feedback';
import { DEFAULT_SCHOOL } from '../utils/personData';

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

const formatSchedule = (raw) => {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((slot) => {
        if (!slot) return null;
        const day = slot.day || slot.dayOfWeek;
        if (!day) return null;
        if (slot.start && slot.end) return `${day}: ${slot.start} - ${slot.end}`;
        return day;
      })
      .filter(Boolean)
      .join(' | ');
  }
  return '';
};

const normalizeLanguageCourse = (languageDoc) => {
  const displayName = languageDoc.languageName || languageDoc.name || 'دورة لغة';
  const levelEntries = [];

  const pushEntry = (levelId, payload = {}) => {
    if (!levelId) return;
    levelEntries.push({
      levelId,
      levelLabel: payload.label || payload.name || levelId,
      price: parseNumericPrice(payload.price ?? languageDoc.price),
      teacherName: payload.teacher || payload.teacherName || languageDoc.teacherName || '',
      schedule: formatSchedule(payload.days || payload.schedule || payload.timing),
    });
  };

  const rawLevels = languageDoc.levels;
  if (Array.isArray(rawLevels)) {
    rawLevels.forEach((level) => {
      if (!level) return;
      pushEntry(level.id || level.levelId || level.name, level);
    });
  } else if (rawLevels && typeof rawLevels === 'object') {
    Object.entries(rawLevels).forEach(([key, levelData]) => {
      if (!levelData) return;
      pushEntry(key, levelData);
    });
  }

  return { id: languageDoc.id, displayName, description: languageDoc.description || '', levelEntries };
};

const extractLevelOptions = (languages) => {
  const map = new Map();
  languages.forEach((language) => {
    language.levelEntries.forEach((entry) => {
      if (!map.has(entry.levelId)) map.set(entry.levelId, entry.levelLabel || entry.levelId);
    });
  });
  return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
};

const LanguageRegistrationForm = ({ initialSelection = null, lockSelection = false, selectedClass = null, onSuccess }) => {
  const { user } = useAuth();
  const { selectedBranchId } = useBranch();
  const { profile } = useUserProfile();

  const [languages,               setLanguages]               = useState([]);
  const [levelOptions,             setLevelOptions]             = useState([]);
  const [selectedLevel,            setSelectedLevel]            = useState('');
  const [selectedLanguageId,       setSelectedLanguageId]       = useState('');
  const [selectedLevelDetails,     setSelectedLevelDetails]     = useState(null);
  const [loading,                  setLoading]                  = useState(true);
  const [error,                    setError]                    = useState('');
  const [verified,                 setVerified]                 = useState(false);
  const [myRegistrations,          setMyRegistrations]          = useState([]);
  const [initialSelectionApplied,  setInitialSelectionApplied]  = useState(false);

  const initialSelectionLevelId    = initialSelection?.levelId    || '';
  const initialSelectionLanguageId = initialSelection?.languageId || '';
  const initialSelectionKey        = `${initialSelectionLevelId}::${initialSelectionLanguageId}`;

  useEffect(() => {
    if (!user || !selectedBranchId) {
      setLanguages([]); setLevelOptions([]); setVerified(false); setLoading(false); return;
    }
    const loadData = async () => {
      try {
        setLoading(true);
        const [verifiedStatus, languagesData, myRegs] = await Promise.all([
          isUserVerified(selectedBranchId, user.uid),
          getLanguages(selectedBranchId),
          getStudentLanguageRegistrations(selectedBranchId, user.uid).catch(() => []),
        ]);
        const normalizedLanguages = languagesData.map(normalizeLanguageCourse);
        setVerified(verifiedStatus);
        setLanguages(normalizedLanguages);
        setLevelOptions(extractLevelOptions(normalizedLanguages));
        setMyRegistrations(Array.isArray(myRegs) ? myRegs : []);
      } catch (err) {
        console.error('Error loading language form data:', err);
        setError('فشل في تحميل بيانات اللغات. يرجى المحاولة لاحقاً.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [selectedBranchId, user]);

  useEffect(() => { setSelectedLanguageId(''); setSelectedLevelDetails(null); }, [selectedLevel]);
  useEffect(() => { setInitialSelectionApplied(false); }, [initialSelectionKey]);

  const availableLanguagesForLevel = useMemo(() => {
    if (!selectedLevel) return [];
    return languages.reduce((acc, language) => {
      const entry = language.levelEntries.find((lvl) => lvl.levelId === selectedLevel);
      if (entry) acc.push({ id: language.id, name: language.displayName, description: language.description, level: entry });
      return acc;
    }, []);
  }, [languages, selectedLevel]);

  const applyLanguageSelection = (languageId, options = availableLanguagesForLevel) => {
    if (!languageId) { setSelectedLanguageId(''); setSelectedLevelDetails(null); return; }
    const match = options.find((option) => option.id === languageId);
    setSelectedLanguageId(languageId);
    setSelectedLevelDetails(
      match ? { ...match.level, languageName: match.name, languageDescription: match.description } : null
    );
  };

  const handleLanguageChange = (event) => applyLanguageSelection(event.target.value);

  // Already-paid guard: a languagesRegistered doc exists ONLY after a confirmed
  // payment (or an admin record), so its presence means "paid". Match the new
  // class-based flow by classId and the legacy flow by languageId + levelId.
  const isAlreadyEnrolled = ({ classId, languageId, levelId } = {}) =>
    myRegistrations.some((r) => {
      if (r?.paid === false) return false;
      if (classId && r.classId === classId) return true;
      const rLang = r.languageId || r.subjectId;
      if (languageId && levelId && rLang === languageId && r.levelId === levelId) return true;
      return false;
    });

  useEffect(() => {
    if (initialSelectionApplied) return;
    if (!initialSelectionLevelId) return;
    setSelectedLevel(initialSelectionLevelId);
  }, [initialSelectionApplied, initialSelectionLevelId]);

  useEffect(() => {
    if (initialSelectionApplied) return;
    if (!initialSelectionLanguageId) return;
    if (!selectedLevel || selectedLevel !== initialSelectionLevelId) return;
    const matchExists = availableLanguagesForLevel.some((option) => option.id === initialSelectionLanguageId);
    if (!matchExists) return;
    applyLanguageSelection(initialSelectionLanguageId);
    setInitialSelectionApplied(true);
  }, [initialSelectionApplied, initialSelectionLanguageId, initialSelectionLevelId, selectedLevel, availableLanguagesForLevel]);

  if (!user) return <div className="p-6" dir="rtl"><Alert variant="danger">يرجى تسجيل الدخول للوصول إلى نموذج التسجيل.</Alert></div>;
  if (!selectedBranchId) return <div className="p-6" dir="rtl"><Alert variant="warning">يرجى اختيار الفرع أولاً للمتابعة في عملية التسجيل.</Alert></div>;
  if (loading) return <div dir="rtl"><LoadingState label="جاري تحميل بيانات الدورات…" /></div>;
  if (!verified) return (
    <div className="p-6" dir="rtl">
      <Alert variant="warning" title="حسابك قيد المراجعة">
        سيتم تفعيل إمكانية التسجيل في الدورات بعد أن يقوم فريق الإدارة بتوثيق حسابك.
      </Alert>
    </div>
  );

  // ── New class-based flow: subject/teacher/group/schedules already chosen ──
  if (selectedClass) {
    const price = parseNumericPrice(selectedClass.price);
    const serviceData = {
      studentName:  profile?.name || '',
      birthDate:    profile?.birthDate   || null,
      birthPlace:   profile?.birthPlace  || '',
      school:       profile?.school || DEFAULT_SCHOOL,
      guardianPhone: profile?.guardianPhone || '',
      studentPhone:  profile?.studentPhone  || profile?.guardianPhone || '',
      classId:      selectedClass.id,
      subjectId:    selectedClass.subjectId,
      subjectName:  selectedClass.subjectName || selectedClass.name || '',
      languageId:   selectedClass.subjectId,
      languageName: selectedClass.subjectName || selectedClass.name || '',
      levelLabel:   selectedClass.level || '',
      groupName:    selectedClass.groupName || '',
      teacherName:  selectedClass.teacherName || '',
      schedules:    Array.isArray(selectedClass.schedules) ? selectedClass.schedules : [],
      price,
      serviceName:  `${selectedClass.subjectName || selectedClass.name || ''} — ${selectedClass.groupName || ''}`,
    };

    return (
      <div className="p-6" dir="rtl">
        <div className="max-w-3xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">نموذج التسجيل في دورات اللغات</h1>
            <p className="text-gray-600">راجع تفاصيل المجموعة المختارة، ثم أكمل الدفع لإتمام التسجيل.</p>
          </header>

          <EnrollmentProfileCard />
          {error && <Alert variant="danger">{error}</Alert>}

          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-2">
              <h4 className="text-lg font-semibold text-primary">
                {selectedClass.subjectName || selectedClass.name}
                {selectedClass.level ? ` · ${selectedClass.level}` : ''}
              </h4>
              <div className="text-sm text-gray-700 space-y-1">
                <p><strong>الأستاذ:</strong> {selectedClass.teacherName || '—'}</p>
                <p><strong>المجموعة:</strong> {selectedClass.groupName || '—'}</p>
                {scheduleRows(selectedClass.schedules).length > 0 && (
                  <div>
                    <strong>المواعيد:</strong>
                    <ul className="mt-1 ms-5 list-disc space-y-0.5">
                      {scheduleRows(selectedClass.schedules).map((r, i) => (
                        <li key={i}>{r.day}{r.time ? ` — ${r.time}` : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p><strong>السعر:</strong> {formatPriceText(selectedClass.price)}</p>
              </div>
            </div>

            {isAlreadyEnrolled({ classId: selectedClass.id, languageId: selectedClass.subjectId }) ? (
              <EnrolledNotice />
            ) : (
              <ChargilyPayButton
                amount={price}
                branchId={selectedBranchId}
                serviceType="language"
                serviceData={serviceData}
                disabled={price == null}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Legacy dropdown flow ──
  return (
    <div className="p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">نموذج التسجيل في دورات اللغات</h1>
          <p className="text-gray-600">اختر المستوى، ثم اللغة المناسبة، وأكمل الدفع.</p>
        </header>

        <EnrollmentProfileCard />
        {error && <Alert variant="danger">{error}</Alert>}

        {languages.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-10 text-center">
            <Languages className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">لا توجد دورات لغة مفعّلة حالياً</h3>
            <p className="text-gray-600">يرجى العودة لاحقاً أو التواصل مع الإدارة لمزيد من التفاصيل.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
            <div>
              <Label htmlFor="lang-level" required className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4" aria-hidden="true" />
                اختر المستوى
              </Label>
              <Select
                id="lang-level"
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                disabled={lockSelection && Boolean(initialSelectionLevelId)}
              >
                <option value="">— اختر المستوى (A1, A2, ... ) —</option>
                {levelOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </div>

            {selectedLevel && (
              <div>
                <Label htmlFor="lang-language" required>اختر اللغة</Label>
                <Select
                  id="lang-language"
                  value={selectedLanguageId}
                  onChange={handleLanguageChange}
                  disabled={lockSelection && Boolean(initialSelectionLanguageId)}
                >
                  <option value="">— اختر اللغة الخاصة بهذا المستوى —</option>
                  {availableLanguagesForLevel.map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.name}{` — ${formatPriceText(language.level.price)}`}
                    </option>
                  ))}
                </Select>
                {availableLanguagesForLevel.length === 0 && (
                  <Alert variant="warning" className="mt-2">لا توجد لغات مرتبطة بهذا المستوى حالياً.</Alert>
                )}
              </div>
            )}

            {selectedLevelDetails && (
              <>
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-2">
                  <h4 className="text-lg font-semibold text-primary">
                    {selectedLevelDetails.languageName} · {selectedLevelDetails.levelLabel}
                  </h4>
                  <div className="text-sm text-gray-700 space-y-1">
                    {selectedLevelDetails.languageDescription && <p>{selectedLevelDetails.languageDescription}</p>}
                    <p><strong>الأستاذ:</strong> {selectedLevelDetails.teacherName || '—'}</p>
                    <p><strong>السعر:</strong> {formatPriceText(selectedLevelDetails.price)}</p>
                    {selectedLevelDetails.schedule && (
                      <p><strong>الجدول:</strong> {selectedLevelDetails.schedule}</p>
                    )}
                  </div>
                </div>

                {isAlreadyEnrolled({ languageId: selectedLanguageId, levelId: selectedLevel }) ? (
                  <EnrolledNotice />
                ) : (
                  <ChargilyPayButton
                    amount={selectedLevelDetails.price}
                    branchId={selectedBranchId}
                    serviceType="language"
                    serviceData={{
                      studentName:  profile?.name || '',
                      birthDate:    profile?.birthDate   || null,
                      birthPlace:   profile?.birthPlace  || '',
                      school:       profile?.school || DEFAULT_SCHOOL,
                      guardianPhone: profile?.guardianPhone || '',
                      studentPhone:  profile?.studentPhone  || profile?.guardianPhone || '',
                      levelId:      selectedLevel,
                      levelLabel:   selectedLevelDetails.levelLabel,
                      languageId:   selectedLanguageId,
                      languageName: selectedLevelDetails.languageName,
                      teacherName:  selectedLevelDetails.teacherName,
                      price:        selectedLevelDetails.price,
                      serviceName:  `${selectedLevelDetails.languageName} — ${selectedLevelDetails.levelLabel}`,
                    }}
                    disabled={!selectedLanguageId}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LanguageRegistrationForm;
