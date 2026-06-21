/**
 * sessionController.js
 * --------------------
 * HTTP surface for support-lesson prorated pricing. Billing is computed entirely
 * from the class's recurring schedule (see sessionService) — there is no session
 * tracking, so the only endpoint is the proration quote.
 */

const { getProrationQuote } = require('../services/sessionService');

/**
 * GET /api/support-sessions/quote?branchId=&classId=
 * Authoritative proration quote for joining a class right now (current cycle),
 * derived from the class schedule.
 */
const prorationQuote = async (req, res, next) => {
  try {
    const { branchId, classId } = req.query;
    if (!branchId) return res.status(400).json({ code: 'missing-branch', message: 'branchId is required.' });
    if (!classId)  return res.status(400).json({ code: 'missing-class',  message: 'classId is required.'  });
    const quote = await getProrationQuote(branchId, classId);
    return res.status(200).json(quote);
  } catch (err) {
    next(err);
  }
};

module.exports = { prorationQuote };
