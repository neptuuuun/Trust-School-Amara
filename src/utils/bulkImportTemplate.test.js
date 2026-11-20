import { unzipSync, strFromU8 } from 'fflate';
import { readXlsx } from './xlsx';
import {
  IMPORT_FIELDS, normalizeHeader, autoMapHeaders, mappingIsUsable, applyMapping, templateHeader,
  buildTemplateXlsx, buildTemplateCsv, csvCell, credentialRows, buildCredentialsXlsx, buildCredentialsCsv,
  buildResultsCsv,
} from './bulkImportTemplate';

describe('header normalisation + auto-mapping', () => {
  it('maps every template header back to its own field', () => {
    const headers = IMPORT_FIELDS.map(templateHeader);
    const { mapping, unmapped } = autoMapHeaders(headers);
    expect(unmapped).toEqual([]);
    IMPORT_FIELDS.forEach((f) => expect(mapping[f.key]).toBe(templateHeader(f)));
  });

  it('accepts common spellings in Arabic, English and French', () => {
    const { mapping } = autoMapHeaders(['الإسم الكامل', 'E-mail', 'Téléphone', 'Niveau', 'السنة الدراسية', 'حالة الرسوم', 'Date de naissance']);
    expect(mapping).toMatchObject({
      fullName: 'الإسم الكامل', email: 'E-mail', phone: 'Téléphone', studyYear: 'Niveau',
      academicYear: 'السنة الدراسية', annualFeeStatus: 'حالة الرسوم', birthDate: 'Date de naissance',
    });
  });

  it('never confuses «السنة» (level) with «السنة الدراسية» (academic year)', () => {
    const { mapping } = autoMapHeaders(['السنة', 'السنة الدراسية']);
    expect(mapping.studyYear).toBe('السنة');
    expect(mapping.academicYear).toBe('السنة الدراسية');
  });

  it('leaves unknown columns unmapped instead of guessing', () => {
    const { mapping, unmapped } = autoMapHeaders(['الاسم', 'ملاحظات المعلم', 'رقم']);
    expect(mapping.fullName).toBe('الاسم');
    expect(unmapped).toEqual(['ملاحظات المعلم', 'رقم']);
  });

  it('normalises BOM, parentheses, punctuation and Arabic letter variants', () => {
    expect(normalizeHeader('﻿الاسم الكامل (إلزامي) *')).toBe(normalizeHeader('الأسم  الكامل'));
    expect(normalizeHeader('full_name')).toBe(normalizeHeader('Full Name'));
  });

  it('a mapping is usable only when name, email AND phone columns are all mapped', () => {
    expect(mappingIsUsable({ fullName: 'a', email: 'b', phone: 'c' })).toBe(true);
    expect(mappingIsUsable({ fullName: 'a', email: 'b' })).toBe(false);
    expect(mappingIsUsable({ fullName: 'a', phone: 'c' })).toBe(false);
    expect(mappingIsUsable({ email: 'b', phone: 'c' })).toBe(false);
  });

  it('applyMapping produces canonical rows and keeps spreadsheet line numbers', () => {
    const rows = applyMapping([{ __row: 7, Name: ' أمين ', Mail: 'a@x.com', Extra: 'z' }], { fullName: 'Name', email: 'Mail' });
    expect(rows).toEqual([{ __row: 7, fullName: 'أمين', email: 'a@x.com' }]);
  });
});

describe('templates', () => {
  it('the Excel template has a header-only data sheet and an instructions sheet', () => {
    const bytes = buildTemplateXlsx({ academicYears: ['2026-2027', '2027-2028'] });
    const parsed = readXlsx(bytes);
    expect(parsed.sheetName).toBe('الطلاب');
    expect(parsed.headers).toEqual(IMPORT_FIELDS.map(templateHeader));
    expect(parsed.rows).toEqual([]); // no sample rows that could be imported by mistake
    const files = unzipSync(bytes);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('أولى متوسط');   // level drop-down
    expect(sheet).toContain('غير مدفوع');    // fee drop-down
    expect(sheet).toContain('2026-2027');     // academic-year drop-down
    expect(strFromU8(files['xl/workbook.xml'])).toContain('التعليمات');
  });

  it('marks name, email and phone as required and everything else as optional', () => {
    const headers = IMPORT_FIELDS.map(templateHeader);
    expect(headers.filter((h) => h.endsWith('(إلزامي)'))).toEqual([
      'الاسم الكامل (إلزامي)', 'البريد الإلكتروني (إلزامي)', 'رقم الهاتف (إلزامي)',
    ]);
    expect(headers.filter((h) => h.endsWith('(اختياري)'))).toHaveLength(IMPORT_FIELDS.length - 3);
    expect(headers).toContain('المستوى الدراسي (اختياري)');
  });

  it('the instructions sheet states that email and phone are required', () => {
    const instructions = strFromU8(unzipSync(buildTemplateXlsx({ academicYears: [] }))['xl/worksheets/sheet2.xml']);
    expect(instructions).toContain('الاسم الكامل + البريد الإلكتروني + رقم الهاتف');
    expect(instructions).not.toContain('البريد الإلكتروني أو رقم الهاتف');
  });

  it('the CSV template is a BOM-prefixed header row only', () => {
    const csv = buildTemplateCsv();
    expect(csv.startsWith('﻿الاسم الكامل (إلزامي),')).toBe(true);
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });
});

