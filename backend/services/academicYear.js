/**
 * academicYear.js (backend / CommonJS)
 * ------------------------------------
 * SINGLE SOURCE OF TRUTH for academic-year calculations on the server.
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
 * Labels are ALWAYS "YYYY-YYYY". Never derive an academic year from a single
 * calendar year — always go through these helpers.
 *
 * ── ARCHITECTURAL RULE (academic-year system) ────────────────────────────────
 * The current academic year is ALWAYS derived from the date — no one ever
 * creates, resets, or switches years. Every academic write (registrations,
 * payments, groups/classes, and any FUTURE academic feature or collection) MUST
 * stamp an explicit `academicYear` label at write time via `withAcademicYear`.
 * Daily views filter to the current year via `academicYearMatches`; the date
 * fallback inside it is a TRANSITIONAL migration-compatibility layer for legacy
 * records only — the explicit field is always the primary path.
 *
 * NOTE: a byte-for-byte logical mirror lives at `src/utils/academicYear.js`
 * (ES module). Keep the two in lockstep.
 */

// July = month index 6 (0-based). Dates in month >= 6 (Jul–Dec) start a new year.
const ACADEMIC_YEAR_START_MONTH = 6; // July

/** Coerce a Firestore Timestamp, JS Date, ms number, or ISO string to a JS Date. */
function toJsDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') {
    try { return value.toDate(); } catch (e) { return null; }
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The calendar year an academic year STARTS in, for a given date.
 * Jul–Dec → that year; Jan–Jun → previous year.
 */
function getAcademicYearStartYear(value = new Date()) {
  const d = toJsDate(value) || new Date();
  const y = d.getFullYear();
  return d.getMonth() >= ACADEMIC_YEAR_START_MONTH ? y : y - 1;
}

/**
 * Full academic-year descriptor for a date:
 *   { label, startYear, endYear, start, end, startMs, endMs }
 * start = 1 Jul 00:00:00.000, end = 30 Jun 23:59:59.999.
 */
function getAcademicYear(value = new Date()) {
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
}

/** Academic-year label ("YYYY-YYYY") for a date. */
function getAcademicYearLabel(value = new Date()) {
  return getAcademicYear(value).label;
}

/** Parse a "YYYY-YYYY" label → { startYear, endYear } | null. */
function parseAcademicYearLabel(label) {
  if (typeof label !== 'string') return null;
  const m = label.trim().match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;
  const startYear = Number(m[1]);
  const endYear = Number(m[2]);
  if (endYear !== startYear + 1) return null;
  return { startYear, endYear };
}

/**
 * Date bounds for an academic year identified by a "YYYY-YYYY" label OR a start
 * year number → { label, startYear, endYear, start, end } | null.
 */
function academicYearBounds(yearOrLabel) {
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
}

/** True when `date` falls inside the academic year identified by `yearOrLabel`. */
function isDateInAcademicYear(date, yearOrLabel) {
  const d = toJsDate(date);
  const bounds = academicYearBounds(yearOrLabel);
  if (!d || !bounds) return false;
  const t = d.getTime();
  return t >= bounds.start.getTime() && t <= bounds.end.getTime();
}

/** Current academic-year descriptor (superset of getAcademicYear). */
function getCurrentAcademicYear(now = new Date()) {
  return getAcademicYear(now);
}

/**
 * Descending list of academic-year labels for selectors/filters, anchored on a
 * date (default: now). Includes `future` upcoming years and `count` years total.
 * Mirror of the frontend `listAcademicYears`.
 */
function listAcademicYears({ count = 5, future = 1, anchor = new Date() } = {}) {
  const startYear = getAcademicYearStartYear(anchor);
  const out = [];
  for (let i = future; out.length < count; i--) {
    const sy = startYear + i;
    out.push(`${sy}-${sy + 1}`);
  }
  return out;
}

/**
 * Coerce a record's date-ish field to a JS Date. Accepts everything toJsDate
 * does PLUS a bare "YYYY-MM" month key (e.g. a group's `startMonth`), resolved
 * to the 1st of that month.
 */
function coerceDateField(value) {
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
  }
  return toJsDate(value);
}

/**
 * True when `record` belongs to the academic year identified by `label`.
 * PRIMARY PATH: the explicit `record.academicYear` field (authoritative when
 * present). TRANSITIONAL FALLBACK: for legacy records lacking the field, derive
 * from the first present `dateFields` value. Pass the fields that reliably
 * reflect the record's year (registrations → date fields; groups → ['startMonth']
 * only, never createdAt). Returns false when neither is usable.
 */
function academicYearMatches(record, label, dateFields = ['registeredAt', 'createdAt']) {
  if (!record || !label) return false;
  if (record.academicYear) return record.academicYear === label;
  for (const field of dateFields) {
    const raw = record[field];
    if (raw === null || raw === undefined || raw === '') continue;
    const d = coerceDateField(raw);
    if (d) return isDateInAcademicYear(d, label);
  }
  return false;
}

/**
 * Stamp the current academic-year label onto a payload. THE standard way for any
 * academic write to attach its year — use this instead of inlining the label so
 * every collection stays consistent and no future feature needs another
 * migration.
 * @param {object} payload
 * @param {*} [when] — date the record belongs to (default: now)
 * @returns {object} a new object with `academicYear` set
 */
function withAcademicYear(payload = {}, when = new Date()) {
  return { ...payload, academicYear: getAcademicYearLabel(when) };
}

module.exports = {
  ACADEMIC_YEAR_START_MONTH,
  toJsDate,
  getAcademicYearStartYear,
  getAcademicYear,
  getAcademicYearLabel,
  parseAcademicYearLabel,
  academicYearBounds,
  isDateInAcademicYear,
  getCurrentAcademicYear,
  listAcademicYears,
  coerceDateField,
  academicYearMatches,
  withAcademicYear,
};
