/**
 * Shared helpers for owner analytics (Phase 2: groups, retention, lifecycle).
 *
 * All revenue reads go through a single windowed ledger fetch keyed on `paidAt`
 * (a single-field range → auto-indexed, no composite index needed). Callers group
 * the returned entries in memory by month / class / student. This keeps reads
 * cheap (one query per window) and avoids per-(serviceType,period) index gaps.
 */

const { admin, db } = require('../config/firebase');
const ledger = require('./ledgerService');

const Timestamp = admin.firestore.Timestamp;

const BRANCHES = ['boumerdes', 'bordj_menaiel'];
const BRANCH_NAMES = { boumerdes: 'بومرداس', bordj_menaiel: 'برج منايل' };

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/** 'YYYY-MM' for a Date. */
function monthKeyOf(date) { return ledger.monthKey(date); }

/** Boundaries for a 'YYYY-MM' string (defaults to current month). */
function monthBounds(month) {
  let y, m;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const p = month.split('-').map(Number); y = p[0]; m = p[1];
  } else { const d = new Date(); y = d.getFullYear(); m = d.getMonth() + 1; }
  return { key: `${y}-${String(m).padStart(2, '0')}`, start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

/** Shift a 'YYYY-MM' by delta months (delta may be negative). */
function shiftMonth(month, delta) {
  const { key } = monthBounds(month);
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Ascending list of the last `n` month keys ending at `endMonth` (inclusive). */
function lastNMonths(endMonth, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftMonth(endMonth, -i));
  return out;
}

/**
 * Fetch ledger entries with paidAt in [start, end). Single-field range query
 * (auto-indexed). Optional branch filter uses the (branchId, paidAt) composite
 * index added in Phase 1.
 */
async function loadLedgerWindow(start, end, branchId = null) {
  let q = db.collection('ledger')
    .where('paidAt', '>=', Timestamp.fromDate(start))
    .where('paidAt', '<',  Timestamp.fromDate(end));
  if (branchId) q = q.where('branchId', '==', branchId);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Net signed amount sum (payments +, reversals/negative adjustments -). */
function sumAmount(entries) { return entries.reduce((a, e) => a + num(e.amount), 0); }

/** Month key from a ledger entry's paidAt (falls back to its period). */
function entryMonth(e) {
  const d = e.paidAt && e.paidAt.toDate ? e.paidAt.toDate() : ledger.toDate(e.paidAt);
  return d ? monthKeyOf(d) : (e.period || null);
}

module.exports = {
  BRANCHES, BRANCH_NAMES,
  num, monthKeyOf, monthBounds, shiftMonth, lastNMonths,
  loadLedgerWindow, sumAmount, entryMonth, Timestamp,
};
