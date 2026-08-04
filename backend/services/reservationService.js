/**
 * reservationService.js
 * ---------------------
 * Group Start Month → reservation lifecycle for SUPPORT subscriptions.
 *
 * A support class (branches/{b}/classes/{classId}, serviceType:'support') now
 * carries a `startMonth` ('YYYY-MM') — the month the group officially begins.
 * A student who enrolls BEFORE that month is only holding a RESERVATION: the
 * seat is theirs, but the subscription (billing, activity, renewal) does not
 * begin until the 1st of the start month.
 *
 * This module is the single SOURCE OF TRUTH for:
 *   • resolveSubscriptionWindow — where a new/verified registration's billing
 *     window starts (the Start Month, never the registration date),
 *   • subscriptionPhase — reserved | active | expired for any registration,
 *     derived from DATES so it can never drift from a stale cached flag,
 *   • activateDueReservations — the idempotent sweep that flips reserved
 *     registrations to active on/after the 1st of their start month.
 *
 * Mirrors the client helpers in src/utils/registrationUtils.js — keep the two
 * in lockstep. Calendar math is delegated to sessionService so the cycle
 * definition (calendar month, resets on the 1st) lives in exactly one place.
 */

// sessionService is import-safe without Admin SDK credentials (its only
// Firestore reader lazy-requires firebase). firebase + notificationService are
// required lazily inside activateDueReservations so the pure helpers below —
// and their unit tests — never need credentials.
const {
  monthKeyOf, endOfMonth, firstDayOfNextMonth, computeCycleEnd,
} = require('./sessionService');

/** A group Start Month / cycle key is always 'YYYY-MM'. */
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

/** Coerce a Firestore Timestamp / Date / ms / ISO string to a JS Date (or null). */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') { try { return value.toDate(); } catch { return null; } }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM' for the calendar month a date falls in. */
function currentMonthKey(now = new Date()) {
  return monthKeyOf(now);
}

/** Normalize a raw startMonth value to a valid 'YYYY-MM' string, or null. */
function normalizeMonthKey(value) {
  const s = String(value || '').trim();
  return MONTH_KEY_RE.test(s) ? s : null;
}

/** First instant (00:00:00.000) of the month a 'YYYY-MM' key names, or null. */
function monthKeyToStartDate(monthKey) {
  const mk = normalizeMonthKey(monthKey);
  if (!mk) return null;
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0);
}

/** Last instant (23:59:59.999) of the month a 'YYYY-MM' key names, or null. */
function monthKeyToEndDate(monthKey) {
  const start = monthKeyToStartDate(monthKey);
  return start ? endOfMonth(start) : null;
}

/**
 * Resolve the billing/subscription window for a registration into `classData`
 * at moment `now`. The window is anchored to the group's Start Month:
 *
 *   • Start Month is a FUTURE month  → RESERVED. Window = the whole start month;
 *     the student joins at the 1st, so there is nothing to prorate (full price).
 *   • Start Month is this month, earlier, or unset (legacy) → NOT reserved.
 *     Window = the current calendar month starting `now` — today's behaviour.
 *
 * The caller owns pricing: when `reserved` is true it should charge the full
 * monthly price (no proration); otherwise it prorates against `now` as before.
 *
 * @returns {{ reserved:boolean, groupStartMonth:string, startDate:Date,
 *             endDate:Date, cycleMonthKey:string, nextPaymentDate:Date }}
 */
function resolveSubscriptionWindow(classData = {}, now = new Date()) {
  const startMonth = normalizeMonthKey(classData.startMonth);
  const nowKey = currentMonthKey(now);

  // Reserved only when the group's start month is strictly AFTER the current
  // month. Missing startMonth (legacy groups) → behaves as already started.
  const reserved = Boolean(startMonth) && startMonth > nowKey;

  if (reserved) {
    const startDate = monthKeyToStartDate(startMonth);
    return {
      reserved: true,
      groupStartMonth: startMonth,
      startDate,
      endDate: computeCycleEnd(startDate),
      cycleMonthKey: startMonth,
      nextPaymentDate: firstDayOfNextMonth(startDate),
    };
  }

  return {
    reserved: false,
    groupStartMonth: startMonth || nowKey,
    startDate: now,
    endDate: computeCycleEnd(now),
    cycleMonthKey: nowKey,
    nextPaymentDate: firstDayOfNextMonth(now),
  };
}

