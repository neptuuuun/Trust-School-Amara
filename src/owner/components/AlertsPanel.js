import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertOctagon, AlertTriangle, Info, ChevronLeft, ChevronDown, ChevronUp, BellOff,
  Building2, Layers, GraduationCap, User, HelpCircle, TrendingDown, Lightbulb, CalendarDays,
} from 'lucide-react';

/**
 * Decision-support alerts for the owner dashboard. Each alert is a compact unit:
 * a header (severity · branch · related entity · date), the key numbers, and an
 * expandable body with the three analytical parts the owner needs to act:
 *   • التحليل (Root Cause)        — why the system believes this fired
 *   • الأثر على العمل (Impact)    — the consequence of inaction + risk tag
 *   • الإجراءات الموصى بها (Actions) — data-specific next steps, each a deep link
 *
 * Pure presentational — the caller fetches `alerts` (getOwnerAlerts) and passes
 * them in. Degrades gracefully for legacy alerts missing the new fields.
 *
 * Props:
 *   alerts:      [{ id, severity, type, title, summary, branchName, entity{type,name},
 *                  date, metrics[{label,value}], rootCause, businessImpact, impactType,
 *                  recommendedActions[{label,link}], link }]
 *   limit:       show only the top-N (compact mode, e.g. OwnerHome); a "view all"
 *                link to /owner/alerts appears when more exist.
 *   defaultOpen: expand the analytical body by default (the dedicated Alerts page).
 *   emptyHint:   text shown when there are no alerts.
 */

const SEVERITY = {
  critical: { label: 'حرجة',  icon: AlertOctagon,  stripe: 'bg-danger-500',    badge: 'bg-danger-100 text-danger-700',       iconCls: 'text-danger-600' },
  warning:  { label: 'تحذير', icon: AlertTriangle, stripe: 'bg-warning-500',   badge: 'bg-warning-100 text-warning-700',     iconCls: 'text-warning-600' },
  info:     { label: 'معلومة', icon: Info,         stripe: 'bg-secondary-500', badge: 'bg-secondary-100 text-secondary-700', iconCls: 'text-secondary-600' },
};
const ORDER = ['critical', 'warning', 'info'];

// Risk category tag shown beside the business-impact heading.
const IMPACT = {
  revenue_loss: { label: 'خطر خسارة الإيراد', cls: 'bg-danger-50 text-danger-700 border-danger-200' },
  cashflow:     { label: 'خطر التدفق النقدي', cls: 'bg-warning-50 text-warning-700 border-warning-200' },
  retention:    { label: 'خطر فقدان الطلاب',  cls: 'bg-accent-50 text-accent-700 border-accent-200' },
  operational:  { label: 'خطر تشغيلي',        cls: 'bg-secondary-50 text-secondary-700 border-secondary-200' },
  fraud:        { label: 'خطر تلاعب مالي',    cls: 'bg-danger-50 text-danger-700 border-danger-200' },
  reputation:   { label: 'خطر السمعة',        cls: 'bg-warning-50 text-warning-700 border-warning-200' },
};

const ENTITY_ICON = { branch: Building2, group: Layers, teacher: GraduationCap, student: User };

const fmtDate = (iso) => { try { return iso ? new Date(iso).toLocaleDateString('en-GB') : ''; } catch { return ''; } };

