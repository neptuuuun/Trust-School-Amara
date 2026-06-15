import React, { useEffect, useMemo, useState } from 'react';
import { useBranch } from '../../contexts/BranchContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getLanguageRegistrationsByStatus,
  getSupportLessonRegistrationsByStatus,
  getAnnualFeeSupportRegistrationsByStatus,
  getUnverifiedTrainingRegistrations,
  getTrainingRegistrationsByVerified,
  verifyLanguageRegistration,
  rejectLanguageRegistration,
  verifySupportLessonRegistration,
  rejectSupportLessonRegistration,
  verifyTrainingRegistration,
  verifyAnnualPayment,
  rejectAnnualPayment,
  rejectTrainingRegistration,
  requestPaymentCorrection,
  getUser,
  getAnnualPayment,
  getAnnualPayments,
  getClasses,
} from '../../services/firestoreService';
import { cleanupPaymentReceipt } from '../../services/storageCleanupService';
import {
  CreditCard, Check, X, AlertCircle, RefreshCw, Search, Clock, Phone,
  Wallet, CheckCircle2, XCircle, FileText, ChevronLeft, User, Inbox,
  AlertTriangle, Edit3, Mail, Image as ImageIcon, Calendar, RotateCcw, History,
} from 'lucide-react';
import apiCall from '../../utils/apiClient';
import PaymentProofViewer from '../components/PaymentProofViewer';
import AdminModal from '../components/AdminModal';
import { useToast } from '../components/ToastNotifications';
import { motion } from 'framer-motion';
import { formatDate, formatDateTime, formatDayMonth } from '../../utils/dateUtils';

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPES = [
  { value: 'all',           label: 'الكل' },
  { value: 'language',      label: 'دورات اللغة' },
  { value: 'annual',        label: 'الرسوم السنوية' },
  { value: 'supportLesson', label: 'دروس الدعم' },
  { value: 'training',      label: 'الدورات التكوينية' },
];

const TYPE_STYLE = {
  language:     'bg-secondary-100 text-secondary-700 border-secondary-200',
  annual:       'bg-success-100 text-success-700 border-success-200',
  supportLesson:'bg-primary-100 text-primary-700 border-primary-200',
  training:     'bg-accent-100 text-accent-700 border-accent-200',
};

// ─── Status model (Phase 1 + 6) ─────────────────────────────────────────────────
// pending → needs_correction → pending → approved   |   pending → rejected
// needs_correction is NEVER grouped with rejected.

const STATUSES = [
  { value: 'all',              label: 'الكل' },
  { value: 'pending',          label: 'معلقة' },
  { value: 'needs_correction', label: 'تحتاج تصحيح' },
  { value: 'approved',         label: 'مقبولة' },
  { value: 'rejected',         label: 'مرفوضة' },
];

// Visual language: pending = gray, needs_correction = amber, approved = green, rejected = red.
const STATUS_STYLE = {
  pending:          { label: 'بانتظار المراجعة', badge: 'bg-gray-100 text-gray-700 border-gray-200',          icon: Clock },
  needs_correction: { label: 'تحتاج تصحيح',       badge: 'bg-warning-100 text-warning-800 border-warning-300', icon: Edit3 },
  approved:         { label: 'مقبولة',            badge: 'bg-success-100 text-success-700 border-success-200', icon: CheckCircle2 },
  rejected:         { label: 'مرفوضة',            badge: 'bg-danger-100 text-danger-700 border-danger-200',    icon: XCircle },
};

const normalizeStatus = (raw) => {
  const s = String(raw || 'pending').toLowerCase();
  if (s === 'needs_correction') return 'needs_correction';
  if (s === 'verified' || s === 'approved' || s === 'registered') return 'approved';
  if (s === 'rejected') return 'rejected';
  return 'pending';
};

const TIME_RANGES = [
  { value: 'all',   label: 'كل الأوقات' },
  { value: 'today', label: 'اليوم' },
  { value: 'week',  label: 'آخر 7 أيام' },
  { value: 'month', label: 'آخر 30 يوم' },
];

const REJECT_REASONS = [
  'إيصال غير صالح',
  'مبلغ غير مطابق',
  'صورة غير واضحة',
  'دفعة مكررة',
  'أخرى',
];

// Phase 5 — dedicated correction reasons.
const CORRECTION_REASONS = [
  'صورة الإيصال غير واضحة',
  'المبلغ غير مطابق',
  'الإيصال ناقص',
  'تم رفع ملف خاطئ',
  'معلومات إضافية مطلوبة',
  'سبب آخر',
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const isPdf = (url) =>
  typeof url === 'string' && url.split('?')[0].toLowerCase().endsWith('.pdf');

const toNumber = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const getAmount = (p) => {
  const d = p.data || {};
  switch (p.type) {
    case 'annual':        return toNumber(d.amount);
    case 'training':      return toNumber(d.trainingPrice ?? d.price);
    case 'supportLesson': return toNumber(d.totalPrice ?? d.monthlyPrice);
    case 'language':      return toNumber(d.languagePrice ?? d.price ?? d.levelPrice);
    default:              return null;
  }
};

const getPhoneInfo = (p) => {
  const d = p.data || {};
  const value = d.guardianPhone || d.studentPhone || d.userPhone || d.phone || '';
  const fieldPresent =
    'guardianPhone' in d ||
    'studentPhone' in d ||
    'userPhone' in d ||
    'phone' in d;
  return { value, fieldPresent };
};

// Keep a plain helper for search/card list usage
const getPhone = (p) => getPhoneInfo(p).value;

const formatMoney = (n) =>
  n == null ? null : `${Number(n).toLocaleString('en-US')} دج`;

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value?.toDate) { try { return value.toDate(); } catch { /* ignore */ } }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const inRange = (date, range) => {
  if (range === 'all') return true;
  if (!date) return false;
  const now = Date.now();
  switch (range) {
    case 'today': return date >= startOfToday();
    case 'week':  return now - date.getTime() <= 7 * 86400000;
    case 'month': return now - date.getTime() <= 30 * 86400000;
    default:      return true;
  }
};

const timeAgo = (date) => {
  if (!date) return 'غير متوفر';
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return formatDayMonth(date);
};


const initials = (name) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Per-day, per-branch counters so "approved/rejected today" survive reloads
// but reset automatically each day.
const counterKey = (branchId) =>
  `pv_counters_${branchId}_${new Date().toISOString().slice(0, 10)}`;

