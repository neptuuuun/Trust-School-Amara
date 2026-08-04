/**
 * dateUtils.js
 * ------------
 * Single source of truth for date formatting across the entire application.
 * Uses explicit Algerian Arabic month names instead of browser locale
 * translations, which may produce non-Algerian variants.
 *
 * Usage:
 *   import { formatDate, formatDateTime, formatMonthYear, formatWeekdayDate } from '../utils/dateUtils';
 *
 *   formatDate(someDate)         → "7 جوان 2026"
 *   formatDateTime(someDate)     → "7 جوان 2026 · 14:30"
 *   formatMonthYear(someDate)    → "جوان 2026"
 *   formatDayMonth(someDate)     → "7 جوان"        (compact, no year)
 *   formatWeekdayDate(someDate)  → "الأحد، 7 جوان 2026"
 */

export const MONTHS_DZ = [
  'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
  'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const WEEKDAYS_AR = [
  'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت',
];

/** Coerce a Firestore Timestamp, JS Date, ms number, or ISO string to a JS Date. */
export const toJsDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') {
    try { return value.toDate(); } catch { return null; }
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "7 جوان 2026" */
export const formatDate = (value) => {
  const d = toJsDate(value);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS_DZ[d.getMonth()]} ${d.getFullYear()}`;
};

/** "جوان 2026" */
export const formatMonthYear = (value) => {
  const d = toJsDate(value);
  if (!d) return '—';
  return `${MONTHS_DZ[d.getMonth()]} ${d.getFullYear()}`;
};

/** "سبتمبر 2026" from a 'YYYY-MM' month key (Group Start Month). '—' if invalid. */
export const formatMonthKey = (monthKey) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || '').trim());
  if (!m) return '—';
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return '—';
  return `${MONTHS_DZ[monthIdx]} ${Number(m[1])}`;
};

/** "7 جوان" — compact day+month for table cells and relative-time fallbacks */
export const formatDayMonth = (value) => {
  const d = toJsDate(value);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS_DZ[d.getMonth()]}`;
};

/** "7 جوان 2026 · 14:30" */
export const formatDateTime = (value) => {
  const d = toJsDate(value);
  if (!d) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS_DZ[d.getMonth()]} ${d.getFullYear()} · ${hh}:${mm}`;
};

/** "الأحد، 7 جوان 2026" — for Clock component */
export const formatWeekdayDate = (value) => {
  const d = toJsDate(value);
  if (!d) return '—';
  return `${WEEKDAYS_AR[d.getDay()]}، ${d.getDate()} ${MONTHS_DZ[d.getMonth()]} ${d.getFullYear()}`;
};
