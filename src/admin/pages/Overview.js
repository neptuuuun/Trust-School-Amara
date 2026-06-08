import React, { useState, useEffect } from 'react';
import { collection, collectionGroup, query, where, getCountFromServer } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { Users, BookOpen, GraduationCap, FileText, DollarSign, Languages, AlertCircle, Clock, CreditCard, ClipboardList } from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import { LoadingState } from '../../components/ui/feedback';

const Overview = () => {
  const navigate = useNavigate();
  const { selectedBranchId } = useBranch();
  
  const [stats, setStats] = useState({
    registrations: 0,
    students: 0,
    verifiedStudents: 0,
    unverifiedStudents: 0,
    supportLessons: 0,
    languages: 0,
    trainings: 0,
    trainingRequests: 0,
    trainingRequestsPending: 0,
    trainingRequestsReviewed: 0,
    trainingRequestsCompleted: 0,
    pendingPayments: 0,
    pendingPaymentsLanguage: 0,
    pendingPaymentsYearly: 0,
    pendingPaymentsSupport: 0,
    pendingPaymentsTraining: 0,
    pendingAnnualFees: 0,
    approvedAnnualFees: 0,
    rejectedAnnualFees: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Guard for required dependency
    if (!selectedBranchId) {
      setStats({
        registrations: 0,
        students: 0,
        verifiedStudents: 0,
        unverifiedStudents: 0,
        supportLessons: 0,
        languages: 0,
        trainings: 0,
        trainingRequests: 0,
        trainingRequestsPending: 0,
        trainingRequestsReviewed: 0,
        trainingRequestsCompleted: 0,
        pendingPayments: 0,
        pendingPaymentsLanguage: 0,
        pendingPaymentsYearly: 0,
        pendingPaymentsSupport: 0,
        pendingPaymentsTraining: 0,
        pendingAnnualFees: 0,
        approvedAnnualFees: 0,
        rejectedAnnualFees: 0
      });
      setLoading(false);
      return;
    }
 
    let isActive = true;

    const countForQuery = async (q) => {
      const snap = await getCountFromServer(q);
      return snap.data().count || 0;
    };

    const loadStats = async () => {
      try {
        setLoading(true);

        const usersRef = collection(db, 'branches', selectedBranchId, 'users');
        // New unified catalog: count subjects per serviceType (replaces the
        // legacy supportLessons/languages/trainings catalog collections).
        const subjectsRef = collection(db, 'branches', selectedBranchId, 'subjects');
        const branchRegistrationsRef = collection(db, 'branches', selectedBranchId, 'registrations');
        const annualPaymentsRef = collection(db, 'branches', selectedBranchId, 'annualPayments');
        const supportLessonRegistrationsRef = collection(db, 'supportLessonRegistrations');

        const [
          studentsTotal,
          studentsVerified,
          supportLessonsTotal,
          languagesTotal,
          trainingsTotal,
          branchRegistrationsTotal,
          languageRegistrationsTotal,
          trainingRegistrationsTotal,
          supportLessonRegistrationsTotal,
          trainingRequestsTotal,
          trainingRequestsPending,
          trainingRequestsReviewed,
          trainingRequestsCompleted,
          pendingPaymentsLanguage,
          pendingPaymentsYearly,
          pendingPaymentsSupportMonthly,
          pendingPaymentsSupportAnnualFee,
          pendingPaymentsTraining,
          pendingAnnualFees,
          approvedAnnualFees,
          rejectedAnnualFees
        ] = await Promise.all([
          countForQuery(query(usersRef)),
          countForQuery(query(usersRef, where('verified', '==', true))),
          countForQuery(query(subjectsRef, where('serviceType', '==', 'support'))),
          countForQuery(query(subjectsRef, where('serviceType', '==', 'language'))),
          countForQuery(query(subjectsRef, where('serviceType', '==', 'training'))),
          countForQuery(query(branchRegistrationsRef)),
          countForQuery(query(collectionGroup(db, 'languageFormEntries'), where('branchId', '==', selectedBranchId))),
          countForQuery(query(collectionGroup(db, 'trainingFormEntries'), where('branchId', '==', selectedBranchId))),
          countForQuery(query(supportLessonRegistrationsRef, where('branchId', '==', selectedBranchId))),
          countForQuery(query(branchRegistrationsRef, where('type', '==', 'training_request'))),
          countForQuery(query(branchRegistrationsRef, where('type', '==', 'training_request'), where('status', '==', 'pending'))),
          countForQuery(query(branchRegistrationsRef, where('type', '==', 'training_request'), where('status', '==', 'reviewed'))),
          countForQuery(query(branchRegistrationsRef, where('type', '==', 'training_request'), where('status', '==', 'completed'))),
          countForQuery(
            query(
              collectionGroup(db, 'languageFormEntries'),
              where('branchId', '==', selectedBranchId),
              where('status', '==', 'pending')
            )
          ),
          countForQuery(query(branchRegistrationsRef, where('type', '==', 'yearly_fee'), where('verified', '==', false))),
          countForQuery(query(supportLessonRegistrationsRef, where('branchId', '==', selectedBranchId), where('status', '==', 'pending'))),
          countForQuery(
            query(
              branchRegistrationsRef,
              where('type', '==', 'supportLesson'),
              where('source', '==', 'annualFee'),
              where('status', '==', 'pending')
            )
          ),
          countForQuery(
            query(
              collectionGroup(db, 'trainingFormEntries'),
              where('branchId', '==', selectedBranchId),
              where('status', '==', 'pending'),
              where('verified', '==', false)
            )
          ),
          countForQuery(query(annualPaymentsRef, where('status', '==', 'pending'))),
          countForQuery(query(annualPaymentsRef, where('status', '==', 'verified'))),
          countForQuery(query(annualPaymentsRef, where('status', '==', 'rejected')))
        ]);

        if (!isActive) return;

        const unverifiedStudents = Math.max(0, (studentsTotal || 0) - (studentsVerified || 0));
        const pendingPaymentsSupport = (pendingPaymentsSupportMonthly || 0) + (pendingPaymentsSupportAnnualFee || 0);
        const totalPendingPayments =
          (pendingPaymentsLanguage || 0)
          + (pendingPaymentsYearly || 0)
          + pendingPaymentsSupport
          + (pendingPaymentsTraining || 0);

        const registrationsTotal =
          (branchRegistrationsTotal || 0)
          + (languageRegistrationsTotal || 0)
          + (trainingRegistrationsTotal || 0)
          + (supportLessonRegistrationsTotal || 0);

        setStats((prev) => ({
          ...prev,
          students: studentsTotal || 0,
          verifiedStudents: studentsVerified || 0,
          unverifiedStudents,
          supportLessons: supportLessonsTotal || 0,
          languages: languagesTotal || 0,
          trainings: trainingsTotal || 0,
          registrations: registrationsTotal,
          trainingRequests: trainingRequestsTotal || 0,
          trainingRequestsPending: trainingRequestsPending || 0,
          trainingRequestsReviewed: trainingRequestsReviewed || 0,
          trainingRequestsCompleted: trainingRequestsCompleted || 0,
          pendingPayments: totalPendingPayments,
          pendingPaymentsLanguage: pendingPaymentsLanguage || 0,
          pendingPaymentsYearly: pendingPaymentsYearly || 0,
          pendingPaymentsSupport,
          pendingPaymentsTraining: pendingPaymentsTraining || 0,
          pendingAnnualFees: pendingAnnualFees || 0,
          approvedAnnualFees: approvedAnnualFees || 0,
          rejectedAnnualFees: rejectedAnnualFees || 0
        }));
      } catch (error) {
        console.error('Error loading overview stats:', error);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    loadStats();

    return () => {
      isActive = false;
    };
  }, [selectedBranchId]);

  // Handle quick action navigation
  const handleQuickAction = (action) => {
    switch (action) {
      case 'viewUsers':
        navigate('/admin/users');
        break;
      case 'viewPayments':
        navigate('/admin/payments-verification');
        break;
      case 'viewAnnualFees':
        navigate('/admin/annual-fees');
        break;
      case 'viewTrainingRequests':
        navigate('/admin/training-requests');
        break;
      case 'adminGuide':
        navigate('/admin/admin-guide');
        break;
      default:
        break;
    }
  };

  // Main statistics cards — semantic tokens give categorical variety on-brand
  const mainStatCards = [
    {
      title: 'إجمالي الطلاب',
      value: stats.students,
      subtitle: `${stats.verifiedStudents} موثق | ${stats.unverifiedStudents} غير موثق`,
      icon: Users,
      textColor: 'text-secondary-600',
      bgColor: 'bg-secondary-50'
    },
    {
      title: 'إجمالي التسجيلات',
      value: stats.registrations,
      subtitle: 'جميع أنواع التسجيلات',
      icon: FileText,
      textColor: 'text-primary-600',
      bgColor: 'bg-primary-50'
    },
    {
      title: 'المدفوعات المعلقة',
      value: stats.pendingPayments,
      subtitle: 'تتطلب مراجعة فورية',
      icon: CreditCard,
      textColor: 'text-warning-600',
      bgColor: 'bg-warning-50',
      alert: stats.pendingPayments > 0
    },
    {
      title: 'طلبات الدورات التكوينية',
      value: stats.trainingRequests,
      subtitle: `${stats.trainingRequestsPending} قيد الانتظار`,
      icon: GraduationCap,
      textColor: 'text-accent-600',
      bgColor: 'bg-accent-50',
      alert: stats.trainingRequestsPending > 0
    }
  ];

  // Course statistics
  const courseStatCards = [
    {
      title: 'اللغات',
      value: stats.languages,
      icon: Languages,
      textColor: 'text-success-600',
      bgColor: 'bg-success-50'
    },
    {
      title: 'دروس الدعم',
      value: stats.supportLessons,
      icon: BookOpen,
      textColor: 'text-secondary-600',
      bgColor: 'bg-secondary-50'
    },
    {
      title: 'الدورات التكوينية',
      value: stats.trainings,
      icon: GraduationCap,
      textColor: 'text-accent-600',
      bgColor: 'bg-accent-50'
    }
  ];

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-8" dir="rtl">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-primary mb-2">نظرة عامة</h1>
          <p className="text-xl text-gray-600">إحصائيات شاملة حول النظام والحالة الحالية</p>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {mainStatCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div 
              key={index} 
              className={`bg-white rounded-xl shadow-md p-6 border-2 transition-all hover:shadow-lg ${
                stat.alert ? 'border-warning-400' : 'border-gray-100'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-6 w-6 ${stat.textColor}`} />
                </div>
                {stat.alert && (
                  <div className="flex items-center gap-1 text-warning-600">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">{stat.title}</p>
                <p className={`text-3xl font-bold ${stat.textColor} mb-1`}>
                  {stat.value.toLocaleString('ar-EG')}
                </p>
                {stat.subtitle && (
                  <p className="text-xs text-gray-500 mt-1">{stat.subtitle}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Course Statistics */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-2xl font-bold text-primary mb-6 flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            إحصائيات الدورات
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {courseStatCards.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div 
                  key={index} 
                  className="text-center p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className={`inline-flex p-3 rounded-full ${stat.bgColor} mb-2`}>
                    <Icon className={`h-5 w-5 ${stat.textColor}`} />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">{stat.title}</p>
                  <p className={`text-2xl font-bold ${stat.textColor}`}>
                    {stat.value.toLocaleString('ar-EG')}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending Actions */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h2 className="text-2xl font-bold text-primary mb-6 flex items-center gap-2">
            <Clock className="h-6 w-6" />
            الإجراءات المعلقة
          </h2>
          <div className="space-y-3">
            <button
              onClick={() => handleQuickAction('adminGuide')}
              className="w-full p-4 rounded-lg border-2 text-start transition-all hover:shadow-md border-gray-200 bg-gray-50 hover:bg-gray-100"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-bold text-gray-900">دليل المسؤول</p>
                  <p className="text-sm text-gray-600">
                    مساعدة خطوة بخطوة للغات، والدورات، والتحقق، والمستخدمين المسجّلين
                  </p>
                </div>
                <ClipboardList className="h-6 w-6 text-gray-400" />
              </div>
            </button>

            <button
              onClick={() => handleQuickAction('viewPayments')}
              className={`w-full p-4 rounded-lg border-2 text-start transition-all hover:shadow-md ${
                stats.pendingPayments > 0
                  ? 'border-warning-400 bg-warning-50 hover:bg-warning-100'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-bold text-gray-900">التحقق من المدفوعات</p>
                  <p className="text-sm text-gray-600">
                    {stats.pendingPayments > 0 
                      ? `${stats.pendingPayments} مدفوعات تتطلب مراجعة`
                      : 'لا توجد مدفوعات معلقة'
                    }
                  </p>
                  {stats.pendingPayments > 0 && (
                    <div className="flex gap-2 mt-2 text-xs">
                      {stats.pendingPaymentsLanguage > 0 && (
                        <span className="px-2 py-1 bg-secondary-100 text-secondary-700 rounded">لغات: {stats.pendingPaymentsLanguage}</span>
                      )}
                      {stats.pendingPaymentsYearly > 0 && (
                        <span className="px-2 py-1 bg-success-100 text-success-700 rounded">سنوية: {stats.pendingPaymentsYearly}</span>
                      )}
                      {stats.pendingPaymentsSupport > 0 && (
                        <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded">دعم: {stats.pendingPaymentsSupport}</span>
                      )}
                      {stats.pendingPaymentsTraining > 0 && (
                        <span className="px-2 py-1 bg-accent-100 text-accent-700 rounded">تكوين: {stats.pendingPaymentsTraining}</span>
                      )}
                    </div>
                  )}
                </div>
                <CreditCard className={`h-6 w-6 ${stats.pendingPayments > 0 ? 'text-warning-600' : 'text-gray-400'}`} />
              </div>
            </button>

            <button
              onClick={() => handleQuickAction('viewAnnualFees')}
              className={`w-full p-4 rounded-lg border-2 text-start transition-all hover:shadow-md ${
                stats.pendingAnnualFees > 0
                  ? 'border-warning-400 bg-warning-50 hover:bg-warning-100'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-bold text-gray-900">الرسوم السنوية</p>
                  <p className="text-sm text-gray-600">
                    {stats.pendingAnnualFees > 0 
                      ? `${stats.pendingAnnualFees} طلب معلق`
                      : 'لا توجد طلبات معلقة'
                    }
                  </p>
                  {stats.approvedAnnualFees > 0 && (
                    <p className="text-xs text-success-600 mt-1">
                      {stats.approvedAnnualFees} موافق عليه
                    </p>
                  )}
                </div>
                <DollarSign className={`h-6 w-6 ${stats.pendingAnnualFees > 0 ? 'text-warning-600' : 'text-gray-400'}`} />
              </div>
            </button>

            <button
              onClick={() => handleQuickAction('viewTrainingRequests')}
              className={`w-full p-4 rounded-lg border-2 text-start transition-all hover:shadow-md ${
                stats.trainingRequestsPending > 0
                  ? 'border-accent-400 bg-accent-50 hover:bg-accent-100'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-bold text-gray-900">طلبات الدورات التكوينية</p>
                  <p className="text-sm text-gray-600">
                    {stats.trainingRequestsPending > 0 
                      ? `${stats.trainingRequestsPending} طلب قيد الانتظار`
                      : 'لا توجد طلبات معلقة'
                    }
                  </p>
                  {stats.trainingRequests > 0 && (
                    <div className="flex gap-2 mt-2 text-xs">
                      <span className="px-2 py-1 bg-warning-100 text-warning-700 rounded">قيد الانتظار: {stats.trainingRequestsPending}</span>
                      <span className="px-2 py-1 bg-secondary-100 text-secondary-700 rounded">تمت المراجعة: {stats.trainingRequestsReviewed}</span>
                      <span className="px-2 py-1 bg-success-100 text-success-700 rounded">مكتمل: {stats.trainingRequestsCompleted}</span>
                    </div>
                  )}
                </div>
                <FileText className={`h-6 w-6 ${stats.trainingRequestsPending > 0 ? 'text-accent-600' : 'text-gray-400'}`} />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overview;