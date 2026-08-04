/**
 * sessionController.js
 * --------------------
 * HTTP surface for support-lesson prorated pricing. Billing is computed entirely
 * from the class's recurring schedule (see sessionService) — there is no session
 * tracking, so the only endpoint is the proration quote.
 */

const { db } = require('../config/firebase');
const { getProrationQuote } = require('../services/sessionService');
const { resolveSubscriptionWindow } = require('../services/reservationService');

/**
 * GET /api/support-sessions/quote?branchId=&classId=
 * Authoritative proration quote for joining a class, derived from the class
 * schedule. RESERVATION-AWARE: when the group's Start Month is a future month
 * the student joins at the 1st, so the quote is the FULL start-month price
 * (nothing prorated). Otherwise it prorates the current calendar cycle.
 */
const prorationQuote = async (req, res, next) => {
  try {
    const { branchId, classId } = req.query;
    if (!branchId) return res.status(400).json({ code: 'missing-branch', message: 'branchId is required.' });
    if (!classId)  return res.status(400).json({ code: 'missing-class',  message: 'classId is required.'  });

    const snap = await db.collection('branches').doc(branchId).collection('classes').doc(classId).get();
    const classData = snap.exists ? (snap.data() || {}) : {};
    const win = resolveSubscriptionWindow(classData, new Date());
    // Anchor the quote to the start month when reserved (elapsed 0 → full price).
    const quote = await getProrationQuote(branchId, classId, classData, win.reserved ? win.startDate : new Date());
    return res.status(200).json({ ...quote, reserved: win.reserved, groupStartMonth: win.groupStartMonth });
  } catch (err) {
    next(err);
  }
};

module.exports = { prorationQuote };
