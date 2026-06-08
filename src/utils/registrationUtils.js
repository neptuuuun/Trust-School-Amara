/**
 * registrationUtils.js
 * --------------------
 * Shared, pure utilities for support lesson registration lifecycle.
 * Import from here instead of duplicating logic in components/hooks/services.
 *
 * Support lessons are SUBSCRIPTION-BASED (monthly expiry).
 * Language lessons and trainings are ONE-TIME payments — do not use these
 * expiry helpers for them.
 */

import { formatDate } from './dateUtils';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Add N calendar months to a date, preserving the day-of-month.
 * If the resulting month doesn't have that day (e.g. Jan 31 + 1 month),
 * JavaScript's Date automatically overflows to the next month.
 */
export const addMonthsKeepingDay = (date, months) => {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
};

/** Coerce a Firestore Timestamp, JS Date, or ms number to a JS Date. */
export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate(); // Firestore Timestamp
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// ---------------------------------------------------------------------------
// Academic year + annual fee
// ---------------------------------------------------------------------------

/** Base annual registration fee (DZD). Single source of truth. */
export const ANNUAL_FEE_DZD = 1000;

/**
 * Current academic year, which starts on 1 September (month index 8).
 * Matches the `getAcademicYearLabel` logic used elsewhere.
 * @param {Date} [now]
 * @returns {{ label: string, startYear: number, startMs: number }}
 *   label   — e.g. "2025-2026"
 *   startMs — ms timestamp of 1 Sep of the academic year's start
 */
export const getCurrentAcademicYear = (now = new Date()) => {
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 8 ? y : y - 1; // Sep–Dec → this year; Jan–Aug → previous year
  return {
    label: `${startYear}-${startYear + 1}`,
    startYear,
    startMs: new Date(startYear, 8, 1, 0, 0, 0, 0).getTime(),
  };
};

/**
 * True when a verified annual payment falls inside the CURRENT academic year.
 * Uses the payment's verifiedAt (works for legacy records that predate the
 * academicYear tag → grandfathers existing payers; resets every September).
 * @param {object} payment — an annualPayments doc ({ status, verifiedAt, academicYear })
 */
export const isAnnualPaymentForCurrentYear = (payment, now = new Date()) => {
  if (!payment) return false;
  if (String(payment.status || '').toLowerCase() !== 'verified') return false;
  const { label, startMs } = getCurrentAcademicYear(now);
  if (payment.academicYear && payment.academicYear === label) return true;
  const verifiedAt = toDate(payment.verifiedAt);
  return Boolean(verifiedAt && verifiedAt.getTime() >= startMs);
};

// ---------------------------------------------------------------------------
// Expiration logic
// ---------------------------------------------------------------------------

/**
 * True if the registration's end date is in the past.
 * Checks both `endDate` and the legacy `expiresAt` field name.
 */
export const isRegistrationExpired = (registration) => {
  if (!registration) return false;
  const rawEnd = registration.endDate ?? registration.expiresAt ?? null;
  const endDate = toDate(rawEnd);
  if (!endDate) return false;
  return endDate <= new Date();
};

/**
 * Returns a human-readable expiry date string, or null if unavailable.
 * @param {object} registration
 * @returns {string|null}
 */
export const getExpiryLabel = (registration) => {
  if (!registration) return null;
  const rawEnd = registration.endDate ?? registration.expiresAt ?? null;
  const d = toDate(rawEnd);
  if (!d) return null;
  return formatDate(d);
};

// ---------------------------------------------------------------------------
// Computed status
// ---------------------------------------------------------------------------

/**
 * Derive a display-level status from the Firestore document.
 * This is the SINGLE source of truth for what to show in UI and what to
 * allow or block in registration forms.
 *
 * Returned values:
 *   'none'     — no registration exists
 *   'pending'  — submitted, waiting for admin verification
 *   'active'   — verified by admin AND not yet expired
 *   'expired'  — was verified but endDate has passed → renewal is allowed
 *   'rejected' — admin rejected the registration
 */
export const getComputedStatus = (registration) => {
  if (!registration) return 'none';
  const norm = String(registration.status || '').toLowerCase();

  if (norm === 'rejected') return 'rejected';
  if (norm === 'pending') return 'pending';

  if (['verified', 'approved', 'active', 'registered'].includes(norm)) {
    return isRegistrationExpired(registration) ? 'expired' : 'active';
  }

  return 'none';
};

// ---------------------------------------------------------------------------
// Gate logic — what the registration form should do
// ---------------------------------------------------------------------------

/**
 * Returns true when an existing registration prevents creating a NEW one.
 * 'expired' and 'rejected' are NOT blocking — the student may renew/re-apply.
 */
export const isRegistrationBlocking = (registration) => {
  const s = getComputedStatus(registration);
  return s === 'pending' || s === 'active';
};

/**
 * Returns true when the student's registration is expired and a renewal
 * should UPDATE the existing document rather than create a new one.
 */
export const isRenewalCandidate = (registration) => {
  return getComputedStatus(registration) === 'expired';
};

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/**
 * Maps a computed status to Tailwind badge classes and Arabic label.
 */
export const STATUS_UI = {
  pending:  { label: 'قيد المراجعة',  classes: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  active:   { label: 'نشط',           classes: 'bg-green-100  text-green-700  border-green-200'  },
  expired:  { label: 'منتهي',         classes: 'bg-gray-100   text-gray-600   border-gray-200'   },
  rejected: { label: 'مرفوض',         classes: 'bg-red-100    text-red-700    border-red-200'    },
  none:     { label: 'غير مسجل',      classes: 'bg-slate-100  text-slate-500  border-slate-200'  },
};

export const getStatusUI = (computedStatus) =>
  STATUS_UI[computedStatus] ?? STATUS_UI.none;
