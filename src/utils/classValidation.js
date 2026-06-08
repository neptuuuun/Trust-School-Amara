/**
 * classValidation.js
 * ------------------
 * Shared, pure validation helpers for the Subject → Class → Schedule model.
 *
 * Used by both the admin class/subject forms and (defensively) the service
 * layer. All messages are in Arabic so they can be shown directly in the UI.
 *
 * Schedule shape (canonical across the app): { day, start, end }
 *   - day:   Arabic weekday label (e.g. "السبت")
 *   - start: "HH:MM" 24h string from <input type="time">
 *   - end:   "HH:MM" 24h string
 */

/** Canonical ordered list of weekday labels used by the schedule editors. */
export const DAYS_OF_WEEK = [
  'السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة',
];

/**
 * Convert an "HH:MM" string to minutes since midnight.
 * @returns {number|null} minutes, or null when the value is missing/invalid
 */
export const timeToMinutes = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

/**
 * Validate a subject.
 * @param {{name?: string}} subject
 * @returns {{ valid: boolean, errors: { name?: string } }}
 */
export const validateSubject = ({ name } = {}) => {
  const errors = {};
  if (!name || !String(name).trim()) {
    errors.name = 'يرجى إدخال اسم المادة';
  }
  return { valid: Object.keys(errors).length === 0, errors };
};

/**
 * Validate a class's scalar fields (schedules validated separately).
 * @param {{teacherName?: string, groupName?: string, capacity?: any, price?: any}} cls
 * @returns {{ valid: boolean, errors: { teacherName?, groupName?, capacity?, price? } }}
 */
export const validateClass = ({ teacherName, groupName, capacity, price } = {}) => {
  const errors = {};

  if (!teacherName || !String(teacherName).trim()) {
    errors.teacherName = 'يرجى إدخال اسم الأستاذ';
  }
  if (!groupName || !String(groupName).trim()) {
    errors.groupName = 'يرجى إدخال اسم المجموعة';
  }

  // capacity: optional, but if provided must be a non-negative integer
  if (capacity !== '' && capacity != null) {
    const c = Number(capacity);
    if (!Number.isFinite(c) || c < 0 || !Number.isInteger(c)) {
      errors.capacity = 'عدد المقاعد يجب أن يكون رقماً صحيحاً موجباً';
    }
  }

  // price: optional, but if provided must be a non-negative number
  if (price !== '' && price != null) {
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) {
      errors.price = 'السعر يجب أن يكون رقماً موجباً';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
};

/**
 * Validate a class's schedule list.
 * Rules: at least one schedule; each row has a day + valid start < end;
 * no exact duplicates; no two schedules on the same day overlap in time.
 *
 * @param {Array<{day, start, end}>} schedules
 * @returns {{ valid: boolean, errors: string[], rowErrors: Record<number,string> }}
 *   errors    — general (form-level) messages
 *   rowErrors — message keyed by the offending row index
 */
export const validateSchedules = (schedules) => {
  const errors = [];
  const rowErrors = {};
  const list = Array.isArray(schedules) ? schedules : [];

  if (list.length === 0) {
    errors.push('يجب إضافة موعد واحد على الأقل');
    return { valid: false, errors, rowErrors };
  }

  // Per-row structural validation
  const parsed = list.map((s, index) => {
    const day = s?.day ? String(s.day).trim() : '';
    const startMin = timeToMinutes(s?.start);
    const endMin = timeToMinutes(s?.end);

    if (!day) {
      rowErrors[index] = 'يرجى اختيار اليوم';
    } else if (startMin == null || endMin == null) {
      rowErrors[index] = 'يرجى إدخال وقت بداية ونهاية صحيحين';
    } else if (startMin >= endMin) {
      rowErrors[index] = 'وقت البداية يجب أن يكون قبل وقت النهاية';
    }

    return { index, day, startMin, endMin };
  });

  // Duplicate + overlap detection (only between structurally-valid rows)
  for (let i = 0; i < parsed.length; i += 1) {
    const a = parsed[i];
    if (rowErrors[a.index] || a.startMin == null || a.endMin == null) continue;

    for (let j = i + 1; j < parsed.length; j += 1) {
      const b = parsed[j];
      if (rowErrors[b.index] || b.startMin == null || b.endMin == null) continue;
      if (a.day !== b.day) continue;

      const isDuplicate = a.startMin === b.startMin && a.endMin === b.endMin;
      const isOverlap = a.startMin < b.endMin && b.startMin < a.endMin;

      if (isDuplicate) {
        rowErrors[b.index] = 'هذا الموعد مكرر';
        if (!errors.includes('يوجد موعد مكرر في نفس اليوم')) {
          errors.push('يوجد موعد مكرر في نفس اليوم');
        }
      } else if (isOverlap) {
        rowErrors[b.index] = 'هذا الموعد يتداخل مع موعد آخر في نفس اليوم';
        if (!errors.includes('يوجد تداخل بين المواعيد في نفس اليوم')) {
          errors.push('يوجد تداخل بين المواعيد في نفس اليوم');
        }
      }
    }
  }

  return { valid: errors.length === 0 && Object.keys(rowErrors).length === 0, errors, rowErrors };
};

/**
 * Normalize a raw schedule list into clean { day, start, end } objects,
 * dropping incomplete rows. Use before persisting.
 */
export const sanitizeSchedules = (schedules) =>
  (Array.isArray(schedules) ? schedules : [])
    .map((s) => ({
      day: s?.day ? String(s.day).trim() : '',
      start: s?.start ? String(s.start).trim() : '',
      end: s?.end ? String(s.end).trim() : '',
    }))
    .filter((s) => s.day && s.start && s.end);
