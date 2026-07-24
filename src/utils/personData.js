/**
 * personData.js
 * -------------
 * Shared constants/helpers for the mandatory educational-institution field on
 * every PERSON record (branches/{branchId}/users/{uid}).
 *
 * Owner directive: the "Educational Institution / School" field is REQUIRED
 * everywhere a person record is created — it must NEVER be empty or null.
 * People with no school affiliation still provide a standardized value: «حر».
 *
 * Mirrors backend/constants.js — keep the two in lockstep.
 */

/** Standardized value for a person not affiliated with any school (free / independent). */
export const DEFAULT_SCHOOL = 'حر';

/** Canonical Arabic label for the field, used across all forms. */
export const SCHOOL_LABEL_AR = 'المؤسسة التعليمية / المدرسة';

/** Hint shown under the input so users know what to enter when unaffiliated. */
export const SCHOOL_HINT_AR = 'اكتب «حر» إذا لم تكن منتسباً إلى مؤسسة تعليمية.';

/**
 * Normalize a raw school value: trim it, and fall back to «حر» when empty/null.
 * Guarantees the stored value is always a non-empty string.
 * @param {*} raw
 * @returns {string}
 */
export const normalizeSchool = (raw) => {
  const v = (raw == null ? '' : String(raw)).trim();
  return v || DEFAULT_SCHOOL;
};

/**
 * True when a raw school value is acceptable as user input (non-empty after trim).
 * Used by form validation to force an explicit value (including «حر»).
 * @param {*} raw
 * @returns {boolean}
 */
export const isValidSchool = (raw) => (raw == null ? '' : String(raw)).trim().length > 0;
