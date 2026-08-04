// trainingRequests.js
// ────────────────────────────────────────────────────────────────────────────
// Single source of truth for the Training-INTEREST domain.
//
// This is an INTEREST / LEAD management feature, NOT a registration or approval
// system. A logged-in student says "I'd like this training if you offer it." The
// branch admin works it like a CRM lead to measure demand and follow up:
//
//     new → contacted → following_up → closed          (+ reopen)
//
// There is deliberately NO "enrolled" / "registered" / "accepted" state here —
// actual enrolment lives in a separate system (trainingsRegistered / Chargily).
// Nothing on this surface may imply the student joined a course.
//
// Both the student panel (src/components/trainings/TrainingRequestPanel) and the
// admin dashboard (src/admin/pages/TrainingRequestsPage) import from here so
// labels, colours and field accessors never drift apart.
//
// Data lives in  branches/{branchId}/registrations  with  type === 'training_request'.

import { formatDayMonth } from './dateUtils';

// ── Interest lifecycle ──────────────────────────────────────────────────────
export const STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  FOLLOWING_UP: 'following_up',
  CLOSED: 'closed',
};

// Pipeline order (open work first → resolved last).
export const STATUS_ORDER = {
  [STATUS.NEW]: 0,
  [STATUS.CONTACTED]: 1,
  [STATUS.FOLLOWING_UP]: 2,
  [STATUS.CLOSED]: 3,
};

// A status is "open" (still in the pipeline) unless it is closed.
export const OPEN_STATUSES = [STATUS.NEW, STATUS.CONTACTED, STATUS.FOLLOWING_UP];
export const isOpen = (raw) => OPEN_STATUSES.includes(normalizeStatus(raw));

// Arabic labels + badge palette (shared design tokens).
//   new          → warning (amber)   — awaiting first contact
//   contacted    → secondary (blue)  — reached once
//   following_up → accent (coral)    — warm lead, actively nurturing
//   closed       → gray              — resolved / not proceeding
export const STATUS_META = {
  [STATUS.NEW]:          { label: 'جديد',        badge: 'bg-warning-50 text-warning-700 border-warning-200',       dot: 'bg-warning-500' },
  [STATUS.CONTACTED]:    { label: 'تم التواصل',  badge: 'bg-secondary-50 text-secondary-700 border-secondary-200', dot: 'bg-secondary-500' },
  [STATUS.FOLLOWING_UP]: { label: 'قيد المتابعة', badge: 'bg-accent-50 text-accent-700 border-accent-200',          dot: 'bg-accent-500' },
  [STATUS.CLOSED]:       { label: 'مغلق',        badge: 'bg-gray-100 text-gray-500 border-gray-200',                dot: 'bg-gray-400' },
};

// Map ANY historical / mixed-language status onto the canonical set. Legacy data
// used 'جديد', empty strings, 'pending', 'reviewing', etc.; an earlier iteration
// briefly used 'enrolled' — none of those may resurface as an enrolment concept,
// so positive-terminal values collapse to 'closed' (the interest was resolved).
const STATUS_ALIASES = {
  '': STATUS.NEW,
  new: STATUS.NEW,
  'جديد': STATUS.NEW,
  pending: STATUS.NEW,
  submitted: STATUS.NEW,
  processing: STATUS.NEW,
  awaiting: STATUS.NEW,

  contacted: STATUS.CONTACTED,
  'تم التواصل': STATUS.CONTACTED,
  reviewing: STATUS.CONTACTED,
  reviewed: STATUS.CONTACTED,
  review: STATUS.CONTACTED,
  in_review: STATUS.CONTACTED,
  'قيد المراجعة': STATUS.CONTACTED,

  following_up: STATUS.FOLLOWING_UP,
  followup: STATUS.FOLLOWING_UP,
  follow_up: STATUS.FOLLOWING_UP,
  'قيد المتابعة': STATUS.FOLLOWING_UP,

  closed: STATUS.CLOSED,
  rejected: STATUS.CLOSED,
  declined: STATUS.CLOSED,
  cancelled: STATUS.CLOSED,
  'مغلق': STATUS.CLOSED,
  'مرفوض': STATUS.CLOSED,
  // Legacy positive-terminal values → resolved (never surfaced as "enrolled").
  enrolled: STATUS.CLOSED,
  registered: STATUS.CLOSED,
  completed: STATUS.CLOSED,
  accepted: STATUS.CLOSED,
  approved: STATUS.CLOSED,
  'مكتمل': STATUS.CLOSED,
  'مسجل': STATUS.CLOSED,
  'تم التسجيل': STATUS.CLOSED,
};

