import React, { useEffect, useState } from 'react';
import { useBranch } from '../../contexts/BranchContext';
import {
  getUnverifiedLanguageRegistrations,
  getUnverifiedYearlyVerifications,
  getUnverifiedSupportLessonRegistrations,
  getPendingAnnualFeeSupportLessonRegistrations,
  getUnverifiedTrainingRegistrations,
  verifyLanguageRegistration,
  rejectLanguageRegistration,
  verifyYearlyFee,
  verifySupportLessonRegistration,
  rejectSupportLessonRegistration,
  verifyTrainingRegistration,
  verifyAnnualPayment,
  rejectAnnualPayment,
  rejectTrainingRegistration,
  getUser,
  getAnnualPayment,
  getSupportLessons
} from '../../services/firestoreService';
import { CreditCard, Check, X, Image, AlertCircle, Filter, RefreshCw } from 'lucide-react';
import FileViewerModal from '../components/FileViewerModal';
import { motion } from 'framer-motion';
import { Button } from '../../components/ui/button';

/**
 * Comprehensive admin page for verifying all types of payments
 * - Language registrations
 * - Yearly fee verifications
 * - Support lesson monthly payments
 * - Training registrations
 */
const PaymentsVerification = () => {
  const { selectedBranchId } = useBranch();
  const [payments, setPayments] = useState([]);
  const [filteredPayments, setFilteredPayments] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all', 'language', 'yearly', 'supportLesson', 'training'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    if (selectedBranchId) {
      loadAllPayments();
    }
  }, [selectedBranchId]);

  useEffect(() => {
    // Apply filter
    if (filter === 'all') {
      setFilteredPayments(payments);
    } else {
      setFilteredPayments(payments.filter(p => p.type === filter));
    }
  }, [filter, payments]);

  const normalizeToDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value?.toDate) {
      try {
        return value.toDate();
      } catch {
        // fall through to parsing below
      }
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const loadAllPayments = async () => {
    try {
      setLoading(true);
      
      // Load all payment types in parallel
      const [
        languageRegs,
        yearlyVerifs,
        supportRegs,
        annualSupportRegs,
        trainingRegs,
        supportLessons
      ] = await Promise.all([
        getUnverifiedLanguageRegistrations(selectedBranchId),
        getUnverifiedYearlyVerifications(selectedBranchId),
        getUnverifiedSupportLessonRegistrations(selectedBranchId),
        getPendingAnnualFeeSupportLessonRegistrations(selectedBranchId),
        getUnverifiedTrainingRegistrations(selectedBranchId),
        getSupportLessons(selectedBranchId)
      ]);

      console.log('🔍 Training registrations loaded:', trainingRegs.length);

      // Prepare lookup maps
      const supportLessonsById = new Map(
        Array.isArray(supportLessons)
          ? supportLessons.map((lesson) => [lesson.id, lesson])
          : []
      );

      // Fetch user details for each payment
      const allPayments = [];

      // Language registrations
      for (const reg of languageRegs) {
        const studentId = reg.studentId || reg.userId;
        let userData = {};
        if (studentId) {
          try {
            const userSnap = await getUser(selectedBranchId, studentId);
            userData = userSnap.exists() ? userSnap.data() : {};
          } catch (err) {
            console.warn('Could not fetch user data for language reg:', studentId);
          }
        }

        allPayments.push({
          id: reg.formId || reg.id,
          paymentId: reg.formId || reg.id,
          status: String(reg.status || 'pending').toLowerCase(),
          formId: reg.formId || reg.id,
          type: 'language',
          typeName: 'تسجيل في دورة لغة',
          userId: studentId,
          studentId,
          userName: reg.studentName || userData.name || userData.fullName || 'غير متوفر',
          userEmail: reg.studentEmail || userData.email || 'غير متوفر',
          paymentProof: reg.receiptUrl || reg.paymentProof || '',
          createdAt: reg.submittedAt || reg.createdAt,
          data: reg
        });
      }

      // Support lesson registrations
      for (const reg of supportRegs) {
        let userData = {};
        try {
          const userSnap = await getUser(selectedBranchId, reg.userId);
          userData = userSnap.exists() ? userSnap.data() : {};
        } catch (err) {
          console.warn('Could not fetch user data for support reg:', reg.userId);
        }

        const months = Array.isArray(reg.selectedMonths) && reg.selectedMonths.length
          ? reg.selectedMonths
          : reg.month
          ? [reg.month]
          : [];

        const lessonId = reg.lessonId || reg.subjectId || null;
        const lessonMeta = lessonId ? supportLessonsById.get(lessonId) : null;

        const subjectName =
          reg.subjectName ||
          lessonMeta?.subject ||
          lessonMeta?.name ||
          'غير محددة';

        const durationInMonths =
          typeof reg.durationInMonths === 'number'
            ? reg.durationInMonths
            : Array.isArray(months) && months.length
            ? months.length
            : null;

        const monthlyPrice =
          reg.monthlyPrice ??
          reg.pricePerMonth ??
          (lessonMeta ? lessonMeta.price : null);

        const totalPrice =
          reg.totalPrice != null
            ? reg.totalPrice
            : monthlyPrice != null && durationInMonths
            ? monthlyPrice * durationInMonths
            : null;

        const rawStart = reg.startDate || reg.createdAt;
        const normalizedStart = normalizeToDate(rawStart);
        let endDate = reg.endDate;
        if (!endDate && normalizedStart && durationInMonths) {
          const tmp = new Date(normalizedStart.getTime());
          tmp.setMonth(tmp.getMonth() + durationInMonths);
          endDate = tmp;
        }

        allPayments.push({
          id: reg.id,
          paymentId: reg.id,
          status: String(reg.status || 'pending').toLowerCase(),
          type: 'supportLesson',
          typeName: 'تسجيل درس دعم',
          userId: reg.userId,
          source: 'monthly',
          userName: userData.name || userData.fullName || 'غير متوفر',
          userEmail: userData.email || 'غير متوفر',
          paymentProof: reg.paymentProofUrl || reg.paymentProofURL || reg.paymentProof || '',
          createdAt: reg.createdAt,
          data: {
            ...reg,
            selectedMonths: months,
            subjectName,
            durationInMonths,
            monthlyPrice,
            totalPrice,
            startDate: normalizedStart || reg.startDate || reg.createdAt,
            endDate: endDate || null
          }
        });
      }

      // Support lesson registrations (created via annual fee - per-subject)
      for (const reg of annualSupportRegs) {
        const studentId = reg.studentId || reg.userId;
        let userData = {};
        if (studentId) {
          try {
            const userSnap = await getUser(selectedBranchId, studentId);
            userData = userSnap.exists() ? userSnap.data() : {};
          } catch (err) {
            console.warn('Could not fetch user data for annual-fee support reg:', studentId);
          }
        }

        const paymentId = reg.paymentId || null;
        if (!paymentId) {
          console.warn('Skipping annual-fee support reg missing paymentId:', reg.id);
          continue;
        }

        let annualPaymentProof = '';
        let annualPaymentCreatedAt = reg.createdAt;
        if (paymentId) {
          try {
            const paymentSnap = await getAnnualPayment(selectedBranchId, paymentId);
            if (paymentSnap.exists()) {
              const paymentData = paymentSnap.data() || {};
              annualPaymentProof = paymentData.receiptUrl || '';
              annualPaymentCreatedAt = paymentData.createdAt || annualPaymentCreatedAt;
            }
          } catch (err) {
            console.warn('Could not fetch annual payment for annual-fee support reg:', paymentId);
          }
        }

        allPayments.push({
          id: reg.id,
          paymentId,
          status: String(reg.status || 'pending').toLowerCase(),
          type: 'supportLesson',
          typeName: 'تسجيل درس دعم (ضمن الرسوم السنوية)',
          userId: studentId,
          studentId,
          source: 'annualFee',
          userName: userData.name || userData.fullName || reg.studentName || 'غير متوفر',
          userEmail: userData.email || reg.studentEmail || 'غير متوفر',
          paymentProof: annualPaymentProof,
          createdAt: annualPaymentCreatedAt,
          data: reg
        });
      }

      // Training registrations - FIXED
      for (const reg of trainingRegs) {
        const studentId = reg.studentId || reg.parentUserId || reg.userId;
        const entryId = reg.id || reg.formId || reg.entryId;
        
        let userData = {};
        if (studentId) {
          try {
            const userSnap = await getUser(selectedBranchId, studentId);
            userData = userSnap.exists() ? userSnap.data() : {};
          } catch (err) {
            console.warn('Could not fetch user data for training reg:', studentId);
          }
        }

        allPayments.push({
          id: entryId,
          paymentId: entryId,
          status: String(reg.status || 'pending').toLowerCase(),
          type: 'training',
          typeName: 'تسجيل في دورة تكوينية',
          userId: studentId,
          studentId: studentId,
          formId: entryId,
          entryId: entryId,
          userName: reg.studentName || userData.name || userData.fullName || 'غير متوفر',
          userEmail: reg.studentEmail || reg.userEmail || userData.email || 'غير متوفر',
          paymentProof: reg.paymentProof || reg.receiptUrl || '',
          createdAt: reg.submittedAt || reg.createdAt || reg.timestamp,
          data: reg
        });
      }

      // Sort by creation date
      allPayments.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      });

      const pendingPayments = allPayments.filter((entry) => {
        const normalized = String(entry.status || 'pending').toLowerCase();
        return normalized === 'pending';
      });

      console.log('✅ Total payments loaded:', pendingPayments.length);
      setPayments(pendingPayments);
      setError('');
    } catch (err) {
      console.error('Error loading payments:', err);
      setError('فشل في تحميل المدفوعات: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (payment, approve) => {
    try {
      setProcessing(prev => ({ ...prev, [payment.id]: true }));

      if (approve) {
        // Call appropriate verification function based on type
        switch (payment.type) {
          case 'language':
            await verifyLanguageRegistration(
              selectedBranchId,
              payment.studentId,
              payment.formId,
              {
                uid: 'admin-uid', // TODO: Replace with actual admin UID
                email: 'trustschoolamara@gmail.com', // TODO: Replace with actual admin email
                name: 'Amara' // TODO: Replace with actual admin name
              }
            );
            break;
          case 'yearly':
            await verifyYearlyFee(selectedBranchId, payment.id, payment.userId);
            break;
          case 'supportLesson':
            if (payment.source === 'monthly') {
              await verifySupportLessonRegistration(payment.paymentId, {
                uid: 'admin-uid',
                email: 'admin@example.com',
                name: 'Admin'
              });
            } else {
              if (!payment.paymentId) throw new Error('Missing paymentId');
              await verifyAnnualPayment(selectedBranchId, payment.paymentId, {
                uid: 'admin-uid',
                email: 'trustschoolamara@gmail.com',
                name: 'Amara'
              });
            }
            break;
          case 'training':
            console.log('Approving training:', {
              branchId: selectedBranchId,
              studentId: payment.studentId,
              entryId: payment.entryId || payment.formId
            });
            await verifyTrainingRegistration(
              selectedBranchId,
              payment.studentId,
              payment.entryId || payment.formId,
              {
                uid: 'admin-uid', // TODO: Replace with actual admin UID
                email: 'trustschoolamara@gmail.com', // TODO: Replace with actual admin email
                name: 'Admin' // TODO: Replace with actual admin name
              }
            );
            break;
        }
        alert('✅ تم قبول الدفعة بنجاح');
      } else {
        // Reject
        if (payment.type === 'language') {
          const reason = window.prompt('سبب الرفض (اختياري):');
          if (reason === null) {
            setProcessing(prev => ({ ...prev, [payment.id]: false }));
            return; // User cancelled
          }

          await rejectLanguageRegistration(
            selectedBranchId,
            payment.studentId,
            payment.formId,
            {
              uid: 'admin-uid',
              email: 'trustschoolamara@gmail.com',
              name: 'Admin',
              reason: reason || null
            }
          );
        } else if (payment.type === 'training') {
          const reason = window.prompt('سبب الرفض (اختياري):');
          if (reason === null) {
            setProcessing(prev => ({ ...prev, [payment.id]: false }));
            return; // User cancelled
          }
          
          await rejectTrainingRegistration(
            selectedBranchId,
            payment.studentId,
            payment.entryId || payment.formId,
            {
              uid: 'admin-uid',
              email: 'trustschoolamara@gmail.com',
              name: 'Admin',
              reason: reason || 'لم يتم تحديد سبب'
            }
          );
        } else if (payment.type === 'supportLesson') {
          const reason = window.prompt('سبب الرفض (اختياري):');
          if (reason === null) {
            setProcessing(prev => ({ ...prev, [payment.id]: false }));
            return;
          }

          if (payment.source === 'monthly') {
            await rejectSupportLessonRegistration(payment.paymentId, reason || null);
          } else {
            if (!payment.paymentId) throw new Error('Missing paymentId');
            await rejectAnnualPayment(selectedBranchId, payment.paymentId, reason || null);
          }
        }
        alert('✅ تم رفض الدفعة');
      }

      setPayments((prev) => prev.filter((entry) => entry.id !== payment.id));
      
    } catch (err) {
      console.error('Error verifying payment:', err);
      alert('❌ حدث خطأ أثناء معالجة الطلب: ' + err.message);
    } finally {
      setProcessing(prev => ({ ...prev, [payment.id]: false }));
    }
  };

  if (!selectedBranchId) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <p className="text-gray-600">يرجى اختيار الفرع أولاً</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-gray-600">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <motion.div className="p-6" dir="rtl" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">التحقق من المدفوعات</h1>
          <p className="text-gray-600">
            راجع واقبل أو ارفض جميع طلبات الدفع
          </p>
        </div>
        <button
          onClick={loadAllPayments}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
            filter === 'all'
              ? 'bg-primary text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          الكل ({payments.length})
        </button>
        <button
          onClick={() => setFilter('language')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
            filter === 'language'
              ? 'bg-primary text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          دورات اللغة ({payments.filter(p => p.type === 'language').length})
        </button>
        <button
          onClick={() => setFilter('yearly')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
            filter === 'yearly'
              ? 'bg-primary text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          الرسوم السنوية ({payments.filter(p => p.type === 'yearly').length})
        </button>
        <button
          onClick={() => setFilter('supportLesson')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
            filter === 'supportLesson'
              ? 'bg-primary text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          دروس الدعم ({payments.filter(p => p.type === 'supportLesson').length})
        </button>
        <button
          onClick={() => setFilter('training')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
            filter === 'training'
              ? 'bg-primary text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          الدورات التكوينية ({payments.filter(p => p.type === 'training').length})
        </button>
      </div>

      {filteredPayments.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <CreditCard className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">لا توجد مدفوعات معلقة</h3>
          <p className="text-gray-600">
            {filter === 'all' 
              ? 'جميع المدفوعات تم التحقق منها' 
              : 'لا توجد مدفوعات من هذا النوع'}
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {filteredPayments.map(payment => (
            <div
              key={`${payment.type}-${payment.id}`}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                        {payment.typeName}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">
                      {payment.userName}
                    </h3>
                    <p className="text-gray-600 text-sm mb-1">{payment.userEmail}</p>
                    <p className="text-gray-500 text-xs">
                      {payment.createdAt?.toDate
                        ? new Date(payment.createdAt.toDate()).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'تاريخ غير متوفر'}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      variant="success" 
                      onClick={() => handleVerify(payment, true)} 
                      disabled={processing[payment.id]} 
                      className="flex items-center gap-2"
                    >
                      {processing[payment.id] ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          جاري المعالجة...
                        </>
                      ) : (
                        <>
                          <Check className="w-5 h-5" />
                          قبول
                        </>
                      )}
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={() => handleVerify(payment, false)} 
                      disabled={processing[payment.id]} 
                      className="flex items-center gap-2"
                    >
                      <X className="w-5 h-5" />
                      رفض
                    </Button>
                  </div>
                </div>

                {/* Language specific details */}
                {payment.type === 'language' && (
                  <div className="border-t pt-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                    <Detail label="اللغة" value={payment.data.languageName} />
                    <Detail label="المستوى" value={payment.data.levelLabel} />
                    <Detail label="الأستاذ" value={payment.data.teacherName || 'غير محدد'} />
                    <Detail label="طريقة الدفع" value={payment.data.paymentMethod || 'غير محددة'} />
                    <Detail label="هاتف الولي" value={payment.data.guardianPhone || 'غير متوفر'} />
                    <Detail label="هاتف الطالب" value={payment.data.studentPhone || 'غير متوفر'} />
                    <Detail label="مكان الميلاد" value={payment.data.birthPlace || 'غير متوفر'} />
                    <Detail
                      label="تاريخ الميلاد"
                      value={payment.data.birthDate?.toDate
                        ? payment.data.birthDate.toDate().toLocaleDateString('ar-DZ')
                        : payment.data.birthDate || 'غير متوفر'}
                    />
                  </div>
                )}

                {/* Training specific details */}
                {payment.type === 'training' && (
                  <div className="border-t pt-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                    <Detail label="اسم الدورة" value={payment.data.trainingTitle || payment.data.trainingName} />
                    <Detail label="السعر" value={payment.data.trainingPrice ? `${payment.data.trainingPrice} دج` : 'غير محدد'} />
                    <Detail label="طريقة الدفع" value={payment.data.paymentMethod || 'غير محددة'} />
                    <Detail label="هاتف الطالب" value={payment.data.studentPhone || 'غير متوفر'} />
                    <Detail label="معرف الدورة" value={payment.data.trainingId || payment.data.selectedTrainingId || 'غير متوفر'} />
                    <Detail label="معرف التسجيل" value={payment.entryId || payment.formId} />
                  </div>
                )}

                {/* Support lesson specific details */}
                {payment.type === 'supportLesson' && (
                  <div className="border-t pt-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                    <Detail
                      label="المادة"
                      value={
                        payment.data.subjectName ||
                        payment.data.lessonName ||
                        'غير محددة'
                      }
                    />
                    <Detail
                      label="السعر الشهري"
                      value={
                        (() => {
                          const monthly = payment.data.monthlyPrice;
                          return monthly != null ? `${monthly} دج` : 'غير محدد';
                        })()
                      }
                    />
                    <Detail
                      label="عدد الشهور"
                      value={
                        payment.data.durationInMonths != null
                          ? payment.data.durationInMonths
                          : (Array.isArray(payment.data.selectedMonths) &&
                             payment.data.selectedMonths.length
                              ? payment.data.selectedMonths.length
                              : 'غير محدد')
                      }
                    />
                    <Detail
                      label="الشهور"
                      value={
                        Array.isArray(payment.data.selectedMonths) && payment.data.selectedMonths.length
                          ? payment.data.selectedMonths.join('، ')
                          : 'غير متوفر'
                      }
                    />
                    <Detail
                      label="المبلغ الإجمالي"
                      value={
                        (() => {
                          const total = payment.data.totalPrice;
                          if (total != null) {
                            return `${total} دج`;
                          }
                          const monthly = payment.data.monthlyPrice;
                          const monthsCount = payment.data.durationInMonths;
                          if (monthly != null && monthsCount != null) {
                            return `${monthly * monthsCount} دج`;
                          }
                          return 'غير محدد';
                        })()
                      }
                    />
                    <Detail
                      label="تاريخ البداية"
                      value={
                        (() => {
                          const date = payment.data.startDate;
                          if (!date) return 'غير محدد';
                          if (date?.toDate) {
                            return date.toDate().toLocaleDateString('ar-DZ');
                          }
                          if (typeof date === 'string' || typeof date === 'number') {
                            return new Date(date).toLocaleDateString('ar-DZ');
                          }
                          return 'غير محدد';
                        })()
                      }
                    />
                    <Detail
                      label="تاريخ الانتهاء"
                      value={
                        (() => {
                          const date = payment.data.endDate;
                          if (!date) return 'غير محدد';
                          if (date?.toDate) {
                            return date.toDate().toLocaleDateString('ar-DZ');
                          }
                          if (typeof date === 'string' || typeof date === 'number') {
                            return new Date(date).toLocaleDateString('ar-DZ');
                          }
                          return 'غير محدد';
                        })()
                      }
                    />
                  </div>
                )}

                {/* Payment proof image */}
                {payment.paymentProof && (
                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <Image className="w-5 h-5" />
                      إثبات الدفع:
                    </h4>
                    <img
                      src={payment.paymentProof}
                      alt="Payment proof"
                      className="max-w-xs rounded-lg cursor-pointer hover:opacity-90 transition-opacity shadow-md"
                      onClick={() => setSelectedImage(payment.paymentProof)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image modal */}
      <FileViewerModal url={selectedImage} onClose={() => setSelectedImage(null)} />
    </motion.div>
  );
};

export default PaymentsVerification;

const Detail = ({ label, value }) => (
  <div className="flex flex-col">
    <span className="text-xs text-gray-500">{label}</span>
    <span className="font-semibold text-gray-900">{value || '—'}</span>
  </div>
);