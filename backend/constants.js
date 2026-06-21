/**
 * constants.js (backend)
 * ----------------------
 * Shared backend constants/helpers for the mandatory educational-institution
 * field on every PERSON record and on the denormalized registration/payment
 * records used for reporting.
 *
 * Owner directive: the "Educational Institution / School" field is REQUIRED
 * everywhere a person record is created — it must NEVER be empty or null.
 * People with no school affiliation still provide a standardized value: «حر».
 *
 * Mirrors src/utils/personData.js — keep the two in lockstep.
 */

/** Standardized value for a person not affiliated with any school (free / independent). */
const DEFAULT_SCHOOL = 'حر';

/**
 * Normalize a raw school value: trim it, and fall back to «حر» when empty/null.
 * Guarantees the stored value is always a non-empty string.
 * @param {*} raw
 * @returns {string}
 */
const normalizeSchool = (raw) => {
  const v = (raw == null ? '' : String(raw)).trim();
  return v || DEFAULT_SCHOOL;
};

/**
 * True when a raw school value is a non-empty string after trimming.
 * Used by backend validation to reject blank submissions.
 * @param {*} raw
 * @returns {boolean}
 */
const isValidSchool = (raw) => (raw == null ? '' : String(raw)).trim().length > 0;

module.exports = { DEFAULT_SCHOOL, normalizeSchool, isValidSchool };