export function normalizeStatus(raw) {
  const key = raw == null ? '' : String(raw).trim().toLowerCase();
  return STATUS_ALIASES[key] || STATUS.NEW;
}

export const statusLabel = (raw) => STATUS_META[normalizeStatus(raw)].label;

// ── Optional structured fields the student may provide ───────────────────────
export const PREFERRED_TIME_OPTIONS = [
  { value: 'mornings', label: 'صباحاً' },
  { value: 'evenings', label: 'مساءً' },
  { value: 'weekends', label: 'عطلة نهاية الأسبوع' },
  { value: 'flexible', label: 'مرن / أي وقت' },
];

export const EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'مبتدئ' },
  { value: 'intermediate', label: 'متوسط' },
  { value: 'advanced', label: 'متقدم' },
];

export const CLOSE_REASONS = [
  'لا يوجد طلب كافٍ لفتح المجموعة',
  'الطالب لم يعد مهتماً',
  'طلب مكرر',
  'تعذّر التواصل مع الطالب',
  'سبب آخر',
];

const labelFrom = (options, value) => options.find((o) => o.value === value)?.label || '';
export const preferredTimeLabel = (value) => labelFrom(PREFERRED_TIME_OPTIONS, value);
export const experienceLabel = (value) => labelFrom(EXPERIENCE_OPTIONS, value);

// ── Field accessors (tolerate legacy shapes) ─────────────────────────────────
// The old form wrote `course`/`courseName` + top-level `name`/`email`/`phone`.
// The redesign writes `topic` + `student*`. Read both so mixed data renders.
export const getTopic = (r = {}) => (r.topic || r.course || r.courseName || '').trim();
export const getStudentName = (r = {}) => (r.studentName || r.name || '').trim();
export const getStudentEmail = (r = {}) => (r.studentEmail || r.email || '').trim();
export const getStudentPhone = (r = {}) => (r.studentPhone || r.phone || '').trim();

// ── Presentation helpers ─────────────────────────────────────────────────────
export const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] || '') + (parts[1][0] || '');
};

// Deterministic avatar tint from a name (same student → same colour).
const AVATAR_TINTS = [
  'bg-primary/10 text-primary',
  'bg-secondary-100 text-secondary-700',
  'bg-success-100 text-success-700',
  'bg-warning-100 text-warning-700',
  'bg-accent-100 text-accent-700',
];
export const avatarTint = (name) => {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
};

// Digits-only phone (for copy-to-clipboard).
export const phoneDigits = (phone) => String(phone || '').replace(/[^\d+]/g, '');

// tel: link — dial exactly what was stored.
export const telHref = (phone) => {
  const digits = phoneDigits(phone);
  return digits ? `tel:${digits}` : null;
};

// wa.me link — WhatsApp needs an international number with no '+'. Algerian
// locals ('0XXXXXXXXX') map to country code 213; already-international pass through.
export const waHref = (phone) => {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `213${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
};

// Coerce Firestore Timestamp / Date / ms / ISO → Date (or null).
export const toDate = (value) => {
  const d = value?.toDate ? value.toDate() : (value ? new Date(value) : null);
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

// Arabic relative time — "الآن" / "منذ ٣ ساعات" / falls back to a short date.
export const relativeTime = (value) => {
  const d = toDate(value);
  if (!d) return '—';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'منذ يوم';
  if (days < 7) return `منذ ${days} أيام`;
  return formatDayMonth(d);
};

// Age in whole days (used to flag stale, un-contacted leads).
export const ageInDays = (value) => {
  const d = toDate(value);
  if (!d) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

export const isSameDay = (value, ref = new Date()) => {
  const d = toDate(value);
  if (!d) return false;
  return d.getDate() === ref.getDate() && d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
};
