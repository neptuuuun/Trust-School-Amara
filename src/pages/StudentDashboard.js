import React, { useState, useEffect, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import PersonalizedAnnouncements from '../components/announcements/PersonalizedAnnouncements';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { useBranch } from '../contexts/BranchContext';
import PaymentUploadForm from '../components/PaymentUploadForm';
import PaymentCorrectionBanner from '../components/payments/PaymentCorrectionBanner';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { submitVerificationRequest } from '../services/userService';
import {
  updateUserProfile,
  streamRegisteredLanguagesForStudent,
  streamRegisteredTrainingsForStudent,
} from '../services/firestoreService';
import { getYearById } from '../data/studyLevels';
import { getComputedStatus, getExpiryLabel, STATUS_UI } from '../utils/registrationUtils';
import { formatDate, formatMonthYear } from '../utils/dateUtils';
import {
  User,
  BookOpen,
  CreditCard,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Check,
  X,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  Edit2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Lock,
  RefreshCw,
  Tag,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

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
  // All language form entries (all statuses) — student submitted
  const [allLanguageForms, setAllLanguageForms] = useState([]);
  // All training form entries (all statuses) — student submitted
  const [allTrainingForms, setAllTrainingForms] = useState([]);
  // Approved language registrations (from languagesRegistered collection, incl. admin-created)
  const [registeredLanguages, setRegisteredLanguages] = useState([]);
  // Approved training registrations (from trainingsRegistered collection, incl. admin-created)
  const [registeredTrainings, setRegisteredTrainings] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [annualFeeStatus, setAnnualFeeStatus] = useState({ paid: false, status: 'unpaid' });
  const [registrationSnapshot, setRegistrationSnapshot] = useState({ languages: [], trainings: [], annualFeeHistory: [] });
  const [supportLessonsMap, setSupportLessonsMap] = useState({});
  const [supportLessonsLoading, setSupportLessonsLoading] = useState(false);
  const navigate = useNavigate();

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDraft, setProfileDraft] = useState({});
  const [profileError, setProfileError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState({ type: '', message: '' });

  const isActiveRef = useRef(false);
  const listenersSetupRef = useRef(false);
  const supportYearBackfillAttemptRef = useRef(new Set());

  // Annual fee computed values - based on SINGLE SOURCE OF TRUTH (branches/{branchId}/annualPayments)
  const isAnnualFeePaid = annualFeeStatus.status === 'verified';
  const isAnnualFeePending = annualFeeStatus.status === 'pending';
  // needs_correction is its own state: the payment already exists and must be
  // RESUBMITTED via the correction banner — never treated as unpaid (which would
  // wrongly prompt the student to create a brand-new payment).
  const isAnnualFeeNeedsCorrection = annualFeeStatus.status === 'needs_correction';
  const isAnnualFeeUnpaid = !isAnnualFeePaid && !isAnnualFeePending && !isAnnualFeeNeedsCorrection;
  const AnnualFeeIcon = isAnnualFeePaid ? Check : isAnnualFeePending ? Clock : X;
  const annualFeeIconClasses = isAnnualFeePaid
    ? 'bg-green-100 text-green-600'
    : isAnnualFeePending
      ? 'bg-amber-100 text-amber-600'
      : 'bg-red-100 text-red-600';
  const annualFeeTitle =
    isAnnualFeePaid
      ? 'تم دفع الرسوم السنوية'
      : isAnnualFeePending
        ? 'الرسوم السنوية - قيد المراجعة'
        : 'الرسوم السنوية غير مدفوعة';
  const annualFeeSubtitle = isAnnualFeePaid
    ? `تم التحقق والتفعيل في: ${annualFeeStatus.date ? formatDate(annualFeeStatus.date) : 'غير معروف'}`
    : isAnnualFeePending
      ? 'بانتظار التحقق من الإدارة - سيتم إشعارك عند الموافقة'
      : 'الرسوم السنوية: 1000 دج';
  const annualFeeBadge = isAnnualFeePaid
    ? { text: 'مسجل ومفعّل', classes: 'bg-green-50 text-green-700 border border-green-200' }
    : isAnnualFeePending
      ? { text: 'بانتظار التحقق', classes: 'bg-amber-50 text-amber-700 border border-amber-200' }
      : null;
  const annualFeeSummaryText = isAnnualFeePaid
    ? 'مدفوعة'
    : isAnnualFeePending
      ? 'قيد المراجعة'
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
              const latestDoc = snapshot.docs[0];
              const latestPayment = latestDoc.data();
              const isVerified = latestPayment.status === 'verified';

              setAnnualFeeStatus({
                paid: isVerified,
                status: isVerified ? 'verified' : (latestPayment.status || 'pending'),
                date: latestPayment.verifiedAt?.toDate?.() || latestPayment.createdAt?.toDate?.(),
                // Carry the doc id + correction metadata so the correction banner
                // can offer a resubmit for an annual payment in needs_correction.
                id: latestDoc.id,
                correctionReason: latestPayment.correctionReason || '',
                correctionRequestedAt: latestPayment.correctionRequestedAt?.toDate?.() || null,
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

        // 4. ALL language form entries (all statuses) — student-scoped forms
        const languageFormsRef = collection(
          db,
          'branches',
          selectedBranchId,
          'languagesForms',
          user.uid,
          'languageFormEntries'
        );
        const unsubLanguageForms = onSnapshot(
          languageFormsRef,
          (snapshot) => {
            if (!isActiveRef.current) return;
            const all = snapshot.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a, b) => {
                const aDate = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt || 0);
                const bDate = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(b.submittedAt || 0);
                return bDate - aDate;
              });
            setAllLanguageForms(all);
          },
          (error) => {
            console.error('Language forms error:', error);
            if (isActiveRef.current) setAllLanguageForms([]);
          }
        );
        unsubscribes.push(unsubLanguageForms);

        // 5. ALL training form entries (all statuses) — student-scoped forms
        const trainingFormsRef = collection(
          db,
          'branches',
          selectedBranchId,
          'trainingsForms',
          user.uid,
          'trainingFormEntries'
        );
        const unsubTrainingForms = onSnapshot(
          trainingFormsRef,
          (snapshot) => {
            if (!isActiveRef.current) return;
            const all = snapshot.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a, b) => {
                const aDate = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt || 0);
                const bDate = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(b.submittedAt || 0);
                return bDate - aDate;
              });
            setAllTrainingForms(all);
          },
          (error) => {
            console.error('Training forms error:', error);
            if (isActiveRef.current) setAllTrainingForms([]);
          }
        );
        unsubscribes.push(unsubTrainingForms);

        // 6. Approved language registrations (from languagesRegistered collection)
        const unsubRegisteredLanguages = streamRegisteredLanguagesForStudent(
          selectedBranchId,
          user.uid,
          (data) => { if (isActiveRef.current) setRegisteredLanguages(data); }
        );
        unsubscribes.push(unsubRegisteredLanguages);

        // 7. Approved training registrations (from trainingsRegistered collection)
        const unsubRegisteredTrainings = streamRegisteredTrainingsForStudent(
          selectedBranchId,
          user.uid,
          (data) => { if (isActiveRef.current) setRegisteredTrainings(data); }
        );
        unsubscribes.push(unsubRegisteredTrainings);

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
    setPaymentSuccess(true);
    setTimeout(() => setPaymentSuccess(false), 6000);
  };

  const handleEditProfile = () => {
    const raw = studentData?.birthDate;
    let birthDate = '';
    if (raw) {
      if (typeof raw === 'string') birthDate = raw;
      else if (typeof raw?.toDate === 'function') birthDate = raw.toDate().toISOString().split('T')[0];
    }
    setProfileDraft({
      name: studentData?.name || studentData?.fullName || '',
      guardianPhone: studentData?.guardianPhone || studentData?.phoneNumber || '',
      studentPhone: studentData?.studentPhone || '',
      birthDate,
      birthPlace: studentData?.birthPlace || '',
      school: studentData?.school || '',
      stream: studentData?.stream || '',
    });
    setEditingProfile(true);
  };

  const handleCancelProfile = () => {
    setEditingProfile(false);
    setProfileDraft({});
  };

  const handleSaveProfile = async () => {
    if (!user?.uid || !selectedBranchId) return;
    try {
      setProfileSaving(true);
      setProfileError('');
      await updateUserProfile(selectedBranchId, user.uid, profileDraft);
      setEditingProfile(false);
      setProfileDraft({});
    } catch (e) {
      console.error('Profile save failed:', e);
      setProfileError('فشل حفظ الملف الشخصي. حاول مرة أخرى.');
    } finally {
      setProfileSaving(false);
    }
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

  const formatRegistrationDate = (value) => formatDate(value);

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
    return asDate ? formatMonthYear(asDate) : value;
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

  const sortedAnnualFeeHistory = [...registrationSnapshot.annualFeeHistory].sort((a, b) => (b.registeredAt || 0) - (a.registeredAt || 0));

  // Pending / rejected language form entries (student-submitted, not yet approved)
  const pendingLanguageForms  = allLanguageForms.filter((f) => String(f.status || '').toLowerCase() === 'pending');
  const rejectedLanguageForms = allLanguageForms.filter((f) => String(f.status || '').toLowerCase() === 'rejected');

  // Pending / rejected training form entries (student-submitted, not yet approved)
  const pendingTrainingForms  = allTrainingForms.filter((f) => String(f.status || '').toLowerCase() === 'pending');
  const rejectedTrainingForms = allTrainingForms.filter((f) => String(f.status || '').toLowerCase() === 'rejected');

  // Payments the admin has flagged for correction (needs_correction) across every
  // payment type. The PaymentCorrectionBanner lets the student re-upload a proof,
  // which returns the payment to 'pending' — the registration is never lost.
  const isNeedsCorrection = (s) => String(s || '').toLowerCase() === 'needs_correction';
  const correctionItems = [
    ...allLanguageForms.filter((f) => isNeedsCorrection(f.status)).map((f) => ({
      key: `lang-${f.id}`, type: 'language', source: null,
      serviceName: `${f.languageName || 'دورة لغة'}${f.levelLabel ? ` - ${f.levelLabel}` : ''}`,
      reason: f.correctionReason || '',
      requestedAt: f.correctionRequestedAt?.toDate?.() || null,
      studentId: user?.uid, formId: f.formId || f.id,
    })),
    ...allTrainingForms.filter((f) => isNeedsCorrection(f.status)).map((f) => ({
      key: `train-${f.id}`, type: 'training', source: null,
      serviceName: f.trainingTitle || f.trainingName || 'دورة تكوينية',
      reason: f.correctionReason || '',
      requestedAt: f.correctionRequestedAt?.toDate?.() || null,
      studentId: user?.uid, entryId: f.id,
    })),
    ...supportRegistrations
      .filter((r) => isNeedsCorrection(r.status) && r.source !== 'annualFee')
      .map((r) => ({
        key: `sup-${r.id}`, type: 'supportLesson', source: 'monthly',
        serviceName: r.subjectName || r.lessonName || 'درس دعم',
        reason: r.correctionReason || '',
        requestedAt: r.correctionRequestedAt?.toDate?.() || null,
        registrationId: r.id,
      })),
    ...(isNeedsCorrection(annualFeeStatus.status) && annualFeeStatus.id ? [{
      key: `annual-${annualFeeStatus.id}`, type: 'annual', source: null,
      serviceName: 'الرسوم السنوية',
      reason: annualFeeStatus.correctionReason || '',
      requestedAt: annualFeeStatus.correctionRequestedAt || null,
      paymentId: annualFeeStatus.id,
    }] : []),
  ];

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

    const lastMonthLabel = formatMonthYear(lastReg._startDateObj);
    const nextMonthLabel = Number.isNaN(nextDate.getTime()) ? '—' : formatMonthYear(nextDate);

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

        // New unified catalog: lessonId == classId. Read classes first, then
        // fall back to the legacy supportLessons collection for old records.
        let lessonSnap = await getDoc(doc(db, 'branches', branchId, 'classes', reg.lessonId));
        if (!lessonSnap.exists()) {
          lessonSnap = await getDoc(doc(db, 'branches', branchId, 'supportLessons', reg.lessonId));
        }
        if (!lessonSnap.exists()) return;

        const lesson = lessonSnap.data() || {};
        const studyYearId = lesson.studyYear || lesson.year || lesson.grade || null;
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
      // Use functional updater so React bails out (no re-render) when the map
      // is already empty — passing a literal {} every time creates a new reference
      // and would re-trigger this effect on every render.
      setSupportLessonsMap((prev) => (Object.keys(prev).length === 0 ? prev : {}));
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

              // lessonId == classId in the new model; fall back to legacy supportLessons.
              let snap = await getDoc(doc(db, 'branches', branchIdForLesson, 'classes', lessonId));
              if (!snap.exists()) {
                snap = await getDoc(doc(db, 'branches', branchIdForLesson, 'supportLessons', lessonId));
              }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, supportRegistrations]);

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
      setVerificationFeedback({ type: 'error', message: 'يرجى رفع الصورة الشخصية وصورة بطاقة الهوية لإعادة التقديم' });
      return;
    }

    try {
      setVerificationSubmitting(true);
      setVerificationFeedback({ type: '', message: '' });
      await submitVerificationRequest(
        selectedBranchId,
        user.uid,
        verificationFiles.profile,
        verificationFiles.idCard
      );
      setVerificationFiles({ profile: null, idCard: null });
      setVerificationFeedback({ type: 'success', message: 'تم إرسال طلب التحقق من جديد. سيتم مراجعته من طرف الإدارة.' });
    } catch (e) {
      console.error('Resubmit verification failed:', e);
      setVerificationFeedback({ type: 'error', message: 'فشل إرسال طلب التحقق. حاول مرة أخرى.' });
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
          {/* Personalized announcements for this student */}
          <PersonalizedAnnouncements
            annualFeeStatus={annualFeeStatus}
            verificationStatus={studentData?.verificationStatus}
            pendingLanguageForms={pendingLanguageForms}
            pendingTrainingForms={pendingTrainingForms}
            supportRegistrations={supportRegistrations}
          />

          {/* Payment correction alert — student must re-upload a corrected proof */}
          <PaymentCorrectionBanner
            items={correctionItems}
            branchId={selectedBranchId}
            studentId={user?.uid}
          />

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

          {/* Profile Section */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100" dir="rtl">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-primary flex items-center gap-3">
                <User className="h-6 w-6" />
                الملف الشخصي
              </h2>
              {!editingProfile ? (
                <button
                  onClick={handleEditProfile}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  تعديل
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelProfile}
                    className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                    className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                  >
                    {profileSaving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                  </button>
                </div>
              )}
              {profileError && editingProfile && (
                <p className="text-red-600 text-sm mt-2">{profileError}</p>
              )}
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Full Name */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    <User className="w-3.5 h-3.5" />
                    الاسم الكامل
                  </label>
                  {editingProfile ? (
                    <input
                      type="text"
                      value={profileDraft.name}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{studentData?.name || studentData?.fullName || '—'}</p>
                  )}
                </div>

                {/* Email — locked */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    البريد الإلكتروني
                    <Lock className="w-3 h-3 text-gray-400" />
                  </label>
                  <p className="text-sm font-medium text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{user?.email || '—'}</p>
                </div>

                {/* Guardian Phone */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    هاتف ولي الأمر
                  </label>
                  {editingProfile ? (
                    <input
                      type="tel"
                      value={profileDraft.guardianPhone}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, guardianPhone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      dir="ltr"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{studentData?.guardianPhone || studentData?.phoneNumber || '—'}</p>
                  )}
                </div>

                {/* Student Phone */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    هاتف الطالب
                  </label>
                  {editingProfile ? (
                    <input
                      type="tel"
                      value={profileDraft.studentPhone}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, studentPhone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      dir="ltr"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{studentData?.studentPhone || '—'}</p>
                  )}
                </div>

                {/* Birth Date */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    تاريخ الميلاد
                  </label>
                  {editingProfile ? (
                    <input
                      type="date"
                      value={profileDraft.birthDate}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, birthDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{studentData?.birthDate || '—'}</p>
                  )}
                </div>

                {/* Birth Place */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    مكان الميلاد
                  </label>
                  {editingProfile ? (
                    <input
                      type="text"
                      value={profileDraft.birthPlace}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, birthPlace: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{studentData?.birthPlace || '—'}</p>
                  )}
                </div>

                {/* School */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    المدرسة / الثانوية
                  </label>
                  {editingProfile ? (
                    <input
                      type="text"
                      value={profileDraft.school}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, school: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{studentData?.school || '—'}</p>
                  )}
                </div>

                {/* Branch — locked */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    <BadgeCheck className="w-3.5 h-3.5" />
                    الفرع
                    <Lock className="w-3 h-3 text-gray-400" />
                  </label>
                  <p className="text-sm font-medium text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    {studentData?.branchName || selectedBranch || '—'}
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
                        <span className="text-amber-700 font-semibold">قيد المراجعة</span>
                      </div>
                    ))}
                    {pendingTrainingForms.slice(0, 5).map((entry) => (
                      <div key={entry.formId || entry.id} className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-gray-900">
                          {entry.trainingTitle || entry.trainingName || 'دورة تكوينية'}
                        </span>
                        <span className="text-amber-700 font-semibold">قيد المراجعة</span>
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
                  {verificationFeedback.message && (
                    <div className={`mt-3 rounded-lg px-4 py-2 text-sm flex items-center gap-2 ${
                      verificationFeedback.type === 'success'
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-700'
                    }`}>
                      {verificationFeedback.type === 'success'
                        ? <CheckCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                        : <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />}
                      {verificationFeedback.message}
                    </div>
                  )}
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

          {/* Payment success toast */}
          {paymentSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 mb-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" aria-hidden="true" />
              <span>تم رفع الدفعة بنجاح. سيتم مراجعتها من قبل الإدارة.</span>
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
                    onClick={() => navigate('/support-lessons')}
                    className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors font-semibold whitespace-nowrap"
                  >
                    التسجيل في دروس الدعم
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Registrations overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Support Lessons Card ── */}
            <div className="bg-white rounded-xl shadow-md border border-gray-100">
              <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">دروس الدعم</h3>
                    <p className="text-xs text-gray-500">اشتراك شهري قابل للتجديد</p>
                  </div>
                </div>
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 font-semibold">شهري</span>
              </div>
              <div className="p-5 space-y-3">
                {normalizedSupportRegistrations.length === 0 ? (
                  <div className="text-center py-6">
                    <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">لا توجد تسجيلات في دروس الدعم بعد.</p>
                    {isAnnualFeePaid && (
                      <Link to="/support-lessons" className="mt-3 inline-block text-sm text-primary font-semibold hover:underline">
                        التسجيل في درس الدعم
                      </Link>
                    )}
                  </div>
                ) : (
                  normalizedSupportRegistrations.slice(0, 6).map((reg) => {
                    const computed = getComputedStatus(reg);
                    const { label: statusLabel, classes: statusClasses } = STATUS_UI[computed] ?? STATUS_UI.none;
                    const yearMeta = reg.studyYearId ? getYearById(reg.studyYearId) : null;
                    const displayYear = reg.yearName || reg.studyYearLabel || yearMeta?.nameShort || yearMeta?.name || '';
                    const lessonFromMap = reg.lessonId ? supportLessonsMap[reg.lessonId] : null;
                    const subjectLabel = reg.subjectName || lessonFromMap?.name || reg.lessonName || 'درس دعم';
                    const expiryLabel = getExpiryLabel(reg);
                    const isExpired = computed === 'expired';
                    const isPending  = computed === 'pending';
                    const isActive   = computed === 'active';
                    return (
                      <div key={reg.id} className={`border rounded-lg p-4 space-y-2 ${isExpired ? 'border-gray-300 bg-gray-50' : isActive ? 'border-green-200 bg-green-50' : 'border-gray-100'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">
                              {subjectLabel}{displayYear ? ` — ${displayYear}` : ''}
                            </p>
                            {expiryLabel && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {isExpired ? 'انتهى في:' : 'ينتهي في:'} {expiryLabel}
                              </p>
                            )}
                          </div>
                          <span className={`text-xs font-semibold rounded-full border px-2 py-0.5 whitespace-nowrap ${statusClasses}`}>
                            {statusLabel}
                          </span>
                        </div>
                        {reg._startDateObj && (
                          <p className="text-xs text-gray-500">
                            من: {formatDate(reg._startDateObj)}
                            {reg._endDateObj ? ` — إلى: ${formatDate(reg._endDateObj)}` : ''}
                          </p>
                        )}
                        {isExpired && (
                          <Link
                            to="/support-lessons"
                            className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            تجديد الاشتراك
                          </Link>
                        )}
                        {isPending && (
                          <p className="text-xs text-amber-700 font-medium">بانتظار موافقة الإدارة</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── Languages Card ── */}
            <div className="bg-white rounded-xl shadow-md border border-gray-100">
              <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BadgeCheck className="w-5 h-5 text-green-500" />
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">دورات اللغات</h3>
                    <p className="text-xs text-gray-500">دفعة واحدة</p>
                  </div>
                </div>
                <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-semibold">دائم</span>
              </div>
              <div className="p-5 space-y-3">
                {registeredLanguages.length === 0 && pendingLanguageForms.length === 0 && rejectedLanguageForms.length === 0 ? (
                  <div className="text-center py-6">
                    <BadgeCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">لا توجد تسجيلات في دورات اللغات بعد.</p>
                  </div>
                ) : (
                  <>
                    {registeredLanguages.slice(0, 4).map((entry) => (
                      <div key={entry.id} className="border border-green-200 bg-green-50 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{entry.languageName || 'لغة'}</p>
                            <p className="text-xs text-gray-600">{entry.levelLabel ? `المستوى: ${entry.levelLabel}` : ''}</p>
                          </div>
                          <span className="text-xs font-semibold text-green-700 bg-green-100 border border-green-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                            ✓ مقبول
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Tag className="w-3 h-3 text-green-600" />
                          <span className="text-xs text-green-700 font-medium">دفعة واحدة — وصول دائم</span>
                        </div>
                      </div>
                    ))}
                    {pendingLanguageForms.map((entry) => (
                      <div key={entry.id} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{entry.languageName || 'لغة'}</p>
                            <p className="text-xs text-gray-600">{entry.levelLabel ? `المستوى: ${entry.levelLabel}` : ''}</p>
                          </div>
                          <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                            قيد المراجعة
                          </span>
                        </div>
                      </div>
                    ))}
                    {rejectedLanguageForms.map((entry) => (
                      <div key={entry.id} className="border border-red-200 bg-red-50 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{entry.languageName || 'لغة'}</p>
                            <p className="text-xs text-red-700 mt-0.5">تم رفض طلبك — تواصل مع الإدارة</p>
                          </div>
                          <span className="text-xs font-semibold text-red-700 bg-red-100 border border-red-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                            ✗ مرفوض
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* ── Trainings Card ── */}
            <div className="bg-white rounded-xl shadow-md border border-gray-100">
              <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Briefcase className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">الدورات التكوينية</h3>
                    <p className="text-xs text-gray-500">دفعة واحدة</p>
                  </div>
                </div>
                <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 font-semibold">دائم</span>
              </div>
              <div className="p-5 space-y-3">
                {registeredTrainings.length === 0 && pendingTrainingForms.length === 0 && rejectedTrainingForms.length === 0 ? (
                  <div className="text-center py-6">
                    <Briefcase className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">لا توجد تسجيلات في الدورات التكوينية بعد.</p>
                  </div>
                ) : (
                  <>
                    {registeredTrainings.slice(0, 4).map((entry) => (
                      <div key={entry.id} className="border border-purple-200 bg-purple-50 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{entry.trainingTitle || entry.trainingName || entry.name || 'دورة تكوينية'}</p>
                            {entry.trainingPrice != null && (
                              <p className="text-xs text-gray-600">{entry.trainingPrice} دج</p>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-purple-700 bg-purple-100 border border-purple-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                            ✓ مقبول
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Tag className="w-3 h-3 text-purple-600" />
                          <span className="text-xs text-purple-700 font-medium">دفعة واحدة — وصول دائم</span>
                        </div>
                      </div>
                    ))}
                    {pendingTrainingForms.map((entry) => (
                      <div key={entry.id} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{entry.trainingTitle || entry.trainingName || 'دورة تكوينية'}</p>
                          </div>
                          <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                            قيد المراجعة
                          </span>
                        </div>
                      </div>
                    ))}
                    {rejectedTrainingForms.map((entry) => (
                      <div key={entry.id} className="border border-red-200 bg-red-50 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{entry.trainingTitle || entry.trainingName || 'دورة تكوينية'}</p>
                            <p className="text-xs text-red-700 mt-0.5">تم رفض طلبك — تواصل مع الإدارة</p>
                          </div>
                          <span className="text-xs font-semibold text-red-700 bg-red-100 border border-red-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                            ✗ مرفوض
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* ── Annual Fee History Card ── */}
            <div className="bg-white rounded-xl shadow-md border border-gray-100">
              <div className="p-5 border-b border-gray-200 flex items-center gap-3">
                <CalendarDays className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-lg font-bold text-gray-900">الرسوم السنوية</h3>
                  <p className="text-xs text-gray-500">سجل الدفع السنوي</p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                {sortedAnnualFeeHistory.length === 0 ? (
                  <div className="text-center py-6">
                    <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">لم يتم تسجيل رسوم سنوية بعد.</p>
                    {isAnnualFeeUnpaid && (
                      <button
                        onClick={() => navigate('/support-lessons')}
                        className="mt-3 text-sm text-primary font-semibold hover:underline"
                      >
                        التسجيل في دروس الدعم
                      </button>
                    )}
                  </div>
                ) : (
                  sortedAnnualFeeHistory.slice(0, 5).map((entry) => (
                    <div key={entry.registrationId || entry.year || entry.registeredAt} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">السنة الدراسية {entry.year || new Date().getFullYear()}</p>
                          <p className="text-xs text-gray-600">مؤكد: {formatRegistrationDate(entry.registeredAt)}</p>
                        </div>
                        <BadgeCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
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