const loadCounters = (branchId) => {
  try {
    const raw = localStorage.getItem(counterKey(branchId));
    if (raw) return { approved: 0, rejected: 0, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { approved: 0, rejected: 0 };
};

const saveCounters = (branchId, c) => {
  try { localStorage.setItem(counterKey(branchId), JSON.stringify(c)); } catch { /* ignore */ }
};

// Prorated-billing breakdown for support lessons. A student who enrolls mid-cycle
// only pays for the sessions left in the month, so the backend stores the proration
// inputs on the registration. Returns null when those fields are absent (older/legacy
// registrations) so callers fall back to the plain amount with no proration line.
const getSupportProration = (d = {}) => {
  const proratedAmount   = toNumber(d.proratedAmount);
  const pricePerSession  = toNumber(d.pricePerSession);
  const sessionsPerMonth = toNumber(d.sessionsPerMonth);
  const remaining        = toNumber(d.remainingSessionsAtEnrollment);
  if (proratedAmount == null || pricePerSession == null
      || sessionsPerMonth == null || remaining == null) return null;
  return { proratedAmount, pricePerSession, sessionsPerMonth, remaining };
};

// Registration detail rows per payment type.
const registrationRows = (p) => {
  const d = p.data || {};
  switch (p.type) {
    case 'language':
      return [
        ['اللغة', d.subjectName || d.languageName],
        ['المجموعة', d.groupName],
        ['المستوى', d.levelLabel],
        ['الأستاذ', d.teacherName || 'غير محدد'],
        ['المواعيد', Array.isArray(d.schedules)
          ? d.schedules
              .map((s) => `${s?.day || ''} ${s?.start || ''}${s?.end ? `-${s.end}` : ''}`.trim())
              .filter(Boolean)
              .join('، ')
          : ''],
        ['مكان الميلاد', d.birthPlace],
        ['تاريخ الميلاد', d.birthDate ? formatDate(d.birthDate) : null],
      ];
    case 'training':
      return [
        ['اسم الدورة', d.trainingTitle || d.subjectName || d.trainingName],
        ['المجموعة', d.groupName],
        ['المواعيد', Array.isArray(d.schedules)
          ? d.schedules
              .map((s) => `${s?.day || ''} ${s?.start || ''}${s?.end ? `-${s.end}` : ''}`.trim())
              .filter(Boolean)
              .join('، ')
          : ''],
      ];
    case 'supportLesson': {
      // Mid-cycle enrollments are billed pro rata; surface the calculation so an
      // admin can reconcile the receipt against the expected amount. Absent on
      // legacy registrations → proration is null and these rows are omitted.
      const proration = getSupportProration(d);
      return [
        ['المادة', d.subjectName || d.lessonName],
        ['المجموعة', d.groupName],
        ['المستوى الدراسي', d.studyYearLabel || d.yearName || d.studyYear],
        ['الأستاذ', d.teacherName],
        ['المواعيد', Array.isArray(d.schedules)
          ? d.schedules
              .map((s) => `${s?.day || ''} ${s?.start || ''}${s?.end ? `-${s.end}` : ''}`.trim())
              .filter(Boolean)
              .join('، ')
          : ''],
        ['عدد الأشهر', d.durationInMonths ?? (Array.isArray(d.selectedMonths) ? d.selectedMonths.length : null)],
        // Full monthly price — labelled "الكامل" only when a prorated amount sits
        // beside it; legacy rows keep the plain "السعر الشهري" label and amount.
        [proration ? 'السعر الشهري الكامل' : 'السعر الشهري', d.monthlyPrice != null ? formatMoney(d.monthlyPrice) : null],
        // Prorated amount due = remaining sessions × price per session.
        ['المبلغ التناسبي المستحق', proration
          ? `${proration.remaining} من ${proration.sessionsPerMonth} حصة متبقية × ${formatMoney(proration.pricePerSession)} = ${formatMoney(proration.proratedAmount)}`
          : null],
        ['الرسوم السنوية مضمّنة', d.includesAnnualFee ? 'نعم' : 'لا'],
        ['الرسوم السنوية', d.includesAnnualFee && d.annualFeeAmount != null ? formatMoney(d.annualFeeAmount) : null],
        ['الإجمالي (شامل الرسوم)', d.includesAnnualFee && d.totalAmount != null ? formatMoney(d.totalAmount) : null],
      ];
    }
    case 'annual':
      return [
        ['المستوى', d.level],
        ['السنة', d.year],
        ['الشعبة', d.stream],
        ['المدرسة', d.school],
      ];
    default:
      return [];
  }
};

// Phase 8 — lifecycle timeline derived from existing timestamp fields.
const buildTimeline = (p) => {
  const d = p.data || {};
  const ev = [];
  const created = toDate(d.submittedAt || d.createdAt || p.createdAt);
  if (created) ev.push({ key: 'created', label: 'تم إنشاء الطلب', at: created });

  const cAt = toDate(d.correctionRequestedAt);
  if (cAt) ev.push({ key: 'correction', label: 'تم طلب تصحيح', at: cAt, note: d.correctionReason });

  const rAt = toDate(d.lastResubmittedAt);
  if (rAt) ev.push({ key: 'resubmitted', label: 'تم إعادة رفع الإيصال', at: rAt });

  if (p.status === 'approved') {
    const vAt = toDate(d.verifiedAt || d.registeredAt);
    ev.push({ key: 'approved', label: 'تمت الموافقة', at: vAt });
  }
  if (p.status === 'rejected') {
    const xAt = toDate(d.rejectedAt || d.updatedAt);
    ev.push({ key: 'rejected', label: 'تم الرفض', at: xAt, note: d.rejectionReason || d.notes });
  }
  return ev.sort((a, b) => (a.at?.getTime?.() || 0) - (b.at?.getTime?.() || 0));
};

// ─── Per-type normalizers (reused for active + processed loads) ──────────────────

const normalizeLanguage = (reg, userData = {}) => {
  const studentId = reg.userId;
  return {
    id: reg.formId || reg.id, paymentId: reg.formId || reg.id,
    status: normalizeStatus(reg.status), formId: reg.formId || reg.id,
    type: 'language', typeName: 'تسجيل في دورة لغة', userId: studentId, studentId,
    userName: reg.studentName || userData.name || userData.fullName || 'غير متوفر',
    userEmail: reg.studentEmail || userData.email || 'غير متوفر',
    paymentProof: reg.receiptUrl || reg.paymentProof || '',
    createdAt: reg.submittedAt || reg.createdAt, data: reg,
  };
};

const normalizeTraining = (reg, userData = {}) => {
  const studentId = reg.userId;
  const entryId = reg.id || reg.formId || reg.entryId;
  return {
    id: entryId, paymentId: entryId, status: normalizeStatus(reg.status),
    type: 'training', typeName: 'تسجيل في دورة تكوينية',
    userId: studentId, studentId, formId: entryId, entryId,
    userName: reg.studentName || userData.name || userData.fullName || 'غير متوفر',
    userEmail: reg.studentEmail || reg.userEmail || userData.email || 'غير متوفر',
    paymentProof: reg.paymentProof || reg.receiptUrl || '',
    createdAt: reg.submittedAt || reg.createdAt || reg.timestamp, data: reg,
  };
};

const normalizeAnnual = (payment, userData = {}) => {
  const studentId = payment.userId;
  return {
    id: payment.id, paymentId: payment.id, status: normalizeStatus(payment.status),
    type: 'annual', typeName: 'رسوم سنوية', userId: studentId, studentId,
    userName: payment.userName || userData.name || userData.fullName || 'غير متوفر',
    userEmail: payment.userEmail || userData.email || 'غير متوفر',
    paymentProof: payment.receiptUrl || '',
    createdAt: payment.createdAt, data: payment,
  };
};

const normalizeSupportMonthly = (reg, userData = {}, supportLessonsById = new Map()) => {
  const months = Array.isArray(reg.selectedMonths) && reg.selectedMonths.length
    ? reg.selectedMonths : reg.month ? [reg.month] : [];
  const lessonId = reg.lessonId || reg.subjectId || null;
  const lessonMeta = lessonId ? supportLessonsById.get(lessonId) : null;
  const subjectName = reg.subjectName || lessonMeta?.subject || lessonMeta?.name || 'غير محددة';
  const durationInMonths = typeof reg.durationInMonths === 'number' ? reg.durationInMonths
    : Array.isArray(months) && months.length ? months.length : null;
  const monthlyPrice = reg.monthlyPrice ?? reg.pricePerMonth ?? (lessonMeta ? lessonMeta.price : null);
  const totalPrice = reg.totalPrice != null ? reg.totalPrice
    : monthlyPrice != null && durationInMonths ? monthlyPrice * durationInMonths : null;
  const normalizedStart = toDate(reg.startDate || reg.createdAt);
  let endDate = reg.endDate;
  if (!endDate && normalizedStart && durationInMonths) {
    const tmp = new Date(normalizedStart.getTime());
    tmp.setMonth(tmp.getMonth() + durationInMonths);
    endDate = tmp;
  }
  return {
    id: reg.id, paymentId: reg.id, status: normalizeStatus(reg.status),
    type: 'supportLesson', typeName: 'تسجيل درس دعم', userId: reg.userId, source: 'monthly',
    userName: reg.studentName || reg.userName || userData.name || userData.fullName || 'غير متوفر',
    userEmail: reg.studentEmail || userData.email || 'غير متوفر',
    paymentProof: reg.paymentProofUrl || reg.paymentProofURL || reg.paymentProof || '',
    createdAt: reg.createdAt,
    data: { ...reg, selectedMonths: months, subjectName, durationInMonths, monthlyPrice, totalPrice,
      startDate: normalizedStart || reg.startDate || reg.createdAt, endDate: endDate || null },
  };
};

const normalizeAnnualFeeSupport = (reg, userData = {}, annualProof = '', annualCreatedAt = null) => {
  const studentId = reg.userId;
  return {
    id: reg.id, paymentId: reg.paymentId || null, status: normalizeStatus(reg.status),
    type: 'supportLesson', typeName: 'درس دعم (ضمن الرسوم السنوية)',
    userId: studentId, studentId, source: 'annualFee',
    userName: reg.studentName || reg.userName || userData.name || userData.fullName || 'غير متوفر',
    userEmail: reg.studentEmail || userData.email || 'غير متوفر',
    paymentProof: annualProof, createdAt: annualCreatedAt || reg.createdAt, data: reg,
  };
};

// ─── Small presentational pieces ───────────────────────────────────────────────

const StatCard = ({ icon: Icon, label, value, tone }) => {
  const tones = {
    gray:    'bg-gray-100 text-gray-600 border-gray-200',
    amber:   'bg-warning-50 text-warning-600 border-warning-100',
    blue:    'bg-secondary-50 text-secondary-600 border-secondary-100',
    green:   'bg-success-50 text-success-600 border-success-100',
    red:     'bg-danger-50 text-danger-600 border-danger-100',
    indigo:  'bg-primary-50 text-primary-600 border-primary-100',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
      <div className={`flex-shrink-0 w-11 h-11 rounded-xl border flex items-center justify-center ${tones[tone] || tones.blue}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-900 leading-tight truncate">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.badge}`}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
};

const TypeBadge = ({ payment }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${TYPE_STYLE[payment.type] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
    {payment.typeName}
  </span>
);

const ProofThumb = ({ url, onOpen, large }) => {
  const box = large ? 'w-full h-48' : 'w-16 h-16 sm:w-20 sm:h-20';
  if (!url) {
    return (
      <div className={`${box} rounded-xl bg-warning-50 border border-dashed border-warning-300 flex flex-col items-center justify-center text-warning-600 flex-shrink-0 gap-1`}>
        <AlertCircle className="w-5 h-5" />
        <span className="text-[10px] font-medium">لا يوجد إيصال</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(url); }}
      className={`${box} group relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0 hover:border-primary transition-colors`}
      aria-label="عرض إيصال الدفع"
    >
      {isPdf(url) ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-1">
          <FileText className="w-6 h-6" />
          <span className="text-[10px] font-medium">PDF</span>
        </div>
      ) : (
        <img src={url} alt="إيصال الدفع" loading="lazy" className="w-full h-full object-cover" />
      )}
      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
        <ImageIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
    </button>
  );
};

// ─── Lifecycle timeline ──────────────────────────────────────────────────────────

const TIMELINE_ICON = {
  created:     { Icon: FileText,     color: 'bg-gray-100 text-gray-500' },
  correction:  { Icon: Edit3,        color: 'bg-warning-100 text-warning-600' },
  resubmitted: { Icon: RotateCcw,    color: 'bg-secondary-100 text-secondary-600' },
  approved:    { Icon: CheckCircle2, color: 'bg-success-100 text-success-600' },
  rejected:    { Icon: XCircle,      color: 'bg-danger-100 text-danger-600' },
};

const Timeline = ({ events }) => {
  if (!events.length) return null;
  return (
    <ol className="relative space-y-3">
      {events.map((e, i) => {
        const cfg = TIMELINE_ICON[e.key] || TIMELINE_ICON.created;
        const Icon = cfg.Icon;
        return (
          <li key={`${e.key}-${i}`} className="flex gap-3">
            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${cfg.color}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 -mt-0.5">
              <p className="text-sm font-semibold text-gray-800">{e.label}</p>
              <p className="text-xs text-gray-400">{formatDateTime(e.at)}</p>
              {e.note && <p className="text-xs text-gray-600 mt-0.5 bg-gray-50 rounded-lg px-2 py-1">{e.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

// ─── Payment review card (list item) ────────────────────────────────────────────

const PaymentCard = ({ payment, onOpen, onViewImage, onApprove, onReject, busy }) => {
  const amount = formatMoney(getAmount(payment));
  const phone = getPhone(payment);
  const date = toDate(payment.createdAt);
  const isPending = payment.status === 'pending';
  const isCorrection = payment.status === 'needs_correction';
  const correctionCount = payment.data?.correctionCount || 0;

  return (
    <div
      onClick={() => onOpen(payment)}
      className={`bg-white rounded-2xl shadow-sm border transition-all cursor-pointer p-4 hover:shadow-md ${
        isCorrection ? 'border-warning-200 hover:border-warning-300' : 'border-gray-200 hover:border-primary/40'
      }`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(payment); }}
    >
      <div className="flex gap-3">
        <ProofThumb url={payment.paymentProof} onOpen={onViewImage} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 truncate">{payment.userName}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <TypeBadge payment={payment} />
                <StatusBadge status={payment.status} />
              </div>
            </div>
            {amount && (
              <div className="text-end flex-shrink-0">
                <p className="text-base font-extrabold text-gray-900 whitespace-nowrap">{amount}</p>
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {phone && (
              <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{phone}</span>
            )}
            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{timeAgo(date)}</span>
          </div>
        </div>
      </div>

      {/* Actions / status footer */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
        {isPending ? (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onApprove(payment); }}
              disabled={!!busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-success-600 hover:bg-success-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {busy === 'approving' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              قبول
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onReject(payment); }}
              disabled={!!busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-danger-200 text-danger-600 hover:bg-danger-50 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {busy === 'rejecting' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              رفض
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(payment); }}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 text-gray-500 hover:text-primary hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors"
              aria-label="مراجعة كاملة"
            >
              مراجعة <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        ) : isCorrection ? (
          <>
            <span className="flex-1 inline-flex items-center gap-1.5 text-xs font-medium text-warning-700">
              <Clock className="w-3.5 h-3.5" />
              بانتظار إعادة رفع الطالب{correctionCount > 1 ? ` · المحاولة ${correctionCount}` : ''}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(payment); }}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 text-warning-700 bg-warning-50 hover:bg-warning-100 rounded-xl text-sm font-medium transition-colors"
            >
              عرض التفاصيل <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(payment); }}
            className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-gray-500 hover:text-primary hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors"
          >
            عرض التفاصيل <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Quick review modal ──────────────────────────────────────────────────────────

const InfoRow = ({ icon: Icon, label, value, href, warn }) => {
  if (!value) return null;
  const valueClass = warn
    ? 'text-warning-600 text-sm break-words font-medium'
    : 'font-semibold text-gray-900 text-sm break-words';
  const content = (
    <>
      <span className="text-xs text-gray-500 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}{label}
      </span>
      <span className={valueClass}>{value}</span>
    </>
  );
  return (
    <div className="flex flex-col gap-0.5 py-2">
      {href ? <a href={href} className="flex flex-col gap-0.5 hover:text-primary">{content}</a> : content}
    </div>
  );
};

const Section = ({ title, children }) => (
  <div className="bg-white rounded-2xl border border-gray-200 p-4">
    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{title}</h4>
    <div className="divide-y divide-gray-50">{children}</div>
  </div>
);

const ReviewModal = ({ payment, busy, onClose, onViewImage, onApprove, onReject, onCorrect }) => {
  if (!payment) return null;

  const amount = formatMoney(getAmount(payment));
  const phoneInfo = getPhoneInfo(payment);
  const phoneDisplay = phoneInfo.value
    ? phoneInfo.value
    : phoneInfo.fieldPresent
      ? 'لم يقم الطالب بإدخال رقم هاتف'
      : '⚠️ رقم الهاتف غير موجود في بيانات التسجيل';
  const phoneIsSystemMissing = !phoneInfo.value && !phoneInfo.fieldPresent;
  const phoneIsStudentBlank = !phoneInfo.value && phoneInfo.fieldPresent;

  const nameDisplay = payment.userName || '⚠️ الاسم غير موجود في بيانات التسجيل';
  const emailDisplay = payment.userEmail || '⚠️ البريد الإلكتروني غير موجود في بيانات التسجيل';

  const date = toDate(payment.createdAt);
  const rows = registrationRows(payment).filter(([, v]) => v != null && v !== '');
  const method = payment?.data?.paymentMethod;
  const notes = payment?.data?.notes || payment?.data?.note;
  const status = payment.status;
  const correctionReason = payment.data?.correctionReason;
  const correctionCount = payment.data?.correctionCount || 0;
  const correctionAt = toDate(payment.data?.correctionRequestedAt);
  const timeline = buildTimeline(payment);
  const actionable = status === 'pending' || status === 'needs_correction';

  const footer = actionable ? (
    <div className="flex w-full flex-col gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => onApprove(payment)}
          disabled={!!busy}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-success-600 px-4 py-3 text-base font-bold text-white transition-colors hover:bg-success-700 disabled:opacity-50"
        >
          {busy === 'approving' ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          قبول الدفعة
        </button>
        <button
          onClick={() => onReject(payment)}
          disabled={!!busy}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-danger-600 px-4 py-3 text-base font-bold text-white transition-colors hover:bg-danger-700 disabled:opacity-50"
        >
          {busy === 'rejecting' ? <RefreshCw className="w-5 h-5 animate-spin" /> : <X className="w-5 h-5" />}
          رفض الدفعة
        </button>
      </div>
      <button
        onClick={() => onCorrect(payment)}
        disabled={!!busy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-2.5 text-sm font-semibold text-warning-700 transition-colors hover:bg-warning-100 disabled:opacity-50"
      >
        {busy === 'correcting' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
        {status === 'needs_correction' ? 'إعادة طلب التصحيح' : 'طلب تصحيح'}
      </button>
    </div>
  ) : null;

  return (
    <AdminModal
      open
      onClose={onClose}
      size="lg"
      bodyClassName="bg-gray-50"
      badge={(
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
          {initials(payment.userName)}
        </div>
      )}
      title={payment.userName}
      subtitle={<span className="flex items-center gap-1.5"><TypeBadge payment={payment} /><StatusBadge status={status} /></span>}
      footer={footer}
    >
      <div className="space-y-3">
        {/* Correction notice */}
        {status === 'needs_correction' && (
          <div className="bg-warning-50 border border-warning-200 rounded-2xl p-4">
            <div className="flex items-start gap-2">
              <Edit3 className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-warning-800">بانتظار تصحيح الطالب</p>
                {correctionReason && <p className="text-sm text-warning-700 mt-0.5">السبب: {correctionReason}</p>}
                <p className="text-xs text-warning-600 mt-1">
                  طُلب التصحيح {correctionAt ? `· ${formatDateTime(correctionAt)}` : ''}{correctionCount > 1 ? ` · المحاولة رقم ${correctionCount}` : ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Proof — the most important thing */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">إيصال الدفع</h4>
          <ProofThumb url={payment.paymentProof} onOpen={onViewImage} large />
          {payment.paymentProof && (
            <button
              onClick={() => onViewImage(payment.paymentProof)}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-sm font-semibold transition-colors"
            >
              <ImageIcon className="w-4 h-4" /> فتح وتكبير الإيصال
            </button>
          )}
        </div>

        {/* Payment info */}
        <Section title="معلومات الدفع">
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-gray-500 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" />المبلغ</span>
            <span className="text-lg font-extrabold text-gray-900">{amount || 'غير محدد'}</span>
          </div>
          <InfoRow icon={CreditCard} label="طريقة الدفع" value={method || 'غير محددة'} />
          <InfoRow icon={Calendar} label="تاريخ الإرسال" value={formatDateTime(date)} />
        </Section>

        {/* Student info */}
        <Section title="معلومات الطالب">
          <InfoRow icon={User} label="الاسم" value={nameDisplay} warn={!payment.userName} />
          <InfoRow
            icon={Phone}
            label="رقم الهاتف"
            value={phoneDisplay}
            href={phoneInfo.value ? `tel:${phoneInfo.value}` : undefined}
            warn={phoneIsSystemMissing || phoneIsStudentBlank}
          />
          <InfoRow icon={Mail} label="البريد الإلكتروني" value={emailDisplay} warn={!payment.userEmail} />
        </Section>

        {/* Registration info */}
        {rows.length > 0 && (
          <Section title="معلومات التسجيل">
            {rows.map(([label, value]) => (
              <InfoRow key={label} label={label} value={String(value)} />
            ))}
          </Section>
        )}

        {/* Notes */}
        {notes && (
          <Section title="ملاحظات">
            <p className="text-sm text-gray-700 py-1">{notes}</p>
          </Section>
        )}

        {/* Lifecycle timeline */}
        {timeline.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> سجل الطلب
            </h4>
            <Timeline events={timeline} />
          </div>
        )}
      </div>
    </AdminModal>
  );
};

// ─── Approve confirmation ────────────────────────────────────────────────────────

const ApproveDialog = ({ payment, loading, onConfirm, onCancel }) => {
  if (!payment) return null;
  const amount = formatMoney(getAmount(payment));
  const activationLabel = payment.type === 'annual'
    ? 'سيتم تفعيل الرسوم السنوية للطالب'
    : 'سيتم تفعيل تسجيل الطالب في الخدمة';

  return (
    <AdminModal
      open
      onClose={onCancel}
      size="sm"
      tier="raised"
      closeOnBackdrop={!loading}
      badge={(
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-success-100">
          <CheckCircle2 className="w-6 h-6 text-success-600" />
        </span>
      )}
      title="تأكيد قبول الدفعة"
      subtitle={`${payment.userName}${amount ? ` · ${amount}` : ''}`}
      footer={(
        <>
          <button onClick={onCancel} disabled={loading} className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60">
            إلغاء
          </button>
          <button onClick={onConfirm} disabled={loading} className="rounded-xl bg-success-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-success-700 disabled:opacity-60">
            {loading ? 'جاري المعالجة...' : 'تأكيد القبول'}
          </button>
        </>
      )}
    >
      <p className="text-sm text-gray-600 mb-3">عند التأكيد سيحدث ما يلي:</p>
      <ul className="space-y-2">
        {['سيتم تأكيد استلام الدفعة', activationLabel, 'سيتم إشعار الطالب بالقبول'].map((t) => (
          <li key={t} className="flex items-center gap-2 text-sm text-gray-700">
            <Check className="w-4 h-4 text-success-600 flex-shrink-0" />{t}
          </li>
        ))}
      </ul>
    </AdminModal>
  );
};

// ─── Reject dialog (structured reasons) ──────────────────────────────────────────

const RejectDialog = ({ payment, loading, onConfirm, onCancel }) => {
  const [selected, setSelected] = useState('');
  const [customText, setCustomText] = useState('');

  useEffect(() => { setSelected(''); setCustomText(''); }, [payment]);

  if (!payment) return null;

  const finalReason = selected === 'أخرى' ? customText.trim() : selected;
  const canSubmit = selected && (selected !== 'أخرى' || customText.trim());

  return (
    <AdminModal
      open
      onClose={onCancel}
      size="sm"
      tier="raised"
      closeOnBackdrop={!loading}
      badge={(
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-danger-100">
          <AlertTriangle className="w-5 h-5 text-danger-600" />
        </span>
      )}
      title="رفض الدفعة"
      subtitle={payment.userName}
      footer={(
        <>
          <button onClick={onCancel} disabled={loading} className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60">
            إلغاء
          </button>
          <button
            onClick={() => onConfirm(finalReason)}
            disabled={loading || !canSubmit}
            className="rounded-xl bg-danger-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-danger-700 disabled:opacity-50"
          >
            {loading ? 'جاري المعالجة...' : 'تأكيد الرفض'}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600">اختر سبب الرفض ليتم إعلام الطالب به:</p>
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
          الرفض إجراء نهائي. إن كنت تريد فقط طلب إيصال أوضح، استخدم «طلب تصحيح» بدلاً من ذلك.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {REJECT_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setSelected(r)}
              className={`text-start px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                selected === r
                  ? 'bg-danger-50 border-danger-300 text-danger-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-danger-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {selected === 'أخرى' && (
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="اكتب سبب الرفض..."
            rows={2}
            autoFocus
            className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        )}
      </div>
    </AdminModal>
  );
};

// ─── Request correction dialog (Phase 5 — dedicated, NOT a rejection) ─────────────

const RequestCorrectionDialog = ({ payment, loading, onConfirm, onCancel }) => {
  const [selected, setSelected] = useState('');
  const [customText, setCustomText] = useState('');

  useEffect(() => { setSelected(''); setCustomText(''); }, [payment]);

  if (!payment) return null;

  const finalReason = selected === 'سبب آخر' ? customText.trim() : selected;
  const canSubmit = selected && (selected !== 'سبب آخر' || customText.trim());

  return (
    <AdminModal
      open
      onClose={onCancel}
      size="sm"
      tier="raised"
      closeOnBackdrop={!loading}
      badge={(
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-warning-100">
          <Edit3 className="w-5 h-5 text-warning-600" />
        </span>
      )}
      title="طلب تصحيح"
      subtitle={payment.userName}
      footer={(
        <>
          <button onClick={onCancel} disabled={loading} className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60">
            إلغاء
          </button>
          <button
            onClick={() => onConfirm(finalReason)}
            disabled={loading || !canSubmit}
            className="rounded-xl bg-warning-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-warning-700 disabled:opacity-50"
          >
            {loading ? 'جاري الإرسال...' : 'إرسال طلب التصحيح'}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <p className="text-sm text-warning-800 bg-warning-50 border border-warning-200 rounded-xl p-3">
          سيتم إرسال طلب تصحيح للطالب مع الاحتفاظ بالتسجيل وعدم رفضه.
        </p>
        <p className="text-sm text-gray-600">اختر ما الذي يجب على الطالب تصحيحه:</p>
        <div className="grid grid-cols-1 gap-2">
          {CORRECTION_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setSelected(r)}
              className={`text-start px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                selected === r
                  ? 'bg-warning-50 border-warning-300 text-warning-800'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-warning-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {selected === 'سبب آخر' && (
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="اكتب ما الذي يجب تصحيحه..."
            rows={2}
            autoFocus
            className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-warning-500 focus:ring-2 focus:ring-warning-500/20"
          />
        )}
      </div>
    </AdminModal>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const PaymentsVerification = () => {
  const { selectedBranchId } = useBranch();
  const { user } = useAuth();
  const { show: showToast } = useToast();

  const [payments, setPayments] = useState([]);           // active set: pending + needs_correction
  const [processed, setProcessed] = useState({ approved: null, rejected: null }); // lazy-loaded
  const [processedLoading, setProcessedLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState({});

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Overlays
  const [viewerUrl, setViewerUrl] = useState(null);
  const [drawerPayment, setDrawerPayment] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [correctTarget, setCorrectTarget] = useState(null);

  // Daily counters
  const [counters, setCounters] = useState({ approved: 0, rejected: 0 });

  useEffect(() => {
    if (selectedBranchId) {
      setCounters(loadCounters(selectedBranchId));
      loadActive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  // Lazy-load processed (approved / rejected) sets the first time they're viewed.
  useEffect(() => {
    if (!selectedBranchId) return;
    if ((statusFilter === 'approved' || statusFilter === 'rejected')
        && processed[statusFilter] == null && !processedLoading) {
      loadProcessed(statusFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, selectedBranchId]);

  // Builds normalized payment objects from raw per-type arrays (shared by both loads).
  const buildPayments = async (branchId, raw) => {
    const out = [];
    const userCache = new Map();
    const getUserData = async (uid) => {
      if (!uid) return {};
      if (userCache.has(uid)) return userCache.get(uid);
      let data = {};
      try { const snap = await getUser(branchId, uid); data = snap.exists() ? snap.data() : {}; } catch { /* ignore */ }
      userCache.set(uid, data);
      return data;
    };

    for (const reg of raw.language || [])
      out.push(normalizeLanguage(reg, await getUserData(reg.userId)));
    for (const reg of raw.supportMonthly || [])
      out.push(normalizeSupportMonthly(reg, await getUserData(reg.userId), raw.supportLessonsById));
    for (const reg of raw.training || [])
      out.push(normalizeTraining(reg, await getUserData(reg.userId)));
    for (const reg of raw.annualFeeSupport || []) {
      if (!reg.paymentId) continue;
      let proof = ''; let createdAt = reg.createdAt;
      try {
        const s = await getAnnualPayment(branchId, reg.paymentId);
        if (s.exists()) { const d = s.data() || {}; proof = d.receiptUrl || ''; createdAt = d.createdAt || createdAt; }
      } catch { /* ignore */ }
      out.push(normalizeAnnualFeeSupport(reg, await getUserData(reg.userId), proof, createdAt));
    }
    for (const p of raw.annual || [])
      out.push(normalizeAnnual(p, await getUserData(p.userId)));

    out.sort((a, b) => (toDate(b.createdAt) || new Date(0)) - (toDate(a.createdAt) || new Date(0)));
    return out;
  };

  // Active queue = pending + needs_correction across all 5 payment types.
  const loadActive = async () => {
    const b = selectedBranchId;
    try {
      setLoading(true);
      const [
        langP, langC, supP, supC, afsP, afsC, training, lessons, annP, annC,
      ] = await Promise.all([
        getLanguageRegistrationsByStatus(b, 'pending'),
        getLanguageRegistrationsByStatus(b, 'needs_correction'),
        getSupportLessonRegistrationsByStatus(b, 'pending'),
        getSupportLessonRegistrationsByStatus(b, 'needs_correction'),
        getAnnualFeeSupportRegistrationsByStatus(b, 'pending'),
        getAnnualFeeSupportRegistrationsByStatus(b, 'needs_correction'),
        getUnverifiedTrainingRegistrations(b), // verified==false, excludes rejected → pending + needs_correction
        getClasses(b, { serviceType: 'support' }),
        getAnnualPayments(b, 'pending'),
        getAnnualPayments(b, 'needs_correction'),
      ]);

      const supportLessonsById = new Map(Array.isArray(lessons) ? lessons.map((l) => [l.id, l]) : []);
      const built = await buildPayments(b, {
        language: [...langP, ...langC],
        supportMonthly: [...supP, ...supC],
        annualFeeSupport: [...afsP, ...afsC],
        training,
        annual: [...annP, ...annC],
        supportLessonsById,
      });

      setPayments(built.filter((p) => p.status === 'pending' || p.status === 'needs_correction'));
      setError('');
    } catch (err) {
      console.error('Error loading payments:', err);
      setError('فشل في تحميل المدفوعات: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Lazy-load processed history (approved | rejected).
  const loadProcessed = async (group) => {
    const b = selectedBranchId;
    setProcessedLoading(true);
    try {
      const lessons = await getClasses(b, { serviceType: 'support' });
      const supportLessonsById = new Map(Array.isArray(lessons) ? lessons.map((l) => [l.id, l]) : []);

      let raw;
      if (group === 'approved') {
        const [lang, sup, afs, tr, ann] = await Promise.all([
          getLanguageRegistrationsByStatus(b, 'approved'),
          getSupportLessonRegistrationsByStatus(b, 'verified'),
          getAnnualFeeSupportRegistrationsByStatus(b, 'verified'),
          getTrainingRegistrationsByVerified(b, true),
          getAnnualPayments(b, 'verified'),
        ]);
        raw = { language: lang, supportMonthly: sup, annualFeeSupport: afs, training: tr, annual: ann, supportLessonsById };
      } else {
        const [lang, sup, afs, tr, ann] = await Promise.all([
          getLanguageRegistrationsByStatus(b, 'rejected'),
          getSupportLessonRegistrationsByStatus(b, 'rejected'),
          getAnnualFeeSupportRegistrationsByStatus(b, 'rejected'),
          getTrainingRegistrationsByVerified(b, false),
          getAnnualPayments(b, 'rejected'),
        ]);
        raw = {
          language: lang, supportMonthly: sup, annualFeeSupport: afs,
          training: tr.filter((t) => normalizeStatus(t.status) === 'rejected'),
          annual: ann, supportLessonsById,
        };
      }

      const built = await buildPayments(b, raw);
      const want = group === 'approved' ? 'approved' : 'rejected';
      setProcessed((prev) => ({ ...prev, [group]: built.filter((p) => p.status === want) }));
    } catch (err) {
      console.error('Error loading processed payments:', err);
      showToast('error', 'تعذر تحميل السجل: ' + err.message);
      setProcessed((prev) => ({ ...prev, [group]: [] }));
    } finally {
      setProcessedLoading(false);
    }
  };

  const handleRefresh = () => {
    setProcessed({ approved: null, rejected: null });
    loadActive();
    if (statusFilter === 'approved' || statusFilter === 'rejected') loadProcessed(statusFilter);
  };

  // ── Derived: counts, stats, filtered list ───────────────────────────────────
  const statusCounts = useMemo(() => ({
    all: payments.length,
    pending: payments.filter((p) => p.status === 'pending').length,
    needs_correction: payments.filter((p) => p.status === 'needs_correction').length,
    approved: processed.approved?.length,
    rejected: processed.rejected?.length,
  }), [payments, processed]);

  const stats = useMemo(() => {
    const pendingItems = payments.filter((p) => p.status === 'pending');
    const totalAmount = pendingItems.reduce((sum, p) => sum + (getAmount(p) || 0), 0);
    return {
      pending: pendingItems.length,
      needsCorrection: payments.filter((p) => p.status === 'needs_correction').length,
      totalAmount,
    };
  }, [payments]);

  const baseList = (statusFilter === 'approved' || statusFilter === 'rejected')
    ? (processed[statusFilter] || [])
    : payments;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseList.filter((p) => {
      if (statusFilter === 'pending' && p.status !== 'pending') return false;
      if (statusFilter === 'needs_correction' && p.status !== 'needs_correction') return false;
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (!inRange(toDate(p.createdAt), timeFilter)) return false;
      if (q) {
        const hay = `${p.userName} ${p.userEmail} ${getPhone(p)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [baseList, statusFilter, typeFilter, timeFilter, search]);

  const typeCounts = useMemo(() => {
    const counts = { all: baseList.length };
    for (const t of TYPES) if (t.value !== 'all') counts[t.value] = 0;
    for (const p of baseList) counts[p.type] = (counts[p.type] || 0) + 1;
    return counts;
  }, [baseList]);

  // ── Verify / reject (existing flow, preserved) ──────────────────────────────
  const processVerification = async (payment, approve, reason) => {
    setProcessing((prev) => ({ ...prev, [payment.id]: approve ? 'approving' : 'rejecting' }));
    try {
      const adminInfo = {
        uid: user?.uid || 'admin-uid',
        email: user?.email || 'admin@trust-school.com',
        name: user?.displayName || 'Admin',
      };

      if (approve) {
        switch (payment.type) {
          case 'language':
            await verifyLanguageRegistration(selectedBranchId, payment.studentId, payment.formId, adminInfo);
            break;
          case 'yearly':
          case 'annual':
            await verifyAnnualPayment(selectedBranchId, payment.paymentId, adminInfo);
            break;
          case 'supportLesson':
            if (payment.source === 'monthly') {
              await verifySupportLessonRegistration(payment.paymentId, adminInfo);
            } else {
              if (!payment.paymentId) throw new Error('Missing paymentId');
              await verifyAnnualPayment(selectedBranchId, payment.paymentId, adminInfo);
            }
            break;
          case 'training':
            await verifyTrainingRegistration(selectedBranchId, payment.studentId, payment.entryId || payment.formId, adminInfo);
            break;
          default:
            throw new Error('Unknown payment type: ' + payment.type);
        }
        showToast('success', 'تم قبول الدفعة بنجاح');
        bumpCounter('approved');

        apiCall('/api/notify/payment-event', {
          method: 'POST',
          body: JSON.stringify({
            type: payment.type, approved: true,
            studentId: payment.userId, studentName: payment.userName || '',
            studentEmail: payment.userEmail || '',
            courseName: payment.data?.trainingTitle || payment.data?.languageName || payment.type || '',
            branchId: selectedBranchId, paymentId: payment.id,
          }),
        }).catch(() => {});
      } else {
        const rejectInfo = { ...adminInfo, reason: reason || null };
        switch (payment.type) {
          case 'language':
            await rejectLanguageRegistration(selectedBranchId, payment.studentId, payment.formId, rejectInfo);
            break;
          case 'training':
            await rejectTrainingRegistration(selectedBranchId, payment.studentId, payment.entryId || payment.formId, { ...rejectInfo, reason: reason || 'لم يتم تحديد سبب' });
            break;
          case 'supportLesson':
            if (payment.source === 'monthly') {
              await rejectSupportLessonRegistration(payment.paymentId, reason || null);
            } else {
              if (!payment.paymentId) throw new Error('Missing paymentId');
              await rejectAnnualPayment(selectedBranchId, payment.paymentId, reason || null);
            }
            break;
          case 'annual':
          case 'yearly':
            await rejectAnnualPayment(selectedBranchId, payment.paymentId, reason || null);
            break;
          default:
            throw new Error('Unknown payment type: ' + payment.type);
        }
        showToast('info', 'تم رفض الدفعة');
        bumpCounter('rejected');

        apiCall('/api/notify/payment-event', {
          method: 'POST',
          body: JSON.stringify({
            type: payment.type, approved: false,
            studentId: payment.userId, studentName: payment.userName || '',
            studentEmail: payment.userEmail || '',
            courseName: payment.data?.trainingTitle || payment.data?.languageName || payment.type || '',
            branchId: selectedBranchId, paymentId: payment.id,
          }),
        }).catch(() => {});
      }

      // Receipt cleanup for backend-driven types (annual fee + support lessons).
      // Language & training receipts are cleaned inside their service functions,
      // so we only handle these two here to avoid duplicate work. Both approval
      // (spec §5) and rejection (spec §4) leave zero long-term storage. Runs
      // after the DB write succeeded; best-effort and never throws.
      if (payment.type === 'annual' || payment.type === 'yearly' || payment.type === 'supportLesson') {
        await cleanupPaymentReceipt(payment.paymentProof);
      }

      // Item leaves the active queue; invalidate processed cache so it reloads fresh.
      setPayments((prev) => prev.filter((e) => e.id !== payment.id));
      setProcessed({ approved: null, rejected: null });
      setDrawerPayment((cur) => (cur && cur.id === payment.id ? null : cur));
    } catch (err) {
      console.error('Error verifying payment:', err);
      showToast('error', 'حدث خطأ أثناء معالجة الطلب: ' + err.message);
    } finally {
      setProcessing((prev) => ({ ...prev, [payment.id]: false }));
    }
  };

  // ── Request correction (NEW — separate status, never a rejection) ────────────
  const processCorrection = async (payment, reason) => {
    setProcessing((prev) => ({ ...prev, [payment.id]: 'correcting' }));
    try {
      await requestPaymentCorrection({
        branchId: selectedBranchId,
        type: payment.type,
        source: payment.source || null,
        studentId: payment.studentId || payment.userId || null,
        formId: payment.formId || null,
        entryId: payment.entryId || null,
        registrationId: payment.source === 'monthly' ? payment.paymentId : null,
        paymentId: (payment.type === 'annual' || payment.source === 'annualFee') ? payment.paymentId : null,
        reason,
      });

      showToast('success', 'تم إرسال طلب التصحيح للطالب');

      // Move item to needs_correction in place (the backend already created the notification).
      const patchItem = (e) => (e && e.id === payment.id ? {
        ...e,
        status: 'needs_correction',
        data: {
          ...e.data,
          correctionReason: reason,
          correctionCount: (e.data?.correctionCount || 0) + 1,
          correctionRequestedAt: new Date(),
        },
      } : e);
      setPayments((prev) => prev.map(patchItem));
      setDrawerPayment((cur) => patchItem(cur));
    } catch (err) {
      console.error('Error requesting correction:', err);
      showToast('error', 'تعذر إرسال طلب التصحيح: ' + err.message);
    } finally {
      setProcessing((prev) => ({ ...prev, [payment.id]: false }));
    }
  };

  const bumpCounter = (key) => {
    setCounters((prev) => {
      const next = { ...prev, [key]: (prev[key] || 0) + 1 };
      saveCounters(selectedBranchId, next);
      return next;
    });
  };

  // ── Action handlers ─────────────────────────────────────────────────────────
  const handleApprove = (payment) => setApproveTarget(payment);
  const handleReject = (payment) => setRejectTarget(payment);
  const handleCorrect = (payment) => setCorrectTarget(payment);

  const confirmApprove = () => { const p = approveTarget; setApproveTarget(null); processVerification(p, true, ''); };
  const confirmReject = (reason) => { const p = rejectTarget; setRejectTarget(null); processVerification(p, false, reason); };
  const confirmCorrect = (reason) => { const p = correctTarget; setCorrectTarget(null); processCorrection(p, reason); };

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (!selectedBranchId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" dir="rtl">
        <AlertCircle className="w-12 h-12 text-warning-500 mb-4" />
        <p className="text-gray-600">يرجى اختيار الفرع أولاً</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24" dir="rtl">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
        <p className="text-gray-600">جاري تحميل المدفوعات...</p>
      </div>
    );
  }

  const busyFor = (p) => processing[p?.id];
  const isProcessedView = statusFilter === 'approved' || statusFilter === 'rejected';
  const showProcessedSpinner = isProcessedView && processed[statusFilter] == null;

  return (
    <motion.div className="space-y-5 pb-4" dir="rtl" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

      {/* Overlays */}
      {viewerUrl && (
        <PaymentProofViewer
          url={viewerUrl}
          studentName={drawerPayment?.userName}
          onClose={() => setViewerUrl(null)}
        />
      )}
      <ReviewModal
        payment={drawerPayment}
        busy={busyFor(drawerPayment)}
        onClose={() => setDrawerPayment(null)}
        onViewImage={setViewerUrl}
        onApprove={handleApprove}
        onReject={handleReject}
        onCorrect={handleCorrect}
      />
      <ApproveDialog
        payment={approveTarget}
        loading={busyFor(approveTarget) === 'approving'}
        onConfirm={confirmApprove}
        onCancel={() => setApproveTarget(null)}
      />
      <RejectDialog
        payment={rejectTarget}
        loading={busyFor(rejectTarget) === 'rejecting'}
        onConfirm={confirmReject}
        onCancel={() => setRejectTarget(null)}
      />
      <RequestCorrectionDialog
        payment={correctTarget}
        loading={busyFor(correctTarget) === 'correcting'}
        onConfirm={confirmCorrect}
        onCancel={() => setCorrectTarget(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التحقق من المدفوعات</h1>
          <p className="text-sm text-gray-500 mt-0.5">راجع الإيصال ثم اقبل أو ارفض أو اطلب تصحيحاً — كل ما تحتاجه في مكان واحد</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-medium text-gray-700 transition-colors disabled:opacity-50 flex-shrink-0"
          aria-label="تحديث"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">تحديث</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-danger-50 border border-danger-200 text-danger-700 rounded-xl p-4 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Priority dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Inbox}        tone="gray"   label="مدفوعات معلقة"        value={stats.pending} />
        <StatCard icon={Edit3}        tone="amber"  label="تحتاج تصحيح"          value={stats.needsCorrection} />
        <StatCard icon={Wallet}       tone="blue"   label="إجمالي المبلغ المعلق" value={formatMoney(stats.totalAmount) || '0 دج'} />
        <StatCard icon={CheckCircle2} tone="green"  label="قُبلت اليوم"          value={counters.approved} />
        <StatCard icon={XCircle}      tone="red"    label="رُفضت اليوم"          value={counters.rejected} />
      </div>

      {/* Status filter (Phase 4) */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUSES.map((s) => {
          const count = statusCounts[s.value];
          const active = statusFilter === s.value;
          return (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${
                active
                  ? (s.value === 'needs_correction' ? 'bg-warning-500 text-white border-warning-500' : 'bg-primary text-white border-primary')
                  : (s.value === 'needs_correction' ? 'bg-warning-50 text-warning-700 border-warning-200 hover:border-warning-300' : 'bg-white text-gray-700 border-gray-200 hover:border-primary/40')
              }`}
            >
              {s.label}
              {count != null && (
                <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar: search + time filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الهاتف أو البريد..."
            className="w-full ps-10 pe-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-1.5 bg-white border border-gray-200 rounded-xl p-1 overflow-x-auto">
          {TIME_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setTimeFilter(r.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                timeFilter === r.value ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Type filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setTypeFilter(t.value)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${
              typeFilter === t.value
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-700 border-gray-200 hover:border-primary/40'
            }`}
          >
            {t.label}
            <span className={`text-xs px-1.5 rounded-full ${typeFilter === t.value ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
              {typeCounts[t.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {showProcessedSpinner ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-3" />
          <p className="text-sm text-gray-500">جاري تحميل السجل...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-14 text-center">
          <CreditCard className="w-14 h-14 text-success-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {baseList.length === 0 ? 'لا توجد مدفوعات' : 'لا توجد نتائج مطابقة'}
          </h3>
          <p className="text-sm text-gray-500">
            {baseList.length === 0 ? 'لا توجد عناصر في هذه الحالة' : 'جرّب تعديل الفلاتر أو البحث'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtered.map((payment) => (
            <PaymentCard
              key={`${payment.type}-${payment.id}`}
              payment={payment}
              busy={busyFor(payment)}
              onOpen={setDrawerPayment}
              onViewImage={setViewerUrl}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default PaymentsVerification;
