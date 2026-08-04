/**
 * academicYear.js
 * ---------------
 * SINGLE SOURCE OF TRUTH for academic-year calculations across the whole app.
 *
 * Official rule — the academic year is NOT the calendar year:
 *
 *     Academic Year = 1 July → 30 June (of the following calendar year)
 *
 *     01/07/2025 → 30/06/2026   = Academic Year "2025-2026"
 *     01/07/2026 → 30/06/2027   = Academic Year "2026-2027"
 *
 * Assignment rule:
 *     July–December → academic year STARTS with the current calendar year.
 *     January–June  → academic year belongs to the PREVIOUS calendar year's cycle.
 *
 *     15/09/2025 → "2025-2026"
 *     10/01/2026 → "2025-2026"
 *     25/06/2026 → "2025-2026"
 *     01/07/2026 → "2026-2027"
 *
 * Labels are ALWAYS rendered as "YYYY-YYYY" (e.g. "2025-2026"). Never derive an
 * academic year from a single calendar year — always go through these helpers.
 *
 * ── ARCHITECTURAL RULE (academic-year system) ────────────────────────────────
 * The current academic year is ALWAYS derived from the date — no one ever
 * creates, resets, or switches years. Every academic record (registrations,
 * payments, groups/classes, and any FUTURE academic feature or collection) MUST
 * carry an explicit `academicYear` label, stamped SERVER-SIDE at write time (see
 * `withAcademicYear` in the backend mirror). Daily views filter to the current
 * year via {@link academicYearMatches}; the date fallback inside it is a
 * TRANSITIONAL migration-compatibility layer for legacy records only — the
 * explicit field is always the primary path.
 *
 * NOTE: a byte-for-byte logical mirror of this module lives at
 * `backend/services/academicYear.js` (CommonJS). Keep the two in lockstep.
 */

/**
 * Month index (0-based) on which the academic year pivots. July = 6, so any date
 * in month >= 6 (Jul–Dec) starts a new academic year.
 */
export const ACADEMIC_YEAR_START_MONTH = 6; // July

/** Coerce a Firestore Timestamp, JS Date, ms number, or ISO string to a JS Date. */
export const toJsDate = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') {
    try { return value.toDate(); } catch { return null; }
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * The calendar year an academic year STARTS in, for a given date.
 * Jul–Dec → that year; Jan–Jun → previous year.
 * @param {*} value — Date | Firestore Timestamp | ms | ISO string (default: now)
 * @returns {number}
 */
export const getAcademicYearStartYear = (value = new Date()) => {
  const d = toJsDate(value) || new Date();
  const y = d.getFullYear();
  return d.getMonth() >= ACADEMIC_YEAR_START_MONTH ? y : y - 1;
};

/**
 * Full academic-year descriptor for a date.
 * @param {*} value — Date | Firestore Timestamp | ms | ISO string (default: now)
 * @returns {{
 *   label: string,      // "2025-2026"
 *   startYear: number,  // 2025
 *   endYear: number,    // 2026
 *   start: Date,        // 1 Jul startYear 00:00:00.000
 *   end: Date,          // 30 Jun endYear 23:59:59.999
 *   startMs: number,
 *   endMs: number,
 * }}
 */
export const getAcademicYear = (value = new Date()) => {
  const startYear = getAcademicYearStartYear(value);
  const endYear = startYear + 1;
  const start = new Date(startYear, ACADEMIC_YEAR_START_MONTH, 1, 0, 0, 0, 0);
  const end = new Date(endYear, ACADEMIC_YEAR_START_MONTH - 1, 30, 23, 59, 59, 999);
  return {
    label: `${startYear}-${endYear}`,
    startYear,
    endYear,
    start,
    end,
    startMs: start.getTime(),
    endMs: end.getTime(),
  };
};

/**
 * Academic-year label ("YYYY-YYYY") for a date.
 * @param {*} value — Date | Firestore Timestamp | ms | ISO string (default: now)
 * @returns {string}
 */
export const getAcademicYearLabel = (value = new Date()) => getAcademicYear(value).label;

/**
 * Parse a "YYYY-YYYY" label into its component years.
 * @param {string} label
 * @returns {{ startYear: number, endYear: number } | null}
 */
export const parseAcademicYearLabel = (label) => {
  if (typeof label !== 'string') return null;
  const m = label.trim().match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;
  const startYear = Number(m[1]);
  const endYear = Number(m[2]);
  if (endYear !== startYear + 1) return null;
  return { startYear, endYear };
};

