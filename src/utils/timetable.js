/**
 * timetable.js
 * ------------
 * Pure helpers that turn a student's active enrollments into a weekly timetable.
 *
 * Every enrollment (support / language / training / academic subject) carries a
 * canonical `schedules` array of { day, start, end } rows (Arabic weekday +
 * "HH:MM"). This module flattens those rows across all enrollments into slots,
 * groups them by weekday in the local (Saturday-first) order, sorts each day by
 * start time, and marks today's slots, any ongoing slot, and the single next
 * upcoming slot — wrapping around the week.
 *
 * No Firestore, no React — just data in, data out — so it is unit-testable and
 * reusable by the student dashboard and (later) an admin view.
 */

import { DAYS_OF_WEEK, timeToMinutes } from './classValidation';
import { normalizeSchedule } from '../components/academic/academicDisplay';

const MINUTES_PER_DAY = 1440;
const WEEK_MINUTES = 7 * MINUTES_PER_DAY;

// JS Date.getDay() (0=Sunday) → Arabic weekday label. Matches dateUtils' WEEKDAYS_AR.
const JS_DAY_TO_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** Index of a weekday label in the Saturday-first working-week order (or -1). */
export const dayOrderIndex = (day) => DAYS_OF_WEEK.indexOf(String(day || '').trim());

/** The Arabic weekday label for a given Date (defaults to now). */
export const todayLabel = (now = new Date()) => JS_DAY_TO_AR[now.getDay()] || '';

/**
 * Position of a (dayIndex, minutes) pair on the Saturday-first weekly timeline,
 * in minutes from the start of Saturday.
 */
const weekPosition = (dayIndex, minutes) => dayIndex * MINUTES_PER_DAY + minutes;

/**
 * Flatten enrollments → slots.
 * @param {Array<{schedules, subjectName?, groupName?, teacherName?, classroom?, serviceType?, classId?}>} enrollments
 * @returns {Array<slot>} slot = { day, dayIndex, start, end, startMin, endMin, subject, group, teacher, classroom, serviceType, key }
 */
export function toSlots(enrollments) {
  const slots = [];
  const seen = new Set();
  (Array.isArray(enrollments) ? enrollments : []).forEach((enr) => {
    if (!enr) return;
    const rows = Array.isArray(enr.schedules) ? enr.schedules : [];
    rows.forEach((raw) => {
      const s = normalizeSchedule(raw);
      const dayIndex = dayOrderIndex(s.day);
      const startMin = timeToMinutes(s.start);
      if (dayIndex < 0 || startMin == null) return; // skip incomplete rows
      const endMin = timeToMinutes(s.end);
      const subject = enr.subjectName || enr.groupName || enr.languageName || enr.trainingName || 'حصة';
      const group = enr.groupName || enr.className || '';
      const teacher = enr.teacherName || '';
      const classroom = enr.classroom || enr.room || '';
      // De-duplicate identical rows that can appear in two stores (e.g. a
      // language that is also an academic subject enrollment).
      const key = `${enr.classId || subject}|${s.day}|${s.start}|${s.end}`;
      if (seen.has(key)) return;
      seen.add(key);
      slots.push({
        day: s.day,
        dayIndex,
        start: s.start,
        end: s.end,
        startMin,
        endMin: endMin == null ? startMin : endMin,
        subject,
        group,
        teacher,
        classroom,
        serviceType: enr.serviceType || enr.type || '',
        key,
      });
    });
  });
  return slots;
}

/**
 * Build the full weekly timetable model.
 * @param {Array} enrollments
 * @param {{ now?: Date }} [opts]
 * @returns {{
 *   days: Array<{ day, dayIndex, isToday, slots: Array<slot & {isOngoing, isNext, minutesUntil}> }>,
 *   totalSlots: number,
 *   hasClasses: boolean,
 *   nextSlot: (slot & {minutesUntil}) | null,
 *   todayLabel: string,
 * }}
 */
export function buildWeeklyTimetable(enrollments, { now = new Date() } = {}) {
  const slots = toSlots(enrollments);
  const todayIdx = dayOrderIndex(todayLabel(now));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowPos = weekPosition(todayIdx < 0 ? 0 : todayIdx, nowMin);

  // Annotate each slot with scheduling relationships.
  const annotated = slots.map((slot) => {
    const pos = weekPosition(slot.dayIndex, slot.startMin);
    const endPos = weekPosition(slot.dayIndex, slot.endMin);
    const isToday = slot.dayIndex === todayIdx;
    const isOngoing = isToday && nowMin >= slot.startMin && nowMin < slot.endMin;
    // Minutes until the slot starts, wrapping forward across the week.
    let minutesUntil = ((pos - nowPos) % WEEK_MINUTES + WEEK_MINUTES) % WEEK_MINUTES;
    if (isOngoing) minutesUntil = 0;
    return { ...slot, isToday, isOngoing, endPos, minutesUntil };
  });

  // The single next upcoming slot = smallest strictly-future start.
  let nextSlot = null;
  annotated.forEach((slot) => {
    if (slot.isOngoing) return; // ongoing is highlighted separately
    if (slot.minutesUntil <= 0) return;
    if (!nextSlot || slot.minutesUntil < nextSlot.minutesUntil) nextSlot = slot;
  });
  if (nextSlot) nextSlot.isNext = true;

  // Group by day in Saturday-first order; keep only populated days.
  const byIndex = new Map();
  annotated.forEach((slot) => {
    if (!byIndex.has(slot.dayIndex)) byIndex.set(slot.dayIndex, []);
    byIndex.get(slot.dayIndex).push(slot);
  });

  const days = [];
  DAYS_OF_WEEK.forEach((label, idx) => {
    const daySlots = byIndex.get(idx);
    if (!daySlots || daySlots.length === 0) return;
    daySlots.sort((a, b) => a.startMin - b.startMin || String(a.subject).localeCompare(String(b.subject)));
    days.push({ day: label, dayIndex: idx, isToday: idx === todayIdx, slots: daySlots });
  });

  return {
    days,
    totalSlots: annotated.length,
    hasClasses: annotated.length > 0,
    nextSlot,
    todayLabel: todayLabel(now),
  };
}

export default buildWeeklyTimetable;
