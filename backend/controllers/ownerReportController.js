/**
 * ownerReportController.js
 * ------------------------
 * Owner-only access to the automated weekly executive report.
 *
 * GET /api/owner/weekly-report      → the latest stored report (generated on
 *                                     demand the first time, before the cron has
 *                                     ever run), plus a short history list.
 *                                     ?refresh=1 forces a fresh recompute.
 * POST /api/owner/weekly-report/generate → force a fresh recompute + persist.
 *
 * The heavy lifting lives in weeklyReportService.generateWeeklyReport, shared
 * with the weekly cron.
 */

const { db } = require('../config/firebase');
const { generateWeeklyReport } = require('../services/weeklyReportService');

async function loadHistory() {
  try {
    const snap = await db.collection('ownerReports').orderBy('weekStart', 'desc').limit(8).get();
    return snap.docs.map((d) => {
      const r = d.data() || {};
      return {
        id: r.id,
        weekStart: r.weekStart,
        weekEnd: r.weekEnd,
        revenue: r.totals?.revenue ?? 0,
        newStudents: r.totals?.newStudents ?? 0,
        paymentsReceived: r.totals?.paymentsReceived ?? 0,
      };
    });
  } catch {
    return [];
  }
}

const getWeeklyReport = async (req, res, next) => {
  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    let report;

    if (refresh) {
      report = await generateWeeklyReport({ persist: true });
    } else {
      let latest = null;
      try {
        const snap = await db.collection('ownerReports').orderBy('weekStart', 'desc').limit(1).get();
        if (!snap.empty) latest = snap.docs[0].data();
      } catch { /* generate below */ }
      report = latest || (await generateWeeklyReport({ persist: true }));
    }

    return res.json({ report, history: await loadHistory() });
  } catch (err) {
    next(err);
  }
};

const generateNow = async (_req, res, next) => {
  try {
    const report = await generateWeeklyReport({ persist: true });
    return res.json({ report, history: await loadHistory() });
  } catch (err) {
    next(err);
  }
};

module.exports = { getWeeklyReport, generateNow };
