/**
 * ArchiveKit — shared presentational building blocks for the admin ARCHIVE pages
 * (المسجلون في اللغات / الدورات التكوينية / دروس الدعم / الرسوم السنوية).
 *
 * These pages list records that are paid by construction — after the Chargily
 * migration a registration document only exists once money was captured — so
 * they are management views, never approval queues. This kit guarantees they
 * share one design system: identical spacing, card style, typography, stat
 * cards, skeleton loaders, empty states, detail rows, and search/filter controls.
 *
 * The payments page (سجل المدفوعات) is built on the same primitives, so the
 * whole admin dashboard reads as one product: rounded-2xl cards, gray-100/200
 * borders, shadow-sm, the `primary` brand color, full RTL.
 */

import React from 'react';
import { Search, Inbox } from 'lucide-react';
import {
  toJsDate as _toJsDate,
  formatDate as _formatDate,
  formatDateTime as _formatDateTime,
} from '../../../utils/dateUtils';

// ── Date / money helpers (single source of truth across the 4 pages) ───────────

// Re-export so existing archive page imports keep working.
export const toJsDate = _toJsDate;
export const fmtDate = _formatDate;
export const fmtDateTime = _formatDateTime;

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** True when the date falls in the current calendar month (used by "هذا الشهر" stats). */
export const isThisMonth = (value) => {
  const d = toJsDate(value);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

export const DATE_RANGES = [
  { value: 'all',   label: 'كل الأوقات' },
  { value: 'today', label: 'اليوم' },
  { value: 'week',  label: 'آخر 7 أيام' },
  { value: 'month', label: 'هذا الشهر' },
];

export const inDateRange = (value, range) => {
  if (range === 'all') return true;
  const d = toJsDate(value);
  if (!d) return false;
  switch (range) {
    case 'today': return d >= startOfToday();
    case 'week':  return Date.now() - d.getTime() <= 7 * 86400000;
    case 'month': {
      const n = new Date();
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
    }
    default: return true;
  }
};

export const formatMoney = (n) =>
  (n == null || n === '') ? null : `${Number(n).toLocaleString('en-US')} دج`;

// ── Shared control classes ─────────────────────────────────────────────────────

export const INPUT_CLASS =
  'w-full rounded-xl border border-gray-200 bg-white py-2.5 ps-10 pe-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20';

export const SELECT_CLASS =
  'rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20';

// ── Stat tones ──────────────────────────────────────────────────────────────────
// Built on the semantic brand tokens so the archive stat cards stay on-palette.
// The original color names (blue/green/amber/indigo/red/gray) are kept as
// back-compat aliases so existing page call sites need no changes.

const TONES = {
  primary:   'bg-primary/10 text-primary border-primary/20',
  secondary: 'bg-secondary-50 text-secondary-600 border-secondary-100',
  success:   'bg-success-50 text-success-700 border-success-100',
  warning:   'bg-warning-50 text-warning-700 border-warning-100',
  accent:    'bg-accent-50 text-accent-600 border-accent-100',
  danger:    'bg-danger-50 text-danger-600 border-danger-100',
  neutral:   'bg-gray-100 text-gray-600 border-gray-200',
};
const TONE_ALIASES = { blue: 'secondary', green: 'success', amber: 'warning', indigo: 'accent', red: 'danger', gray: 'neutral' };
const toneClass = (tone) => TONES[tone] || TONES[TONE_ALIASES[tone]] || TONES.secondary;

/** Informational stat card (display-only — these pages don't filter by status). */
export const StatCard = ({ icon: Icon, label, value, tone = 'secondary' }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
    <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${toneClass(tone)}`}>
      {Icon && <Icon className="h-5 w-5" />}
    </div>
    <div className="min-w-0">
      <p className="truncate text-xl font-bold leading-tight text-gray-900">{value}</p>
      <p className="mt-0.5 truncate text-xs text-gray-500">{label}</p>
    </div>
  </div>
);

// ── Page header (title + description + actions slot) ─────────────────────────────

export const PageHeader = ({ title, description, children }) => (
  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {description && <p className="mt-1 max-w-2xl text-sm text-gray-500">{description}</p>}
    </div>
    {children && <div className="flex flex-shrink-0 flex-wrap gap-2">{children}</div>}
  </div>
);

// ── Search input ─────────────────────────────────────────────────────────────────

export const SearchInput = ({ value, onChange, placeholder }) => (
  <div className="relative flex-1 min-w-48">
    <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={INPUT_CLASS}
    />
  </div>
);

// ── Empty state ──────────────────────────────────────────────────────────────────

export const EmptyState = ({ icon: Icon = Inbox, title, subtitle, action }) => (
  <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
      <Icon className="h-8 w-8 text-gray-300" />
    </div>
    <h3 className="text-base font-semibold text-gray-900">{title}</h3>
    {subtitle && <p className="mt-1 max-w-sm text-sm text-gray-500">{subtitle}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

// ── Skeleton loaders (replace bare spinners for a modern feel) ───────────────────

const Shimmer = ({ className = '' }) => (
  <div className={`animate-pulse rounded bg-gray-200/70 ${className}`} />
);

export const SkeletonStatCards = ({ count = 4 }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <Shimmer className="h-11 w-11 flex-shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-5 w-12" />
          <Shimmer className="h-3 w-20" />
        </div>
      </div>
    ))}
  </div>
);

export const SkeletonTable = ({ rows = 6, cols = 5 }) => (
  <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm sm:block">
    <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
      <Shimmer className="h-4 w-40" />
    </div>
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Shimmer key={c} className={`h-4 ${c === 0 ? 'w-40' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const SkeletonCards = ({ count = 4 }) => (
  <div className="space-y-3 sm:hidden">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="h-5 w-16 rounded-full" />
        </div>
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-9 w-full rounded-xl" />
      </div>
    ))}
  </div>
);

/** Combined skeleton: stat cards + table + mobile cards, used during initial load. */
export const ArchiveSkeleton = ({ statCount = 4, cols = 5 }) => (
  <div className="space-y-5">
    <SkeletonStatCards count={statCount} />
    <Shimmer className="h-11 w-full max-w-md rounded-xl" />
    <SkeletonTable cols={cols} />
    <SkeletonCards />
  </div>
);

// ── Detail modal building blocks ─────────────────────────────────────────────────

export const DetailSection = ({ title, children }) => (
  <section>
    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</p>
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-4">{children}</div>
  </section>
);

export const DetailRow = ({ label, value }) => {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2.5 last:border-0">
      <span className="flex-shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-end text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
};
