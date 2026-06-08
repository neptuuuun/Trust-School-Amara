/**
 * academicDisplay.js — shared display helpers for the student-facing
 * Subject → Class → Schedule UI (used by SubjectGrid / ClassCard / ClassList).
 */

// New classes store Arabic day labels directly; this map only normalizes any
// legacy English day values that might still appear.
const DAY_AR = {
  Saturday: 'السبت', Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة',
};

export const formatDay = (day) => (day ? (DAY_AR[day] || day) : '');

export const parseNumericPrice = (raw) => {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const cleaned = raw.trim().replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * @param {*} raw price
 * @param {'oneTime'|'monthly'} [priceType]
 */
export const formatPriceText = (raw, priceType) => {
  const price = parseNumericPrice(raw);
  if (price == null) return 'السعر غير متوفر';
  if (price === 0) return 'مجاني';
  const base = `${price.toLocaleString('en-US')} دج`;
  return priceType === 'monthly' ? `${base} / شهرياً` : base;
};

/** Normalize a single schedule object to { day, start, end } with Arabic day. */
export const normalizeSchedule = (s) => ({
  day: formatDay(s?.day || s?.dayOfWeek || ''),
  start: s?.start || s?.startTime || '',
  end: s?.end || s?.endTime || '',
});

/** "السبت 09:00 - 11:00" for one slot. */
export const scheduleSlotLabel = (s) => {
  const n = normalizeSchedule(s);
  if (!n.day && !n.start) return '';
  const time = n.start && n.end ? `${n.start} - ${n.end}` : (n.start || '');
  return [n.day, time].filter(Boolean).join('  ');
};

/** Returns an array of { day, time } for compact rendering. */
export const scheduleRows = (schedules) =>
  (Array.isArray(schedules) ? schedules : [])
    .map(normalizeSchedule)
    .filter((s) => s.day || s.start)
    .map((s) => ({ day: s.day, time: s.start && s.end ? `${s.start} - ${s.end}` : s.start }));