const Chip = ({ icon: Icon, children, className = 'bg-gray-100 text-gray-600' }) => (
  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${className}`}>
    {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
    {children}
  </span>
);

const AlertCard = ({ a, defaultOpen = false }) => {
  const meta = SEVERITY[a.severity] || SEVERITY.info;
  const Icon = meta.icon;
  const [open, setOpen] = useState(defaultOpen);

  const impact = a.impactType ? IMPACT[a.impactType] : null;
  const EntityIcon = a.entity && a.entity.type ? ENTITY_ICON[a.entity.type] : null;
  const actions = Array.isArray(a.recommendedActions) ? a.recommendedActions : [];
  const metrics = Array.isArray(a.metrics) ? a.metrics : [];
  const hasDetail = Boolean(a.rootCause || a.businessImpact || actions.length);

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <span className={`absolute inset-y-0 start-0 z-10 w-1.5 ${meta.stripe}`} aria-hidden="true" />

      <div className="p-4 ps-5">
        {/* Header: severity · branch · entity · date */}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <Chip icon={Icon} className={`font-bold ${meta.badge}`}>{meta.label}</Chip>
          {a.branchName && <Chip icon={Building2}>{a.branchName}</Chip>}
          {a.entity && a.entity.name && EntityIcon && <Chip icon={EntityIcon}>{a.entity.name}</Chip>}
          {a.date && (
            <span className="ms-auto inline-flex items-center gap-1 text-gray-400">
              <CalendarDays className="h-3 w-3" aria-hidden="true" /> {fmtDate(a.date)}
            </span>
          )}
        </div>

        {/* Title + executive summary */}
        <p className="text-sm font-bold text-gray-900">{a.title}</p>
        {(a.summary || a.message) && (
          <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{a.summary || a.message}</p>
        )}

        {/* Key numbers */}
        {metrics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {metrics.map((m, i) => (
              <span key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1">
                <span className="text-[10px] text-gray-500">{m.label}</span>
                <span className="ms-1 text-xs font-bold text-gray-800">{m.value}</span>
              </span>
            ))}
          </div>
        )}

        {hasDetail && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-600"
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? 'إخفاء التحليل' : 'لماذا حدث؟ وماذا أفعل؟'}
          </button>
        )}
      </div>

      {/* Analytical body */}
      {open && hasDetail && (
        <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 p-4 ps-5">
          {a.rootCause && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-gray-700">
                <HelpCircle className="h-3.5 w-3.5 text-secondary-600" aria-hidden="true" /> التحليل — السبب المرجّح
              </p>
              <p className="text-xs leading-relaxed text-gray-600">{a.rootCause}</p>
            </div>
          )}
          {a.businessImpact && (
            <div>
              <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-bold text-gray-700">
                <TrendingDown className="h-3.5 w-3.5 text-danger-600" aria-hidden="true" /> الأثر على العمل
                {impact && <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${impact.cls}`}>{impact.label}</span>}
              </p>
              <p className="text-xs leading-relaxed text-gray-600">{a.businessImpact}</p>
            </div>
          )}
          {actions.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-gray-700">
                <Lightbulb className="h-3.5 w-3.5 text-warning-600" aria-hidden="true" /> الإجراءات الموصى بها
              </p>
              <div className="flex flex-wrap gap-2">
                {actions.map((act, i) => (act.link ? (
                  <Link
                    key={i}
                    to={act.link}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-50"
                  >
                    {act.label}
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                ) : (
                  <span key={i} className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">
                    {act.label}
                  </span>
                )))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legacy fallback: an alert with only a primary link and no analytical parts. */}
      {!hasDetail && a.link && (
        <div className="border-t border-gray-100 p-3 ps-5">
          <Link to={a.link} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-600">
            عرض التفاصيل <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
};

export default function AlertsPanel({ alerts = [], limit, emptyHint = 'لا توجد تنبيهات — كل شيء على ما يرام.', defaultOpen = false }) {
  const list = limit ? alerts.slice(0, limit) : alerts;
  const groups = ORDER
    .map((sev) => ({ sev, items: list.filter((a) => a.severity === sev) }))
    .filter((g) => g.items.length);

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-gray-500">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-500">
          <BellOff className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="text-sm">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.sev} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${SEVERITY[g.sev].badge}`}>{SEVERITY[g.sev].label}</span>
            <span className="text-xs text-gray-400">{g.items.length}</span>
          </div>
          <div className="space-y-2.5">
            {g.items.map((a) => <AlertCard key={a.id} a={a} defaultOpen={defaultOpen} />)}
          </div>
        </div>
      ))}

      {limit && alerts.length > limit && (
        <Link to="/owner/alerts" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-600">
          عرض كل التنبيهات ({alerts.length})
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
