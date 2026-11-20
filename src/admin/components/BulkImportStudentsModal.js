/**
 * BulkImportStudentsModal — complete bulk student registration from Excel/CSV.
 *
 *   1. النموذج   download the Excel (or CSV) template — required/optional columns
 *   2. الملف     upload .xlsx / .csv, columns auto-mapped (editable), academic year
 *   3. المعاينة  server dry-run: per-row validation, duplicates, account eligibility,
 *                level / year / annual-fee status, errors AND warnings
 *   4. الاستيراد ready rows only, sent in chunks of 50 (progress bar)
 *   5. النتائج   full summary + one-time temporary-credential export (Excel/CSV)
 *
 * The server (POST /api/admin/bulk-import-students) is the single authority for
 * validation, duplicates, record + account creation and annual fees. This
 * component only parses the file, maps columns, and renders the verdicts.
 *
 * Credentials live ONLY in this component's memory: they are never written to
 * localStorage, never logged, and are wiped when the modal closes. Closing with
 * credentials that were not downloaded asks for confirmation first.
 */

import React, { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Download, Loader2, Users,
  KeyRound, ShieldAlert, MailX, Wallet, CircleSlash, Info, ArrowLeft, RotateCcw,
} from 'lucide-react';
import AdminModal from './AdminModal';
import AdminConfirmDialog from './AdminConfirmDialog';
import { Button } from '../../components/ui/button';
import apiCall from '../../utils/apiClient';
import { readXlsx } from '../../utils/xlsx';
import { getAcademicYearLabel, getAcademicYearStartYear } from '../../utils/academicYear';
import {
  IMPORT_FIELDS, REQUIREMENT, requirementLabel, autoMapHeaders, mappingIsUsable, applyMapping,
  buildTemplateXlsx, buildTemplateCsv, credentialRows, buildCredentialsXlsx, buildCredentialsCsv,
  buildResultsCsv, downloadFile, XLSX_MIME,
} from '../../utils/bulkImportTemplate';

const MAX_ROWS = 500;            // mirrors backend MAX_ROWS (one preview request)
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const CHUNK_SIZE = 50;           // students per import request

const STEPS = [
  { id: 'template', label: 'النموذج' },
  { id: 'file', label: 'الملف' },
  { id: 'preview', label: 'المعاينة' },
  { id: 'import', label: 'الاستيراد' },
  { id: 'result', label: 'النتائج' },
];
const STEP_OF = { start: 0, map: 1, preview: 2, importing: 3, result: 4 };

const STATUS_UI = {
  ready:   { Icon: CheckCircle2, cls: 'text-success-600', label: 'جاهز' },
  created: { Icon: CheckCircle2, cls: 'text-success-600', label: 'تم الاستيراد' },
  skipped: { Icon: CircleSlash, cls: 'text-warning-600', label: 'مكرر' },
  error:   { Icon: XCircle, cls: 'text-danger-600', label: 'خطأ' },
  pending: { Icon: Info, cls: 'text-gray-400', label: 'لم يُستورد' },
};

const stamp = () => new Date().toISOString().slice(0, 10);

/** Parse a CSV File into { headers, rows } keeping real spreadsheet line numbers. */
const parseCsv = (file) => new Promise((resolve, reject) => {
  Papa.parse(file, {
    header: false,
    skipEmptyLines: false,
    complete: (res) => {
      const lines = res.data || [];
      const isEmpty = (l) => !l || l.every((v) => String(v ?? '').trim() === '');
      const h = lines.findIndex((l) => !isEmpty(l));
      if (h < 0) { resolve({ headers: [], rows: [] }); return; }
      const headers = lines[h].map((x, i) => String(x ?? '').replace(/^﻿/, '').trim() || `عمود ${i + 1}`);
      const rows = [];
      for (let i = h + 1; i < lines.length; i += 1) {
        if (isEmpty(lines[i])) continue;
        const obj = { __row: i + 1 };
        headers.forEach((col, c) => { obj[col] = String(lines[i][c] ?? '').trim(); });
        rows.push(obj);
      }
      resolve({ headers, rows });
    },
    error: () => reject(new Error('تعذّر قراءة ملف CSV.')),
  });
});

