/**
 * sessionService.js
 * -----------------
 * Support-lesson prorated billing, computed ENTIRELY from the class's recurring
 * schedule. There is NO manual session tracking and NO materialised sessions
 * collection — everything is derived on demand from `class.schedules`.
 *
 * A "support class" (branches/{b}/classes/{classId}, serviceType:'support') is
 * sold as a MONTHLY package. The billing cycle is the CALENDAR month and resets
 * on the 1st. The price of a single session is the monthly price divided by the
 * number of scheduled occurrences in that month, and a student joining mid-cycle
 * pays only for the occurrences that have not yet started:
 *
 *     occurrences = generateOccurrences(schedules, monthOf(now))
 *     total       = occurrences.length
 *     elapsed     = occurrences whose start datetime is before `now`
 *     remaining   = total - elapsed
 *     perSession  = monthlyPrice / total
 *     amountDue   = round(remaining * perSession)
 *
 * Example — schedule { Friday 14:00, Saturday 14:00 }, June has 8 occurrences,
 * the student joins after 6 have passed ⇒ remaining 2 ⇒ (monthlyPrice / 8) * 2.
 *
 * The schedule is the single source of truth: the admin never marks a session
 * complete for billing. If a class has no schedule the month cannot be prorated,
 * so the full monthly price is charged.
 */

const { db } = require('../config/firebase');

// Arabic weekday label → JS Date.getDay() (Sun=0 … Sat=6). Mirrors
// src/utils/classValidation.js DAYS_OF_WEEK. Both Monday spellings accepted.
const DAY_LABEL_TO_INDEX = {
  'الأحد': 0,
  'الاثنين': 1,
  'الإثنين': 1,
  'الثلاثاء': 2,
  'الأربعاء': 3,
  'الخميس': 4,
  'الجمعة': 5,
  'السبت': 6,
};

// ── Calendar helpers ──────────────────────────────────────────────────────────
// All boundaries are built at local server time. The deployment clock is assumed
// to track Africa/Algiers (UTC+1, no DST) — same assumption the cron schedule and
// registrationController already make.

function monthKeyOf(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** First day of the calendar month (00:00:00.000) for the cycle a date is in. */
function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/** End of the calendar month (last day, 23:59:59.999) for the cycle a date is in. */
function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** First day of the NEXT calendar month (00:00:00) — the next payment date. */
function firstDayOfNextMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

/**
 * Compute the support subscription window end for a cycle that starts at
 * `startDate`. Production: end of the current calendar month. Testing: when
 * SUPPORT_LESSON_EXPIRY_MINUTES is set, shrink the window for rapid QA.
 */
function computeCycleEnd(startDate = new Date()) {
  const testMinutes = parseInt(process.env.SUPPORT_LESSON_EXPIRY_MINUTES || '', 10);
  if (Number.isFinite(testMinutes) && testMinutes > 0) {
    return new Date(startDate.getTime() + testMinutes * 60 * 1000);
  }
  return endOfMonth(startDate);
}

// ── Occurrence generation (the recurrence engine) ──────────────────────────────

/**
 * Walk every day of the (year, month) and emit one occurrence per schedule row
 * whose weekday matches. Each occurrence is anchored at its scheduled start time
 * (falling back to noon when no/invalid start), so callers can compare it against
 * "now" to decide whether it has already started.
 *
 * @returns {Array<{ date: Date, dayLabel: string, start: string, end: string }>}
 *          sorted ascending by start datetime.
 */
function generateOccurrences(schedules, year, month) {
  const rows = Array.isArray(schedules) ? schedules : [];
  const out = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const jsDay = new Date(year, month, day, 12, 0, 0, 0).getDay();
    rows.forEach((row) => {
      const idx = DAY_LABEL_TO_INDEX[String(row?.day || '').trim()];
      if (idx !== jsDay) return;

      const start = String(row.start || '').trim();
      const m = start.match(/^(\d{1,2}):(\d{2})$/);
      const date = m
        ? new Date(year, month, day, Number(m[1]), Number(m[2]), 0, 0)
        : new Date(year, month, day, 12, 0, 0, 0); // noon anchor when start missing

      out.push({
        date,
        dayLabel: String(row.day || '').trim(),
        start,
        end: String(row.end || '').trim(),
      });
    });
  }

  out.sort((a, b) => a.date - b.date || a.start.localeCompare(b.start));
  return out;
}

// ── Proration ─────────────────────────────────────────────────────────────────

/**
 * Pure proration math, derived from the class's recurring schedule for the
 * calendar month that `now` falls in. No persisted state, no manual marking.
 *
 * @param {{ price?: number, schedules?: Array }} classData
 * @param {Date} now  the enrollment moment (defaults to the current time)
 */
function computeProration(classData = {}, now = new Date()) {
  const monthlyPrice = Number(classData.price) || 0;
  const occurrences = generateOccurrences(classData.schedules, now.getFullYear(), now.getMonth());
  const totalSessions = occurrences.length;

  // No schedule ⇒ nothing to prorate against ⇒ charge the full monthly price.
  if (totalSessions === 0) {
    return {
      monthlyPrice,
      totalSessions: 0,
      elapsedSessions: 0,
      remainingSessions: 0,
      pricePerSession: 0,
      amountDue: monthlyPrice,
    };
  }

  // "Elapsed" = scheduled occurrences whose start datetime is before enrollment.
  const elapsedSessions = occurrences.filter((o) => o.date.getTime() < now.getTime()).length;
  const remainingSessions = Math.max(0, totalSessions - elapsedSessions);
  const pricePerSession = monthlyPrice / totalSessions;
  const amountDue = Math.round(remainingSessions * pricePerSession);

  return {
    monthlyPrice,
    totalSessions,
    elapsedSessions,
    remainingSessions,
    pricePerSession: Math.round(pricePerSession),
    amountDue,
  };
}

/**
 * Authoritative proration for a class right now: loads the class (if not given)
 * and returns the full quote + cycle dates. Reads nothing but the class document.
 */
async function getProrationQuote(branchId, classId, classData, now = new Date()) {
  let cls = classData;
  if (!cls) {
    const snap = await db.collection('branches').doc(branchId)
      .collection('classes').doc(classId).get();
    cls = snap.exists ? snap.data() : {};
  }
  const quote = computeProration(cls, now);
  return {
    ...quote,
    monthKey: monthKeyOf(now),
    cycleEnd: computeCycleEnd(now),
    nextPaymentDate: firstDayOfNextMonth(now),
  };
}

module.exports = {
  monthKeyOf,
  startOfMonth,
  endOfMonth,
  firstDayOfNextMonth,
  computeCycleEnd,
  generateOccurrences,
  computeProration,
  getProrationQuote,
};
