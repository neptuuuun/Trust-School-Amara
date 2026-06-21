/**
 * supportEligibility.js  (backend / Admin SDK)
 * --------------------------------------------
 * Server-side mirror of src/utils/supportClassification.js. The classification
 * math and the eligibility rules are IDENTICAL by design — this is the
 * unbypassable enforcement point for every support enrollment that flows through
 * the Express backend (student self-enroll, admin manual-create, verify, edit).
 *
 * A student's «معدل المواد المميزة» (distinguished-subjects average, /20) decides
 * their classification:
 *     average >= 11  -> 'normal'         (🟢 عادي)
 *     average <  11  -> 'support_level'  (🔴 مستوى دعم)
 *
 * Support GROUPS (branches/{b}/classes, serviceType:'support') carry a groupType:
 *     'normal_support'     (🟢 مجموعة عادية)
 *     'low_level_support'  (🟠 مجموعة دعم خاصة)
 *
 * Routing is decided PER SUBJECT (+ study year): "a low-level group exists" is
 * evaluated only among the target class's siblings in the same subject + year.
 */

const AVERAGE_MIN = 0;
const AVERAGE_MAX = 20;
const SUPPORT_THRESHOLD = 11; // average < 11 ⇒ support level

const GROUP_TYPES = ['normal_support', 'low_level_support'];
const DEFAULT_GROUP_TYPE = 'normal_support';

const CLASSIFICATIONS = ['normal', 'support_level'];

// Deny reasons returned by evaluateEligibility (kept identical client/backend).
const REASONS = {
  AVERAGE_REQUIRED: 'average-required',
  NORMAL_CANNOT_JOIN_LOW: 'normal-cannot-join-low-level',
  SUPPORT_MUST_JOIN_LOW: 'support-must-join-low-level',
};

// Arabic, respectful messages for each deny reason (never «ضعيف/سيء»).
const REASON_MESSAGES = {
  [REASONS.AVERAGE_REQUIRED]: 'يرجى إدخال معدل المواد المميزة للمتابعة.',
  [REASONS.NORMAL_CANNOT_JOIN_LOW]: 'هذه المجموعة مخصصة لمستوى دراسي مختلف. يرجى اختيار مجموعة عادية.',
  [REASONS.SUPPORT_MUST_JOIN_LOW]: 'تم توجيهك إلى مجموعة دعم مناسبة لمستواك الدراسي لضمان أفضل متابعة وتحسين النتائج.',
};

// ── Average parsing / validation ───────────────────────────────────────────────

/**
 * Validate a raw average input (string or number).
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
function validateAverage(raw) {
  if (raw === '' || raw == null) {
    return { valid: false, value: null, error: 'يرجى إدخال معدل المواد المميزة.' };
  }
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n)) {
    return { valid: false, value: null, error: 'المعدل يجب أن يكون رقماً صحيحاً.' };
  }
  if (n < AVERAGE_MIN || n > AVERAGE_MAX) {
    return { valid: false, value: null, error: `المعدل يجب أن يكون بين ${AVERAGE_MIN} و ${AVERAGE_MAX}.` };
  }
  // Round to 2 decimals to avoid float noise (e.g. 9.800000001).
  return { valid: true, value: Math.round(n * 100) / 100, error: null };
}

/**
 * Classify a numeric average. Returns null when there is no usable average
 * (so callers can treat "unclassified" distinctly from a real classification).
 * @param {number|null|undefined} average
 * @returns {'normal'|'support_level'|null}
 */
function classify(average) {
  if (average == null || !Number.isFinite(Number(average))) return null;
  return Number(average) >= SUPPORT_THRESHOLD ? 'normal' : 'support_level';
}

// ── Group-type helpers ──────────────────────────────────────────────────────────

const normalizeGroupType = (gt) => (GROUP_TYPES.includes(gt) ? gt : DEFAULT_GROUP_TYPE);

const isActiveClass = (c) => String((c && c.status) || 'active').toLowerCase() !== 'inactive';

/**
 * Among `subjectClasses`, is there at least one ACTIVE low_level_support group in
 * the same subject + study year as `targetClass` (excluding the target itself)?
 */
function hasLowLevelSibling(targetClass = {}, subjectClasses = []) {
  const subjectId = targetClass.subjectId || null;
  const studyYear = targetClass.studyYear || targetClass.year || null;
  return (Array.isArray(subjectClasses) ? subjectClasses : []).some((c) => {
    if (!c || c.id === targetClass.id) return false;
    if (subjectId && c.subjectId !== subjectId) return false;
    if (studyYear && (c.studyYear || c.year || null) !== studyYear) return false;
    if (normalizeGroupType(c.groupType) !== 'low_level_support') return false;
    return isActiveClass(c);
  });
}

// ── Eligibility (RULE A / RULE B) ────────────────────────────────────────────────

/**
 * Decide whether a student of `classification` may enroll into `targetClass`,
 * given the target's sibling classes in the same subject (`subjectClasses`).
 *
 *  RULE A — a NORMAL student may never join a low_level_support group.
 *  RULE B — a SUPPORT_LEVEL student must join a low_level_support group WHEN one
 *           exists for that subject+year; if none exists, a normal group is fine.
 *
 * @returns {{ allowed: boolean, reason: string|null, message: string|null }}
 */
function evaluateEligibility({ classification, targetClass = {}, subjectClasses = [] } = {}) {
  if (classification == null) {
    return { allowed: false, reason: REASONS.AVERAGE_REQUIRED, message: REASON_MESSAGES[REASONS.AVERAGE_REQUIRED] };
  }

  const targetType = normalizeGroupType(targetClass.groupType);

  // RULE A
  if (targetType === 'low_level_support' && classification === 'normal') {
    return { allowed: false, reason: REASONS.NORMAL_CANNOT_JOIN_LOW, message: REASON_MESSAGES[REASONS.NORMAL_CANNOT_JOIN_LOW] };
  }

  // RULE B
  if (targetType === 'normal_support' && classification === 'support_level' && hasLowLevelSibling(targetClass, subjectClasses)) {
    return { allowed: false, reason: REASONS.SUPPORT_MUST_JOIN_LOW, message: REASON_MESSAGES[REASONS.SUPPORT_MUST_JOIN_LOW] };
  }

  return { allowed: true, reason: null, message: null };
}

module.exports = {
  AVERAGE_MIN,
  AVERAGE_MAX,
  SUPPORT_THRESHOLD,
  GROUP_TYPES,
  DEFAULT_GROUP_TYPE,
  CLASSIFICATIONS,
  REASONS,
  REASON_MESSAGES,
  validateAverage,
  classify,
  normalizeGroupType,
  hasLowLevelSibling,
  evaluateEligibility,
};
