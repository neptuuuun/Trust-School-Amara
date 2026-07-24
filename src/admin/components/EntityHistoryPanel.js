/**
 * EntityHistoryPanel — the record-level "View History" timeline.
 *
 * Opens in an AdminModal (portal-based, the single modal foundation) and shows
 * every audit entry for ONE entity, newest → oldest, with name attribution and
 * exact field changes (e.g. "القاعة: 02 → 03"). Data comes from the branch-scoped
 * /api/audit/history endpoint; the diff is computed client-side with the shared
 * `diffFields` util so it matches the owner activity feed.
 */

import React, { useEffect, useState } from 'react';
import { History, ArrowLeft } from 'lucide-react';
import AdminModal from './AdminModal';
import { getEntityHistory } from '../../services/auditService';
import { diffFields } from '../../utils/changes';
import { actionMeta, fieldLabel, displayValue, initials } from '../../utils/auditLabels';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-GB') : '—');

const ChangeList = ({ before, after }) => {
  const diff = diffFields(before, after);
  const keys = Object.keys(diff);
  if (!keys.length) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {keys.map((k) => (
        <li key={k} className="flex flex-wrap items-center gap-1 text-xs">
          <span className="font-medium text-gray-700">{fieldLabel(k)}:</span>
          <span className="text-gray-500 line-through decoration-gray-300">{displayValue(diff[k].old)}</span>
          <ArrowLeft className="h-3 w-3 text-gray-400" aria-hidden />
          <span className="font-semibold text-gray-800">{displayValue(diff[k].new)}</span>
        </li>
      ))}
    </ul>
  );
};

const EntityHistoryPanel = ({ targetType, targetId, branchId, title, onClose }) => {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getEntityHistory({ targetType, targetId, branchId, limit: 100 })
      .then((res) => { if (active) setEntries(res.entries || []); })
      .catch((e) => { if (active) setError(e?.message || 'تعذر تحميل السجل'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [targetType, targetId, branchId]);

  return (
    <AdminModal
      open
      onClose={onClose}
      size="md"
      tier="raised"
      icon={History}
      title={title ? `سجل: ${title}` : 'سجل التغييرات'}
      footer={(
        <button
          onClick={onClose}
          className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          إغلاق
        </button>
      )}
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">جاري التحميل…</p>
      ) : error ? (
        <p className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</p>
      ) : !entries || entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">لا يوجد سجل لهذا العنصر بعد.</p>
      ) : (
        <ol className="relative space-y-4 border-s-2 border-gray-100 ps-4">
          {entries.map((e) => {
            const meta = actionMeta(e.action);
            const who = e.actor?.name || e.actor?.email || '—';
            return (
              <li key={e.id} className="relative">
                <span className="absolute -start-[1.42rem] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm ring-2 ring-gray-100" aria-hidden>
                  {meta.icon}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700" title={who}>
                    {initials(who)}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{who}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
                  <span className="ms-auto text-xs text-gray-400">{fmt(e.at)}</span>
                </div>
                <ChangeList before={e.before} after={e.after} />
                {e.reason && <p className="mt-1 text-xs text-gray-500">السبب: {e.reason}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </AdminModal>
  );
};

export default EntityHistoryPanel;
