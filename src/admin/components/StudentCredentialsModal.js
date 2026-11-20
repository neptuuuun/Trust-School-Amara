/**
 * StudentCredentialsModal — recover an admin-created student's login.
 *
 * Used from the Students page for:
 *   • a student imported WITHOUT an email      → enter the email, create the account
 *   • a student whose account creation FAILED  → retry (same record, same uid)
 *   • lost temporary credentials               → issue a NEW temporary password
 *                                                (only while the admin-issued one
 *                                                is still unchanged)
 *
 * Calls POST /api/admin/students/:userId/credentials. The temporary password is
 * shown ONCE, held only in this component's memory, and wiped on close.
 */

import React, { useState } from 'react';
import { KeyRound, Loader2, AlertCircle, Copy, CheckCircle2, Download } from 'lucide-react';
import AdminModal from './AdminModal';
import apiCall from '../../utils/apiClient';
import {
  credentialRows, buildCredentialsXlsx, downloadFile, XLSX_MIME,
} from '../../utils/bulkImportTemplate';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the button on a student card should offer, or null. */
export function credentialActionFor(user) {
  const status = user?.authAccountStatus;
  if (status === 'none') return { kind: 'create', label: 'إنشاء حساب الدخول' };
  if (status === 'failed') return { kind: 'create', label: 'إعادة محاولة إنشاء الحساب' };
  if (user?.createdByAdmin === true && user?.mustChangePassword === true) {
    return { kind: 'reset', label: 'كلمة مرور مؤقتة جديدة' };
  }
  return null;
}

export default function StudentCredentialsModal({ student, onClose, onDone }) {
  const action = credentialActionFor(student) || { kind: 'reset', label: 'كلمة مرور مؤقتة جديدة' };
  const needsEmail = action.kind === 'create' && !student?.email;
  const [email, setEmail] = useState(student?.email || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null); // { email, temporaryPassword, action }
  const [copied, setCopied] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (needsEmail && !EMAIL_RE.test(trimmed)) { setError('أدخل بريداً إلكترونياً صحيحاً.'); return; }
    setBusy(true);
    try {
      const res = await apiCall(`/api/admin/students/${student.id}/credentials`, {
        method: 'POST',
        body: JSON.stringify({ branchId: student.branchId, ...(needsEmail ? { email: trimmed } : {}) }),
      });
      setIssued({ email: res.email, temporaryPassword: res.temporaryPassword, action: res.action });
      onDone?.({ email: res.email, action: res.action });
    } catch (err) {
      setError(err?.message || 'تعذّر إصدار بيانات الدخول.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${issued.email}\t${issued.temporaryPassword}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const rows = credentialRows(
      [{ row: 1, status: 'created', name: student.fullName || student.name || '', email: issued.email, account: { status: 'active' } }],
      [{ row: 1, email: issued.email, temporaryPassword: issued.temporaryPassword }],
    );
    downloadFile(buildCredentialsXlsx(rows), `بيانات-دخول-${(student.fullName || student.name || 'طالب').replace(/\s+/g, '-')}.xlsx`, XLSX_MIME);
  };

  const footer = issued ? (
    <button type="button" onClick={onClose} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">تم</button>
  ) : (
    <>
      <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">إلغاء</button>
      <button
        type="submit"
        form="student-credentials-form"
        disabled={busy}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {busy ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> جاري…</span> : action.label}
      </button>
    </>
  );

  return (
    <AdminModal open onClose={onClose} size="md" icon={KeyRound} title={action.label} subtitle={student?.fullName || student?.name} footer={footer}>
      {!issued ? (
        <form id="student-credentials-form" onSubmit={submit} className="space-y-4">
          {error && (
            <div className="flex gap-2.5 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> <span>{error}</span>
            </div>
          )}
          {needsEmail ? (
            <div>
              <label htmlFor="sc-email" className="mb-1.5 block text-sm font-medium text-gray-700">
                البريد الإلكتروني للطالب <span className="text-danger-500">*</span>
              </label>
              <input
                id="sc-email"
                type="email"
                dir="ltr"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="mt-1 text-xs text-gray-500">سيُنشأ حساب الدخول لهذا السجل نفسه — لن يُنشأ طالب جديد.</p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-gray-600">
              {action.kind === 'reset'
                ? 'ستُستبدل كلمة المرور المؤقتة الحالية بأخرى جديدة، وتُغلق أي جلسة مفتوحة بالقديمة. يبقى الطالب ملزماً بتغييرها عند أول دخول.'
                : `سيُنشأ حساب الدخول بالبريد ${student?.email} لهذا السجل نفسه، مع كلمة مرور مؤقتة جديدة.`}
            </p>
          )}
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2.5 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{issued.action === 'created' ? 'تم إنشاء حساب الدخول.' : 'تم إصدار كلمة مرور مؤقتة جديدة.'} أبلغ الطالب بها — لن تظهر مرة أخرى.</span>
          </div>
          <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">البريد الإلكتروني</dt>
              <dd className="font-medium text-gray-900" dir="ltr">{issued.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">كلمة المرور المؤقتة</dt>
              <dd className="select-all rounded bg-white px-2 py-1 font-mono text-base font-bold tracking-wider text-gray-900" dir="ltr" data-testid="issued-password">
                {issued.temporaryPassword}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              {copied ? <CheckCircle2 className="h-4 w-4 text-success-600" /> : <Copy className="h-4 w-4" />} {copied ? 'تم النسخ' : 'نسخ'}
            </button>
            <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <Download className="h-4 w-4" /> تنزيل (Excel)
            </button>
          </div>
          <p className="text-xs text-gray-500">سيُطلب من الطالب اختيار كلمة مرور جديدة عند أول تسجيل دخول.</p>
        </div>
      )}
    </AdminModal>
  );
}
