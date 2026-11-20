/**
 * Wizard flow test for the bulk student import.
 *
 * The admin dashboard sits behind a real Firebase login, so the flow is driven
 * here with the backend mocked at the apiCall boundary. What is asserted:
 *   • an .xlsx built from the real template is parsed and auto-mapped;
 *   • the preview sends canonical rows + the chosen academic year as a dry run
 *     and renders errors, warnings, level, fee status and account eligibility;
 *   • the import sends ONLY ready rows, in chunks, never as a dry run;
 *   • the results show every summary figure, and the credential download
 *     contains the right password for each student;
 *   • closing with undownloaded credentials asks for confirmation.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import BulkImportStudentsModal, { summarize } from './BulkImportStudentsModal';
import apiCall from '../../utils/apiClient';
import { buildXlsx, readXlsx } from '../../utils/xlsx';
import { IMPORT_FIELDS, templateHeader, downloadFile } from '../../utils/bulkImportTemplate';

jest.mock('../../utils/apiClient', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../utils/bulkImportTemplate', () => ({
  ...jest.requireActual('../../utils/bulkImportTemplate'),
  downloadFile: jest.fn(),
}));

const header = IMPORT_FIELDS.map(templateHeader);
const col = (key) => IMPORT_FIELDS.findIndex((f) => f.key === key);
const rowOf = (values) => {
  const r = new Array(IMPORT_FIELDS.length).fill('');
  Object.entries(values).forEach(([k, v]) => { r[col(k)] = v; });
  return r;
};

function xlsxFile(rows) {
  const bytes = buildXlsx({ sheets: [{ name: 'الطلاب', rows: [header, ...rows.map(rowOf)] }] });
  const file = new File([bytes], 'students.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  // jsdom's Blob has no arrayBuffer(); the browser's does.
  file.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return file;
}

const preview = (sel) => ({
  name: sel.name, email: sel.email || '', phone: sel.phone || '', warnings: sel.warnings || [],
});

const DRY_RUN = {
  dryRun: true,
  summary: { total: 3, imported: 2, skipped: 0, failed: 1, accountsCreated: 1, withoutEmail: 1, feePaid: 1, feeUnpaid: 1 },
  results: [
    { index: 0, row: 2, status: 'ready', ...preview({ name: 'أمين بن علي', email: 'amine@x.com' }),
      preview: { academicYear: '2026-2027', studyYear: 'sec2', studyYearLabel: 'ثانية ثانوي', annualFeeStatus: 'paid', accountEligible: true } },
    { index: 1, row: 3, status: 'ready', ...preview({ name: 'يوسف', phone: '0770123456', warnings: ['المؤسسة التعليمية فارغة — ستُسجَّل «حر» (غير منتسب)'] }),
      preview: { academicYear: '2026-2027', studyYear: 'mid4', studyYearLabel: 'رابعة متوسط', annualFeeStatus: 'unpaid', accountEligible: false } },
    { index: 2, row: 4, status: 'error', ...preview({ name: '' }), reason: 'الاسم الكامل مطلوب', errors: ['الاسم الكامل مطلوب'] },
  ],
};

const COMMIT = {
  dryRun: false,
  results: [
    { index: 0, row: 2, status: 'created', uid: 'u1', name: 'أمين بن علي', email: 'amine@x.com', warnings: [],
      preview: DRY_RUN.results[0].preview, account: { status: 'active' }, annualFee: { status: 'paid' } },
    { index: 1, row: 3, status: 'created', uid: 'u2', name: 'يوسف', email: '', phone: '0770123456', warnings: [],
      preview: DRY_RUN.results[1].preview, account: { status: 'none' }, annualFee: { status: 'unpaid' } },
  ],
  credentials: [{ index: 0, row: 2, uid: 'u1', name: 'أمين بن علي', email: 'amine@x.com', temporaryPassword: 'Xy7#kLm9Pq2r' }],
};

beforeEach(() => {
  apiCall.mockReset();
  downloadFile.mockReset();
});

async function goToPreview() {
  const onClose = jest.fn();
  const onImported = jest.fn();
  render(<BulkImportStudentsModal open onClose={onClose} onImported={onImported} />);
  const file = xlsxFile([
    { fullName: 'أمين بن علي', email: 'amine@x.com', studyYear: '2AS', annualFeeStatus: 'مدفوع' },
    { fullName: 'يوسف', phone: '770123456', studyYear: '4AM' },
    { email: 'noname@x.com' },
  ]);
  fireEvent.change(screen.getByTestId('bulk-import-file'), { target: { files: [file] } });
  await screen.findByText(/تمت مطابقة الأعمدة تلقائياً/);
  apiCall.mockResolvedValueOnce(DRY_RUN);
  fireEvent.click(screen.getByRole('button', { name: /معاينة والتحقق/ }));
  await screen.findByText(/معاينة فقط/);
  return { onClose, onImported };
}

it('previews, imports in chunks and exports credentials with the right passwords', async () => {
  const { onClose, onImported } = await goToPreview();

  // Dry run: canonical rows, admin-chosen academic year, no writes.
  const [url, opts] = apiCall.mock.calls[0];
  expect(url).toBe('/api/admin/bulk-import-students');
  const body = JSON.parse(opts.body);
  expect(body.dryRun).toBe(true);
  expect(body.defaultAcademicYear).toMatch(/^\d{4}-\d{4}$/);
  expect(body.students).toEqual([
    expect.objectContaining({ __row: 2, fullName: 'أمين بن علي', email: 'amine@x.com', studyYear: '2AS', annualFeeStatus: 'مدفوع' }),
    expect.objectContaining({ __row: 3, fullName: 'يوسف', phone: '770123456', studyYear: '4AM' }),
    expect.objectContaining({ __row: 4, email: 'noname@x.com' }),
  ]);

  // Preview shows level, fee, account eligibility, warnings and errors.
  expect(screen.getByText('ثانية ثانوي')).toBeInTheDocument();
  expect(screen.getByText('سيُنشأ حساب')).toBeInTheDocument();
  expect(screen.getByText('بدون حساب')).toBeInTheDocument();
  expect(screen.getByText(/ستُسجَّل «حر»/)).toBeInTheDocument();
  expect(screen.getByText(/• الاسم الكامل مطلوب/)).toBeInTheDocument();

  // Import: only the 2 ready rows, real (non-dry) request.
  apiCall.mockResolvedValueOnce(COMMIT);
  fireEvent.click(screen.getByRole('button', { name: /استيراد 2 طالب/ }));
  await screen.findByText(/بيانات الدخول المؤقتة/);
  const commitBody = JSON.parse(apiCall.mock.calls[1][1].body);
  expect(commitBody.dryRun).toBe(false);
  expect(commitBody.students.map((s) => s.__row)).toEqual([2, 3]);
  expect(onImported).toHaveBeenCalled();

  // Summary figures.
  const tile = (label) => screen.getByText(label).parentElement;
  expect(tile('تم استيرادهم')).toHaveTextContent('2');
  expect(tile('فشل استيرادهم')).toHaveTextContent('1');
  expect(tile('حسابات أُنشئت')).toHaveTextContent('1');
  expect(tile('بدون بريد إلكتروني')).toHaveTextContent('1');
  expect(tile('الرسوم مدفوعة')).toHaveTextContent('1');
  expect(tile('الرسوم غير مدفوعة')).toHaveTextContent('1');

  // Closing before downloading asks for confirmation.
  fireEvent.click(screen.getByRole('button', { name: 'تم' }));
  expect(await screen.findByText('لم تُنزّل بيانات الدخول')).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));

  // Credential download carries the right password for the right student.
  fireEvent.click(screen.getByRole('button', { name: /بيانات الدخول \(Excel\)/ }));
  expect(downloadFile).toHaveBeenCalledTimes(1);
  const [bytes, filename] = downloadFile.mock.calls[0];
  expect(filename).toMatch(/^بيانات-دخول-الطلاب-.*\.xlsx$/);
  const sheet = readXlsx(bytes);
  expect(sheet.rows.map((r) => [r['الاسم الكامل'], r['البريد الإلكتروني'], r['كلمة المرور المؤقتة']])).toEqual([
    ['أمين بن علي', 'amine@x.com', 'Xy7#kLm9Pq2r'],
    ['يوسف', '', ''],
  ]);

  // After downloading, closing needs no confirmation.
  fireEvent.click(screen.getByRole('button', { name: 'تم' }));
  expect(onClose).toHaveBeenCalled();
});

it('keeps imported rows and reports the rest when a chunk request fails', async () => {
  await goToPreview();
  apiCall.mockRejectedValueOnce(new Error('Network error'));
  fireEvent.click(screen.getByRole('button', { name: /استيراد 2 طالب/ }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/توقف الاستيراد/);
  expect(screen.getByText(/لم يُستورد بسبب انقطاع/)).toBeInTheDocument();
  const pendingTab = screen.getByRole('tab', { name: /لم يُستورد/ });
  expect(within(pendingTab).getByText('(2)')).toBeInTheDocument();
});

it('rejects the legacy .xls format with a clear message', async () => {
  render(<BulkImportStudentsModal open onClose={jest.fn()} />);
  const file = new File(['x'], 'old.xls');
  fireEvent.change(screen.getByTestId('bulk-import-file'), { target: { files: [file] } });
  expect(await screen.findByText(/xls القديمة غير مدعومة/)).toBeInTheDocument();
  expect(apiCall).not.toHaveBeenCalled();
});

describe('summarize', () => {
  it('counts records, accounts and fees separately', () => {
    expect(summarize([
      { status: 'created', account: { status: 'active' }, annualFee: { status: 'paid' } },
      { status: 'created', account: { status: 'failed' }, annualFee: { status: 'failed' } },
      { status: 'created', account: { status: 'none' }, annualFee: { status: 'unpaid' } },
      { status: 'skipped' }, { status: 'error' }, { status: 'pending' },
    ])).toEqual({
      total: 6, imported: 3, skipped: 1, failed: 1, notAttempted: 1,
      accountsCreated: 1, accountsFailed: 1, withoutEmail: 1, feePaid: 1, feeUnpaid: 1, feeFailed: 1,
    });
  });
});
