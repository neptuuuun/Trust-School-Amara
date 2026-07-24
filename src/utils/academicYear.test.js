/**
 * Tests for the centralized academic-year engine.
 * Academic year = 1 July → 30 June. Boundary dates are the critical cases:
 * June 30, July 1, December 31, January 1.
 *
 * Run: `npm test -- academicYear`  (react-scripts / jest).
 */

import {
  ACADEMIC_YEAR_START_MONTH,
  getAcademicYearStartYear,
  getAcademicYear,
  getAcademicYearLabel,
  parseAcademicYearLabel,
  academicYearBounds,
  isDateInAcademicYear,
  getCurrentAcademicYear,
  listAcademicYears,
  toJsDate,
} from './academicYear';

// Local date constructor — month is 1-based here for readability.
const d = (y, m, day, hh = 12, mm = 0, ss = 0, ms = 0) => new Date(y, m - 1, day, hh, mm, ss, ms);

describe('getAcademicYearLabel — boundary dates from the spec', () => {
  it('15 Sep 2025 → "2025-2026"', () => {
    expect(getAcademicYearLabel(d(2025, 9, 15))).toBe('2025-2026');
  });
  it('10 Jan 2026 → "2025-2026"', () => {
    expect(getAcademicYearLabel(d(2026, 1, 10))).toBe('2025-2026');
  });
  it('25 Jun 2026 → "2025-2026"', () => {
    expect(getAcademicYearLabel(d(2026, 6, 25))).toBe('2025-2026');
  });
  it('1 Jul 2026 → "2026-2027"', () => {
    expect(getAcademicYearLabel(d(2026, 7, 1))).toBe('2026-2027');
  });
});

describe('getAcademicYearLabel — the four mandated boundary edges', () => {
  // June 30 — last day of the cycle that began the previous July.
  it('30 Jun 2026 at 23:59:59.999 → "2025-2026"', () => {
    expect(getAcademicYearLabel(d(2026, 6, 30, 23, 59, 59, 999))).toBe('2025-2026');
  });
  // July 1 — first day of the new cycle.
  it('1 Jul 2025 at 00:00:00.000 → "2025-2026"', () => {
    expect(getAcademicYearLabel(d(2025, 7, 1, 0, 0, 0, 0))).toBe('2025-2026');
  });
  // December 31 — still the cycle that began that July.
  it('31 Dec 2025 → "2025-2026"', () => {
    expect(getAcademicYearLabel(d(2025, 12, 31, 23, 59, 59, 999))).toBe('2025-2026');
  });
  // January 1 — belongs to the previous July's cycle.
  it('1 Jan 2026 at 00:00:00.000 → "2025-2026"', () => {
    expect(getAcademicYearLabel(d(2026, 1, 1, 0, 0, 0, 0))).toBe('2025-2026');
  });
});

describe('getAcademicYearStartYear', () => {
  it('uses July (month index 6) as the pivot', () => {
    expect(ACADEMIC_YEAR_START_MONTH).toBe(6);
  });
  it('30 Jun → previous year', () => {
    expect(getAcademicYearStartYear(d(2026, 6, 30))).toBe(2025);
  });
  it('1 Jul → current year', () => {
    expect(getAcademicYearStartYear(d(2026, 7, 1))).toBe(2026);
  });
});

describe('getAcademicYear — descriptor bounds', () => {
  const ay = getAcademicYear(d(2025, 9, 15));
  it('label/startYear/endYear', () => {
    expect(ay.label).toBe('2025-2026');
    expect(ay.startYear).toBe(2025);
    expect(ay.endYear).toBe(2026);
  });
  it('starts 1 Jul 2025 00:00:00.000', () => {
    expect(ay.start.getFullYear()).toBe(2025);
    expect(ay.start.getMonth()).toBe(6); // July
    expect(ay.start.getDate()).toBe(1);
    expect(ay.start.getHours()).toBe(0);
  });
  it('ends 30 Jun 2026 23:59:59.999', () => {
    expect(ay.end.getFullYear()).toBe(2026);
    expect(ay.end.getMonth()).toBe(5); // June
    expect(ay.end.getDate()).toBe(30);
    expect(ay.end.getHours()).toBe(23);
    expect(ay.end.getMilliseconds()).toBe(999);
  });
  it('the cycle is contiguous: next year starts 1ms after this year ends', () => {
    const next = getAcademicYear(d(2026, 7, 1));
    expect(next.startMs - ay.endMs).toBe(1);
  });
});

describe('parseAcademicYearLabel', () => {
  it('parses a valid label', () => {
    expect(parseAcademicYearLabel('2025-2026')).toEqual({ startYear: 2025, endYear: 2026 });
  });
  it('rejects non-contiguous years', () => {
    expect(parseAcademicYearLabel('2025-2027')).toBeNull();
  });
  it('rejects garbage', () => {
    expect(parseAcademicYearLabel('2025')).toBeNull();
    expect(parseAcademicYearLabel('')).toBeNull();
    expect(parseAcademicYearLabel(null)).toBeNull();
  });
});

describe('academicYearBounds — by label or start year', () => {
  it('accepts a label', () => {
    const b = academicYearBounds('2025-2026');
    expect(b.startYear).toBe(2025);
    expect(b.start.getMonth()).toBe(6);
    expect(b.end.getMonth()).toBe(5);
  });
  it('accepts a start-year number', () => {
    expect(academicYearBounds(2025).label).toBe('2025-2026');
  });
  it('returns null for a bad label', () => {
    expect(academicYearBounds('nope')).toBeNull();
  });
});

describe('isDateInAcademicYear', () => {
  it('30 Jun 2026 is inside "2025-2026"', () => {
    expect(isDateInAcademicYear(d(2026, 6, 30, 23, 59), '2025-2026')).toBe(true);
  });
  it('1 Jul 2026 is NOT inside "2025-2026"', () => {
    expect(isDateInAcademicYear(d(2026, 7, 1, 0, 0), '2025-2026')).toBe(false);
  });
  it('1 Jul 2025 is the first instant inside "2025-2026"', () => {
    expect(isDateInAcademicYear(d(2025, 7, 1, 0, 0, 0, 0), '2025-2026')).toBe(true);
  });
});

describe('getCurrentAcademicYear is a superset of getAcademicYear', () => {
  it('exposes label + startMs used by annual-fee callers', () => {
    const cur = getCurrentAcademicYear(d(2025, 9, 1));
    expect(cur.label).toBe('2025-2026');
    expect(cur.startMs).toBe(d(2025, 7, 1, 0, 0, 0, 0).getTime());
  });
});

describe('listAcademicYears — for selectors', () => {
  it('returns descending labels including one future year', () => {
    expect(listAcademicYears({ count: 4, future: 1, anchor: d(2025, 9, 1) }))
      .toEqual(['2026-2027', '2025-2026', '2024-2025', '2023-2024']);
  });
});

describe('toJsDate coercion', () => {
  it('passes a Date through', () => {
    const x = d(2025, 9, 1);
    expect(toJsDate(x)).toBe(x);
  });
  it('coerces a Firestore-style Timestamp', () => {
    const ts = { toDate: () => d(2025, 9, 1) };
    expect(getAcademicYearLabel(ts)).toBe('2025-2026');
  });
  it('returns null for unparseable input', () => {
    expect(toJsDate('not-a-date')).toBeNull();
  });
});
