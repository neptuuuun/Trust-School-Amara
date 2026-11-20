/**
 * bulkImportTemplate.js
 * ---------------------
 * Everything the student bulk-import wizard needs on the client:
 *   • IMPORT_FIELDS — the importable student fields (same keys the backend
 *     validates in services/bulkImportValidation.js) with Arabic labels,
 *     requirement level, header aliases and examples.
 *   • Header auto-mapping (exact, normalized — never fuzzy, so a column can
 *     never be silently mapped to the wrong field).
 *   • The downloadable Excel / CSV templates.
 *   • The credential export (Excel / CSV) and the results / issues report.
 *
 * Validation itself is NOT done here: the server is the single authority and
 * returns the per-row verdicts the wizard renders (dry-run preview).
 */

import { buildXlsx, XLSX_STYLE } from './xlsx';

export const REQUIREMENT = Object.freeze({ REQUIRED: 'required', CONTACT: 'contact', OPTIONAL: 'optional' });

const LEVEL_CHOICES = ['أولى متوسط', 'ثانية متوسط', 'ثالثة متوسط', 'رابعة متوسط', 'أولى ثانوي', 'ثانية ثانوي', 'ثالثة ثانوي'];
export const FEE_CHOICES = ['مدفوع', 'غير مدفوع'];

export const IMPORT_FIELDS = [
  {
    key: 'fullName', label: 'الاسم الكامل', requirement: REQUIREMENT.REQUIRED, width: 28,
    example: 'محمد أمين بن علي', accepted: 'نص',
    aliases: ['fullName', 'name', 'full name', 'student name', 'nom', 'nom complet', 'الاسم', 'الإسم', 'اسم الطالب', 'الاسم واللقب', 'الاسم و اللقب', 'اللقب والاسم'],
  },
  {
    key: 'email', label: 'البريد الإلكتروني', requirement: REQUIREMENT.REQUIRED, width: 30, text: true,
    example: 'amine@example.com', accepted: 'بريد صالح — يُنشأ به حساب الدخول تلقائياً',
    aliases: ['email', 'e-mail', 'mail', 'البريد', 'البريد الالكتروني', 'الإيميل', 'الايميل', 'بريد الطالب'],
  },
  {
    key: 'phone', label: 'رقم الهاتف', requirement: REQUIREMENT.REQUIRED, width: 18, text: true,
    example: '0550123456', accepted: 'أرقام فقط (مثال: 0550123456 أو ‎+213550123456)',
    aliases: ['phone', 'phoneNumber', 'telephone', 'tel', 'mobile', 'téléphone', 'الهاتف', 'رقم الجوال', 'الجوال', 'هاتف الطالب', 'رقم هاتف'],
  },
  {
    key: 'school', label: 'المؤسسة التعليمية', requirement: REQUIREMENT.OPTIONAL, width: 26,
    example: 'ثانوية الأمل', accepted: 'اسم المؤسسة، أو «حر» إن لم يكن منتسباً (الفارغ يُسجَّل «حر»)',
    aliases: ['school', 'établissement', 'المدرسة', 'المؤسسة', 'المؤسسة التعليمية / المدرسة', 'الثانوية', 'المتوسطة'],
  },
  {
    key: 'birthDate', label: 'تاريخ الازدياد', requirement: REQUIREMENT.OPTIONAL, width: 16, text: true,
    example: '14/05/2009', accepted: 'يوم/شهر/سنة (14/05/2009) أو 2009-05-14',
    aliases: ['birthDate', 'birth date', 'date of birth', 'dob', 'date de naissance', 'تاريخ الميلاد'],
  },
  {
    key: 'birthPlace', label: 'مكان الازدياد', requirement: REQUIREMENT.OPTIONAL, width: 18,
    example: 'بومرداس', accepted: 'نص',
    aliases: ['birthPlace', 'birth place', 'place of birth', 'lieu de naissance', 'مكان الميلاد'],
  },
  {
    key: 'address', label: 'العنوان', requirement: REQUIREMENT.OPTIONAL, width: 30,
    example: 'حي 500 مسكن، بومرداس', accepted: 'نص',
    aliases: ['address', 'adresse', 'عنوان السكن', 'مقر السكن'],
  },
  {
    key: 'academicYear', label: 'السنة الدراسية', requirement: REQUIREMENT.OPTIONAL, width: 16, text: true,
    example: '2026-2027', accepted: 'الفارغ = السنة المختارة في نافذة الاستيراد',
    aliases: ['academicYear', 'academic year', 'school year', 'année scolaire', 'الموسم الدراسي', 'العام الدراسي'],
  },
  {
    key: 'studyYear', label: 'المستوى الدراسي', requirement: REQUIREMENT.OPTIONAL, width: 18,
    example: 'ثانية ثانوي', accepted: 'مثل «ثانية ثانوي» أو «2AS» أو «4AM» — مطلوب إذا كانت الرسوم «مدفوع»',
    aliases: ['studyYear', 'level', 'grade', 'niveau', 'المستوى', 'القسم', 'الصف', 'السنة'],
  },
  {
    key: 'annualFeeStatus', label: 'الرسوم السنوية', requirement: REQUIREMENT.OPTIONAL, width: 16,
    example: 'مدفوع', accepted: '«مدفوع» أو «غير مدفوع» (الفارغ = غير مدفوع)',
    aliases: ['annualFeeStatus', 'annual fee', 'annualFee', 'fee status', 'frais annuels', 'حالة الرسوم', 'الرسوم', 'حالة الدفع', 'حالة الرسوم السنوية'],
  },
  {
    key: 'annualFeePaidAt', label: 'تاريخ دفع الرسوم', requirement: REQUIREMENT.OPTIONAL, width: 16, text: true,
    example: '05/09/2026', accepted: 'فقط إذا كانت الرسوم «مدفوع» (الفارغ = تاريخ الاستيراد)',
    aliases: ['annualFeePaidAt', 'paidAt', 'paid at', 'payment date', 'date de paiement', 'تاريخ الدفع'],
  },
  {
    key: 'distinguishedSubjectsAverage', label: 'معدل المواد المميزة', requirement: REQUIREMENT.OPTIONAL, width: 18,
    example: '12.5', accepted: 'رقم من 0 إلى 20 (لتصنيف دروس الدعم)',
    aliases: ['distinguishedSubjectsAverage', 'average', 'moyenne', 'المعدل', 'معدل المواد'],
  },
];

