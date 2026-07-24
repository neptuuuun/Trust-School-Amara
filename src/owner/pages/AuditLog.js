import React, { useEffect, useState } from 'react';
import { ScrollText, ArrowLeft } from 'lucide-react';
import { getOwnerAuditLog, getOwnerAdminActivity } from '../../services/ownerService';
import { LoadingState, Alert, EmptyState } from '../../components/ui/feedback';
import ExportButtons from '../components/ExportButtons';
import { generateFilename } from '../../utils/csvExport';
import { diffFields } from '../../utils/changes';
import { actionMeta, actionLabel, fieldLabel, displayValue, entityLabel, initials } from '../../utils/auditLabels';

const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB') : '—');

const BRANCH_OPTIONS = [
  { id: 'all', label: 'كل الفروع' },
  { id: 'boumerdes', label: 'بومرداس' },
  { id: 'bordj_menaiel', label: 'برج منايل' },
];

const ActionBadge = ({ action }) => {
  const m = actionMeta(action);
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap ${m.tone}`}>
      <span aria-hidden>{m.icon}</span>{m.label}
    </span>
  );
};

// Generic field-level change list (room: 02 → 03). Falls back to the amount-only
// view when before/after carry just a monetary amount (payment edits).
const Changes = ({ entry }) => {
  const before = entry.before || {};
  const after = entry.after || {};
  // Only diff when both snapshots exist (an UPDATE); creates/deletes show the entity name.
  if (entry.before && entry.after) {
    const diff = diffFields(before, after);
    const keys = Object.keys(diff);
    if (keys.length) {
      return (
        <ul className="mt-1 space-y-0.5">
          {keys.slice(0, 6).map((k) => (
            <li key={k} className="flex flex-wrap items-center gap-1 text-xs text-gray-600">
              <span className="font-medium text-gray-700">{fieldLabel(k)}:</span>
              <span className="text-gray-400 line-through decoration-gray-300">{displayValue(diff[k].old)}</span>
              <ArrowLeft className="h-3 w-3 text-gray-400" aria-hidden />
              <span className="font-semibold text-gray-800">{displayValue(diff[k].new)}</span>
            </li>
          ))}
        </ul>
      );
    }
  }
  const label = entityLabel(entry);
  if (label) return <span className="text-xs text-gray-500">{label}</span>;
  // Bare amount (legacy payment edit) → show it.
  const amt = after.amount ?? before.amount;
  if (amt != null) return <span className="text-xs text-gray-500">{Number(amt).toLocaleString('en-US')} دج</span>;
  return <span className="text-xs text-gray-400">—</span>;
};

const CSV_COLUMNS = [
  { key: 'at', header: 'الوقت', transform: (v) => (v ? new Date(v).toLocaleString('en-GB') : '') },
  { key: 'actor', header: 'المستخدم', transform: (v) => (v?.name || v?.email || '') },
  { key: 'action', header: 'الإجراء', transform: (v) => actionLabel(v) },
  { key: 'targetType', header: 'نوع السجل' },
  { key: 'targetId', header: 'معرّف السجل' },
  { key: 'reason', header: 'السبب' },
];

const AuditLog = () => {
  const [branchId, setBranchId] = useState('all');
  const [action, setAction] = useState('all');
  const [actorUid, setActorUid] = useState('all');
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Employee roster for the per-employee filter (the spec's "show everything Ahmed did").
  useEffect(() => {
    let active = true;
    getOwnerAdminActivity({ branchId: branchId === 'all' ? undefined : branchId, days })
      .then((res) => { if (active) setAdmins(res?.admins || []); })
      .catch(() => { if (active) setAdmins([]); });
    return () => { active = false; };
  }, [branchId, days]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getOwnerAuditLog({
      branchId: branchId === 'all' ? undefined : branchId,
      action: action === 'all' ? undefined : action,
      actorUid: actorUid === 'all' ? undefined : actorUid,
      days, limit: 300,
    })
      .then((res) => { if (active) setData(res); })
      .catch((e) => { if (active) setError(e.message || 'تعذر تحميل البيانات'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [branchId, action, actorUid, days]);

  const entries = data?.entries || [];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1">سجل النشاط</h1>
        <p className="text-gray-600">من فعل ماذا ومتى — سجل دائم لكل إجراء مهم</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={actorUid} onChange={(e) => setActorUid(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
          <option value="all">كل الموظفين</option>
          {admins.map((a) => (
            <option key={a.uid} value={a.uid}>{a.name || a.email || a.uid}</option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
          <option value="all">كل الإجراءات</option>
          {(data?.actions || []).map((a) => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
          <option value={7}>7 أيام</option>
          <option value={30}>30 يوم</option>
          <option value={90}>90 يوم</option>
          <option value={365}>سنة</option>
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
          {BRANCH_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div className="flex items-center gap-3 ms-auto">
          <ExportButtons rows={entries} columns={CSV_COLUMNS} filename={generateFilename(`audit-${branchId}-${days}d`)} />
          {data && <span className="text-sm text-gray-500">{Number(data.count || 0).toLocaleString('ar-EG')} سجل</span>}
        </div>
      </div>

      {loading ? (
        <LoadingState label="جاري تحميل سجل النشاط..." />
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : entries.length === 0 ? (
        <EmptyState icon={ScrollText} title="لا توجد سجلات" description="لا توجد إجراءات مسجلة لهذا الفلتر." />
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 divide-y divide-gray-100">
          {entries.map((e) => {
            const who = e.actor?.name || e.actor?.email || '—';
            return (
              <div key={e.id} className="flex items-start gap-3 p-4 hover:bg-gray-50">
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700"
                  title={who}
                >
                  {initials(who)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{who}</span>
                    <ActionBadge action={e.action} />
                    {e.branchId && (
                      <span className="text-xs text-gray-400">
                        {BRANCH_OPTIONS.find((b) => b.id === e.branchId)?.label || e.branchId}
                      </span>
                    )}
                    <span className="ms-auto text-xs text-gray-400 whitespace-nowrap">{fmtDateTime(e.at)}</span>
                  </div>
                  <Changes entry={e} />
                  {e.reason && <p className="mt-1 text-xs text-gray-500">السبب: {e.reason}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AuditLog;
