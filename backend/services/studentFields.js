/**
 * studentFields.js  (backend / CommonJS, PURE — no firebase, no I/O)
 * -----------------------------------------------------------------
 * Field-level parsers for the student PROFILE, shared by every admin write path:
 *   • POST /api/admin/create-student       (individual registration)
 *   • POST /api/admin/bulk-import-students (Excel/CSV import, row by row)
 *
 * Both paths validate through these functions, so a value accepted (or rejected)
 * by one is accepted (or rejected) by the other — an imported student and a
 * manually registered one can never drift apart in what they store.
 *
 * Every parser returns `{ value, error?, warning? }`:
 *   • blank input          → { value: null }         (optional fields stay EMPTY —
 *                                                     nothing is invented)
 *   • valid input          → { value: <normalized> }
 *   • present but invalid  → { value: null, error }   (never silently dropped)
 *
 * The level vocabulary (mid1…mid4, sec1…sec3) is the platform's canonical
 * `studyYear` — see src/data/studyLevels.js, which this mirrors.
 */

const { validateAverage, classify } = require('./supportEligibility');
const academicYear = require('./academicYear');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Canonical study levels — mirror of src/data/studyLevels.js (keep in lockstep). */
const STUDY_LEVELS = [
  { id: 'mid1', short: 'أولى متوسط',  long: 'السنة الأولى متوسط',  stage: 'mid', n: 1 },
  { id: 'mid2', short: 'ثانية متوسط', long: 'السنة الثانية متوسط', stage: 'mid', n: 2 },
  { id: 'mid3', short: 'ثالثة متوسط', long: 'السنة الثالثة متوسط', stage: 'mid', n: 3 },
  { id: 'mid4', short: 'رابعة متوسط', long: 'السنة الرابعة متوسط', stage: 'mid', n: 4 },
  { id: 'sec1', short: 'أولى ثانوي',  long: 'السنة الأولى ثانوي',  stage: 'sec', n: 1 },
  { id: 'sec2', short: 'ثانية ثانوي', long: 'السنة الثانية ثانوي', stage: 'sec', n: 2 },
  { id: 'sec3', short: 'ثالثة ثانوي', long: 'السنة الثالثة ثانوي', stage: 'sec', n: 3 },
];
const LEVEL_BY_ID = new Map(STUDY_LEVELS.map((l) => [l.id, l]));

/** 'mid*' → 'middle', 'sec*' → 'high' (the existing `schoolLevel` vocabulary). */
const schoolLevelOf = (grade) => {
  if (!grade) return null;
  if (String(grade).startsWith('mid')) return 'middle';
  if (String(grade).startsWith('sec')) return 'high';
  return null;
};

const levelLabel = (grade) => LEVEL_BY_ID.get(grade)?.short || null;

// ── Text helpers ──────────────────────────────────────────────────────────────

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII digits. */
const toLatinDigits = (s) => String(s)
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';

/** Trim + collapse inner whitespace. Blank → null. */
const cleanText = (v) => (isBlank(v) ? null : String(v).replace(/\s+/g, ' ').trim());

/**
 * Loose Arabic normalisation for vocabulary matching only (never stored):
 * strips diacritics/tatweel, unifies alef/ya/ta-marbuta forms, lowercases Latin.
 */
const normalizeArabic = (s) => toLatinDigits(String(s))
  .toLowerCase()
  .replace(/[ً-ْٰـ]/g, '') // tashkeel + tatweel
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ')
  .trim();

// ── Optional free-text fields ────────────────────────────────────────────────

/**
 * Optional free text with a max length (birth place, address).
 * @returns {{value: string|null, error?: string}}
 */
function parseOptionalText(raw, { max, label }) {
  const v = cleanText(raw);
  if (v === null) return { value: null };
  if (v.length > max) return { value: null, error: `${label} طويل جداً (الحد الأقصى ${max} حرفاً)` };
  return { value: v };
}

// ── Email ─────────────────────────────────────────────────────────────────────

function parseEmail(raw) {
  if (isBlank(raw)) return { value: null };
  const v = String(raw).trim().toLowerCase();
  if (!EMAIL_RE.test(v)) return { value: null, error: 'صيغة البريد الإلكتروني غير صحيحة' };
  return { value: v };
}

// ── Phone ─────────────────────────────────────────────────────────────────────

/** Legacy format-agnostic cleaner (kept for existing-record comparison). */
const cleanPhone = (v) => String(v == null ? '' : v).replace(/[\s\-()]/g, '').trim();

/**
 * Canonical comparison key for duplicate detection: digits only, with the
 * Algerian international prefix (+213 / 00213) folded to the local leading 0,
 * so "0550 12 34 56" and "+213 550 123 456" are recognised as the same number.
 */