export const FIELD_BY_KEY = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, f]));

export const requirementLabel = (field) => {
  if (field.requirement === REQUIREMENT.REQUIRED) return 'إلزامي';
  return 'اختياري';
};

/** Header text written in the template, e.g. "الاسم الكامل (إلزامي)". */
export const templateHeader = (field) => `${field.label} (${requirementLabel(field)})`;

// ── Header normalisation + mapping ───────────────────────────────────────────

/**
 * Comparison key for a header: parenthetical notes and every non letter/digit
 * removed, Arabic letter variants unified, Latin lowercased. So
 * "الاسم الكامل (إلزامي)", "الإسم الكامل", "full_name" and "Full Name *" all match
 * their field — but "السنة" (level) and "السنة الدراسية" (academic year) never
 * collide, because matching is exact on the normalized key.
 */
export const normalizeHeader = (h) => String(h ?? '')
  .replace(/^﻿/, '')
  .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
  .toLowerCase()
  .replace(/[ً-ْٰـ]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/[^\p{L}\p{N}]/gu, '');

const ALIAS_INDEX = (() => {
  const idx = new Map();
  IMPORT_FIELDS.forEach((f) => {
    [f.key, f.label, templateHeader(f), ...f.aliases].forEach((a) => {
      const k = normalizeHeader(a);
      if (k && !idx.has(k)) idx.set(k, f.key);
    });
  });
  return idx;
})();

/**
 * @param {string[]} headers
 * @returns {{ mapping: Record<string,string>, unmapped: string[] }}
 *          mapping = fieldKey → header (first matching header wins)
 */
export function autoMapHeaders(headers) {
  const mapping = {};
  const unmapped = [];
  headers.forEach((h) => {
    const key = ALIAS_INDEX.get(normalizeHeader(h));
    if (key && !mapping[key]) mapping[key] = h;
    else unmapped.push(h);
  });
  return { mapping, unmapped };
}

/** Is the mapping enough to import anything? (every REQUIRED field has a column) */
export const mappingIsUsable = (mapping) => IMPORT_FIELDS
  .filter((f) => f.requirement === REQUIREMENT.REQUIRED)
  .every((f) => Boolean(mapping[f.key]));

