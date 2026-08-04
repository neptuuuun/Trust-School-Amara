/**
 * BulkImportStudentsModal — a guided wizard to import many students from a
 * CSV/Excel file, built on the AdminModal foundation.
 *
 * Steps: Upload → Map columns → Preview (server dry-run validates + detects
 * duplicates) → Import (creates through the same rules as manual add) → Report.
 *
 * The heavy lifting (validation, duplicate prevention by email/phone, creation,
 * audit) is done server-side by POST /api/admin/bulk-import-students; this
 * component only parses the file (papaparse), maps columns, and renders results.
 * Excel users export to .csv first (kept dependency-light — papaparse only).
 */

import React, { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  UploadCloud, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle,
  XCircle, Download, Loader2, Users,
} from 'lucide-react';
import AdminModal from './AdminModal';
import { Button } from '../../components/ui/button';
import apiCall from '../../utils/apiClient';

const TARGET_FIELDS = [
  { key: 'fullName', label: 'الاسم الكامل', required: true,  match: /name|الاسم|الإسم/i },
  { key: 'email',    label: 'البريد الإلكتروني', required: true, match: /e-?mail|بريد/i },
  { key: 'phone',    label: 'رقم الهاتف', required: false, match: /phone|tel|هاتف|جوال|رقم/i },
  { key: 'school',   label: 'المؤسسة التعليمية', required: false, match: /school|مدرسة|مؤسسة|ثانوية|متوسطة/i },
  { key: 'grade',    label: 'المستوى / السنة', required: false, match: /grade|level|مستوى|سنة|صف/i },
];

const SAMPLE_CSV =
  'fullName,email,phone,school,grade\n' +
  'محمد أمين,mohamed@example.com,0550000000,ثانوية الأمل,3 ثانوي\n' +
  'سارة بعلقاسم,sara@example.com,066. .1234567,حر,\n';

const STATUS_UI = {
  created: { Icon: CheckCircle2, cls: 'text-success-600', label: 'تم الإنشاء' },
  ready:   { Icon: CheckCircle2, cls: 'text-success-600', label: 'جاهز' },
  skipped: { Icon: AlertTriangle, cls: 'text-warning-600', label: 'تم التخطي' },
  error:   { Icon: XCircle, cls: 'text-danger-600', label: 'خطأ' },
};

