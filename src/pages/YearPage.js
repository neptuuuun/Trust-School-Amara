import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { AlertCircle, X, ArrowRight } from 'lucide-react';
import { getYearById, getLevelById } from '../data/studyLevels';
import useAnnualFeeStatus from '../hooks/useAnnualFeeStatus';
import useSupportLessonRegistrationStatus from '../hooks/useSupportLessonRegistrationStatus';
import { streamSubjects, streamClasses } from '../services/firestoreService';
import SubjectGrid from '../components/academic/SubjectGrid';
import ClassCard from '../components/academic/ClassCard';
import { Button } from '../components/ui/button';
import { Alert, LoadingState } from '../components/ui/feedback';

/**
 * YearPage — support lessons for a specific level + study year.
 *
 * Route: /support-lessons/:level/:year
 *
 * New Subject → Class flow:
 *   Step 1  subjects available for this year
 *   Step 2  the chosen subject's classes (groups), each with subscription gating
 *
 * Registration remains backend-driven (monthly subscription, annual-fee + study-year
 * gated). Each class is keyed in supportLessonRegistrations by lessonId == classId,
 * so useSupportLessonRegistrationStatus works per class unchanged.
 */
function YearPage() {
  const { level: levelParam, year: yearParam } = useParams();
  const navigate = useNavigate();
  const { user, profileDoc } = useAuth();
  const { selectedBranchId } = useBranch();

  const { annualFeeStatus, loading: annualFeeLoading } = useAnnualFeeStatus(user?.uid, selectedBranchId);

  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [modal, setModal] = useState(null); // 'login' | 'fee' | null

  // CRITICAL: studyYear is the source of truth (not schoolLevel which is middle/high).
  const userStudyYear = String(profileDoc?.studyYear || '').trim() || null;
  const feeVerified = annualFeeStatus.status === 'verified';
  const canBrowse = Boolean(selectedBranchId);

  const yearData = getYearById(yearParam);
  const levelData = getLevelById(levelParam);

  // ── Catalog streams for THIS year (branch-scoped) ──────────────────────────
  useEffect(() => {
    if (!selectedBranchId || !yearParam) { setSubjects([]); setClasses([]); setLoading(false); return undefined; }
    setLoading(true);
    const unsubSubjects = streamSubjects(selectedBranchId, 'support', { studyYear: yearParam }, (rows) => {
      setSubjects(rows.filter((s) => (s.status || 'active') !== 'inactive'));
      setLoading(false);
    });
    const unsubClasses = streamClasses(
      selectedBranchId,
      { serviceType: 'support', studyYear: yearParam, activeOnly: true },
      setClasses,
    );
    return () => { unsubSubjects?.(); unsubClasses?.(); };
  }, [selectedBranchId, yearParam]);

  const classCountBySubject = useMemo(() => {
    const map = {};
    classes.forEach((c) => { map[c.subjectId] = (map[c.subjectId] || 0) + 1; });
    return map;
  }, [classes]);

  const classesForSelected = useMemo(
    () => (selectedSubject ? classes.filter((c) => c.subjectId === selectedSubject.id) : []),
    [classes, selectedSubject],
  );

  const handleRegister = (cls) => {
    if (!user) { setModal('login'); return; }
    // No fee gate here: the registration form handles CASE 1 (annual fee already
    // paid this year → monthly only) vs CASE 2 (first reg of the year → bundles
    // the annual fee + first month).
    const classYear = cls.studyYear || yearParam;
    if (userStudyYear && classYear && userStudyYear !== classYear) return; // wrong year — blocked
    navigate('/support-lesson-registration', {
      state: { lesson: { ...cls, name: cls.subjectName, studyYearLabel: yearData?.name || '' } },
    });
  };

  // ── Route validation ────────────────────────────────────────────────────────
  if (!yearData || !levelData || yearData.level.id !== levelParam) {
    return (
      <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
        <div className="container mx-auto max-w-6xl">
          <div className="bg-danger-50 border border-danger-200 rounded-xl p-8 text-center">
            <AlertCircle className="w-16 h-16 text-danger-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-danger-800 mb-3">مسار غير صحيح</h2>
            <p className="text-danger-700 mb-6">المستوى أو الصف الدراسي غير موجود.</p>
            <Button variant="danger" onClick={() => navigate('/support-lessons')}>
              العودة لصفحة دروس الدعم
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!canBrowse) {
    return (
      <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
        <div className="container mx-auto max-w-6xl">
          <div className="bg-warning-50 border border-warning-200 rounded-xl p-8 text-center">
            <AlertCircle className="w-16 h-16 text-warning-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-warning-800 mb-3">يرجى اختيار الفرع</h2>
            <p className="text-warning-700 mb-6">لعرض دروس الدعم، يرجى اختيار الفرع أولاً من الصفحة الرئيسية.</p>
            <Button onClick={() => navigate('/')}>العودة للصفحة الرئيسية</Button>
          </div>
        </div>
      </div>
    );
  }

  const showFeeBanner = !user || (!annualFeeLoading && !feeVerified);

  return (
    <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => (selectedSubject ? setSelectedSubject(null) : navigate('/support-lessons'))}
            className="flex items-center text-secondary hover:text-primary font-medium mb-4"
          >
            <ArrowRight className="w-5 h-5 me-2" />
            {selectedSubject ? 'العودة للمواد' : 'العودة لصفحة دروس الدعم'}
          </button>
          <h1 className="text-4xl md:text-5xl font-bold text-primary mb-2">{yearData.name}</h1>
          <p className="text-lg text-gray-700">{levelData.name} - {yearData.nameShort}</p>
        </div>

        {/* Fee / login banner */}
        {showFeeBanner && (
          <Alert variant="warning" className="mb-8">
            {!user
              ? 'يمكنك تصفح جميع دروس الدعم. للتسجيل، يرجى تسجيل الدخول.'
              : 'أول تسجيل في دروس الدعم هذا العام يشمل الرسوم السنوية (تُدفع مرة واحدة في السنة). التسجيلات اللاحقة شهرية فقط.'}
          </Alert>
        )}

        {/* Content */}
        <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
          {loading || (user && annualFeeLoading) ? (
            <LoadingState />
          ) : !selectedSubject ? (
            <>
              <h2 className="text-2xl font-bold text-primary mb-6">المواد المتاحة</h2>
              <SubjectGrid
                subjects={subjects}
                getClassCount={(id) => classCountBySubject[id] || 0}
                onSelect={setSelectedSubject}
                emptyText="لا توجد مواد مضافة بعد لهذه السنة"
              />
            </>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-primary">{selectedSubject.name}</h2>
                {selectedSubject.description && <p className="mt-1 text-gray-600">{selectedSubject.description}</p>}
              </div>
              {classesForSelected.length === 0 ? (
                <p className="py-8 text-center text-gray-500">لا توجد مجموعات متاحة لهذه المادة بعد.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {classesForSelected.map((cls) => (
                    <SupportClassCard
                      key={cls.id}
                      cls={cls}
                      branchId={selectedBranchId}
                      user={user}
                      userStudyYear={userStudyYear}
                      onRegister={handleRegister}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Login required modal */}
      {modal === 'login' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative">
            <button onClick={() => setModal(null)} className="absolute top-4 end-4 text-gray-400 hover:text-gray-600" aria-label="إغلاق">
              <X className="w-6 h-6" />
            </button>
            <div className="text-center">
              <div className="w-16 h-16 bg-warning-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-warning-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">تسجيل الدخول مطلوب</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">يجب تسجيل الدخول للتسجيل في دروس الدعم.</p>
              <div className="space-y-3">
                <Button fullWidth onClick={() => navigate('/login')}>تسجيل الدخول</Button>
                <Button variant="outline" fullWidth onClick={() => navigate('/register')}>إنشاء حساب جديد</Button>
                <Button variant="neutral" fullWidth onClick={() => setModal(null)}>إلغاء</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SupportClassCard — wraps the shared ClassCard with subscription-aware status
 * (per-class, from the global supportLessonRegistrations collection).
 */
function SupportClassCard({ cls, branchId, user, userStudyYear, onRegister }) {
  const { status: regStatus } = useSupportLessonRegistrationStatus(branchId, user?.uid ?? '', cls?.id ?? '');

  const mismatch = Boolean(userStudyYear && cls.studyYear && userStudyYear !== cls.studyYear);
  const cap = Number(cls.capacity) || 0;
  const isFull = cap > 0 && (Number(cls.enrollmentCount) || 0) >= cap;

  let status;
  if (regStatus === 'active') status = { type: 'verified' };
  else if (regStatus === 'pending') status = { type: 'pending' };
  else if (mismatch) status = { type: 'disabled', label: 'غير متاح لهذا المستوى', note: 'يمكنك التسجيل فقط في دروس سنتك الدراسية.' };
  else if (isFull) status = { type: 'full' };
  else if (regStatus === 'expired') status = { type: 'none', label: 'تجديد الاشتراك', note: 'اشتراكك السابق منتهٍ — يمكنك التجديد.' };
  else status = { type: 'none' };

  return <ClassCard cls={cls} status={status} onRegister={onRegister} />;
}

export default YearPage;
