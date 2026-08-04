/**
 * Student360 — the admin's single-page view of everything about one student.
 *
 * Replaces hopping across Users / archives / payments with one branch-scoped
 * aggregate (GET /api/admin/students/:userId/profile): profile & contact,
 * verification & documents, annual fee, language / training / support
 * registrations, full payment history with downloadable receipts, and the
 * activity/audit timeline (reusing EntityHistoryPanel).
 *
 * Reuses existing building blocks: ArchiveKit primitives, ReceiptButton, and the
 * audit EntityHistoryPanel — no new UI conventions.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowRight, User, Phone, Mail, School, BadgeCheck, Clock, XCircle, FileText,
  CreditCard, BookOpen, Languages, Briefcase, CalendarDays, History, ExternalLink, Inbox,
} from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import { getStudentProfile } from '../../services/adminSearchService';
import { branchLabel } from '../../utils/branches';
import { formatDate } from '../../utils/dateUtils';
import { PAYMENT_TYPE_LABELS } from '../../utils/receipt';
import ReceiptButton from '../../components/ReceiptButton';
import EntityHistoryPanel from '../components/EntityHistoryPanel';
import {
  StatCard, EmptyState, DetailSection, DetailRow, ArchiveSkeleton, formatMoney,
} from '../components/archive/ArchiveKit';

const VERIFICATION_UI = {
  verified: { label: 'موثّق', Icon: BadgeCheck, cls: 'bg-success-50 text-success-700 border-success-200' },
  pending:  { label: 'قيد المراجعة', Icon: Clock, cls: 'bg-warning-50 text-warning-700 border-warning-200' },
  rejected: { label: 'مرفوض', Icon: XCircle, cls: 'bg-danger-50 text-danger-700 border-danger-200' },
};

const PAYMENT_STATUS_UI = {
  paid: 'bg-success-50 text-success-700 border-success-200',
  pending_payment: 'bg-warning-50 text-warning-700 border-warning-200',
  failed: 'bg-danger-50 text-danger-700 border-danger-200',
  canceled: 'bg-gray-100 text-gray-500 border-gray-200',
};
const PAYMENT_STATUS_LABEL = {
  paid: 'مدفوع', pending_payment: 'بانتظار الدفع', failed: 'فشل', canceled: 'ملغى',
};

const TABS = [
  { key: 'profile', label: 'الملف الشخصي', Icon: User },
  { key: 'registrations', label: 'التسجيلات', Icon: BookOpen },
  { key: 'payments', label: 'المدفوعات والإيصالات', Icon: CreditCard },
  { key: 'activity', label: 'سجل النشاط', Icon: History },
];

export default function Student360() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { branches } = useBranch();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('profile');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getStudentProfile(userId)
      .then((res) => { if (active) setData(res); })
      .catch((err) => { if (active) setError(err?.message || 'تعذر تحميل ملف الطالب.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  const profile = data?.profile || {};
  const branchName = profile.branchName || branchLabel(data?.branchId, branches);

  // Shared identity stamped onto every receipt generated from this page.
  const receiptInfo = useMemo(() => ({
    studentName: profile.name || profile.fullName,
    studentEmail: profile.email,
    studentPhone: profile.studentPhone || profile.phone || profile.phoneNumber || profile.guardianPhone,
    branchLabel: branchName,
  }), [profile, branchName]);

  if (loading) {
    return <div className="p-1"><ArchiveSkeleton statCount={4} cols={4} /></div>;
  }
  if (error) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState icon={XCircle} title="تعذر تحميل الملف" subtitle={error}
          action={<button onClick={() => navigate(-1)} className="text-sm font-semibold text-primary hover:underline">العودة</button>} />
      </div>
    );
  }

  const ver = VERIFICATION_UI[data.verification?.status] || VERIFICATION_UI.pending;

  return (
    <div className="space-y-5" dir="rtl">
      {/* Back + header */}
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary">
        <ArrowRight className="h-4 w-4" /> رجوع
      </button>

      <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
            {(profile.name || '؟').trim().charAt(0)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-gray-900">{profile.name || profile.fullName || 'طالب'}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
              {profile.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{profile.email}</span>}
              {branchName && <span className="inline-flex items-center gap-1"><School className="h-3.5 w-3.5" />{branchName}</span>}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1 text-sm font-semibold ${ver.cls}`}>
          <ver.Icon className="h-4 w-4" /> {ver.label}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CalendarDays} tone={data.annualFee?.paid ? 'success' : 'warning'} label="الرسم السنوي"
          value={data.annualFee?.paid ? 'مدفوع' : 'غير مدفوع'} />
        <StatCard icon={BookOpen} tone="primary" label="دروس الدعم" value={data.registrations?.counts?.support ?? 0} />
        <StatCard icon={Languages} tone="secondary" label="اللغات" value={data.registrations?.counts?.languages ?? 0} />
        <StatCard icon={Briefcase} tone="accent" label="الدورات التكوينية" value={data.registrations?.counts?.trainings ?? 0} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Tab: Profile */}
      {tab === 'profile' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <DetailSection title="معلومات التواصل">
            <DetailRow label="الاسم الكامل" value={profile.name || profile.fullName} />
            <DetailRow label="البريد الإلكتروني" value={profile.email} />
            <DetailRow label="هاتف الطالب" value={profile.studentPhone} />
            <DetailRow label="هاتف ولي الأمر" value={profile.guardianPhone || profile.phoneNumber} />
            <DetailRow label="المؤسسة التعليمية" value={profile.school} />
            <DetailRow label="تاريخ الميلاد" value={profile.birthDate} />
          </DetailSection>

          <div className="space-y-4">
            <DetailSection title="التحقق والوثائق">
              <DetailRow label="حالة التحقق" value={ver.label} />
              <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-2.5 last:border-0">
                <span className="text-sm text-gray-500">الوثائق</span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {data.verification?.idCardUrl ? (
                    <a href={data.verification.idCardUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-primary hover:bg-primary-50">
                      <FileText className="h-3.5 w-3.5" /> بطاقة الهوية
                    </a>
                  ) : <span className="text-xs text-gray-400">لا توجد بطاقة</span>}
                  {data.verification?.photoUrl && (
                    <a href={data.verification.photoUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-primary hover:bg-primary-50">
                      <FileText className="h-3.5 w-3.5" /> الصورة
                    </a>
                  )}
                </span>
              </div>
            </DetailSection>

            <DetailSection title="الرسم السنوي">
              {data.annualFee?.current ? (
                <>
                  <DetailRow label="الحالة" value={data.annualFee.paid ? 'مدفوع' : 'غير مدفوع'} />
                  <DetailRow label="المبلغ" value={formatMoney(data.annualFee.current.amount)} />
                  <DetailRow label="السنة الدراسية" value={data.annualFee.current.year || data.annualFee.current.academicYear} />
                  <div className="flex items-center justify-between gap-4 py-2.5">
                    <span className="text-sm text-gray-500">الإيصال</span>
                    <ReceiptButton data={{
                      ...receiptInfo,
                      paymentType: 'annual_fee',
                      serviceName: `الرسم السنوي — ${data.annualFee.current.year || ''}`.trim(),
                      amount: data.annualFee.current.amount,
                      date: data.annualFee.current.verifiedAt || data.annualFee.current.createdAt,
                      reference: data.annualFee.current.id,
                      academicYear: data.annualFee.current.year || data.annualFee.current.academicYear,
                      status: 'paid',
                    }} />
                  </div>
                </>
              ) : (
                <p className="py-3 text-sm text-gray-400">لم يُسجَّل رسم سنوي بعد.</p>
              )}
            </DetailSection>
          </div>
        </div>
      )}

      {/* Tab: Registrations */}
      {tab === 'registrations' && (
        <div className="space-y-4">
          <RegistrationGroup title="دروس الدعم" Icon={BookOpen} items={data.registrations.support}
            nameOf={(r) => r.subjectName || r.lessonName || 'درس دعم'}
            metaOf={(r) => [r.groupName, r.teacherName, r.classroom].filter(Boolean).join(' · ')}
            receiptOf={(r) => ({ ...receiptInfo, paymentType: 'support', serviceName: r.subjectName || r.lessonName, amount: r.amount ?? r.price, date: r.startDate || r.createdAt, reference: r.orderId || r.id, status: r.status || 'paid' })} />
          <RegistrationGroup title="اللغات" Icon={Languages} items={data.registrations.languages}
            nameOf={(r) => [r.languageName, r.levelLabel].filter(Boolean).join(' — ') || 'لغة'}
            metaOf={(r) => [r.groupName, r.teacherName].filter(Boolean).join(' · ')}
            receiptOf={(r) => ({ ...receiptInfo, paymentType: 'language', serviceName: [r.languageName, r.levelLabel].filter(Boolean).join(' — '), amount: r.amount ?? r.price, date: r.registeredAt || r.createdAt, reference: r.orderId || r.id, status: 'paid' })} />
          <RegistrationGroup title="الدورات التكوينية" Icon={Briefcase} items={data.registrations.trainings}
            nameOf={(r) => r.trainingTitle || r.trainingName || r.name || 'دورة'}
            metaOf={(r) => [r.groupName, r.teacherName].filter(Boolean).join(' · ')}
            receiptOf={(r) => ({ ...receiptInfo, paymentType: 'training', serviceName: r.trainingTitle || r.trainingName || r.name, amount: r.trainingPrice ?? r.amount ?? r.price, date: r.registeredAt || r.createdAt, reference: r.orderId || r.id, status: 'paid' })} />
        </div>
      )}

      {/* Tab: Payments */}
      {tab === 'payments' && (
        data.payments.length === 0 ? (
          <EmptyState icon={Inbox} title="لا توجد مدفوعات" subtitle="لم يُسجَّل أي دفع لهذا الطالب بعد." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">النوع</th>
                  <th className="px-4 py-3 text-start font-semibold">الخدمة</th>
                  <th className="px-4 py-3 text-start font-semibold">المبلغ</th>
                  <th className="px-4 py-3 text-start font-semibold">التاريخ</th>
                  <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                  <th className="px-4 py-3 text-start font-semibold">الإيصال</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.payments.map((p) => (
                  <tr key={p.orderId} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-gray-900">{PAYMENT_TYPE_LABELS[p.serviceType] || p.serviceType}</td>
                    <td className="px-4 py-3 text-gray-600">{p.serviceName || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatMoney(p.amount) || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.paidAt || p.createdAt ? formatDate(new Date(p.paidAt || p.createdAt)) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_UI[p.status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {PAYMENT_STATUS_LABEL[p.status] || p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.status === 'paid' ? (
                        <ReceiptButton data={{
                          ...receiptInfo,
                          paymentType: p.serviceType,
                          serviceName: p.serviceName,
                          amount: p.amount,
                          date: p.paidAt || p.createdAt,
                          reference: p.reference || p.orderId,
                          status: 'paid',
                        }} />
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Tab: Activity */}
      {tab === 'activity' && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
          <History className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <h3 className="text-base font-semibold text-gray-900">سجل النشاط والتدقيق</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
            كل إجراء إداري على هذا الطالب مُسجَّل في سجل التدقيق غير القابل للتعديل.
          </p>
          <button
            onClick={() => setShowHistory(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            <ExternalLink className="h-4 w-4" /> عرض السجل الكامل
          </button>
        </div>
      )}

      {showHistory && (
        <EntityHistoryPanel
          targetType="user"
          targetId={userId}
          branchId={data.branchId}
          title={profile.name || 'الطالب'}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

/** A titled group of registration cards, each with a downloadable receipt. */
function RegistrationGroup({ title, Icon, items = [], nameOf, metaOf, receiptOf }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <Icon className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400">{items.length}</span>
      </div>
      <div className="p-4">
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">لا توجد تسجيلات.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-gray-100 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{nameOf(r)}</p>
                  {metaOf(r) && <p className="truncate text-xs text-gray-500">{metaOf(r)}</p>}
                </div>
                <ReceiptButton data={receiptOf(r)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
