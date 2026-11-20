/**
 * bulkImportValidation.js
 * -----------------------
 * Pure, firebase-free validation + duplicate-decision helpers for the student
 * bulk importer. Kept separate from the controller (which owns the Firestore
 * reads + creation) so this critical logic is unit-testable without the Admin SDK.
 *
 * Field parsing is delegated to studentFields.js — the SAME parsers individual
 * registration uses — so the importer and the manual form can never disagree.
 *
 * REQUIRED vs OPTIONAL (the only things that can make a row fail):
 *   • الاسم الكامل        — required.
 *   • البريد الإلكتروني  — required (every imported student gets a login account).
 *   • رقم الهاتف         — required.
 *     A missing value fails ONLY that row, with an error naming the field.
 *   • Everything else is optional: blank cells stay EMPTY on the profile.
 *   • A value that IS provided must be valid (a typo is reported, never dropped).
 *   • Annual fee «مدفوع» requires the educational level — same rule as the
 *     individual registration form ("choose the level when recording the fee").
 *
 * Each row yields { candidate, warnings } or { error, errors[], warnings }.
 */

const { normalizeSchool } = require('../constants');
const F = require('./studentFields');
const academicYear = require('./academicYear');

const MAX_ROWS = 500;
const { EMAIL_RE, cleanPhone, phoneKey } = F;

const pad2 = (n) => String(n).padStart(2, '0');
/** "YYYY-MM-DD" of a Date in the server's local calendar. */
const localIsoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * The instant to record for a validated "YYYY-MM-DD" payment date: now when it
 * is today (never a time in the future), else local noon of that day — so the
 * academic-year label derived from it cannot shift with the server's timezone.
 * @returns {?string}
 */
function paymentInstant(isoDate, now = new Date()) {
  if (!isoDate) return null;
  if (isoDate === localIsoDate(now)) return now.toISOString();
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

/** Context for one import request (dates resolved once, server-side). */
function buildContext({ now = new Date(), defaultAcademicYear = null } = {}) {
  const { current, next } = F.allowedAcademicYears(now);
  return { now, currentAcademicYear: current, nextAcademicYear: next, defaultAcademicYear: defaultAcademicYear || current };
}

/**
 * Validate the admin-chosen default academic year (wizard selector).
 * @returns {{value: string, error?: string}}
 */
function resolveDefaultAcademicYear(raw, now = new Date()) {
  const { current, next } = F.allowedAcademicYears(now);
  if (F.isBlank(raw)) return { value: current };
  const r = F.parseAcademicYearValue(raw);
  if (r.error) return { value: current, error: r.error };
  if (r.value !== current && r.value !== next) {
    return { value: current, error: `السنة الدراسية يجب أن تكون ${current} أو ${next}` };
  }
  return { value: r.value };
}

const pickRaw = (raw, ...keys) => {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') return raw[k];
  }
  return '';
};

/**
 * Validate + normalize one raw row into a creation candidate.
 * @param {object} raw
 * @param {string} branchId
 * @param {object} [ctx]  from buildContext(); defaults to "now, current year"
 * @returns {{candidate: object, warnings: string[]} | {error: string, errors: string[], warnings: string[]}}
 */