/** Aggregate per-row results into the summary shown on the results step. */
export function summarize(results) {
  const s = {
    total: results.length, imported: 0, skipped: 0, failed: 0, notAttempted: 0,
    accountsCreated: 0, accountsFailed: 0, withoutEmail: 0, feePaid: 0, feeUnpaid: 0, feeFailed: 0,
  };
  results.forEach((r) => {
    if (r.status === 'skipped') s.skipped += 1;
    else if (r.status === 'error') s.failed += 1;
    else if (r.status === 'pending') s.notAttempted += 1;
    else if (r.status === 'created') {
      s.imported += 1;
      const acc = r.account?.status;
      if (acc === 'active') s.accountsCreated += 1;
      else if (acc === 'failed') s.accountsFailed += 1;
      else s.withoutEmail += 1;
      const fee = r.annualFee?.status;
      if (fee === 'paid') s.feePaid += 1;
      else if (fee === 'failed') s.feeFailed += 1;
      else s.feeUnpaid += 1;
    }
  });
  return s;
}

export default function BulkImportStudentsModal({ open, onClose, onImported }) {
  const current = getAcademicYearLabel();
  const startYear = getAcademicYearStartYear();
  const academicYears = useMemo(() => [current, `${startYear + 1}-${startYear + 2}`], [current, startYear]);

  const [step, setStep] = useState('start'); // start | map | preview | importing | result
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [defaultYear, setDefaultYear] = useState(current);
  const [preview, setPreview] = useState(null);
  const [filter, setFilter] = useState('all');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [downloaded, setDownloaded] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const reset = () => {
    setStep('start'); setFileName(''); setHeaders([]); setRawRows([]); setMapping({});
    setDefaultYear(current); setPreview(null); setFilter('all'); setProgress({ done: 0, total: 0 });
    setResults([]); setCredentials([]); setDownloaded(false); setConfirmClose(false); setBusy(false); setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const hasUnsavedCredentials = credentials.length > 0 && !downloaded;
  const requestClose = () => {
    if (step === 'importing') return; // never abandon an import mid-flight
    if (hasUnsavedCredentials) { setConfirmClose(true); return; }
    reset();
    onClose?.();
  };
  const forceClose = () => { reset(); onClose?.(); };

  // ── Step 1: templates ─────────────────────────────────────────────────────
  const downloadTemplateXlsx = () => downloadFile(buildTemplateXlsx({ academicYears }), 'نموذج-استيراد-الطلاب.xlsx', XLSX_MIME);
  const downloadTemplateCsv = () => downloadFile(buildTemplateCsv(), 'نموذج-استيراد-الطلاب.csv', 'text/csv;charset=utf-8;');

  // ── Step 2: file ──────────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();
    if (file.size > MAX_FILE_BYTES) { setError('الملف كبير جداً (الحد الأقصى 5 ميغابايت).'); return; }
    if (ext === 'xls') { setError('صيغة ‎.xls القديمة غير مدعومة — احفظ الملف بصيغة ‎.xlsx أو CSV.'); return; }
    if (!['xlsx', 'csv'].includes(ext)) { setError('اختر ملف Excel ‏(‎.xlsx) أو CSV.'); return; }
    setBusy(true);
    try {
      const parsed = ext === 'xlsx' ? readXlsx(await file.arrayBuffer()) : await parseCsv(file);
      if (!parsed.headers.length || !parsed.rows.length) {
        setError('الملف فارغ أو لا يحتوي على صف عناوين وصف بيانات واحد على الأقل.');
        return;
      }
      const looksMisencoded = [...parsed.headers, ...parsed.rows.slice(0, 20).flatMap((r) => Object.values(r))]
        .some((v) => String(v).includes('�'));
      if (looksMisencoded) {
        setError('ترميز الملف غير مدعوم (تظهر الحروف العربية مشوّهة). احفظه بصيغة «CSV UTF-8» أو استعمل ملف Excel ‏(‎.xlsx).');
        return;
      }
      if (parsed.rows.length > MAX_ROWS) {
        setError(`الملف يحتوي على ${parsed.rows.length} صفاً — الحد الأقصى ${MAX_ROWS} طالب في الملف الواحد. قسّم الملف وأعد المحاولة.`);
        return;
      }
      const { mapping: auto } = autoMapHeaders(parsed.headers);
      setFileName(name);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(auto);
      setPreview(null);
      setStep('map');
    } catch (e) {
      setError(e.message || 'تعذّر قراءة الملف.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const canonicalRows = useMemo(() => applyMapping(rawRows, mapping), [rawRows, mapping]);
  const unmappedHeaders = useMemo(() => headers.filter((h) => !Object.values(mapping).includes(h)), [headers, mapping]);
  const usable = mappingIsUsable(mapping);

  // ── Step 3: preview (server dry-run) ──────────────────────────────────────
  const runPreview = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await apiCall('/api/admin/bulk-import-students', {
        method: 'POST',
        body: JSON.stringify({ students: canonicalRows, dryRun: true, defaultAcademicYear: defaultYear }),
      });
      setPreview(res);
      setFilter('all');
      setStep('preview');
    } catch (err) {
      setError(err?.message || 'تعذّر التحقق من الملف.');
    } finally {
      setBusy(false);
    }
  };

  const previewCounts = useMemo(() => {
    const rows = preview?.results || [];
    return {
      all: rows.length,
      ready: rows.filter((r) => r.status === 'ready').length,
      warnings: rows.filter((r) => r.status === 'ready' && r.warnings?.length).length,
      error: rows.filter((r) => r.status === 'error').length,
      skipped: rows.filter((r) => r.status === 'skipped').length,
    };
  }, [preview]);

  const visibleRows = useMemo(() => {
    const rows = (step === 'preview' ? preview?.results : results) || [];
    if (filter === 'all') return rows;
    if (filter === 'warnings') return rows.filter((r) => r.warnings?.length);
    return rows.filter((r) => r.status === filter);
  }, [preview, results, step, filter]);

  // ── Step 4: import, chunked ───────────────────────────────────────────────
  const runImport = async () => {
    const ready = (preview?.results || []).filter((r) => r.status === 'ready');
    const readyRows = new Set(ready.map((r) => r.row));
    const toSend = canonicalRows.filter((r) => readyRows.has(r.__row));
    // Rows already decided by the preview (errors / duplicates) stay as they are;
    // ready rows start as "pending" until their chunk comes back.
    const byRow = new Map((preview?.results || []).map((r) => [r.row, r.status === 'ready' ? { ...r, status: 'pending' } : r]));
    const creds = [];
    setStep('importing');
    setError('');
    setProgress({ done: 0, total: toSend.length });
    let imported = 0;
    for (let i = 0; i < toSend.length; i += CHUNK_SIZE) {
      const chunk = toSend.slice(i, i + CHUNK_SIZE);
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await apiCall('/api/admin/bulk-import-students', {
          method: 'POST',
          body: JSON.stringify({ students: chunk, dryRun: false, defaultAcademicYear: defaultYear }),
        });
        (res.results || []).forEach((r) => byRow.set(r.row, r));
        (res.credentials || []).forEach((c) => creds.push(c));
        imported += (res.results || []).filter((r) => r.status === 'created').length;
        setProgress({ done: Math.min(i + chunk.length, toSend.length), total: toSend.length });
      } catch (err) {
        setError(`توقف الاستيراد بعد ${Math.min(i, toSend.length)} من ${toSend.length}: ${err?.message || 'خطأ في الاتصال'}. `
          + 'الطلاب الذين لم يُستوردوا معروضون أدناه — يمكنك المتابعة لاحقاً بإعادة رفع الملف نفسه (المكررون يُتجاهلون تلقائياً).');
        break;
      }
    }
    const all = [...byRow.values()].sort((a, b) => a.row - b.row);
    setResults(all);
    setCredentials(creds.sort((a, b) => a.row - b.row));
    setFilter('all');
    setStep('result');
    if (imported > 0) onImported?.();
  };

  const summary = useMemo(() => summarize(results), [results]);
  const exportRows = useMemo(() => credentialRows(results, credentials), [results, credentials]);

  const downloadCredentials = (kind) => {
    if (kind === 'xlsx') downloadFile(buildCredentialsXlsx(exportRows), `بيانات-دخول-الطلاب-${stamp()}.xlsx`, XLSX_MIME);
    else downloadFile(buildCredentialsCsv(exportRows), `بيانات-دخول-الطلاب-${stamp()}.csv`, 'text/csv;charset=utf-8;');
    setDownloaded(true);
  };
  const downloadReport = (rows, name) => downloadFile(buildResultsCsv(rows), `${name}-${stamp()}.csv`, 'text/csv;charset=utf-8;');

  // ── Footer ────────────────────────────────────────────────────────────────
  const readyCount = previewCounts.ready;
  const willCreateAccounts = preview?.summary?.accountsCreated ?? 0;
  const footer = step === 'start' ? null : (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-gray-400">
        {fileName ? `${fileName} · ${rawRows.length} صف` : ''}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {step === 'map' && (
          <>
            <Button variant="neutral" size="sm" onClick={() => setStep('start')} disabled={busy}>رجوع</Button>
            <Button size="sm" onClick={runPreview} disabled={!usable || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />} معاينة والتحقق
            </Button>
          </>
        )}
        {step === 'preview' && (
          <>
            <Button variant="neutral" size="sm" onClick={() => setStep('map')} disabled={busy}>رجوع</Button>
            <Button size="sm" onClick={runImport} disabled={busy || readyCount === 0}>
              <UploadCloud className="h-4 w-4" /> استيراد {readyCount} طالب
            </Button>
          </>
        )}
        {step === 'result' && (
          <>
            <Button variant="neutral" size="sm" onClick={() => downloadReport(results, 'نتائج-الاستيراد')}>
              <Download className="h-4 w-4" /> تقرير النتائج
            </Button>
            <Button variant="neutral" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" /> استيراد ملف آخر</Button>
            <Button size="sm" onClick={requestClose}>تم</Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <AdminModal
        open={open}
        onClose={requestClose}
        title="استيراد الطلاب بالجملة"
        subtitle="بديل كامل للتسجيل الفردي — نفس البيانات، الحسابات، والرسوم السنوية"
        icon={Users}
        size="xl"
        closeOnBackdrop={step !== 'importing' && !hasUnsavedCredentials}
        footer={footer}
      >
        <Stepper active={STEP_OF[step]} />

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> <span>{error}</span>
          </div>
        )}

        {step === 'start' && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-white">1</span>
                نزّل النموذج واملأه
              </h3>
              <p className="mb-3 text-xs leading-relaxed text-gray-500">
                املأ ما يتوفر لديك فقط. الإلزامي: <strong>الاسم الكامل</strong> + <strong>البريد الإلكتروني</strong> + <strong>رقم الهاتف</strong>.
                كل طالب يحصل تلقائياً على حساب وكلمة مرور مؤقتة.
              </p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {IMPORT_FIELDS.map((f) => <FieldChip key={f.key} field={f} />)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={downloadTemplateXlsx}>
                  <FileSpreadsheet className="h-4 w-4" /> نموذج Excel
                </Button>
                <Button variant="neutral" size="sm" onClick={downloadTemplateCsv}>
                  <Download className="h-4 w-4" /> نموذج CSV
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-white">2</span>
                ارفع الملف المكتمل
              </h3>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-10 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-9 w-9 animate-spin text-primary" /> : <UploadCloud className="h-9 w-9 text-primary" />}
                <span className="text-sm font-semibold text-gray-900">اختر ملف Excel أو CSV</span>
                <span className="text-xs text-gray-500">‎.xlsx أو ‎.csv — حتى {MAX_ROWS} طالب</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                data-testid="bulk-import-file"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </section>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-secondary-200 bg-secondary-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-secondary-900">السنة الدراسية للطلاب المستوردين</p>
                <p className="text-xs text-secondary-700">تُطبَّق على كل صف تكون فيه خانة «السنة الدراسية» فارغة. القيمة الموجودة في الملف تُحترم دائماً.</p>
              </div>
              <select
                aria-label="السنة الدراسية الافتراضية"
                value={defaultYear}
                onChange={(e) => setDefaultYear(e.target.value)}
                className="rounded-xl border border-secondary-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {academicYears.map((y, i) => <option key={y} value={y}>{y}{i === 0 ? ' (الحالية)' : ' (القادمة)'}</option>)}
              </select>
            </div>

            <p className="text-sm text-gray-600">
              تمت مطابقة الأعمدة تلقائياً. راجعها وعدّل أي عمود عند الحاجة — الأعمدة غير المطابَقة لا تُستورد.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((f) => {
                const sample = mapping[f.key] ? rawRows.find((r) => r[mapping[f.key]])?.[mapping[f.key]] : '';
                return (
                  <label key={f.key} className="block">
                    <span className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-gray-600">
                      {f.label}
                      <RequirementBadge field={f} />
                    </span>
                    <select
                      value={mapping[f.key] || ''}
                      onChange={(e) => setMapping((m) => {
                        const next = { ...m };
                        if (e.target.value) next[f.key] = e.target.value; else delete next[f.key];
                        return next;
                      })}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">— غير موجود في الملف —</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                    {sample && <span className="mt-1 block truncate text-[11px] text-gray-400">مثال: {sample}</span>}
                  </label>
                );
              })}
            </div>
            {!usable && (
              <div className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                طابِق الأعمدة الإلزامية للمتابعة: «الاسم الكامل» و«البريد الإلكتروني» و«رقم الهاتف».
              </div>
            )}
            {unmappedHeaders.length > 0 && (
              <p className="text-xs text-gray-400">أعمدة لن تُستورد: {unmappedHeaders.join('، ')}</p>
            )}
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <Tile tone="primary" label="جاهز للاستيراد" value={preview.summary.imported} />
              <Tile tone="success" label="سيُنشأ لهم حساب" value={preview.summary.accountsCreated} Icon={KeyRound} />
              <Tile tone="neutral" label="بدون بريد (بدون حساب)" value={preview.summary.withoutEmail} Icon={MailX} />
              <Tile tone="success" label="الرسوم: مدفوع" value={preview.summary.feePaid} Icon={Wallet} />
              <Tile tone="neutral" label="الرسوم: غير مدفوع" value={preview.summary.feeUnpaid} />
              <Tile tone="warning" label="مكرر (سيُتخطى)" value={preview.summary.skipped} />
              <Tile tone="danger" label="أخطاء" value={preview.summary.failed} />
            </div>
            <FilterBar
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'all', label: 'الكل', count: previewCounts.all },
                { id: 'ready', label: 'جاهز', count: previewCounts.ready },
                { id: 'warnings', label: 'تحذيرات', count: previewCounts.warnings },
                { id: 'error', label: 'أخطاء', count: previewCounts.error },
                { id: 'skipped', label: 'مكرر', count: previewCounts.skipped },
              ]}
              action={(previewCounts.error > 0 || previewCounts.warnings > 0) && (
                <button type="button" onClick={() => downloadReport(preview.results.filter((r) => r.status !== 'ready' || r.warnings?.length), 'ملاحظات-ملف-الاستيراد')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <Download className="h-3.5 w-3.5" /> تنزيل الأخطاء والتحذيرات
                </button>
              )}
            />
            <RowsTable rows={visibleRows} mode="preview" />
            <p className="flex items-start gap-1.5 text-xs text-gray-500">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              معاينة فقط — لم يُنشأ أي شيء بعد. سيُستورد {readyCount} طالب{willCreateAccounts ? ` ويُنشأ ${willCreateAccounts} حساب دخول بكلمات مرور مؤقتة` : ''}.
              الصفوف التي بها أخطاء لن تُستورد؛ صحّحها في الملف ثم أعد رفعه (المستوردون سابقاً يُتجاهلون تلقائياً).
            </p>
          </div>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center gap-4 py-10 text-center" aria-live="polite">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-semibold text-gray-900">جاري الاستيراد وإنشاء الحسابات… {progress.done} / {progress.total}</p>
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">لا تغلق هذه النافذة حتى ينتهي الاستيراد.</p>
          </div>
        )}

        {step === 'result' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Tile tone="neutral" label="الصفوف المعالجة" value={summary.total} />
              <Tile tone="primary" label="تم استيرادهم" value={summary.imported} />
              <Tile tone="danger" label="فشل استيرادهم" value={summary.failed + summary.notAttempted} />
              <Tile tone="warning" label="مكرر (تم تخطيه)" value={summary.skipped} />
              <Tile tone="success" label="حسابات أُنشئت" value={summary.accountsCreated} Icon={KeyRound} />
              <Tile tone="danger" label="فشل إنشاء الحساب" value={summary.accountsFailed} Icon={ShieldAlert} />
              <Tile tone="neutral" label="بدون بريد إلكتروني" value={summary.withoutEmail} Icon={MailX} />
              <Tile tone="success" label="الرسوم مدفوعة" value={summary.feePaid} Icon={Wallet} />
              <Tile tone="neutral" label="الرسوم غير مدفوعة" value={summary.feeUnpaid} />
              <Tile tone="danger" label="فشل تسجيل الرسوم" value={summary.feeFailed} />
            </div>

            {summary.imported > 0 && (
              <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <KeyRound className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-bold text-gray-900">بيانات الدخول المؤقتة ({credentials.length} حساب)</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                        كلمات المرور تظهر <strong>هذه المرة فقط</strong> ولا تُحفظ في النظام. نزّل الملف الآن ووزّعه على الطلاب؛
                        سيُطلب من كل طالب تغيير كلمة المرور عند أول دخول.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => downloadCredentials('xlsx')} disabled={exportRows.length === 0}>
                      <Download className="h-4 w-4" /> بيانات الدخول (Excel)
                    </Button>
                    <Button variant="neutral" size="sm" onClick={() => downloadCredentials('csv')} disabled={exportRows.length === 0}>
                      CSV
                    </Button>
                    {downloaded && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-600">
                        <CheckCircle2 className="h-4 w-4" /> تم التنزيل
                      </span>
                    )}
                  </div>
                </div>
              </section>
            )}

            {(summary.accountsFailed > 0 || summary.withoutEmail > 0 || summary.feeFailed > 0 || summary.notAttempted > 0) && (
              <ul className="space-y-1.5 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-xs text-warning-900">
                {summary.accountsFailed > 0 && (
                  <li>• {summary.accountsFailed} طالب سُجّل بنجاح لكن لم يُنشأ حساب دخوله — أنشئه من صفحة الطلاب (زر «إنشاء حساب الدخول»)، دون أي تكرار للسجل.</li>
                )}
                {summary.withoutEmail > 0 && (
                  <li>• {summary.withoutEmail} طالب بدون بريد إلكتروني سُجّل بدون حساب — أضف بريده لاحقاً من صفحة الطلاب لإنشاء حسابه.</li>
                )}
                {summary.feeFailed > 0 && (
                  <li>• {summary.feeFailed} طالب لم تُسجَّل رسومه السنوية — سجّلها من صفحة الرسوم السنوية؛ مستواه الدراسي محفوظ ولن يُطلب منك إدخاله.</li>
                )}
                {summary.notAttempted > 0 && (
                  <li>• {summary.notAttempted} طالب لم يُستورد بسبب انقطاع — أعد رفع الملف نفسه لإكمالهم (المستوردون يُتجاهلون تلقائياً).</li>
                )}
              </ul>
            )}

            <FilterBar
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'all', label: 'الكل', count: results.length },
                { id: 'created', label: 'تم الاستيراد', count: summary.imported },
                { id: 'error', label: 'أخطاء', count: summary.failed },
                { id: 'skipped', label: 'مكرر', count: summary.skipped },
                ...(summary.notAttempted ? [{ id: 'pending', label: 'لم يُستورد', count: summary.notAttempted }] : []),
              ]}
            />
            <RowsTable rows={visibleRows} mode="result" />
          </div>
        )}
      </AdminModal>

      <AdminConfirmDialog
        open={confirmClose}
        title="لم تُنزّل بيانات الدخول"
        message="كلمات المرور المؤقتة لن تظهر مرة أخرى بعد إغلاق النافذة. يمكنك لاحقاً إنشاء كلمة مرور مؤقتة جديدة لكل طالب من صفحة الطلاب. هل تريد الإغلاق دون تنزيلها؟"
        confirmLabel="إغلاق دون تنزيل"
        cancelLabel="رجوع"
        danger
        onConfirm={forceClose}
        onCancel={() => setConfirmClose(false)}
      />
    </>
  );
}

