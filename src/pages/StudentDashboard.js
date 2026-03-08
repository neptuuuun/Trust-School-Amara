import React, { useState, useEffect, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  doc,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { useBranch } from '../contexts/BranchContext';
import PaymentUploadForm from '../components/PaymentUploadForm';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { submitVerificationRequest } from '../services/userService';
import { getYearById } from '../data/studyLevels';
import { 
  User, 
  BookOpen, 
  CreditCard, 
  Bell,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Eye,
  Check,
  X,
  BadgeCheck,
  Briefcase,
  CalendarDays
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const StudentDashboard = () => {
  const [user] = useAuthState(auth);
  const { logout } = useAuth();
  const { selectedBranch, selectedBranchId } = useBranch();
  const [studentData, setStudentData] = useState(null);
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);
  const [verificationFiles, setVerificationFiles] = useState({ profile: null, idCard: null });
  const [enrolledSubjects, setEnrolledSubjects] = useState([]);
  const [payments, setPayments] = useState([]);
  const [supportRegistrations, setSupportRegistrations] = useState([]);
  const [pendingLanguageForms, setPendingLanguageForms] = useState([]);
  const [pendingTrainingForms, setPendingTrainingForms] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [annualFeeStatus, setAnnualFeeStatus] = useState({ paid: false, status: 'unpaid' });
  const [registrationSnapshot, setRegistrationSnapshot] = useState({ languages: [], trainings: [], annualFeeHistory: [] });
  const [supportLessonsMap, setSupportLessonsMap] = useState({});
  const [supportLessonsLoading, setSupportLessonsLoading] = useState(false);
  const navigate = useNavigate();

  const isActiveRef = useRef(false);
  const listenersSetupRef = useRef(false);
  const supportYearBackfillAttemptRef = useRef(new Set());

  // Annual fee computed values - based on SINGLE SOURCE OF TRUTH (branches/{branchId}/annualPayments)
  const isAnnualFeePaid = annualFeeStatus.status === 'verified';
  const isAnnualFeePending = annualFeeStatus.status === 'pending';
  const isAnnualFeeUnpaid = !isAnnualFeePaid && !isAnnualFeePending;
  const AnnualFeeIcon = isAnnualFeePaid ? Check : isAnnualFeePending ? Clock : X;
  const annualFeeIconClasses = isAnnualFeePaid
    ? 'bg-green-100 text-green-600'
    : isAnnualFeePending
      ? 'bg-amber-100 text-amber-600'
      : 'bg-red-100 text-red-600';
  const annualFeeTitle =
    isAnnualFeePaid
      ? 'تم دفع الرسوم السنوية ✓'
      : isAnnualFeePending
        ? 'الرسوم السنوية - قيد المراجعة ⏳'
        : 'الرسوم السنوية غير مدفوعة';
  const annualFeeSubtitle = isAnnualFeePaid
    ? `تم التحقق والتفعيل في: ${annualFeeStatus.date?.toLocaleDateString('ar-DZ') || 'غير معروف'}`
    : isAnnualFeePending
      ? 'بانتظار التحقق من الإدارة - سيتم إشعارك عند الموافقة'
      : 'الرسوم السنوية: 1000 دج';
  const annualFeeBadge = isAnnualFeePaid
    ? { text: 'مسجل ومفعّل ✓', classes: 'bg-green-50 text-green-700 border border-green-200' }
    : isAnnualFeePending
      ? { text: 'بانتظار التحقق ⏳', classes: 'bg-amber-50 text-amber-700 border border-amber-200' }
      : null;
  const annualFeeSummaryText = isAnnualFeePaid
    ? 'مدفوعة ✓'
    : isAnnualFeePending
      ? 'قيد المراجعة ⏳'
      : 'غير مدفوعة';
  const AnnualFeeSummaryIcon = isAnnualFeePaid ? CheckCircle : isAnnualFeePending ? Clock : XCircle;

  // Combined effect for all data fetching
  useEffect(() => {
    isActiveRef.current = true;
    
    if (!user?.uid || !selectedBranchId) {
      setStudentData(null);
      setRegistrationSnapshot({ languages: [], trainings: [], annualFeeHistory: [] });
      setSupportRegistrations([]);
      setLoading(false);
      return;
    }

    if (listenersSetupRef.current) {
      return;
    }
    listenersSetupRef.current = true;

    setLoading(true);
    const unsubscribes = [];

    const setupAllListeners = async () => {
      try {
        // 1. Student data listener
        const userDocRef = doc(db, 'branches', selectedBranchId, 'users', user.uid);
        const unsubStudent = onSnapshot(
          userDocRef,
          (snapshot) => {
            if (!isActiveRef.current) return;
            
            if (snapshot.exists()) {
              const data = { id: snapshot.id, ...snapshot.data() };

              console.log('[StudentDashboard] Canonical user doc snapshot', {
                path: userDocRef.path,
                verificationStatus: data?.verificationStatus,
                status: data?.status,
                doc: data,
              });

              setStudentData(data);
              setRegistrationSnapshot({
                languages: Array.isArray(data.registrations?.languages) ? data.registrations.languages : [],
                trainings: Array.isArray(data.registrations?.trainings) ? data.registrations.trainings : [],
                annualFeeHistory: Array.isArray(data.registrations?.annualFeeHistory) ? data.registrations.annualFeeHistory : [],
                annualFee: data.registrations?.annualFee || null
              });
              setLoading(false);
              
              if (data.branchId && unsubscribes.length === 1) {
                setupDependentListeners(data.branchId);
              }
            } else {
              setStudentData(null);
              setLoading(false);
            }
          },
          (error) => {
            console.error('Student data error:', error);
            if (isActiveRef.current) {
              setStudentData(null);
              setRegistrationSnapshot({ languages: [], trainings: [], annualFeeHistory: [] });
              setLoading(false);
            }
          }
        );
        unsubscribes.push(unsubStudent);

        // 2. Annual fee listener - SINGLE SOURCE OF TRUTH: branches/{branchId}/annualPayments
        const annualPaymentsQuery = query(
          collection(db, 'branches', selectedBranchId, 'annualPayments'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const unsubAnnualFee = onSnapshot(
          annualPaymentsQuery,
          (snapshot) => {
            if (!isActiveRef.current) return;
            
            if (snapshot.docs.length > 0) {
              // Get the latest annual payment (most recent)
              const latestPayment = snapshot.docs[0].data();
              const isVerified = latestPayment.status === 'verified';
              
              setAnnualFeeStatus({
                paid: isVerified,
                status: isVerified ? 'verified' : (latestPayment.status || 'pending'),
                date: latestPayment.verifiedAt?.toDate?.() || latestPayment.createdAt?.toDate?.()
              });
            } else {
              // No annual payment found
              setAnnualFeeStatus({ paid: false, status: 'unpaid' });
            }
          },
          (error) => {
            console.error('Annual fee error:', error);
            if (isActiveRef.current) {
              setAnnualFeeStatus({ paid: false, status: 'unpaid' });
            }
          }
        );
        unsubscribes.push(unsubAnnualFee);

        // 3. Support lesson registrations listener (global collection)
        const supportRegsQuery = query(
          collection(db, 'supportLessonRegistrations'),
          where('userId', '==', user.uid)
        );
        const unsubSupportRegs = onSnapshot(
          supportRegsQuery,
          (snapshot) => {
            if (!isActiveRef.current) return;
            const regs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSupportRegistrations(regs);
          },
          (error) => {
            console.error('Support registrations error:', error);
            if (isActiveRef.current) setSupportRegistrations([]);
          }
        );
        unsubscribes.push(unsubSupportRegs);

        // 4. Pending language registrations (student-scoped forms)
        const languageFormsRef = collection(
          db,
          'branches',
          selectedBranchId,
          'languagesForms',
          user.uid,
          'languageFormEntries'
        );
        const unsubPendingLanguages = onSnapshot(
          languageFormsRef,
          (snapshot) => {
            if (!isActiveRef.current) return;
            const pending = snapshot.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((entry) => String(entry.status || '').toLowerCase() === 'pending')
              .sort((a, b) => {
                const aDate = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt || 0);
                const bDate = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(b.submittedAt || 0);
                return bDate - aDate;
              });
            setPendingLanguageForms(pending);
          },
          (error) => {
            console.error('Pending language forms error:', error);
            if (isActiveRef.current) setPendingLanguageForms([]);
          }
        );
        unsubscribes.push(unsubPendingLanguages);

        // 5. Pending training registrations (student-scoped forms)
        const trainingFormsRef = collection(
          db,
          'branches',
          selectedBranchId,
          'trainingsForms',
          user.uid,
          'trainingFormEntries'
        );
        const unsubPendingTrainings = onSnapshot(
          trainingFormsRef,
          (snapshot) => {
            if (!isActiveRef.current) return;
            const pending = snapshot.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((entry) => String(entry.status || '').toLowerCase() === 'pending')
              .sort((a, b) => {
                const aDate = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt || 0);
                const bDate = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(b.submittedAt || 0);
                return bDate - aDate;
              });
            setPendingTrainingForms(pending);
          },
          (error) => {
            console.error('Pending training forms error:', error);
            if (isActiveRef.current) setPendingTrainingForms([]);
          }
        );
        unsubscribes.push(unsubPendingTrainings);

      } catch (error) {
        console.error('Setup error:', error);
        if (isActiveRef.current) {
          setLoading(false);
        }
      }
    };

    const setupDependentListeners = (branchId) => {
      try {
        // 3. Subjects listener
        const subjectsQuery = query(
          collection(db, 'branches', branchId, 'studentSubjects'),
          where('studentId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const unsubSubjects = onSnapshot(
          subjectsQuery,
          (snapshot) => {
            if (!isActiveRef.current) return;
            setEnrolledSubjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          },
          (error) => {
            console.error('Subjects error:', error);
            if (isActiveRef.current) setEnrolledSubjects([]);
          }
        );
        unsubscribes.push(unsubSubjects);

        // 4. Payments listener
        const paymentsQuery = query(
          collection(db, 'branches', branchId, 'payments'),
          where('userId', '==', user.uid),
          where('branchId', '==', branchId),
          orderBy('createdAt', 'desc')
        );
        const unsubPayments = onSnapshot(
          paymentsQuery,
          (snapshot) => {
            if (!isActiveRef.current) return;
            setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          },
          (error) => {
            console.error('Payments error:', error);
            if (isActiveRef.current) setPayments([]);
          }
        );
        unsubscribes.push(unsubPayments);

        // 5. Notifications listener
        const notificationsQuery = query(
          collection(db, 'notifications'),
          where('target', 'in', ['all', user.uid]),
          orderBy('createdAt', 'desc')
        );
        const unsubNotifications = onSnapshot(
          notificationsQuery,
          (snapshot) => {
            if (!isActiveRef.current) return;
            setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          },
          (error) => {
            console.error('Notifications error:', error);
            if (isActiveRef.current) setNotifications([]);
          }
        );
        unsubscribes.push(unsubNotifications);

      } catch (error) {
        console.error('Dependent listeners error:', error);
      }
    };

    setupAllListeners();

    return () => {
      isActiveRef.current = false;
      listenersSetupRef.current = false;
      
      unsubscribes.forEach(unsub => {
        if (typeof unsub === 'function') {
          try {
            unsub();
          } catch (error) {
            console.error('Unsubscribe error:', error);
          }
        }
      });
    };
  }, [user?.uid, selectedBranchId]);

  const getPaymentStatusIcon = (status) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getPaymentStatusText = (status) => {
    switch (status) {
      case 'approved':
        return 'مقبولة';
      case 'rejected':
        return 'مرفوضة';
      case 'pending':
        return 'قيد المراجعة';
      default:
        return 'غير محدد';
    }
  };

  const handlePaymentUpload = (paymentType, amount, serviceRef, serviceName) => {
    setSelectedPayment({
      type: paymentType,
      amount,
      serviceRef,
      serviceName
    });
    setShowPaymentForm(true);
  };

  const handlePaymentComplete = (paymentData) => {
    setShowPaymentForm(false);
    setSelectedPayment(null);
    alert('تم رفع الدفعة بنجاح. سيتم مراجعتها من قبل الإدارة.');
  };

  const isSubjectExpired = (expiresAt) => {
    if (!expiresAt) return false;
    const expiry = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    return expiry < new Date();
  };

  const isSubjectExpiringSoon = (expiresAt) => {
    if (!expiresAt) return false;
    const expiry = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    const daysUntilExpiry = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  };

  const formatRegistrationDate = (value) => {
    if (!value) return '—';
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const parseMonthValue = (value) => {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (Number.isNaN(year) || Number.isNaN(month)) return null;
    return new Date(year, month - 1, 1);
  };

  const formatSupportMonthLabel = (value) => {
    if (!value) return '—';
    const asDate = parseMonthValue(value);
    if (asDate) {
      return asDate.toLocaleDateString('ar-DZ', { month: 'long', year: 'numeric' });
    }
    return value;
  };

  const getSupportStatusKey = (reg) => {
    if (!reg) return 'pending';
    const rawStatus = reg.status ?? (reg.verified ? 'verified' : 'pending');
    return String(rawStatus).toLowerCase();
  };

  const getSupportStatusInfo = (reg) => {
    const key = getSupportStatusKey(reg);
    switch (key) {
      case 'verified':
      case 'approved':
        return {
          key,
          label: 'مقبول',
          classes: 'text-green-700'
        };
      case 'rejected':
        return {
          key,
          label: 'مرفوض',
          classes: 'text-red-700'
        };
      case 'pending':
        return {
          key,
          label: 'في انتظار التأكيد',
          classes: 'text-amber-700'
        };
      default:
        return {
          key,
          label: 'في انتظار التأكيد',
          classes: 'text-amber-700'
        };
    }
  };

  const sortedLanguageRegistrations = [...registrationSnapshot.languages].sort((a, b) => (b.registeredAt || 0) - (a.registeredAt || 0));
  const sortedTrainingRegistrations = [...registrationSnapshot.trainings].sort((a, b) => (b.registeredAt || 0) - (a.registeredAt || 0));
  const sortedAnnualFeeHistory = [...registrationSnapshot.annualFeeHistory].sort((a, b) => (b.registeredAt || 0) - (a.registeredAt || 0));

  const normalizedSupportRegistrations = supportRegistrations
    .map((reg) => {
      const start = reg.startDate?.toDate
        ? reg.startDate.toDate()
        : reg.startDate
        ? new Date(reg.startDate)
        : reg.createdAt?.toDate
        ? reg.createdAt.toDate()
        : null;
      const rawDuration = reg.durationInMonths != null ? Number(reg.durationInMonths) : null;
      const durationMonths = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null;
      let end = reg.endDate?.toDate
        ? reg.endDate.toDate()
        : reg.endDate
        ? new Date(reg.endDate)
        : null;

      if (!end && start instanceof Date && !Number.isNaN(start.getTime()) && durationMonths) {
        const computedEnd = new Date(start.getTime());
        computedEnd.setMonth(computedEnd.getMonth() + durationMonths);
        end = computedEnd;
      }

      return {
        ...reg,
        _startDateObj: start,
        _endDateObj: end,
        _durationMonthsNumeric: durationMonths
      };
    })
    .sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return bTime - aTime;
    });
  
  const supportPaymentSummary = (() => {
    const verifiedRegs = normalizedSupportRegistrations
      .filter((reg) => {
        const key = getSupportStatusKey(reg);
        return key === 'verified' || key === 'approved';
      })
      .filter((reg) => reg._startDateObj instanceof Date && !Number.isNaN(reg._startDateObj.getTime()));

    if (verifiedRegs.length === 0) {
      return { hasVerified: false, lastMonthLabel: null, nextMonthLabel: null };
    }

    verifiedRegs.sort((a, b) => b._startDateObj - a._startDateObj);
    const lastReg = verifiedRegs[0];
    const duration = Number.isFinite(Number(lastReg.durationInMonths)) ? Number(lastReg.durationInMonths) : 1;
    const nextDate = new Date(lastReg._startDateObj.getTime());
    nextDate.setMonth(nextDate.getMonth() + duration);

    const lastMonthLabel = lastReg._startDateObj.toLocaleDateString('ar-DZ', { month: 'long', year: 'numeric' });
    const nextMonthLabel = Number.isNaN(nextDate.getTime())
      ? '—'
      : nextDate.toLocaleDateString('ar-DZ', { month: 'long', year: 'numeric' });

    return {
      hasVerified: true,
      lastMonthLabel,
      nextMonthLabel
    };
  })();

  useEffect(() => {
    if (!supportRegistrations || supportRegistrations.length === 0) return;

    const regsMissingYear = supportRegistrations.filter((reg) => {
      if (!reg || !reg.id) return false;
      if (supportYearBackfillAttemptRef.current.has(reg.id)) return false;
      return !reg.studyYearId && !reg.studyYearLabel && Boolean(reg.lessonId);
    });

    if (regsMissingYear.length === 0) return;

    regsMissingYear.forEach(async (reg) => {
      supportYearBackfillAttemptRef.current.add(reg.id);

      try {
        const branchId = reg.branchId || selectedBranchId;
        if (!branchId) return;

        const lessonRef = doc(db, 'branches', branchId, 'supportLessons', reg.lessonId);
        const lessonSnap = await getDoc(lessonRef);
        if (!lessonSnap.exists()) return;

        const lesson = lessonSnap.data() || {};
        const studyYearId = lesson.year || lesson.grade || null;
        if (!studyYearId) return;

        const studyYearLabel = lesson.studyLevel || '';
        const studyLevelId = lesson.level || null;

        const registrationRef = doc(db, 'supportLessonRegistrations', reg.id);
        await updateDoc(registrationRef, {
          studyYearId,
          studyYearLabel,
          studyLevelId
        });
      } catch (e) {
        console.error('Support lesson year backfill failed:', e);
      }
    });
  }, [supportRegistrations, selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId || !supportRegistrations || supportRegistrations.length === 0) {
      setSupportLessonsMap({});
      setSupportLessonsLoading(false);
      return;
    }

    const uniqueLessonIds = Array.from(
      new Set(
        supportRegistrations
          .map((reg) => reg.lessonId)
          .filter(Boolean)
      )
    );

    const missingIds = uniqueLessonIds.filter((id) => !supportLessonsMap[id]);
    if (missingIds.length === 0) return;

    let cancelled = false;

    const loadLessons = async () => {
      try {
        setSupportLessonsLoading(true);

        const results = await Promise.all(
          missingIds.map(async (lessonId) => {
            try {
              const anyReg = supportRegistrations.find((reg) => reg.lessonId === lessonId);
              const branchIdForLesson = anyReg?.branchId || selectedBranchId;
              if (!branchIdForLesson) {
                return { lessonId, data: null };
              }

              const lessonRef = doc(db, 'branches', branchIdForLesson, 'supportLessons', lessonId);
              const snap = await getDoc(lessonRef);
              if (!snap.exists()) {
                return { lessonId, data: null };
              }
              return { lessonId, data: { id: snap.id, ...snap.data() } };
            } catch (error) {
              console.error('Failed to load support lesson', lessonId, error);
              return { lessonId, data: null };
            }
          })
        );

        if (cancelled) return;

        setSupportLessonsMap((prev) => {
          const next = { ...prev };
          results.forEach(({ lessonId, data }) => {
            if (!next[lessonId]) {
              next[lessonId] = data;
            }
          });
          return next;
        });
      } finally {
        if (!cancelled) {
          setSupportLessonsLoading(false);
        }
      }
    };

    loadLessons();

    return () => {
      cancelled = true;
    };
  }, [selectedBranchId, supportRegistrations, supportLessonsMap]);

  // Computed verification status
  const normalizedVerificationStatus = String(studentData?.verificationStatus || '').toLowerCase();
  const isStudentVerificationPending = normalizedVerificationStatus === 'pending';
  const isStudentVerified = normalizedVerificationStatus === 'verified';
  const isStudentRejectedOrUnverified =
    normalizedVerificationStatus === 'rejected' ||
    normalizedVerificationStatus === 'unverified' ||
    normalizedVerificationStatus === '';

  const handleResubmitVerification = async () => {
    if (!user?.uid || !selectedBranchId) return;
    if (!verificationFiles.profile || !verificationFiles.idCard) {
      alert('يرجى رفع الصورة الشخصية وصورة بطاقة الهوية لإعادة التقديم');
      return;
    }

    try {
      setVerificationSubmitting(true);
      await submitVerificationRequest(
        selectedBranchId,
        user.uid,
        verificationFiles.profile,
        verificationFiles.idCard
      );
      setVerificationFiles({ profile: null, idCard: null });
      alert('✅ تم إرسال طلب التحقق من جديد. سيتم مراجعته من طرف الإدارة.');
    } catch (e) {
      console.error('Resubmit verification failed:', e);
      alert('❌ فشل إرسال طلب التحقق: ' + (e?.message || 'خطأ غير معروف'));
    } finally {
      setVerificationSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <main className="pt-20">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <span className="mr-4 text-lg">جاري التحميل...</span>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!studentData) {
    return (
      <>
        <Header />
        <main className="pt-20">
          <div className="text-center py-12">
            <User className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <p className="text-xl text-gray-600">لم يتم العثور على بيانات الطالب</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="pt-20">
        <div className="space-y-8">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-secondary text-white rounded-xl p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {studentData.profilePictureUrl && (
                  <img
                    src={studentData.profilePictureUrl}
                    alt="Profile"
                    className="w-16 h-16 rounded-full border-4 border-white mr-4"
                  />
                )}
                <div>
                  <h1 className="text-3xl font-bold mb-2">
                    مرحباً {studentData.name}
                  </h1>
                  <p className="text-primary-100">
                    {studentData.branchName} - طالب
                  </p>
                  {studentData.idCardUrl && (
                    <a
                      href={studentData.idCardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-200 hover:text-white text-sm underline"
                    >
                      عرض بطاقة الهوية
                    </a>
                  )}
                </div>
              </div>
              <div className="text-left flex items-center space-x-3 space-x-reverse">
                
                {/* Verification Status */}
                <div className={`rounded-lg p-4 ${
                  isStudentVerified
                    ? 'bg-green-500 bg-opacity-20' 
                    : 'bg-yellow-500 bg-opacity-20'
                }`}>
                  <p className="text-sm opacity-90">حالة التحقق</p>
                  <p className="text-xl font-bold flex items-center gap-2">
                    {isStudentVerified ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        موثق ✓
                      </>
                    ) : (
                      <>
                        <Clock className="w-5 h-5" />
                        قيد المراجعة
                      </>
                    )}
                  </p>
                </div>
                
                {/* Yearly Fee Status */}
                <div className="bg-white bg-opacity-20 rounded-lg p-4 text-right">
                  <p className="text-sm opacity-90">الرسوم السنوية</p>
                  <p className="text-xl font-bold flex items-center gap-2">
                    <AnnualFeeSummaryIcon className="w-5 h-5" />
                    {annualFeeSummaryText}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Verification Warning */}
          {isStudentVerificationPending && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-8 h-8 text-yellow-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-yellow-900 mb-2">
                    حسابك قيد المراجعة
                  </h3>
                  <p className="text-yellow-800 mb-3">
                    تم استلام طلب التسجيل الخاص بك. يقوم فريق الإدارة بمراجعة معلوماتك حالياً.
                    سيتم إشعارك عند الموافقة على حسابك.
                  </p>
                  <div className="bg-yellow-100 rounded-lg p-3 text-sm text-yellow-900">
                    <p className="font-semibold mb-1">بعد الموافقة، ستتمكن من:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>التسجيل في دورات اللغات</li>
                      <li>التسجيل في الدورات التكوينية</li>
                      <li>دفع الرسوم السنوية للوصول إلى دروس الدعم</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Course Registration Pending Banner */}
          {(pendingLanguageForms.length > 0 || pendingTrainingForms.length > 0) && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <Clock className="w-8 h-8 text-blue-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-blue-900 mb-2">
                    طلبات التسجيل في الدورات قيد المراجعة
                  </h3>
                  <p className="text-blue-800 mb-3">
                    تم استلام طلباتك وسيتم تفعيل الوصول فور موافقة الإدارة.
                  </p>
                  <div className="bg-white rounded-lg border border-blue-200 p-4 space-y-2">
                    {pendingLanguageForms.slice(0, 5).map((entry) => (
                      <div key={entry.formId || entry.id} className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-gray-900">
                          {entry.languageName || 'لغة'} {entry.levelLabel ? `- ${entry.levelLabel}` : ''}
                        </span>
                        <span className="text-amber-700 font-semibold">قيد المراجعة ⏳</span>
                      </div>
                    ))}
                    {pendingTrainingForms.slice(0, 5).map((entry) => (
                      <div key={entry.formId || entry.id} className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-gray-900">
                          {entry.trainingTitle || entry.trainingName || 'دورة تكوينية'}
                        </span>
                        <span className="text-amber-700 font-semibold">قيد المراجعة ⏳</span>
                      </div>
                    ))}
                    {(pendingLanguageForms.length + pendingTrainingForms.length) > 10 && (
                      <p className="text-xs text-gray-600 mt-2">
                        يوجد المزيد من الطلبات قيد المراجعة.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isStudentRejectedOrUnverified && !isStudentVerified && (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-8 h-8 text-gray-700 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">التحقق غير مكتمل</h3>
                  <p className="text-gray-700 mb-4">
                    يمكنك إعادة رفع الوثائق لإرسال طلب تحقق جديد.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">الصورة الشخصية</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setVerificationFiles((prev) => ({ ...prev, profile: e.target.files?.[0] || null }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">صورة بطاقة الهوية</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setVerificationFiles((prev) => ({ ...prev, idCard: e.target.files?.[0] || null }))}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleResubmitVerification}
                    disabled={verificationSubmitting}
                    className="mt-4 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors font-semibold disabled:opacity-50"
                  >
                    {verificationSubmitting ? 'جاري الإرسال...' : 'إرسال طلب تحقق جديد'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Payment Upload Modal */}
          {showPaymentForm && selectedPayment && (
            <PaymentUploadForm
              paymentType={selectedPayment.type}
              amount={selectedPayment.amount}
              serviceRef={selectedPayment.serviceRef}
              serviceName={selectedPayment.serviceName}
              onComplete={handlePaymentComplete}
              onCancel={() => {
                setShowPaymentForm(false);
                setSelectedPayment(null);
              }}
            />
          )}

          {/* Annual Fee Status */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 mb-8">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-primary flex items-center">
                <CreditCard className="ml-3 h-6 w-6" />
                حالة الرسوم السنوية
              </h2>
            </div>
            <div className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4 flex-1">
                  <div className={`p-3 rounded-full ${annualFeeIconClasses}`}>
                    <AnnualFeeIcon className="h-8 w-8" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">
                      {annualFeeTitle}
                    </h3>
                    <p className="text-gray-600 mb-2">
                      {annualFeeSubtitle}
                    </p>
                    {annualFeeBadge && (
                      <div className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold ${annualFeeBadge.classes}`}>
                        {annualFeeBadge.text}
                      </div>
                    )}
                  </div>
                </div>

                {isAnnualFeeUnpaid && (
                  <button
                    onClick={() => navigate('/annual-fee')}
                    className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors font-semibold whitespace-nowrap"
                  >
                    دفع الرسوم السنوية الآن
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Registrations overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-md border border-gray-100">
              <div className="p-6 border-b border-gray-200 flex items-center gap-3">
                <BadgeCheck className="w-5 h-5 text-green-500" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">تسجيلات اللغات</h3>
                  <p className="text-sm text-gray-500">آخر الطلبات المقبولة</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                {sortedLanguageRegistrations.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center">لا توجد تسجيلات مؤكدة بعد.</p>
                ) : (
                  sortedLanguageRegistrations.slice(0, 5).map((entry) => (
                    <div key={entry.formId || `${entry.languageName}-${entry.registeredAt}`} className="border border-gray-100 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{entry.languageName || 'لغة غير محددة'}</p>
                          <p className="text-sm text-gray-600">المستوى: {entry.levelLabel || '—'}</p>
                        </div>
                        <span className="text-xs text-gray-500">{formatRegistrationDate(entry.registeredAt)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border border-gray-100">
              <div className="p-6 border-b border-gray-200 flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">تسجيلات دروس الدعم</h3>
                  <p className="text-sm text-gray-500">الحالية والمعلقة</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                {normalizedSupportRegistrations.filter((reg) => getSupportStatusKey(reg) !== 'rejected').length === 0 ? (
                  <p className="text-sm text-gray-500 text-center">لا توجد تسجيلات في دروس الدعم بعد.</p>
                ) : (
                  normalizedSupportRegistrations
                    .filter((reg) => getSupportStatusKey(reg) !== 'rejected')
                    .slice(0, 5)
                    .map((reg) => {
                    const statusInfo = getSupportStatusInfo(reg);
                    const yearMeta = reg.studyYearId ? getYearById(reg.studyYearId) : null;
                    const displayYearLabel = reg.yearName || reg.studyYearLabel || yearMeta?.nameShort || yearMeta?.name || null;
                    const hasYear = Boolean(displayYearLabel);
                    const lessonFromMap = reg.lessonId ? supportLessonsMap[reg.lessonId] : null;
                    const lessonName = reg.subjectName || lessonFromMap?.name || reg.lessonName || null;
                    const subjectWithYear = hasYear
                      ? `${lessonName || 'المادة غير متوفرة'} - ${displayYearLabel}`
                      : 'خطأ بيانات: السنة الدراسية مفقودة';

                    const durationMonths =
                      reg._durationMonthsNumeric != null
                        ? reg._durationMonthsNumeric
                        : reg.durationInMonths != null
                        ? Number(reg.durationInMonths)
                        : null;
                    const formattedDuration = Number.isFinite(durationMonths) ? `${durationMonths}` : null;

                    const rawMonthlyPrice =
                      lessonFromMap?.monthlyPrice ??
                      lessonFromMap?.priceMonthly ??
                      lessonFromMap?.price ??
                      reg.monthlyPrice ??
                      null;
                    const monthlyPrice =
                      rawMonthlyPrice != null && Number.isFinite(Number(rawMonthlyPrice))
                        ? Number(rawMonthlyPrice)
                        : null;
                    const totalAmount =
                      monthlyPrice != null && Number.isFinite(durationMonths)
                        ? monthlyPrice * durationMonths
                        : reg.totalPrice != null && Number.isFinite(Number(reg.totalPrice))
                        ? Number(reg.totalPrice)
                        : null;

                    return (
                      <div key={reg.id} className="border border-gray-100 rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-gray-900">
                            {subjectWithYear}
                          </p>
                          <span className={`text-sm font-semibold ${statusInfo.classes}`}>
                            الحالة: {statusInfo.label}
                          </span>
                        </div>
                        {!hasYear && (
                          <p className="text-sm text-red-700">
                            لا يمكن عرض المادة أو السعر بدون السنة الدراسية. سيتم تصحيح البيانات تلقائياً إن أمكن، وإلا يرجى التواصل مع الإدارة.
                          </p>
                        )}
                        <p className="text-sm text-gray-700">
                          عدد الأشهر: <span className="font-medium text-gray-900">{formattedDuration ?? 'غير محدد'}</span>
                        </p>
                        <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
                          <div>
                            <p className="text-gray-500">السعر الشهري</p>
                            <p className="font-semibold text-gray-900">
                              {hasYear
                                ? monthlyPrice != null
                                  ? `${monthlyPrice} دج`
                                  : 'غير متوفر'
                                : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">المبلغ الإجمالي</p>
                            <p className="font-semibold text-gray-900">
                              {hasYear
                                ? totalAmount != null
                                  ? `${totalAmount} دج`
                                  : 'غير متوفر'
                                : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">من</p>
                            <p className="font-semibold text-gray-900">
                              {reg._startDateObj ? reg._startDateObj.toLocaleDateString('ar-DZ') : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">إلى</p>
                            <p className="font-semibold text-gray-900">
                              {reg._endDateObj ? reg._endDateObj.toLocaleDateString('ar-DZ') : '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border border-gray-100">
              <div className="p-6 border-b border-gray-200 flex items-center gap-3">
                <Briefcase className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">تسجيلات الدورات التكوينية</h3>
                  <p className="text-sm text-gray-500">الدورات المؤكدة</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                {sortedTrainingRegistrations.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center">لا توجد تسجيلات مؤكدة بعد.</p>
                ) : (
                  sortedTrainingRegistrations.slice(0, 5).map((entry) => (
                    <div key={entry.registrationId || `${entry.trainingId}-${entry.registeredAt}`} className="border border-gray-100 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{entry.title || entry.trainingTitle || 'دورة غير محددة'}</p>
                          <p className="text-sm text-gray-600">السعر: {entry.price ? `${entry.price} دج` : '—'}</p>
                        </div>
                        <span className="text-xs text-gray-500">{formatRegistrationDate(entry.registeredAt)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border border-gray-100">
              <div className="p-6 border-b border-gray-200 flex items-center gap-3">
                <CalendarDays className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">الرسوم السنوية</h3>
                  <p className="text-sm text-gray-500">سجل الدفع التاريخي</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                {sortedAnnualFeeHistory.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center">لم يتم تسجيل رسوم سنوية بعد.</p>
                ) : (
                  sortedAnnualFeeHistory.slice(0, 5).map((entry) => (
                    <div key={entry.registrationId || entry.year || entry.registeredAt} className="border border-gray-100 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">سنة {entry.year || 'غير محددة'}</p>
                          <p className="text-sm text-gray-600">تم الدفع: {formatRegistrationDate(entry.registeredAt)}</p>
                        </div>
                        <BadgeCheck className="w-4 h-4 text-green-500" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default StudentDashboard;