function normalizeRow(raw = {}, branchId, ctx = buildContext()) {
  const errors = [];
  const warnings = [];
  const take = (r) => {
    if (r.error) errors.push(r.error);
    if (r.warning) warnings.push(r.warning);
    return r.value;
  };

  // ── Identity & contact ─────────────────────────────────────────────────────
  const fullName = F.cleanText(pickRaw(raw, 'fullName', 'name')) || '';
  if (!fullName) errors.push('الاسم الكامل مطلوب');
  else if (fullName.length > 120) errors.push('الاسم الكامل طويل جداً');

  const email = take(F.parseEmail(pickRaw(raw, 'email')));
  const phone = take(F.parsePhone(pickRaw(raw, 'phone', 'phoneNumber')));
  // Both contact fields are REQUIRED. A blank value gets its own error; a value
  // that is present but malformed is already reported by its parser above.
  if (F.isBlank(pickRaw(raw, 'email'))) errors.push('البريد الإلكتروني مطلوب');
  if (F.isBlank(pickRaw(raw, 'phone', 'phoneNumber'))) errors.push('رقم الهاتف مطلوب');

  const rowBranch = String(pickRaw(raw, 'branch', 'branchId')).trim();
  if (rowBranch && rowBranch !== branchId) errors.push('الفرع لا يطابق فرع المشرف');

  // ── Personal data (optional) ───────────────────────────────────────────────
  const rawSchool = pickRaw(raw, 'school');
  const school = normalizeSchool(rawSchool);
  if (F.isBlank(rawSchool)) warnings.push('المؤسسة التعليمية فارغة — ستُسجَّل «حر» (غير منتسب)');
  const birthDate  = take(F.parseBirthDate(pickRaw(raw, 'birthDate'), ctx.now));
  const birthPlace = take(F.parseOptionalText(pickRaw(raw, 'birthPlace'), { max: 120, label: 'مكان الازدياد' }));
  const address    = take(F.parseOptionalText(pickRaw(raw, 'address'), { max: 250, label: 'العنوان' }));

  // ── Academic data (optional) ───────────────────────────────────────────────
  let rowYear = take(F.parseAcademicYearValue(pickRaw(raw, 'academicYear')));
  if (rowYear && rowYear !== ctx.currentAcademicYear && rowYear !== ctx.nextAcademicYear) {
    const parsed = academicYear.parseAcademicYearLabel(rowYear);
    const currentStart = academicYear.parseAcademicYearLabel(ctx.currentAcademicYear).startYear;
    errors.push(parsed && parsed.startYear < currentStart
      ? `لا يمكن تسجيل طالب جديد في سنة دراسية منتهية (${rowYear})`
      : `السنة الدراسية ${rowYear} لم تُفتح بعد للتسجيل`);
    rowYear = null;
  }
  const studentYear = rowYear || ctx.defaultAcademicYear;
  if (studentYear === ctx.nextAcademicYear) warnings.push(`مُسجَّل للسنة الدراسية القادمة ${studentYear}`);

  const levelR = F.parseLevel(pickRaw(raw, 'studyYear', 'level', 'grade'));
  const studyYear = take(levelR);

  const avg = F.parseAverage(pickRaw(raw, 'distinguishedSubjectsAverage', 'average'));
  if (avg.error) errors.push(avg.error);

  // ── Annual fee (optional; blank = not paid) ────────────────────────────────
  const feeParsed = F.parseFeeStatus(pickRaw(raw, 'annualFeeStatus', 'annualFee'));
  if (feeParsed.error) errors.push(feeParsed.error);
  const feeStatus = feeParsed.value || 'unpaid';
  const feeDefaulted = !feeParsed.value && !feeParsed.error;

  const paidAtRaw = pickRaw(raw, 'annualFeePaidAt', 'paidAt');
  const paidAtR = F.parseDateValue(paidAtRaw, 'تاريخ دفع الرسوم');
  if (paidAtR.error) errors.push(paidAtR.error);
  const paidAt = paidAtR.value;

  if (feeStatus === 'paid') {
    if (!studyYear && !levelR.error) {
      errors.push('حدد المستوى الدراسي عند تسجيل الرسوم السنوية كمدفوعة');
    }
    if (studentYear === ctx.nextAcademicYear) {
      errors.push(`لا يمكن تسجيل الرسوم السنوية مسبقاً لسنة لم تبدأ بعد (${studentYear})`);
    } else if (paidAt) {
      // Compare CALENDAR dates: a payment dated today is valid at any hour.
      const [y, m, d] = paidAt.split('-').map(Number);
      const paidDate = new Date(y, m - 1, d, 12);
      if (paidAt > localIsoDate(ctx.now)) {
        errors.push('تاريخ دفع الرسوم في المستقبل');
      } else if (academicYear.getAcademicYearLabel(paidDate) !== studentYear) {
        errors.push(`تاريخ دفع الرسوم لا يقع ضمن السنة الدراسية ${studentYear}`);
      }
    }
  } else if (paidAt) {
    errors.push('يوجد تاريخ دفع للرسوم بينما الحالة ليست «مدفوع» — صحّح أحدهما');
  }

  if (errors.length) {
    return { error: errors.join(' · '), errors, warnings };
  }

  return {
    candidate: {
      fullName,
      email,
      phone,
      phoneKey: phone ? phoneKey(phone) : '',
      school,
      birthDate,
      birthPlace,
      address,
      academicYear: studentYear,
      studyYear,
      studyYearLabel: F.levelLabel(studyYear),
      schoolLevel: F.schoolLevelOf(studyYear),
      distinguishedSubjectsAverage: avg.value,
      supportClassification: avg.classification,
      annualFee: { status: feeStatus, defaulted: feeDefaulted, paidAt: feeStatus === 'paid' ? paidAt : null },
      accountEligible: Boolean(email),
    },
    warnings,
  };
}

/**
 * Decide whether a candidate is a duplicate — within the current batch, against
 * existing branch students, or against an existing login account. Returns an
 * Arabic reason string, or null when unique.
 * @param {{email:?string, phone:?string}} candidate   phone = comparison key
 * @param {{seenEmails:Set, seenPhones:Set, existingEmails:Set, existingPhones:Set, authEmails?:Set}} sets
 */
function duplicateReason(candidate, sets) {
  const { seenEmails, seenPhones, existingEmails, existingPhones, authEmails } = sets;
  const email = candidate.email || '';
  const phone = candidate.phone ? phoneKey(candidate.phone) : '';
  if (email && seenEmails.has(email)) return 'بريد مكرر داخل الملف';
  if (phone && seenPhones.has(phone)) return 'هاتف مكرر داخل الملف';
  if (email && existingEmails.has(email)) return 'البريد مسجل مسبقاً';
  if (phone && existingPhones.has(phone)) return 'الهاتف مسجل مسبقاً';
  if (email && authEmails && authEmails.has(email)) return 'البريد مرتبط بحساب دخول موجود';
  return null;
}

module.exports = {
  MAX_ROWS,
  EMAIL_RE,
  cleanPhone,
  phoneKey,
  buildContext,
  resolveDefaultAcademicYear,
  normalizeRow,
  duplicateReason,
  localIsoDate,
  paymentInstant,
};