/**
 * Date bounds for an academic year identified by a "YYYY-YYYY" label OR a start
 * year number.
 * @param {string|number} yearOrLabel
 * @returns {{ label: string, startYear: number, endYear: number, start: Date, end: Date } | null}
 */
export const academicYearBounds = (yearOrLabel) => {
  let startYear;
  if (typeof yearOrLabel === 'number' && Number.isInteger(yearOrLabel)) {
    startYear = yearOrLabel;
  } else {
    const parsed = parseAcademicYearLabel(yearOrLabel);
    if (!parsed) return null;
    startYear = parsed.startYear;
  }
  const endYear = startYear + 1;
  return {
    label: `${startYear}-${endYear}`,
    startYear,
    endYear,
    start: new Date(startYear, ACADEMIC_YEAR_START_MONTH, 1, 0, 0, 0, 0),
    end: new Date(endYear, ACADEMIC_YEAR_START_MONTH - 1, 30, 23, 59, 59, 999),
  };
};

/**
 * True when `date` falls inside the academic year identified by `yearOrLabel`
 * ("YYYY-YYYY" or start-year number).
 * @param {*} date
 * @param {string|number} yearOrLabel
 * @returns {boolean}
 */
export const isDateInAcademicYear = (date, yearOrLabel) => {
  const d = toJsDate(date);
  const bounds = academicYearBounds(yearOrLabel);
  if (!d || !bounds) return false;
  const t = d.getTime();
  return t >= bounds.start.getTime() && t <= bounds.end.getTime();
};

/**
 * Current academic-year descriptor (superset of {@link getAcademicYear}).
 * Kept as a named export for the annual-fee callers that destructure
 * `{ label, startMs }`.
 * @param {*} now
 */
export const getCurrentAcademicYear = (now = new Date()) => getAcademicYear(now);

/**
 * Descending list of academic-year labels for selectors/filters, anchored on a
 * date (default: now). Includes `future` upcoming years and `count` years total.
 * @param {{ count?: number, future?: number, anchor?: * }} [opts]
 * @returns {string[]}  e.g. ["2026-2027", "2025-2026", "2024-2025"]
 */
export const listAcademicYears = ({ count = 5, future = 1, anchor = new Date() } = {}) => {
  const startYear = getAcademicYearStartYear(anchor);
  const out = [];
  for (let i = future; out.length < count; i--) {
    const sy = startYear + i;
    out.push(`${sy}-${sy + 1}`);
  }
  return out;
};

/**
 * Coerce a record's date-ish field to a JS Date. Accepts everything
 * {@link toJsDate} does PLUS a bare "YYYY-MM" month key (e.g. a group's
 * `startMonth`), resolved to the 1st of that month.
 * @param {*} value
 * @returns {Date|null}
 */
export const coerceDateField = (value) => {
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
  }
  return toJsDate(value);
};

/**
 * True when `record` belongs to the academic year identified by `label`
 * ("YYYY-YYYY").
 *
 * PRIMARY PATH — the explicit `record.academicYear` field. When present it is
 * authoritative and the date fallback is never consulted.
 *
 * TRANSITIONAL FALLBACK — for legacy records written before the academic-year
 * migration (no `academicYear` field), derive membership from the first present
 * `dateFields` value via {@link isDateInAcademicYear}. Pass the date fields that
 * reliably reflect the record's year:
 *   • registrations/payments → ['registeredAt','verifiedAt','startDate','createdAt']
 *   • groups/classes         → ['startMonth']  (NEVER createdAt — groups may be
 *                              prepared for next year before 1 July)
 * A record with neither the field nor a usable fallback date returns false (it is
 * surfaced for manual review, never guessed).
 *
 * @param {object} record
 * @param {string} label — "YYYY-YYYY"
 * @param {string[]} [dateFields]
 * @returns {boolean}
 */
export const academicYearMatches = (record, label, dateFields = ['registeredAt', 'createdAt']) => {
  if (!record || !label) return false;
  if (record.academicYear) return record.academicYear === label;
  for (const field of dateFields) {
    const raw = record[field];
    if (raw === null || raw === undefined || raw === '') continue;
    const d = coerceDateField(raw);
    if (d) return isDateInAcademicYear(d, label);
  }
  return false;
};
