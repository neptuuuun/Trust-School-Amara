/**
 * financeSettings.js
 * ------------------
 * Owner-controlled financial policy (currently: the annual registration fee).
 *
 * Stored in a single global doc `config/finance`. Read broadly (admins record
 * payments, students self-pay, the backend snapshots the amount onto each
 * record); written ONLY by the owner via the Express backend (Admin SDK) — the
 * Firestore rules deny all client writes to /config.
 *
 * The amount recorded on each annualPayments doc is a SNAPSHOT taken at payment
 * time, so changing the fee here never rewrites historical records — old
 * payments keep their original amount for audit/accounting accuracy.
 */

const { admin, db } = require('../config/firebase');

const CONFIG_COLLECTION = 'config';
const FINANCE_DOC = 'finance';
const CURRENCY = 'DZD';

// Default fee when the config doc has never been set. Mirrors the historical
// hardcoded ANNUAL_FEE_DZD so behaviour is unchanged until an owner edits it.
const DEFAULT_ANNUAL_FEE_DZD = 1000;

function financeRef() {
  return db.collection(CONFIG_COLLECTION).doc(FINANCE_DOC);
}

/** Coerce to a non-negative finite number, else fall back to the default. */
function toAmount(value, fallback = DEFAULT_ANNUAL_FEE_DZD) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Full finance settings descriptor (with metadata for the owner UI). */
async function getFinanceSettings() {
  try {
    const snap = await financeRef().get();
    if (snap.exists) {
      const d = snap.data() || {};
      const hasValue = d.annualFeeAmount !== undefined && d.annualFeeAmount !== null;
      return {
        annualFeeAmount: toAmount(d.annualFeeAmount),
        currency:        d.currency || CURRENCY,
        updatedAt:       d.updatedAt || null,
        updatedBy:       d.updatedBy || null,
        isDefault:       !hasValue,
      };
    }
  } catch (e) {
    console.warn('[financeSettings] read failed:', e.message);
  }
  return { annualFeeAmount: DEFAULT_ANNUAL_FEE_DZD, currency: CURRENCY, updatedAt: null, updatedBy: null, isDefault: true };
}

/** Current annual fee amount (DZD). Single source of truth for every fee path. */
async function getAnnualFeeAmount() {
  return (await getFinanceSettings()).annualFeeAmount;
}

/**
 * Set the annual fee amount (owner-only — enforced by the route's requireOwner).
 * Returns the persisted numeric value. Throws { code: 'invalid-amount' } on bad input.
 */
async function setAnnualFeeAmount(amount, actor = null) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    const err = new Error('Annual fee amount must be a non-negative number.');
    err.code = 'invalid-amount';
    throw err;
  }
  await financeRef().set({
    annualFeeAmount: value,
    currency:        CURRENCY,
    updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
    updatedBy:       actor ? { uid: actor.uid || '', email: actor.email || '', name: actor.name || '' } : null,
  }, { merge: true });
  return value;
}

module.exports = {
  DEFAULT_ANNUAL_FEE_DZD,
  CURRENCY,
  getFinanceSettings,
  getAnnualFeeAmount,
  setAnnualFeeAmount,
};