const phoneKey = (v) => {
  let s = toLatinDigits(cleanPhone(v)).replace(/\./g, '');
  if (s.startsWith('+213')) s = `0${s.slice(4)}`;
  else if (s.startsWith('00213')) s = `0${s.slice(5)}`;
  return s.replace(/\D/g, '');
};

/**
 * @returns {{value: string|null, error?: string, warning?: string}}
 * A 9-digit number starting 5/6/7 is an Algerian mobile whose leading 0 was eaten
 * by Excel's number formatting — restore it, and SAY so (warning), never silently.
 */
function parsePhone(raw) {
  if (isBlank(raw)) return { value: null };
  const v = toLatinDigits(String(raw)).replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(v)) return { value: null, error: 'رقم الهاتف يحتوي على رموز غير صالحة' };
  const digits = v.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return { value: null, error: 'رقم الهاتف غير صالح (عدد الأرقام غير صحيح)' };
  if (/^[567]\d{8}$/.test(v)) {
    return { value: `0${v}`, warning: 'أُضيف الصفر في بداية رقم الهاتف (يحذفه Excel عند حفظ الأرقام)' };
  }
  return { value: v };
}

// ── Dates ─────────────────────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

function validYmd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Excel serial day number (1900 date system) → ISO date, or null. */
function excelSerialToIso(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 1 || n > 2958465) return null;
  // Excel day 0 = 1899-12-30 (accounts for the fictitious 1900-02-29).
  const ms = Math.round((Math.floor(n) - 25569) * 86400000);
  const d = new Date(ms);
  return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Accepts YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (the
 * Algerian day-first convention), an ISO datetime, or an Excel serial number.
 * @returns {{value: string|null, error?: string}}  value = "YYYY-MM-DD"
 */
function parseDateValue(raw, label = 'التاريخ') {
  if (isBlank(raw)) return { value: null };
  const s = toLatinDigits(String(raw)).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? { value: isoDate(y, mo, d) } : { value: null, error: `${label} غير صالح` };
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? { value: isoDate(y, mo, d) } : { value: null, error: `${label} غير صالح` };
  }
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const iso = excelSerialToIso(s);
    if (iso) return { value: iso };
  }
  return { value: null, error: `${label} غير مفهوم — استعمل الصيغة يوم/شهر/سنة (مثال: 14/05/2008)` };
}

const todayIso = (now) => isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());

function parseBirthDate(raw, now = new Date()) {
  const r = parseDateValue(raw, 'تاريخ الازدياد');
  if (r.error || r.value === null) return r;
  if (r.value > todayIso(now)) return { value: null, error: 'تاريخ الازدياد في المستقبل' };
  if (Number(r.value.slice(0, 4)) < 1930) return { value: null, error: 'تاريخ الازدياد غير منطقي' };
  return r;
}

// ── Study level (المستوى الدراسي) ────────────────────────────────────────────

const ORDINALS = {
  'اولي': 1, 'الاولي': 1, 'اول': 1, 'الاول': 1,
  'ثانيه': 2, 'الثانيه': 2, 'ثاني': 2, 'الثاني': 2,
  'ثالثه': 3, 'الثالثه': 3, 'ثالث': 3, 'الثالث': 3,
  'رابعه': 4, 'الرابعه': 4, 'رابع': 4, 'الرابع': 4,
};
const STAGES = {
  'متوسط': 'mid', 'المتوسط': 'mid', 'متوسطه': 'mid', 'م': 'mid',
  'ثانوي': 'sec', 'الثانوي': 'sec', 'ثانويه': 'sec', 'ث': 'sec',
};

const LEVEL_EXAMPLES = 'أمثلة مقبولة: «ثانية ثانوي»، «2AS»، «4AM»، «sec2»';

function levelFrom(stage, n) {
  return STUDY_LEVELS.find((l) => l.stage === stage && l.n === n) || null;
}

/**
 * Parse the educational level from any common spelling into the canonical
 * studyYear id: "sec2", "ثانية ثانوي", "السنة الثانية ثانوي", "2 ثانوي", "2AS",
 * "2ème AS", "4AM", "4 AM", "٢ ثانوي" …
 * @returns {{value: string|null, error?: string}}
 */