/** Raw parsed rows → canonical rows the API expects ({ __row, fullName, email, … }). */
export function applyMapping(rows, mapping) {
  return rows.map((r, i) => {
    const out = { __row: r.__row || i + 2 };
    IMPORT_FIELDS.forEach((f) => {
      const h = mapping[f.key];
      if (h) out[f.key] = r[h] == null ? '' : String(r[h]).trim();
    });
    return out;
  });
}

// ── Templates ────────────────────────────────────────────────────────────────

const headerStyle = (f) => (f.requirement === REQUIREMENT.REQUIRED ? XLSX_STYLE.HEADER_REQUIRED
  : f.requirement === REQUIREMENT.CONTACT ? XLSX_STYLE.HEADER_CONDITIONAL : XLSX_STYLE.HEADER_OPTIONAL);

/**
 * The Excel template: a header-only data sheet (no sample rows that could be
 * imported by mistake as fake students) + an instructions sheet with examples.
 * @param {{ academicYears: string[] }} opts  e.g. ['2026-2027', '2027-2028']
 */
export function buildTemplateXlsx({ academicYears = [] } = {}) {
  const col = (key) => IMPORT_FIELDS.findIndex((f) => f.key === key);
  const students = {
    name: 'الطلاب',
    rtl: true,
    freezeHeader: true,
    headerHeight: 42,
    columns: IMPORT_FIELDS.map((f) => ({ width: f.width, style: f.text ? XLSX_STYLE.TEXT : undefined })),
    rows: [IMPORT_FIELDS.map((f) => ({ v: templateHeader(f), s: headerStyle(f) }))],
    validations: [
      { column: col('studyYear'), list: LEVEL_CHOICES, promptTitle: 'المستوى الدراسي', prompt: 'اختر من القائمة أو اكتب مثل 2AS / 4AM' },
      { column: col('annualFeeStatus'), list: FEE_CHOICES, promptTitle: 'الرسوم السنوية', prompt: 'مدفوع أو غير مدفوع — الفارغ يعني غير مدفوع' },
      { column: col('academicYear'), list: academicYears, promptTitle: 'السنة الدراسية', prompt: 'الفارغ = السنة المختارة عند الاستيراد' },
    ],
  };
  const W = XLSX_STYLE.WRAP;
  const instructions = {
    name: 'التعليمات',
    rtl: true,
    columns: [{ width: 24 }, { width: 26 }, { width: 60 }, { width: 24 }],
    rows: [
      [{ v: 'العمود', s: XLSX_STYLE.HEADER_PLAIN }, { v: 'الحالة', s: XLSX_STYLE.HEADER_PLAIN },
        { v: 'القيم المقبولة / ملاحظات', s: XLSX_STYLE.HEADER_PLAIN }, { v: 'مثال', s: XLSX_STYLE.HEADER_PLAIN }],
      ...IMPORT_FIELDS.map((f) => [
        { v: f.label, s: headerStyle(f) }, { v: requirementLabel(f), s: W }, { v: f.accepted, s: W }, { v: f.example, s: W },
      ]),
      [],
      [{ v: 'قواعد عامة', s: XLSX_STYLE.HEADER_PLAIN }],
      [{ v: '• املأ ورقة «الطلاب» بدءاً من السطر الثاني، طالب واحد في كل سطر، ولا تغيّر أسماء الأعمدة.', s: W }],
      [{ v: '• الإلزامي فقط: الاسم الكامل + البريد الإلكتروني + رقم الهاتف. الصف الذي ينقصه أحدها لا يُستورد. اترك أي خانة أخرى فارغة إن لم تتوفر المعلومة.', s: W }],
      [{ v: '• كل طالب يحصل تلقائياً على حساب دخول وكلمة مرور مؤقتة خاصة به، تُنزَّل في ملف منفصل بعد الاستيراد.', s: W }],
      [{ v: '• الطلاب المكررون (نفس البريد أو الهاتف) يُتجاهلون تلقائياً، لذا يمكن إعادة رفع الملف نفسه بأمان.', s: W }],
    ],
  };
  return buildXlsx({ sheets: [students, instructions] });
}

/** CSV template: header row only, UTF-8 with BOM (Excel-friendly Arabic). */
export const buildTemplateCsv = () => `﻿${IMPORT_FIELDS.map((f) => csvCell(templateHeader(f))).join(',')}\r\n`;

// ── CSV safety ───────────────────────────────────────────────────────────────

