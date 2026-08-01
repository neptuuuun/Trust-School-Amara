/**
 * supportClassification.js  (client)
 * ----------------------------------
 * Client mirror of backend/services/supportEligibility.js. The classification
 * math and the eligibility rules MUST stay byte-for-byte in lockstep with the
 * backend — the backend is the real (unbypassable) guarantee, this copy drives
 * the UI (filtering group lists, disabling cards, showing badges).
 *
 * «معدل المواد المميزة» (distinguished-subjects average, /20):
 *     average >= 11  -> 'normal'         (🟢 عادي)
 *     average <  11  -> 'support_level'  (🔴 مستوى دعم)
 *
 * Support GROUPS carry a groupType:
 *     'normal_support'     (🟢 مجموعة عادية)
 *     'low_level_support'  (🟠 مجموعة دعم خاصة)
 *
 * Routing is decided PER SUBJECT (+ study year).
 */

import { Circle } from 'lucide-react';

export const AVERAGE_MIN = 0;
export const AVERAGE_MAX = 20;
export const SUPPORT_THRESHOLD = 11; // average < 11 ⇒ support level

export const GROUP_TYPES = ['normal_support', 'low_level_support'];
export const DEFAULT_GROUP_TYPE = 'normal_support';

export const REASONS = {
  AVERAGE_REQUIRED: 'average-required',
  NORMAL_CANNOT_JOIN_LOW: 'normal-cannot-join-low-level',
  SUPPORT_MUST_JOIN_LOW: 'support-must-join-low-level',
};

// Respectful Arabic messages per deny reason (never «ضعيف/سيء»).
export const REASON_MESSAGES = {
  [REASONS.AVERAGE_REQUIRED]: 'يرجى إدخال معدل المواد المميزة للمتابعة.',
  [REASONS.NORMAL_CANNOT_JOIN_LOW]: 'هذه المجموعة مخصصة لمستوى دراسي مختلف. يرجى اختيار مجموعة عادية.',
  [REASONS.SUPPORT_MUST_JOIN_LOW]: 'تم توجيهك إلى مجموعة دعم مناسبة لمستواك الدراسي لضمان أفضل متابعة وتحسين النتائج.',
};

// ── Average parsing / validation ───────────────────────────────────────────────

/**
 * Normalize a raw decimal string the way real (esp. mobile / Arabic-keyboard)
 * users type it into a plain text field, WITHOUT changing the stored format —
 * the result is still parsed to a plain Number afterwards.
 *   - Arabic-Indic (٠-٩) and Persian (۰-۹) digits  → Latin 0-9
 *   - comma (,) and Arabic decimal separator (٫)    → dot (.)  ← the mobile fix
 *   - Arabic thousands separator (٬) and whitespace → removed
 * Keep byte-for-byte in lockstep with backend/services/supportEligibility.js.
 */
export const normalizeDecimalInput = (raw) =>
  String(raw)
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[٫,]/g, '.')
    .replace(/[٬\s]/g, '');

/**
 * Validate a raw average input (string or number).
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
export const validateAverage = (raw) => {
  if (raw === '' || raw == null) {
    return { valid: false, value: null, error: 'يرجى إدخال معدل المواد المميزة.' };
  }
  const n = typeof raw === 'number' ? raw : Number(normalizeDecimalInput(raw));
  if (!Number.isFinite(n)) {
    return { valid: false, value: null, error: 'المعدل يجب أن يكون رقماً صحيحاً.' };
  }
  if (n < AVERAGE_MIN || n > AVERAGE_MAX) {
    return { valid: false, value: null, error: `المعدل يجب أن يكون بين ${AVERAGE_MIN} و ${AVERAGE_MAX}.` };
  }
  return { valid: true, value: Math.round(n * 100) / 100, error: null };
};

/**
 * Classify a numeric average. Returns null when there is no usable average.
 * @returns {'normal'|'support_level'|null}
 */
export const classify = (average) => {
  if (average == null || !Number.isFinite(Number(average))) return null;
  return Number(average) >= SUPPORT_THRESHOLD ? 'normal' : 'support_level';
};

// ── Group-type helpers ──────────────────────────────────────────────────────────

export const normalizeGroupType = (gt) => (GROUP_TYPES.includes(gt) ? gt : DEFAULT_GROUP_TYPE);

const isActiveClass = (c) => String((c && c.status) || 'active').toLowerCase() !== 'inactive';