function parseLevel(raw) {
  if (isBlank(raw)) return { value: null };
  const original = String(raw).trim();
  const lower = original.toLowerCase();
  if (LEVEL_BY_ID.has(lower)) return { value: lower };

  // Latin shorthand used in Algerian schools: 1AM…4AM (moyen), 1AS…3AS (secondaire).
  const latin = toLatinDigits(lower)
    .replace(/[\s.\-_]/g, '')
    .replace(/^(\d)(?:ère|ere|er|ème|eme|e|st|nd|rd|th)/, '$1')
    .replace(/année|annee/g, '');
  let m = latin.match(/^(\d)a?([ms])$/) || latin.match(/^(\d)(am|as)$/);
  if (m) {
    const stage = (m[2] === 'm' || m[2] === 'am') ? 'mid' : 'sec';
    const lvl = levelFrom(stage, Number(m[1]));
    return lvl ? { value: lvl.id } : { value: null, error: `مستوى دراسي غير موجود: «${original}»` };
  }

  // Arabic: [السنة] <ordinal|digit> <stage>
  const words = normalizeArabic(original).replace(/^السنه\s*/, '').split(' ').filter(Boolean);
  if (words.length >= 2) {
    const first = words[0];
    const stageWord = words.slice(1).join(' ');
    const n = /^\d$/.test(first) ? Number(first) : ORDINALS[first];
    const stage = STAGES[stageWord];
    if (n && stage) {
      const lvl = levelFrom(stage, n);
      return lvl ? { value: lvl.id } : { value: null, error: `مستوى دراسي غير موجود: «${original}»` };
    }
  }
  // "2ثانوي" / "4متوسط" written without a space.
  m = normalizeArabic(original).match(/^(\d)\s*(متوسط|ثانوي)$/);
  if (m) {
    const lvl = levelFrom(STAGES[m[2]], Number(m[1]));
    return lvl ? { value: lvl.id } : { value: null, error: `مستوى دراسي غير موجود: «${original}»` };
  }
  return { value: null, error: `مستوى دراسي غير معروف: «${original}» (${LEVEL_EXAMPLES})` };
}

// ── Academic year (السنة الدراسية) ────────────────────────────────────────────

/** "2026-2027", "2026/2027", "2026 - 2027", Arabic-Indic digits … → "2026-2027". */
function parseAcademicYearValue(raw) {
  if (isBlank(raw)) return { value: null };
  const s = toLatinDigits(String(raw)).replace(/\s+/g, '').replace('/', '-');
  const parsed = academicYear.parseAcademicYearLabel(s);
  if (!parsed) return { value: null, error: `سنة دراسية غير صالحة: «${String(raw).trim()}» (الصيغة: 2026-2027)` };
  return { value: `${parsed.startYear}-${parsed.endYear}` };
}

/**
 * The academic years a NEW student may be registered for right now: the current
 * one and the next (pre-registration). Mirrors the platform rule that years are
 * derived from the date — finished years are history, never written to.
 */
function allowedAcademicYears(now = new Date()) {
  const current = academicYear.getAcademicYearLabel(now);
  const start = academicYear.getAcademicYearStartYear(now);
  return { current, next: `${start + 1}-${start + 2}` };
}

// ── Annual fee status (الرسوم السنوية) ───────────────────────────────────────

const PAID_TOKENS = new Set([
  'مدفوع', 'مدفوعه', 'مدفوعه بالكامل', 'دفع', 'تم الدفع', 'خالص', 'نعم',
  'paid', 'yes', 'y', 'true', '1', '✓', '✔', 'payé', 'paye', 'oui',
]);
const UNPAID_TOKENS = new Set([
  'غير مدفوع', 'غيرمدفوع', 'غير مدفوعه', 'لم يدفع', 'لا', 'لم تدفع',
  'unpaid', 'not paid', 'no', 'n', 'false', '0', '✗', '✘', 'non payé', 'non paye', 'impayé', 'impaye', 'non',
]);

/** @returns {{value: 'paid'|'unpaid'|null, error?: string}} */
function parseFeeStatus(raw) {
  if (isBlank(raw)) return { value: null };
  const s = normalizeArabic(raw);
  if (PAID_TOKENS.has(s)) return { value: 'paid' };
  if (UNPAID_TOKENS.has(s)) return { value: 'unpaid' };
  return { value: null, error: `حالة الرسوم السنوية غير مفهومة: «${String(raw).trim()}» (استعمل «مدفوع» أو «غير مدفوع»)` };
}

// ── Distinguished-subjects average (معدل المواد المميزة) ────────────────────

/** Reuses the support-eligibility validator + classifier (single source of truth). */
function parseAverage(raw) {
  if (isBlank(raw)) return { value: null, classification: null };
  const v = validateAverage(toLatinDigits(String(raw)).trim());
  if (!v.valid) return { value: null, classification: null, error: `معدل المواد المميزة: ${v.error}` };
  return { value: v.value, classification: classify(v.value) };
}

module.exports = {
  EMAIL_RE,
  STUDY_LEVELS,
  schoolLevelOf,
  levelLabel,
  toLatinDigits,
  isBlank,
  cleanText,
  normalizeArabic,
  parseOptionalText,
  parseEmail,
  cleanPhone,
  phoneKey,
  parsePhone,
  excelSerialToIso,
  parseDateValue,
  parseBirthDate,
  parseLevel,
  parseAcademicYearValue,
  allowedAcademicYears,
  parseFeeStatus,
  parseAverage,
};