/**
 * One CSV cell: neutralizes spreadsheet formula injection (a value starting
 * with = + - @ TAB CR is prefixed with ') and quotes when needed.
 */
export const csvCell = (value) => {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvOf = (header, rows) => `﻿${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

// ── Credentials export ───────────────────────────────────────────────────────

const ACCOUNT_LABEL = {
  active: 'تم إنشاء الحساب',
  failed: 'فشل إنشاء الحساب',
  none: 'بدون حساب (لا يوجد بريد)',
};

/**
 * Rows for the credential export: EVERY imported student, so the admin has one
 * complete distribution list — a password only where an account now exists.
 * Rows are matched by spreadsheet line (`row`), which stays unique across the
 * chunked requests of one import (per-request `index` values do not).
 * @param {Array} results      import results (status 'created' rows are used)
 * @param {Array} credentials  [{ row, uid, name, email, temporaryPassword }]
 */
export function credentialRows(results, credentials) {
  const byRow = new Map(credentials.map((c) => [c.row, c]));
  return results
    .filter((r) => r.status === 'created')
    .sort((a, b) => a.row - b.row)
    .map((r, i) => {
      const c = byRow.get(r.row);
      const status = r.account?.status || 'none';
      return {
        n: i + 1,
        row: r.row,
        name: r.name,
        email: c?.email || r.email || '',
        password: c?.temporaryPassword || '',
        status: ACCOUNT_LABEL[status] || status,
        note: status === 'failed' ? (r.account?.reason || '') : status === 'none' ? 'أنشئ الحساب لاحقاً من صفحة الطلاب' : 'يُطلب تغيير كلمة المرور عند أول دخول',
      };
    });
}

const CREDENTIAL_HEADER = ['#', 'الاسم الكامل', 'البريد الإلكتروني', 'كلمة المرور المؤقتة', 'حالة الحساب', 'ملاحظة'];
const credentialCells = (r) => [String(r.n), r.name, r.email, r.password, r.status, r.note];

export function buildCredentialsXlsx(rows) {
  return buildXlsx({
    sheets: [{
      name: 'بيانات الدخول',
      rtl: true,
      freezeHeader: true,
      columns: [{ width: 6 }, { width: 28 }, { width: 32 }, { width: 22, style: XLSX_STYLE.TEXT }, { width: 24 }, { width: 40 }],
      rows: [
        CREDENTIAL_HEADER.map((h) => ({ v: h, s: XLSX_STYLE.HEADER_OPTIONAL })),
        ...rows.map((r) => credentialCells(r).map((v) => ({ v, s: XLSX_STYLE.TEXT }))),
      ],
    }],
  });
}

export const buildCredentialsCsv = (rows) => csvOf(CREDENTIAL_HEADER, rows.map(credentialCells));

// ── Results / issues report (never contains passwords) ──────────────────────

const STATUS_LABEL = { ready: 'جاهز', created: 'تم الاستيراد', skipped: 'مكرر — تم التخطي', error: 'خطأ' };
const FEE_LABEL = { paid: 'مدفوع', unpaid: 'غير مدفوع', failed: 'فشل تسجيل الرسوم' };

export function buildResultsCsv(results) {
  const header = ['السطر', 'الاسم', 'البريد الإلكتروني', 'الهاتف', 'الحالة', 'الأخطاء / السبب', 'تحذيرات', 'حساب الدخول', 'الرسوم السنوية'];
  const rows = [...results].sort((a, b) => a.row - b.row).map((r) => [
    String(r.row), r.name || '', r.email || '', r.phone || '',
    STATUS_LABEL[r.status] || r.status,
    (r.errors && r.errors.length ? r.errors.join(' | ') : r.reason) || '',
    (r.warnings || []).join(' | '),
    r.account ? (ACCOUNT_LABEL[r.account.status] || r.account.status) + (r.account.reason ? ` — ${r.account.reason}` : '') : '',
    r.annualFee ? (FEE_LABEL[r.annualFee.status] || r.annualFee.status) + (r.annualFee.reason ? ` — ${r.annualFee.reason}` : '')
      : r.preview ? (FEE_LABEL[r.preview.annualFeeStatus] || '') : '',
  ]);
  return csvOf(header, rows);
}

// ── Download helper ──────────────────────────────────────────────────────────

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function downloadFile(data, filename, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