/** Is there an ACTIVE low_level_support group in the target's subject + year? */
export const hasLowLevelSibling = (targetClass = {}, subjectClasses = []) => {
  const subjectId = targetClass.subjectId || null;
  const studyYear = targetClass.studyYear || targetClass.year || null;
  return (Array.isArray(subjectClasses) ? subjectClasses : []).some((c) => {
    if (!c || c.id === targetClass.id) return false;
    if (subjectId && c.subjectId !== subjectId) return false;
    if (studyYear && (c.studyYear || c.year || null) !== studyYear) return false;
    if (normalizeGroupType(c.groupType) !== 'low_level_support') return false;
    return isActiveClass(c);
  });
};

// ── Eligibility (RULE A / RULE B) ────────────────────────────────────────────────

/**
 * @returns {{ allowed: boolean, reason: string|null, message: string|null }}
 */
export const evaluateEligibility = ({ classification, targetClass = {}, subjectClasses = [] } = {}) => {
  if (classification == null) {
    return { allowed: false, reason: REASONS.AVERAGE_REQUIRED, message: REASON_MESSAGES[REASONS.AVERAGE_REQUIRED] };
  }

  const targetType = normalizeGroupType(targetClass.groupType);

  if (targetType === 'low_level_support' && classification === 'normal') {
    return { allowed: false, reason: REASONS.NORMAL_CANNOT_JOIN_LOW, message: REASON_MESSAGES[REASONS.NORMAL_CANNOT_JOIN_LOW] };
  }

  if (targetType === 'normal_support' && classification === 'support_level' && hasLowLevelSibling(targetClass, subjectClasses)) {
    return { allowed: false, reason: REASONS.SUPPORT_MUST_JOIN_LOW, message: REASON_MESSAGES[REASONS.SUPPORT_MUST_JOIN_LOW] };
  }

  return { allowed: true, reason: null, message: null };
};

/**
 * Filter a subject's classes down to the ones a student of `classification` may
 * see, applying RULE B (hide normal groups when a low-level one exists) and
 * RULE A (hide low-level groups from normal students). When classification is
 * null (no average yet) the full list is returned — the caller is expected to
 * collect the average first.
 */
export const visibleClassesFor = (classification, subjectClasses = []) => {
  const list = Array.isArray(subjectClasses) ? subjectClasses : [];
  if (classification == null) return list;
  return list.filter((c) => evaluateEligibility({ classification, targetClass: c, subjectClasses: list }).allowed);
};

// ── UI helpers (badges) ───────────────────────────────────────────────────────

// Badges carry a lucide Icon (a colored status dot) instead of an emoji, so the
// support UI uses the same icon system (lucide-react) as the rest of the app.
// Render as:
//   <badge.Icon className={`h-2.5 w-2.5 ${badge.iconClass}`} fill="currentColor" aria-hidden="true" />
/** Classification badge descriptor for {classification}. */
export const classificationBadge = (classification) => {
  if (classification === 'support_level') {
    return { key: 'support_level', label: 'مستوى دعم', Icon: Circle, iconClass: 'text-danger-600', classes: 'bg-danger-50 text-danger-700 border border-danger-200' };
  }
  if (classification === 'normal') {
    return { key: 'normal', label: 'عادي', Icon: Circle, iconClass: 'text-success-600', classes: 'bg-success-50 text-success-700 border border-success-200' };
  }
  return { key: 'unclassified', label: 'غير محدد', Icon: Circle, iconClass: 'text-gray-400', classes: 'bg-gray-100 text-gray-600 border border-gray-200' };
};

/** Group-type badge descriptor for a support class's groupType. */
export const groupTypeBadge = (groupType) => {
  if (normalizeGroupType(groupType) === 'low_level_support') {
    return { key: 'low_level_support', label: 'مجموعة دعم خاصة', Icon: Circle, iconClass: 'text-orange-500', classes: 'bg-orange-50 text-orange-700 border border-orange-200' };
  }
  return { key: 'normal_support', label: 'مجموعة عادية', Icon: Circle, iconClass: 'text-success-600', classes: 'bg-success-50 text-success-700 border border-success-200' };
};

export const GROUP_TYPE_OPTIONS = [
  { value: 'normal_support', label: 'مجموعة عادية', hint: 'للطلاب ذوي المستوى العادي' },
  { value: 'low_level_support', label: 'مجموعة دعم للمستوى الضعيف', hint: 'مخصصة للطلاب الذين يحتاجون متابعة إضافية' },
];

/** Read a student's classification from their profile (recomputed from average). */
export const classificationFromProfile = (profile = {}) => {
  if (!profile) return null;
  const avg = profile.distinguishedSubjectsAverage;
  if (avg != null && Number.isFinite(Number(avg))) return classify(Number(avg));
  // Fall back to a stored classification if present (e.g. legacy/migrated).
  return profile.supportClassification || null;
};