// ── Presentational pieces ────────────────────────────────────────────────────

function Stepper({ active }) {
  return (
    <ol className="mb-5 flex items-center gap-1 overflow-x-auto pb-1" aria-label="مراحل الاستيراد">
      {STEPS.map((s, i) => {
        const done = i < active;
        const on = i === active;
        return (
          <li key={s.id} className="flex flex-shrink-0 items-center gap-1">
            <span
              aria-current={on ? 'step' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                on ? 'bg-primary text-white' : done ? 'bg-success-50 text-success-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span>{i + 1}</span>} {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-gray-200" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function RequirementBadge({ field }) {
  const cls = field.requirement === REQUIREMENT.REQUIRED
    ? 'bg-danger-50 text-danger-700'
    : field.requirement === REQUIREMENT.CONTACT ? 'bg-warning-50 text-warning-800' : 'bg-gray-100 text-gray-500';
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{requirementLabel(field)}</span>;
}

function FieldChip({ field }) {
  const cls = field.requirement === REQUIREMENT.REQUIRED
    ? 'border-danger-200 bg-danger-50 text-danger-700'
    : field.requirement === REQUIREMENT.CONTACT ? 'border-warning-200 bg-warning-50 text-warning-800' : 'border-gray-200 bg-white text-gray-600';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`} title={field.accepted}>
      {field.label}{field.requirement === REQUIREMENT.REQUIRED ? ' *' : field.requirement === REQUIREMENT.CONTACT ? ' ⁺' : ''}
    </span>
  );
}

function Tile({ tone, label, value, Icon }) {
  const tones = {
    primary: 'bg-primary/5 text-primary border-primary/20',
    success: 'bg-success-50 text-success-700 border-success-100',
    warning: 'bg-warning-50 text-warning-700 border-warning-100',
    danger: 'bg-danger-50 text-danger-600 border-danger-100',
    neutral: 'bg-gray-50 text-gray-700 border-gray-100',
  };
  return (
    <div className={`rounded-xl border p-2.5 text-center ${tones[tone] || tones.neutral}`}>
      <p className="flex items-center justify-center gap-1 text-xl font-bold leading-tight">
        {Icon && <Icon className="h-4 w-4 opacity-70" aria-hidden="true" />}{value ?? 0}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight">{label}</p>
    </div>
  );
}

function FilterBar({ value, onChange, options, action }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={value === o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              value === o.id ? 'bg-primary text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {o.label} <span className="opacity-70">({o.count})</span>
          </button>
        ))}
      </div>
      {action}
    </div>
  );
}

const FEE_UI = {
  paid: { label: 'مدفوع', cls: 'bg-success-50 text-success-700' },
  unpaid: { label: 'غير مدفوع', cls: 'bg-gray-100 text-gray-600' },
  failed: { label: 'فشل التسجيل', cls: 'bg-danger-50 text-danger-700' },
};
const ACCOUNT_UI = {
  active: { label: 'حساب أُنشئ', cls: 'text-success-700' },
  failed: { label: 'فشل الحساب', cls: 'text-danger-700' },
  none: { label: 'بدون حساب', cls: 'text-gray-500' },
};

function RowsTable({ rows, mode }) {
  if (!rows.length) {
    return <p className="rounded-xl border border-gray-100 py-8 text-center text-sm text-gray-400">لا توجد صفوف في هذا التصنيف.</p>;
  }
  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-gray-100">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="sticky top-0 z-[1] bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-3 py-2 text-start font-semibold">السطر</th>
            <th className="px-3 py-2 text-start font-semibold">الطالب</th>
            <th className="px-3 py-2 text-start font-semibold">السنة / المستوى</th>
            <th className="px-3 py-2 text-start font-semibold">الرسوم</th>
            <th className="px-3 py-2 text-start font-semibold">الحساب</th>
            <th className="px-3 py-2 text-start font-semibold">الحالة</th>
            <th className="px-3 py-2 text-start font-semibold">ملاحظات</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r) => {
            const ui = STATUS_UI[r.status] || STATUS_UI.error;
            const p = r.preview || {};
            const feeKey = mode === 'result' ? (r.annualFee?.status || (r.status === 'created' ? 'unpaid' : null)) : p.annualFeeStatus;
            const fee = feeKey ? FEE_UI[feeKey] : null;
            const accountKey = mode === 'result'
              ? r.account?.status
              : (r.status === 'ready' ? (p.accountEligible ? 'active' : 'none') : null);
            const account = accountKey ? ACCOUNT_UI[accountKey] : null;
            const issues = r.errors && r.errors.length ? r.errors : (r.status === 'skipped' || (r.status === 'error' && r.reason) ? [r.reason] : []);
            return (
              <tr key={r.row} className="align-top">
                <td className="px-3 py-2 text-gray-400" dir="ltr">{r.row}</td>
                <td className="px-3 py-2">
                  <p className="font-medium text-gray-900">{r.name || '—'}</p>
                  <p className="text-xs text-gray-500" dir="ltr">{[r.email, r.phone].filter(Boolean).join(' · ') || '—'}</p>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  <p dir="ltr" className="text-start">{p.academicYear || '—'}</p>
                  <p>{p.studyYearLabel || <span className="text-gray-400">بدون مستوى</span>}</p>
                </td>
                <td className="px-3 py-2">
                  {fee ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${fee.cls}`}>{fee.label}</span> : <span className="text-gray-300">—</span>}
                  {mode === 'result' && r.annualFee?.reason && <p className="mt-1 text-[11px] text-danger-600">{r.annualFee.reason}</p>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {account ? <span className={`font-semibold ${account.cls}`}>{mode === 'preview' && accountKey === 'active' ? 'سيُنشأ حساب' : account.label}</span> : <span className="text-gray-300">—</span>}
                  {mode === 'result' && r.account?.reason && <p className="mt-1 text-[11px] text-danger-600">{r.account.reason}</p>}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold ${ui.cls}`}>
                    <ui.Icon className="h-3.5 w-3.5" /> {ui.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {issues.map((m, i) => <p key={`e${i}`} className="text-danger-600">• {m}</p>)}
                  {(r.warnings || []).map((m, i) => <p key={`w${i}`} className="text-warning-700">⚠ {m}</p>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