/**
 * The authoritative phase of a support registration, derived from its dates so
 * it can never drift from a stale cached `reserved` flag:
 *   'reserved' — verified but its window starts in the future (group not begun)
 *   'active'   — verified, window has begun and has not expired
 *   'expired'  — verified, window end has passed (renewal due)
 *   'inactive' — anything not verified (pending / rejected / none)
 */
function subscriptionPhase(reg = {}, now = new Date()) {
  const status = String(reg.status || '').toLowerCase();
  if (status !== 'verified') return 'inactive';

  const start = toDate(reg.startDate);
  if (start && start.getTime() > now.getTime()) return 'reserved';
  // Legacy flagged-reserved row with no start date → trust the flag.
  if (!start && reg.reserved === true) return 'reserved';

  const end = toDate(reg.endDate);
  if (end && end.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

const isReserved = (reg, now = new Date()) => subscriptionPhase(reg, now) === 'reserved';
const isActive   = (reg, now = new Date()) => subscriptionPhase(reg, now) === 'active';

/**
 * Idempotent sweep: flip every RESERVED registration whose start month has
 * arrived (groupStartMonth <= current month, or its anchored startDate is no
 * longer in the future) to active. The billing window was already anchored to
 * the start month at enrollment, so this only clears the `reserved` cache flag,
 * stamps `activatedAt`, recomputes the class counters, and notifies the student.
 * It NEVER re-bills — revenue was booked at payment time with period = start
 * month.
 *
 * `recompute` is injected (registrationController.recomputeSupportClassEnrollment)
 * to avoid a require() cycle between this module and the controller.
 *
 * @param {(branchId:string, classId:string)=>Promise} [recompute]
 * @param {Date} [now]
 * @returns {Promise<{ scanned:number, activated:number, errors:string[] }>}
 */
async function activateDueReservations(recompute, now = new Date()) {
  const { admin, db } = require('../config/firebase');
  const { createNotification } = require('./notificationService');
  const nowKey = currentMonthKey(now);
  const result = { scanned: 0, activated: 0, errors: [] };

  let snap;
  try {
    snap = await db.collection('supportLessonRegistrations').where('reserved', '==', true).get();
  } catch (e) {
    result.errors.push(`query: ${e.message}`);
    return result;
  }

  const touchedClasses = new Set();
  for (const doc of snap.docs) {
    result.scanned += 1;
    const reg = doc.data() || {};

    const startMonth = normalizeMonthKey(reg.groupStartMonth);
    const start = toDate(reg.startDate);
    // Due when the start month has arrived, or (defensively) the anchored
    // startDate is no longer in the future.
    const due = (startMonth && startMonth <= nowKey)
      || (start && start.getTime() <= now.getTime());
    if (!due) continue;

    try {
      await doc.ref.update({
        reserved: false,
        activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      result.activated += 1;

      const branchId = reg.branchId || null;
      const classId = reg.classId || reg.lessonId || null;
      if (branchId && classId) touchedClasses.add(`${branchId}::${classId}`);

      // Best-effort notification — a failure must not stop activation.
      if (reg.userId) {
        const month = startMonth || nowKey;
        createNotification(
          reg.userId,
          'بدأ اشتراكك',
          `${reg.subjectName || reg.lessonName || 'مجموعتك'} — أصبح اشتراكك نشطاً الآن (${month}).`,
          { branchId, registrationId: doc.id, event: 'reservation-activated' },
        ).catch(() => {});
      }
    } catch (e) {
      result.errors.push(`${doc.id}: ${e.message}`);
    }
  }

  // Recompute active/reserved counters once per affected class.
  if (typeof recompute === 'function') {
    for (const key of touchedClasses) {
      const [branchId, classId] = key.split('::');
      try {
        await recompute(branchId, classId);
      } catch (e) {
        result.errors.push(`recompute ${key}: ${e.message}`);
      }
    }
  }

  return result;
}

module.exports = {
  MONTH_KEY_RE,
  toDate,
  currentMonthKey,
  normalizeMonthKey,
  monthKeyToStartDate,
  monthKeyToEndDate,
  resolveSubscriptionWindow,
  subscriptionPhase,
  isReserved,
  isActive,
  activateDueReservations,
};
