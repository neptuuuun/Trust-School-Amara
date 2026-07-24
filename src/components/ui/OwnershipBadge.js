import React from 'react';
import { User, Pencil } from 'lucide-react';

/**
 * OwnershipBadge — shows WHO created (and last edited) a record, directly on the
 * record, so the owner/admins never have to open the audit log to know who is
 * accountable. Reads the canonical provenance fields stamped on entity docs:
 *
 *   createdBy / updatedBy : { uid, name, email }  (a bare uid string is tolerated)
 *   createdAt / updatedAt : Firestore Timestamp | Date | ISO string | {seconds}
 *
 * Renders nothing when no provenance is available (e.g. self-registered students),
 * so it can be dropped onto any record surface unconditionally.
 *
 * Props:
 *   compact  — single inline "👤 Name" chip (for dense lists/cards)
 *   expanded (default) — two lines: created-by + last-modified-by, with dates
 */

const actorName = (a) => {
  if (!a) return '';
  if (typeof a === 'string') return ''; // bare uid — no display name available
  return a.name || a.email || '';
};

const toDate = (ts) => {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') { try { return ts.toDate(); } catch { return null; } }
  if (ts instanceof Date) return ts;
  if (typeof ts === 'object' && typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmt = (ts) => {
  const d = toDate(ts);
  return d
    ? d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
};

export default function OwnershipBadge({
  createdBy,
  createdAt,
  updatedBy,
  updatedAt,
  compact = false,
  className = '',
}) {
  const creator = actorName(createdBy);
  const editor = actorName(updatedBy);

  // Show the "last modified" line only when we know who edited it.
  const showUpdate = Boolean(editor);

  if (!creator && !editor && !createdAt && !updatedAt) return null;

  if (compact) {
    const label = creator || editor || '—';
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs text-gray-500 ${className}`.trim()}
        title={creator ? `أنشأ بواسطة ${creator}` : ''}
      >
        <User className="h-3 w-3 text-gray-400" aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 text-xs text-gray-500 ${className}`.trim()}>
      {(creator || createdAt) && (
        <span className="inline-flex flex-wrap items-center gap-1">
          <User className="h-3 w-3 flex-shrink-0 text-gray-400" aria-hidden />
          <span>
            أنشأ بواسطة <span className="font-medium text-gray-700">{creator || '—'}</span>
          </span>
          {createdAt && <span className="text-gray-400">· {fmt(createdAt)}</span>}
        </span>
      )}
      {showUpdate && (
        <span className="inline-flex flex-wrap items-center gap-1">
          <Pencil className="h-3 w-3 flex-shrink-0 text-gray-400" aria-hidden />
          <span>
            آخر تعديل بواسطة <span className="font-medium text-gray-700">{editor || '—'}</span>
          </span>
          {updatedAt && <span className="text-gray-400">· {fmt(updatedAt)}</span>}
        </span>
      )}
    </div>
  );
}