export default function BulkImportStudentsModal({ open, onClose, onImported }) {
  const [step, setStep] = useState('upload'); // upload | map | preview | result
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const reset = () => {
    setStep('upload'); setFileName(''); setHeaders([]); setRows([]);
    setMapping({}); setPreview(null); setResult(null); setBusy(false); setError('');
  };

  const close = () => { reset(); onClose?.(); };

  const autoMap = (fields) => {
    const m = {};
    TARGET_FIELDS.forEach((f) => {
      const hit = fields.find((h) => f.match.test(h));
      if (hit) m[f.key] = hit;
    });
    return m;
  };

  const handleFile = (file) => {
    if (!file) return;
    setError('');
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const fields = (res.meta?.fields || []).filter(Boolean);
        const data = (res.data || []).filter((r) => Object.values(r).some((v) => String(v || '').trim()));
        if (fields.length === 0 || data.length === 0) {
          setError('الملف فارغ أو لا يحتوي على صف عناوين صالح.');
          return;
        }
        setHeaders(fields);
        setRows(data);
        setMapping(autoMap(fields));
        setStep('map');
      },
      error: () => setError('تعذّر قراءة الملف. تأكد أنه بصيغة CSV صالحة.'),
    });
  };

  const mappedRows = useMemo(() => {
    if (!mapping.fullName && !mapping.email) return [];
    return rows.map((r) => ({
      fullName: mapping.fullName ? r[mapping.fullName] : '',
      email: mapping.email ? r[mapping.email] : '',
      phone: mapping.phone ? r[mapping.phone] : '',
      school: mapping.school ? r[mapping.school] : '',
      grade: mapping.grade ? r[mapping.grade] : '',
    }));
  }, [rows, mapping]);

  const canProceedMapping = mapping.fullName && mapping.email;

  const runImport = async (dryRun) => {
    setBusy(true);
    setError('');
    try {
      const res = await apiCall('/api/admin/bulk-import-students', {
        method: 'POST',
        body: JSON.stringify({ students: mappedRows, dryRun }),
      });
      if (dryRun) { setPreview(res); setStep('preview'); }
      else { setResult(res); setStep('result'); if (res.summary?.created > 0) onImported?.(); }
    } catch (err) {
      setError(err?.message || 'تعذّر تنفيذ العملية.');
    } finally {
      setBusy(false);
    }
  };

  const downloadSample = () => {
    const blob = new Blob(['﻿' + SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const active = preview || result;

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      <span className="text-xs text-gray-400">
        {fileName ? `${fileName} · ${rows.length} صف` : 'CSV / Excel (صدّر إلى CSV)'}
      </span>
      <div className="flex items-center gap-2">
        {step === 'map' && (
          <>
            <Button variant="neutral" size="sm" onClick={() => setStep('upload')}>رجوع</Button>
            <Button size="sm" onClick={() => runImport(true)} disabled={!canProceedMapping || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />} معاينة
            </Button>
          </>
        )}
        {step === 'preview' && (
          <>
            <Button variant="neutral" size="sm" onClick={() => setStep('map')}>رجوع</Button>
            <Button size="sm" onClick={() => runImport(false)} disabled={busy || (preview?.summary?.created ?? 0) === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              استيراد {preview?.summary?.created ?? 0} طالب
            </Button>
          </>
        )}
        {step === 'result' && <Button size="sm" onClick={close}>تم</Button>}
      </div>
    </div>
  );

  return (
    <AdminModal
      open={open}
      onClose={close}
      title="استيراد الطلاب بالجملة"
      icon={Users}
      size="xl"
      footer={step === 'upload' ? null : footer}
    >
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <UploadCloud className="h-10 w-10 text-primary" />
            <span className="text-sm font-semibold text-gray-900">اختر ملف CSV للرفع</span>
            <span className="text-xs text-gray-500">الأعمدة المدعومة: الاسم، البريد، الهاتف، المؤسسة، المستوى</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="flex items-center justify-center">
            <button onClick={downloadSample} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              <Download className="h-4 w-4" /> تنزيل نموذج CSV
            </button>
          </div>
        </div>
      )}

      {/* Step: Map columns */}
      {step === 'map' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">طابِق أعمدة ملفك مع حقول الطالب. الاسم والبريد إلزاميان.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {TARGET_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600">
                  {f.label} {f.required && <span className="text-danger-500">*</span>}
                </span>
                <select
                  value={mapping[f.key] || ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">— تجاهل —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-xs text-gray-500">
            المؤسسة الفارغة تُسجَّل تلقائياً كـ «حر». يتم تجاهل الطلاب المكررين (بالبريد أو الهاتف).
          </div>
        </div>
      )}

      {/* Step: Preview / Result */}
      {(step === 'preview' || step === 'result') && active && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <SummaryTile tone="primary" label={step === 'result' ? 'تم الإنشاء' : 'جاهز للاستيراد'} value={active.summary.created} />
            <SummaryTile tone="warning" label="تم التخطي (مكرر)" value={active.summary.skipped} />
            <SummaryTile tone="danger" label="أخطاء" value={active.summary.failed} />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">#</th>
                  <th className="px-3 py-2 text-start font-semibold">البريد</th>
                  <th className="px-3 py-2 text-start font-semibold">الحالة</th>
                  <th className="px-3 py-2 text-start font-semibold">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {active.results.map((r) => {
                  const ui = STATUS_UI[r.status] || STATUS_UI.error;
                  return (
                    <tr key={r.index}>
                      <td className="px-3 py-2 text-gray-400">{r.index + 1}</td>
                      <td className="px-3 py-2 text-gray-700">{r.email || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 font-semibold ${ui.cls}`}>
                          <ui.Icon className="h-3.5 w-3.5" /> {ui.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.reason || r.name || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {step === 'preview' && (
            <p className="text-center text-xs text-gray-400">
              هذه معاينة فقط — لم يُنشأ أي حساب بعد. اضغط «استيراد» للتأكيد.
            </p>
          )}
        </div>
      )}
    </AdminModal>
  );
}

function SummaryTile({ tone, label, value }) {
  const tones = {
    primary: 'bg-primary/5 text-primary border-primary/20',
    warning: 'bg-warning-50 text-warning-700 border-warning-100',
    danger: 'bg-danger-50 text-danger-600 border-danger-100',
  };
  return (
    <div className={`rounded-xl border p-3 text-center ${tones[tone] || tones.primary}`}>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      <p className="mt-0.5 text-xs">{label}</p>
    </div>
  );
}