describe('CSV safety', () => {
  it('neutralises spreadsheet formula injection', () => {
    expect(csvCell('=cmd|"/c calc"!A1')).toBe('"\'=cmd|""/c calc""!A1"');
    expect(csvCell('+213550')).toBe("'+213550");
    expect(csvCell('@SUM(1)')).toBe("'@SUM(1)");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('أمين, بن علي')).toBe('"أمين, بن علي"');
    expect(csvCell(null)).toBe('');
  });
});

describe('credential export', () => {
  // Two chunks: per-request indexes collide (0, 0) — rows must be matched by line.
  const results = [
    { index: 0, row: 2, status: 'created', name: 'أمين', email: 'amine@x.com', account: { status: 'active' } },
    { index: 1, row: 3, status: 'error', name: 'خطأ', reason: 'x' },
    { index: 0, row: 4, status: 'created', name: 'سارة', email: 'sara@x.com', account: { status: 'active' } },
    { index: 1, row: 5, status: 'created', name: 'يوسف', email: '', account: { status: 'none' } },
    { index: 2, row: 6, status: 'created', name: 'فشل', email: 'fail@x.com', account: { status: 'failed', reason: 'البريد مستخدم' } },
    { index: 3, row: 7, status: 'skipped', name: 'مكرر', reason: 'dup' },
  ];
  const credentials = [
    { index: 0, row: 2, name: 'أمين', email: 'amine@x.com', temporaryPassword: 'Pw#A2bc3Def4' },
    { index: 0, row: 4, name: 'سارة', email: 'sara@x.com', temporaryPassword: 'Pw#S5tu6Vwx7' },
  ];

  it('lists every imported student with the RIGHT password (matched by spreadsheet row)', () => {
    const rows = credentialRows(results, credentials);
    expect(rows.map((r) => [r.name, r.email, r.password, r.status])).toEqual([
      ['أمين', 'amine@x.com', 'Pw#A2bc3Def4', 'تم إنشاء الحساب'],
      ['سارة', 'sara@x.com', 'Pw#S5tu6Vwx7', 'تم إنشاء الحساب'],
      ['يوسف', '', '', 'بدون حساب (لا يوجد بريد)'],
      ['فشل', 'fail@x.com', '', 'فشل إنشاء الحساب'],
    ]);
    expect(rows[3].note).toBe('البريد مستخدم');
  });

  it('the Excel export reads back with the exact name ↔ email ↔ password mapping', () => {
    const parsed = readXlsx(buildCredentialsXlsx(credentialRows(results, credentials)));
    expect(parsed.sheetName).toBe('بيانات الدخول');
    expect(parsed.headers).toEqual(['#', 'الاسم الكامل', 'البريد الإلكتروني', 'كلمة المرور المؤقتة', 'حالة الحساب', 'ملاحظة']);
    const map = parsed.rows.map((r) => [r['الاسم الكامل'], r['البريد الإلكتروني'], r['كلمة المرور المؤقتة']]);
    expect(map.slice(0, 2)).toEqual([
      ['أمين', 'amine@x.com', 'Pw#A2bc3Def4'],
      ['سارة', 'sara@x.com', 'Pw#S5tu6Vwx7'],
    ]);
  });

  it('the CSV export contains the same rows', () => {
    const csv = buildCredentialsCsv(credentialRows(results, credentials));
    expect(csv).toContain('أمين,amine@x.com,Pw#A2bc3Def4');
    expect(csv).toContain('سارة,sara@x.com,Pw#S5tu6Vwx7');
  });

  it('the results report never contains a password', () => {
    const csv = buildResultsCsv(results);
    credentials.forEach((c) => expect(csv).not.toContain(c.temporaryPassword));
    expect(csv).toContain('فشل إنشاء الحساب — البريد مستخدم');
  });
});
