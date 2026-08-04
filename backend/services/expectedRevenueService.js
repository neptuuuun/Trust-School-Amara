/**
 * expectedRevenueService.js
 * -------------------------
 * The single place that computes EXPECTED support revenue for the owner/admin
 * dashboards. It derives the figure from the ACTUAL payable amount stored on
 * each active subscription (`registrationPayable`, prorated at registration) —
 * never from `enrollmentCount × monthlyPrice`.
 *
 * WHY THIS EXISTS
 * Support lessons are billed on a prorated calendar-month cycle (see
 * sessionService.js): a student who joins mid-cycle owes only the sessions that
 * have not yet started. Reporting expected revenue as `students × full price`
 * therefore overstates what is owed and paints fully-paid late joiners as a
 * collection deficit. Expected revenue for a group must equal the SUM of each
 * student's payable amount, so it is built here from the registration documents
 * and compared against the support ledger (which records the same prorated
 * amounts) — the two halves of `expected vs actual` now share one basis.
 *
 * "Active subscription" is the exact rule used by loadLiveClassEnrollment,
 * loadSupportSnapshot and the capacity gate, plus the RESERVED exclusion:
 *   • status === 'verified'      (a real, paid subscription)
 *   • reserved !== true          (Group Start Month reached → billing has begun)
 *   • no endDate, or endDate > now (not lapsed)
 * A reserved seat holds a place but generates no expected revenue until it
 * activates, so it must not inflate the target.
 *
 * The pure aggregation (aggregateExpectedSupport) is separated from the Firestore
 * read (loadExpectedSupportRevenue) so the money math is unit-testable without
 * credentials. `registrationPayable` is imported eagerly (sessionService's own
 * Firestore use is lazy, so importing it is credential-free); `db` is required
 * lazily inside the loader for the same reason.
 */

const { registrationPayable } = require('./sessionService');

/** Coerce a Firestore Timestamp | Date | ISO string | ms to a Date, or null. */
function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') { try { return value.toDate(); } catch { return null; } }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Is this support registration a live, billable subscription right now?
 * @param {object} reg  a supportLessonRegistrations document's data
 * @param {Date}   now
 */
function isActiveSubscription(reg = {}, now = new Date()) {
  if (String(reg.status || '').toLowerCase() !== 'verified') return false;
  if (reg.reserved === true) return false;
  const end = toDate(reg.endDate);
  if (end && end <= now) return false;
  return true;
}

/**
 * Pure aggregation: given the raw support-registration docs for a branch, sum the
 * stored payable amount of every active subscription, overall and per class.
 *
 * @param   {Array<object>} regs  registration document data objects
 * @param   {Date}          [now]
 * @returns {{ total:number, students:number,
 *            byClass: Map<string, { expected:number, students:number }> }}
 */
function aggregateExpectedSupport(regs = [], now = new Date()) {
  const byClass = new Map();
  let total = 0;
  let students = 0;

  for (const r of regs) {
    if (!isActiveSubscription(r, now)) continue;

    const amount = registrationPayable(r);
    const classId = r.classId || r.lessonId || null;
    total += amount;
    students += 1;

    if (classId) {
      const slot = byClass.get(classId) || { expected: 0, students: 0 };
      slot.expected += amount;
      slot.students += 1;
      byClass.set(classId, slot);
    }
  }

  return { total, students, byClass };
}

/**
 * Expected support revenue for one branch, from stored payable amounts.
 *
 * One query over the branch's support registrations; the pure aggregator above
 * skips reserved / lapsed / unpaid rows. Returns the branch total plus a per-class
 * breakdown so callers that report by group (owner group analytics, collection-
 * shortfall alerts) share the identical numbers as the summary cards.
 *
 * @param   {string} branchId
 * @param   {Date}   [now]
 * @returns {Promise<{ total:number, students:number,
 *                     byClass: Map<string, { expected:number, students:number }> }>}
 */
async function loadExpectedSupportRevenue(branchId, now = new Date()) {
  const { db } = require('../config/firebase');
  const snap = await db.collection('supportLessonRegistrations')
    .where('branchId', '==', branchId)
    .get();
  return aggregateExpectedSupport(snap.docs.map((d) => d.data() || {}), now);
}

module.exports = {
  isActiveSubscription,
  aggregateExpectedSupport,
  loadExpectedSupportRevenue,
};
