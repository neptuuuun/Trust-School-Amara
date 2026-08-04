/**
 * Student · Languages (تعليم اللغات)
 *
 * New Subject → Class flow:
 *   Step 1  pick a language (Subject)
 *   Step 2  see its available groups (Classes) with teacher + schedules
 *   Step 3  Register → form opens with the class pre-filled & locked
 *
 * Fully branch-isolated (streamSubjects / streamClasses are branch-scoped).
 * Browsing is public; registering requires a logged-in, verified account.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, X, ArrowRight } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';
import {
  streamSubjects,
  streamClasses,
  streamRegisteredLanguagesForStudent,
} from '../services/firestoreService';
import { getAcademicYearLabel } from '../utils/academicYear';
import SubjectGrid from '../components/academic/SubjectGrid';
import ClassList from '../components/academic/ClassList';
import LanguageRegistrationForm from '../components/LanguageRegistrationForm';
import PageAnnouncements from '../components/announcements/PageAnnouncements';
import { Button } from '../components/ui/button';
import { LoadingState } from '../components/ui/feedback';

const LanguagesPage = () => {
  const navigate = useNavigate();
  const { selectedBranchId } = useBranch();
  const { user } = useAuth();

  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [forms, setForms] = useState([]);                  // student's own languageFormEntries
  const [adminRegistered, setAdminRegistered] = useState([]); // languagesRegistered
  const [loading, setLoading] = useState(true);

  const [selectedSubject, setSelectedSubject] = useState(null);
  const [registerClass, setRegisterClass] = useState(null);

  // ── Catalog streams (branch-scoped) ────────────────────────────────────────
  useEffect(() => {
    if (!selectedBranchId) { setSubjects([]); setClasses([]); setLoading(false); return undefined; }
    setLoading(true);
    const unsubSubjects = streamSubjects(selectedBranchId, 'language', (rows) => {
      setSubjects(rows.filter((s) => (s.status || 'active') !== 'inactive'));
      setLoading(false);
    });
    const unsubClasses = streamClasses(selectedBranchId, { serviceType: 'language', activeOnly: true, academicYear: getAcademicYearLabel() }, setClasses);
    return () => { unsubSubjects?.(); unsubClasses?.(); };
  }, [selectedBranchId]);

  // ── Student's own registration status ──────────────────────────────────────
  useEffect(() => {
    if (!selectedBranchId || !user) { setForms([]); return undefined; }
    const ref = collection(db, 'branches', selectedBranchId, 'languagesForms', user.uid, 'languageFormEntries');
    const unsub = onSnapshot(ref, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const da = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt || 0);
        const dbb = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(b.submittedAt || 0);
        return dbb - da;
      });
      setForms(rows);
    });
    return () => unsub();
  }, [selectedBranchId, user]);

  useEffect(() => {
    if (!selectedBranchId || !user) { setAdminRegistered([]); return undefined; }
    const unsub = streamRegisteredLanguagesForStudent(selectedBranchId, user.uid, setAdminRegistered);
    return () => unsub?.();
  }, [selectedBranchId, user]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const classCountBySubject = useMemo(() => {
    const map = {};
    classes.forEach((c) => { map[c.subjectId] = (map[c.subjectId] || 0) + 1; });
    return map;
  }, [classes]);

  const classesForSelected = useMemo(
    () => (selectedSubject ? classes.filter((c) => c.subjectId === selectedSubject.id) : []),
    [classes, selectedSubject],
  );

  const isClassFull = (cls) => {
    const cap = Number(cls.capacity) || 0;
    return cap > 0 && (Number(cls.enrollmentCount) || 0) >= cap;
  };

  const getClassStatus = (cls) => {
    // Admin-registered records are authoritative & always count as verified.
    if (adminRegistered.some((r) => r.classId && r.classId === cls.id)) return { type: 'verified' };
    const latest = forms.find((f) => f.classId && f.classId === cls.id);
    const s = latest ? String(latest.status || '').toLowerCase() : '';
    if (['approved', 'verified', 'registered'].includes(s)) return { type: 'verified' };
    if (s === 'pending') return { type: 'pending' };
    // 'none' or 'rejected' → registerable, unless the class is at capacity.
    if (isClassFull(cls)) return { type: 'full' };
    if (s === 'rejected') {
      return { type: 'rejected', note: latest.rejectionReason ? `سبب الرفض: ${latest.rejectionReason}` : undefined };
    }
    return { type: 'none' };
  };

  const handleRegister = (cls) => {
    if (!user) { navigate('/login'); return; }
    setRegisterClass(cls);
  };

  const closeModal = () => setRegisterClass(null);

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!selectedBranchId) {
    return (
      <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
        <div className="container mx-auto max-w-6xl">
          <div className="bg-warning-50 border border-warning-200 rounded-xl p-8 text-center">
            <h2 className="text-2xl font-bold text-warning-800 mb-3">يرجى اختيار الفرع</h2>
            <p className="text-warning-700 mb-6">لعرض دورات اللغات، يرجى اختيار الفرع أولاً من الصفحة الرئيسية.</p>
            <Button onClick={() => navigate('/')}>العودة للصفحة الرئيسية</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="languages-page py-12 px-6 md:px-12 bg-gray-50 min-h-screen" dir="rtl">
      <div className="container mx-auto max-w-6xl">
        <PageAnnouncements page="languages" />

        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">تعليم اللغات</h1>
          <p className="text-lg text-gray-700 max-w-3xl mx-auto leading-relaxed">
            اختر اللغة التي تريد تعلمها، ثم اختر المجموعة المناسبة لك وسجّل بخطوات بسيطة.
          </p>
        </div>

        {loading ? (
          <LoadingState />
        ) : !selectedSubject ? (
          /* Step 1 — choose a language */
          <div className="bg-white rounded-xl shadow-lg p-6 md:p-10">
            <h2 className="text-2xl md:text-3xl font-bold text-primary text-center mb-8">اختر اللغة التي تريد تعلمها</h2>
            <SubjectGrid
              subjects={subjects}
              getClassCount={(id) => classCountBySubject[id] || 0}
              onSelect={setSelectedSubject}
              icon={Globe}
              emptyText="لا توجد لغات متاحة حالياً"
            />
          </div>
        ) : (
          /* Step 2 — choose a class (group) */
          <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
            <ClassList
              subject={selectedSubject}
              classes={classesForSelected}
              getStatus={getClassStatus}
              onRegister={handleRegister}
              onBack={() => setSelectedSubject(null)}
              backLabel="العودة لاختيار اللغة"
              emptyText="لا توجد مجموعات متاحة لهذه اللغة بعد."
            />
          </div>
        )}

        {!selectedSubject && (
          <div className="mt-8 text-center text-sm text-gray-500">
            <button
              onClick={() => navigate('/home')}
              className="inline-flex items-center gap-1 text-secondary hover:text-primary font-medium"
            >
              <ArrowRight className="w-4 h-4" /> العودة للصفحة الرئيسية
            </button>
          </div>
        )}
      </div>

      {/* Registration modal — class pre-filled & locked */}
      {registerClass && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="نموذج التسجيل"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-y-auto max-h-[95vh]">
            <button
              onClick={closeModal}
              className="absolute top-4 end-4 text-gray-500 hover:text-gray-800 rounded-lg p-1 transition-colors"
              aria-label="إغلاق"
            >
              <X className="w-6 h-6" aria-hidden="true" />
            </button>
            <LanguageRegistrationForm
              selectedClass={registerClass}
              onSuccess={closeModal}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguagesPage;
