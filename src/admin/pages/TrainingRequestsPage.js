// TrainingRequestsPage — Training-INTEREST management (a CRM, not an inbox).
//
// Data:  branches/{branchId}/registrations  where  type === 'training_request'
//
// Purpose: students tell the school "I'd like this training IF you offer it."
// This is lead / demand management — NOT enrolment, registration, or approval
// (that lives in a separate system). So there is no Accept / Reject / Enrolled
// anywhere here. The admin works each interest through a pipeline:
//     new → contacted → following_up → closed   (+ reopen)
//
// The page is built to answer, at a glance: "which trainings are students asking
// for?" — via a most-requested-topics panel and a requests-over-time trend — and
// to make follow-up one click (Call / WhatsApp / Copy number), with a lifecycle
// side panel (timeline + internal notes). Identity always comes from the account.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, updateDoc, serverTimestamp, arrayUnion, Timestamp,
} from 'firebase/firestore';
import {
  Search, Download, Eye, Phone, MessageCircle, Clock, XCircle,
  RefreshCw, MoreVertical, Loader2, AlertCircle, TrendingUp, PhoneCall,
  StickyNote, Send, X, Flame, Users, ChevronLeft, Copy, Check, Sparkles,
  Archive, Calendar,
} from 'lucide-react';
import { db } from '../../firebase';
import { useBranch } from '../../contexts/BranchContext';
import { useAuth } from '../../contexts/AuthContext';
import { exportToCsv, generateFilename } from '../../utils/csvExport';
import { formatDateTime, formatDayMonth } from '../../utils/dateUtils';
import { Input } from '../../components/ui/input';
import { LoadingState } from '../../components/ui/feedback';
import AdminModal from '../components/AdminModal';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import { useToast } from '../components/ToastNotifications';
import {
  STATUS, STATUS_META, STATUS_ORDER, normalizeStatus, isOpen,
  getTopic, getStudentName, getStudentEmail, getStudentPhone,
  preferredTimeLabel, experienceLabel,
  initials, avatarTint, telHref, waHref, phoneDigits,
  relativeTime, ageInDays, isSameDay, toDate,
} from '../../utils/trainingRequests';

// ── Small utilities ─────────────────────────────────────────────────────────
const useDebounce = (value, delay) => {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
};

const STALE_DAYS = 3; // a NEW lead older than this needs urgent follow-up

const copyText = async (text) => {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
};

// ── Forward transitions per status (NO enrolment concept) ───────────────────
const NEXT_ACTIONS = {
  [STATUS.NEW]: [
    { to: STATUS.CONTACTED,    label: 'تم التواصل',  icon: PhoneCall, primary: true },
    { to: STATUS.FOLLOWING_UP, label: 'قيد المتابعة', icon: Clock,     primary: false },
  ],
  [STATUS.CONTACTED]: [
    { to: STATUS.FOLLOWING_UP, label: 'قيد المتابعة', icon: Clock, primary: true },
  ],
  [STATUS.FOLLOWING_UP]: [],
  [STATUS.CLOSED]: [],
};
const primaryActionFor = (status) => (NEXT_ACTIONS[normalizeStatus(status)] || []).find((a) => a.primary) || null;

// ── Status badge ────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const m = STATUS_META[normalizeStatus(status)];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${m.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
};

const Avatar = ({ name, size = 'md' }) => {
  const cls = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <div className={`flex ${cls} shrink-0 items-center justify-center rounded-full font-bold ${avatarTint(name)}`}>
      {initials(name)}
    </div>
  );
};

// ── Contact buttons: Call · WhatsApp · Copy (one-click, no drilling) ─────────
const ContactButtons = ({ phone, size = 'sm', onCopied }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!phone) return <span className="text-xs text-gray-300">لا يوجد رقم</span>;

  const pad = size === 'lg' ? 'px-3 py-2 text-sm' : 'p-1.5';
  const doCopy = async (e) => {
    e.stopPropagation(); e.preventDefault();
    const ok = await copyText(phoneDigits(phone));
    if (ok) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
      onCopied?.();
    }
  };
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <a href={telHref(phone)} onClick={(e) => e.stopPropagation()} title={`اتصال بـ ${phone}`} aria-label="اتصال"
         className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 ${pad} text-gray-600 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary`}>
        <Phone className="h-4 w-4" />{size === 'lg' && 'اتصال'}
      </a>
      <a href={waHref(phone)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="واتساب" aria-label="واتساب"
         className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-success-200 bg-success-50 ${pad} text-success-700 transition-colors hover:bg-success-100`}>
        <MessageCircle className="h-4 w-4" />{size === 'lg' && 'واتساب'}
      </a>
      <button type="button" onClick={doCopy} title="نسخ الرقم" aria-label="نسخ الرقم"
         className={`inline-flex items-center justify-center gap-1.5 rounded-lg border ${pad} transition-colors ${copied ? 'border-success-200 bg-success-50 text-success-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{size === 'lg' && (copied ? 'تم النسخ' : 'نسخ')}
      </button>
    </div>
  );
};

// ── Metric card (status cards double as filter toggles) ─────────────────────
const StatCard = ({ icon, label, value, sub, subTone = 'text-success-600', iconBg, active, onClick }) => {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-start shadow-sm transition-all ${onClick ? 'hover:shadow-md' : ''}
        ${active ? 'border-primary/40 ring-2 ring-primary/20' : 'border-gray-100'}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-none text-gray-900">{value}</p>
        <p className="mt-1 truncate text-xs text-gray-500">{label}</p>
        {sub != null && <p className={`mt-0.5 text-xs font-medium ${subTone}`}>{sub}</p>}
      </div>
    </Comp>
  );
};

// ── Most requested trainings (the demand answer) ────────────────────────────
const TopTopics = ({ topics, activeTopic, onPick }) => {
  if (!topics.length) return null;
  const max = topics[0].count;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-gray-900">أكثر الدورات طلباً</h3>
        <span className="text-xs text-gray-400">— أين يتركّز الطلب</span>
      </div>
      <ul className="space-y-2.5">
        {topics.map((t) => {
          const pct = Math.max(6, Math.round((t.count / max) * 100));
          const active = activeTopic === t.key;
          return (
            <li key={t.key}>
              <button type="button" onClick={() => onPick(active ? 'all' : t.key)} className="group flex w-full items-center gap-3 text-start"
                title={active ? 'إلغاء التصفية' : `تصفية حسب ${t.label}`}>
                <span className={`w-36 shrink-0 truncate text-sm ${active ? 'font-bold text-primary' : 'text-gray-700'}`}>{t.label}</span>
                <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <span className={`absolute inset-y-0 start-0 rounded-full transition-all ${active ? 'bg-primary' : 'bg-primary/40 group-hover:bg-primary/60'}`} style={{ width: `${pct}%` }} />
                </span>
                <span className="w-6 shrink-0 text-end text-sm font-semibold text-gray-600">{t.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ── Requests by date (14-day demand trend) ──────────────────────────────────
const RequestsByDate = ({ buckets, total }) => {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-gray-900">الطلبات حسب التاريخ</h3>
        <span className="text-xs text-gray-400">— آخر ١٤ يوماً ({total})</span>
      </div>
      <div className="flex h-28 items-end gap-1.5">
        {buckets.map((b) => (
          <div key={b.key} className="group relative flex flex-1 flex-col items-center justify-end" title={`${b.label}: ${b.count}`}>
            <span
              className={`w-full rounded-t transition-all ${b.count ? 'bg-primary/70 group-hover:bg-primary' : 'bg-gray-100'}`}
              style={{ height: `${b.count ? Math.max(8, (b.count / max) * 100) : 4}%` }}
            />
            {b.count > 0 && <span className="absolute -top-4 text-[10px] font-semibold text-gray-500 opacity-0 group-hover:opacity-100">{b.count}</span>}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-gray-400">
        <span>{buckets[0]?.label}</span>
        <span>{buckets[buckets.length - 1]?.label}</span>
      </div>
    </div>
  );
};

// ── Row action menu ─────────────────────────────────────────────────────────
const RowMenu = ({ status, onFollowUp, onClose, onReopen }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const s = normalizeStatus(status);
  const items = [];
  if (s === STATUS.NEW) items.push({ label: 'قيد المتابعة', icon: Clock, fn: onFollowUp });
  if (s === STATUS.NEW || s === STATUS.CONTACTED || s === STATUS.FOLLOWING_UP) items.push({ label: 'إغلاق الطلب', icon: XCircle, fn: onClose });
  if (s === STATUS.CLOSED) items.push({ label: 'إعادة فتح', icon: RefreshCw, fn: onReopen });
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute end-0 top-8 z-20 min-w-max rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
          {items.map((it) => (
            <button key={it.label} type="button" onClick={() => { it.fn(); setOpen(false); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
              <it.icon className="h-3.5 w-3.5" /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Activity timeline ───────────────────────────────────────────────────────
const ACTIVITY_META = {
  submitted:    { label: 'أبدى الطالب اهتمامه', icon: Send,       tone: 'text-gray-400 bg-gray-100' },
  contacted:    { label: 'تم التواصل مع الطالب', icon: PhoneCall,  tone: 'text-secondary-700 bg-secondary-50' },
  following_up: { label: 'وُضع قيد المتابعة',    icon: Clock,      tone: 'text-accent-700 bg-accent-50' },
  closed:       { label: 'أُغلق الطلب',          icon: XCircle,    tone: 'text-gray-500 bg-gray-100' },
  reopened:     { label: 'أُعيد فتح الطلب',       icon: RefreshCw,  tone: 'text-warning-700 bg-warning-50' },
  note:         { label: 'ملاحظة داخلية',        icon: StickyNote, tone: 'text-primary bg-primary/10' },
};

const Timeline = ({ request }) => {
  const events = useMemo(() => {
    const list = Array.isArray(request.activity) ? [...request.activity] : [];
    if (request.createdAt) list.push({ at: request.createdAt, type: 'submitted' });
    return list.filter((e) => e && e.type).sort((a, b) => {
      const da = toDate(a.at)?.getTime() || 0;
      const db2 = toDate(b.at)?.getTime() || 0;
      return db2 - da;
    });
  }, [request]);
  if (!events.length) return null;
  return (
    <ol className="space-y-3">
      {events.map((e, i) => {
        const meta = ACTIVITY_META[e.type] || ACTIVITY_META.note;
        const Icon = meta.icon;
        return (
          <li key={i} className="flex gap-3">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.tone}`}><Icon className="h-3.5 w-3.5" /></div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium text-gray-800">{meta.label}</p>
              {e.note && <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-600">{e.note}</p>}
              <p className="mt-0.5 text-xs text-gray-400">{formatDateTime(e.at)}{e.by ? ` · ${e.by}` : ''}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

const DRow = ({ label, value, mono }) => (
  <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2.5 last:border-0">
    <span className="shrink-0 text-sm text-gray-500">{label}</span>
    <span className={`text-end text-sm font-semibold text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</span>
  </div>
);

// ── Detail side panel ───────────────────────────────────────────────────────
const DetailPanel = ({ request, note, onNoteChange, onSaveNote, onSetStatus, onAskClose, onClose, onCopied, busy, branchName }) => {
  const s = normalizeStatus(request.status);
  const phone = getStudentPhone(request);
  const name = getStudentName(request);
  const actions = NEXT_ACTIONS[s] || [];
  const chips = [experienceLabel(request.experience), preferredTimeLabel(request.preferredTime)].filter(Boolean);
  const noteDirty = (note || '').trim() !== (request.adminNote || '').trim();

  const btnCls = (primary) => primary
    ? 'bg-primary text-white hover:bg-primary-700'
    : 'border border-gray-200 text-gray-700 hover:bg-gray-50';

  const footer = (
    <div className="flex w-full flex-col gap-2.5">
      {actions.map((a) => (
        <button key={a.to} onClick={() => onSetStatus(request, a.to)} disabled={!!busy}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60 ${btnCls(a.primary)}`}>
          {busy === 'status' ? <Loader2 className="h-4 w-4 animate-spin" /> : <a.icon className="h-4 w-4" />} {a.label}
        </button>
      ))}
      {isOpen(s) && (
        <button onClick={() => onAskClose(request)} disabled={!!busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60">
          <XCircle className="h-4 w-4" /> إغلاق الطلب
        </button>
      )}
      {s === STATUS.CLOSED && (
        <button onClick={() => onSetStatus(request, STATUS.NEW)} disabled={!!busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60">
          {busy === 'status' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} إعادة فتح الطلب
        </button>
      )}
    </div>
  );

  return (
    <AdminModal open onClose={onClose} size="md" title={name || 'تفاصيل الاهتمام'} badge={<StatusBadge status={request.status} />} footer={footer}>
      <div className="space-y-6">
        {/* Student + contact — the fast path */}
        <section className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-gray-900">{name || '—'}</p>
              <p className="truncate text-xs text-gray-500" dir="ltr">{getStudentEmail(request) || '—'}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-gray-600" dir="ltr">{phone || 'لا يوجد رقم هاتف'}</span>
            <ContactButtons phone={phone} size="lg" onCopied={onCopied} />
          </div>
        </section>

        {/* Interest details */}
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">تفاصيل الاهتمام</p>
          <DRow label="الدورة المطلوبة" value={getTopic(request)} />
          {request.experience && <DRow label="المستوى" value={experienceLabel(request.experience)} />}
          {request.preferredTime && <DRow label="الوقت المفضل" value={preferredTimeLabel(request.preferredTime)} />}
          <DRow label="الفرع" value={branchName || request.branchId} />
          <DRow label="تاريخ الطلب" value={formatDateTime(request.createdAt)} />
          {request.closedReason && <DRow label="سبب الإغلاق" value={request.closedReason} />}
        </section>

        {/* Student note */}
        {request.note && (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">وصف الطالب</p>
            <div className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">{request.note}</div>
          </section>
        )}

        {/* Internal admin note */}
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">ملاحظة داخلية</p>
          <textarea value={note} onChange={(e) => onNoteChange(e.target.value)} rows={2}
            placeholder="سجّل نتيجة المكالمة، تفاصيل المتابعة…"
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          <button onClick={() => onSaveNote(request)} disabled={!noteDirty || busy === 'note'}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-40">
            {busy === 'note' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StickyNote className="h-3.5 w-3.5" />} حفظ الملاحظة
          </button>
        </section>

        {/* Timeline */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">السجل الزمني</p>
          <Timeline request={request} />
        </section>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => <span key={c} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{c}</span>)}
          </div>
        )}
      </div>
    </AdminModal>
  );
};

// ── Main page ───────────────────────────────────────────────────────────────
const TrainingRequestsPage = () => {
  const { selectedBranchId, branches } = useBranch();
  const { adminData } = useAuth();
  const { show: toast } = useToast();
  const actorName = adminData?.name || 'الإدارة';
  const branchName = useMemo(
    () => branches?.find?.((b) => (b.id || b.branchId) === selectedBranchId)?.name || selectedBranchId,
    [branches, selectedBranchId],
  );

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [search, setSearch] = useState('');
  const dSearch = useDebounce(search, 250);
  const [statusFilter, setStatusFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState('all');
  const [openOnly, setOpenOnly] = useState(false);

  const [drawerId, setDrawerId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [busy, setBusy] = useState({});           // { [id]: 'status' | 'note' }
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeReason, setCloseReason] = useState('');

  // ── Real-time stream (same shape as before → existing composite index applies) ─
  useEffect(() => {
    if (!selectedBranchId) { setRequests([]); setLoading(false); return undefined; }
    setLoading(true); setLoadErr('');
    const q = query(
      collection(db, 'branches', selectedBranchId, 'registrations'),
      where('type', '==', 'training_request'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q,
      (snap) => { setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error(err); setLoadErr('فشل في تحميل الطلبات'); setLoading(false); },
    );
    return () => unsub();
  }, [selectedBranchId]);

  // ── Derived: counts ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const by = { new: 0, contacted: 0, following_up: 0, closed: 0 };
    let newToday = 0;
    requests.forEach((r) => {
      const s = normalizeStatus(r.status);
      by[s] += 1;
      if (s === STATUS.NEW && isSameDay(r.createdAt)) newToday += 1;
    });
    const open = by.new + by.contacted + by.following_up;
    return { ...by, total: requests.length, newToday, open };
  }, [requests]);

  // ── Derived: most-requested trainings (case-insensitive grouping) ──────────
  const topTopics = useMemo(() => {
    const map = new Map();
    requests.forEach((r) => {
      const label = getTopic(r);
      if (!label) return;
      const key = label.toLowerCase();
      const cur = map.get(key) || { key, label, count: 0 };
      cur.count += 1;
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [requests]);

  // ── Derived: requests-by-date (last 14 days) ────────────────────────────────
  const dateBuckets = useMemo(() => {
    const days = 14;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const buckets = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, label: formatDayMonth(d), date: d, count: 0 });
    }
    const index = new Map(buckets.map((b) => [b.key, b]));
    let inWindow = 0;
    requests.forEach((r) => {
      const d = toDate(r.createdAt);
      if (!d) return;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const b = index.get(key);
      if (b) { b.count += 1; inWindow += 1; }
    });
    return { buckets, inWindow };
  }, [requests]);

  // Unique topics keyed by a canonical lowercase key (matches TopTopics keys and
  // the row filter) while displaying the original-case label.
  const topicOptions = useMemo(() => {
    const m = new Map();
    requests.forEach((r) => {
      const label = getTopic(r);
      if (label && !m.has(label.toLowerCase())) m.set(label.toLowerCase(), label);
    });
    return [...m.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }, [requests]);

  // ── Derived: filtered + sorted rows ─────────────────────────────────────────
  const rows = useMemo(() => {
    const term = dSearch.trim().toLowerCase();
    const filtered = requests.filter((r) => {
      const s = normalizeStatus(r.status);
      if (openOnly && !isOpen(s)) return false;
      if (statusFilter !== 'all' && s !== statusFilter) return false;
      if (topicFilter !== 'all' && getTopic(r).toLowerCase() !== topicFilter) return false;
      if (term) {
        const hay = `${getStudentName(r)} ${getStudentEmail(r)} ${getStudentPhone(r)} ${getTopic(r)}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      const oa = STATUS_ORDER[normalizeStatus(a.status)];
      const ob = STATUS_ORDER[normalizeStatus(b.status)];
      if (oa !== ob) return oa - ob;
      return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
    });
  }, [requests, dSearch, statusFilter, topicFilter, openOnly]);

  const liveDrawer = useMemo(() => requests.find((r) => r.id === drawerId) || null, [requests, drawerId]);
  const openDrawer = (r) => { setNoteDraft(r.adminNote || ''); setDrawerId(r.id); };

  // ── Mutations ───────────────────────────────────────────────────────────────
  const setStatus = useCallback(async (req, next, reason) => {
    setBusy((p) => ({ ...p, [req.id]: 'status' }));
    try {
      const entry = { at: Timestamp.now(), type: next === STATUS.NEW ? 'reopened' : next, by: actorName };
      if (reason) entry.note = reason;
      const updates = { status: next, updatedAt: serverTimestamp(), activity: arrayUnion(entry) };
      if (next === STATUS.CONTACTED) updates.contactedAt = serverTimestamp();
      if (next === STATUS.FOLLOWING_UP) updates.followingUpAt = serverTimestamp();
      if (next === STATUS.CLOSED) { updates.closedAt = serverTimestamp(); updates.closedReason = reason || ''; }
      if (next === STATUS.NEW) updates.closedReason = '';
      await updateDoc(doc(db, 'branches', selectedBranchId, 'registrations', req.id), updates);
      toast('success', {
        [STATUS.CONTACTED]:    'تم وضع علامة "تم التواصل"',
        [STATUS.FOLLOWING_UP]: 'تم وضع الطلب قيد المتابعة',
        [STATUS.CLOSED]:       'تم إغلاق الطلب',
        [STATUS.NEW]:          'تمت إعادة فتح الطلب',
      }[next]);
    } catch (err) {
      toast('error', 'فشل تحديث الحالة: ' + (err.message || ''));
    } finally {
      setBusy((p) => { const n = { ...p }; delete n[req.id]; return n; });
    }
  }, [selectedBranchId, actorName, toast]);

  const saveNote = useCallback(async (req) => {
    const text = noteDraft.trim();
    setBusy((p) => ({ ...p, [req.id]: 'note' }));
    try {
      await updateDoc(doc(db, 'branches', selectedBranchId, 'registrations', req.id), {
        adminNote: text,
        updatedAt: serverTimestamp(),
        activity: arrayUnion({ at: Timestamp.now(), type: 'note', by: actorName, note: text }),
      });
      toast('success', 'تم حفظ الملاحظة');
    } catch (err) {
      toast('error', 'فشل حفظ الملاحظة: ' + (err.message || ''));
    } finally {
      setBusy((p) => { const n = { ...p }; delete n[req.id]; return n; });
    }
  }, [noteDraft, selectedBranchId, actorName, toast]);

  const confirmClose = useCallback(async () => {
    const req = closeTarget;
    if (!req) return;
    setCloseTarget(null);
    await setStatus(req, STATUS.CLOSED, closeReason.trim());
    setCloseReason('');
  }, [closeTarget, closeReason, setStatus]);

  const exportData = () => {
    if (!rows.length) { toast('warning', 'لا توجد بيانات للتصدير.'); return; }
    exportToCsv(rows.map((r) => ({
      name: getStudentName(r), email: getStudentEmail(r), phone: getStudentPhone(r),
      topic: getTopic(r), status: STATUS_META[normalizeStatus(r.status)].label,
      experience: experienceLabel(r.experience), preferredTime: preferredTimeLabel(r.preferredTime),
      createdAt: r.createdAt,
    })), [
      { key: 'name', header: 'الاسم' },
      { key: 'email', header: 'البريد الإلكتروني' },
      { key: 'phone', header: 'الهاتف' },
      { key: 'topic', header: 'الدورة المطلوبة' },
      { key: 'status', header: 'الحالة' },
      { key: 'experience', header: 'المستوى' },
      { key: 'preferredTime', header: 'الوقت المفضل' },
      { key: 'createdAt', header: 'تاريخ الطلب', type: 'date' },
    ], generateFilename('training-interest', 'csv'));
  };

  const hasFilters = search || statusFilter !== 'all' || topicFilter !== 'all' || openOnly;
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); setTopicFilter('all'); setOpenOnly(false); };
  const toggleStatus = (s) => setStatusFilter((p) => (p === s ? 'all' : s));

  // ── Guard ────────────────────────────────────────────────────────────────────
  if (!selectedBranchId) {
    return (
      <div className="flex items-center justify-center py-24 text-center" dir="rtl">
        <div>
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-warning-400" />
          <p className="text-gray-600">يرجى اختيار الفرع أولاً</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Close-with-reason dialog */}
      <AdminConfirmDialog
        open={!!closeTarget}
        title="إغلاق الطلب"
        message={closeTarget ? `إغلاق طلب اهتمام ${getStudentName(closeTarget) || '—'} بخصوص «${getTopic(closeTarget) || '—'}».` : ''}
        confirmLabel="إغلاق الطلب"
        danger={false}
        withReason
        reasonLabel="سبب الإغلاق (اختياري — يُسجَّل في السجل الزمني)"
        reasonPlaceholder="مثال: لا يوجد طلب كافٍ لفتح المجموعة…"
        reason={closeReason}
        onReasonChange={setCloseReason}
        onConfirm={confirmClose}
        onCancel={() => { setCloseTarget(null); setCloseReason(''); }}
      />

      {/* Detail side panel */}
      {liveDrawer && (
        <DetailPanel
          request={liveDrawer}
          note={noteDraft}
          onNoteChange={setNoteDraft}
          onSaveNote={saveNote}
          onSetStatus={(req, next) => setStatus(req, next)}
          onAskClose={(req) => { setCloseReason(''); setCloseTarget(req); }}
          onClose={() => setDrawerId(null)}
          onCopied={() => toast('success', 'تم نسخ الرقم')}
          busy={busy[liveDrawer.id]}
          branchName={branchName}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">طلبات الاهتمام بالدورات</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            قياس الطلب على دورات جديدة ومتابعة الطلاب المهتمين — ليست تسجيلاً في دورة.
          </p>
        </div>
        <button onClick={exportData} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <Download className="h-4 w-4" /> تصدير
        </button>
      </div>

      {loadErr && (
        <div className="flex items-center gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <AlertCircle className="h-4 w-4 shrink-0" /><span>{loadErr}</span>
          <button onClick={() => setLoadErr('')} className="ms-auto text-danger-500 hover:text-danger-700"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard value={stats.total} label="إجمالي الاهتمامات"
          icon={<Users className="h-5 w-5 text-primary" />} iconBg="bg-primary/10"
          active={statusFilter === 'all' && !openOnly} onClick={() => { setStatusFilter('all'); setOpenOnly(false); }} />
        <StatCard value={stats.new} label="جديدة — بانتظار التواصل" sub={stats.newToday ? `${stats.newToday} اليوم` : undefined}
          icon={<Sparkles className="h-5 w-5 text-warning-600" />} iconBg="bg-warning-50"
          active={statusFilter === STATUS.NEW} onClick={() => toggleStatus(STATUS.NEW)} />
        <StatCard value={stats.contacted} label="تم التواصل"
          icon={<PhoneCall className="h-5 w-5 text-secondary-600" />} iconBg="bg-secondary-50"
          active={statusFilter === STATUS.CONTACTED} onClick={() => toggleStatus(STATUS.CONTACTED)} />
        <StatCard value={stats.following_up} label="قيد المتابعة"
          icon={<Clock className="h-5 w-5 text-accent-600" />} iconBg="bg-accent-50"
          active={statusFilter === STATUS.FOLLOWING_UP} onClick={() => toggleStatus(STATUS.FOLLOWING_UP)} />
        <StatCard value={stats.closed} label="مغلقة"
          icon={<Archive className="h-5 w-5 text-gray-500" />} iconBg="bg-gray-100"
          active={statusFilter === STATUS.CLOSED} onClick={() => toggleStatus(STATUS.CLOSED)} />
      </div>

      {/* Demand insight: most requested + trend */}
      {requests.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          <TopTopics topics={topTopics} activeTopic={topicFilter} onPick={setTopicFilter} />
          <RequestsByDate buckets={dateBuckets.buckets} total={dateBuckets.inWindow} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[220px]">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم، البريد، الهاتف، أو الدورة…" startIcon={<Search className="h-4 w-4" />} />
        </div>
        {topicOptions.length > 0 && (
          <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
            <option value="all">جميع الدورات</option>
            {topicOptions.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        )}
        <button type="button" onClick={() => setOpenOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors
            ${openOnly ? 'border-warning-300 bg-warning-50 text-warning-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
          <Flame className="h-4 w-4" /> بحاجة لمتابعة {stats.open ? `(${stats.open})` : ''}
        </button>
        {hasFilters && (
          <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-sm text-gray-500 hover:text-gray-700">
            <X className="h-3.5 w-3.5" /> مسح
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-14 text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-gray-200" />
          <p className="text-gray-400">
            {hasFilters ? 'لا توجد طلبات مطابقة للتصفية الحالية.' : 'لا توجد طلبات اهتمام بعد. ستظهر هنا فور إبداء الطلاب اهتمامهم بدورات جديدة.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['الطالب', 'الدورة المطلوبة', 'التواصل', 'منذ', 'الحالة', 'الإجراء'].map((h) => (
                    <th key={h} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((req) => {
                  const s = normalizeStatus(req.status);
                  const primary = primaryActionFor(req.status);
                  const isBusy = busy[req.id];
                  const stale = s === STATUS.NEW && ageInDays(req.createdAt) >= STALE_DAYS;
                  return (
                    <tr key={req.id} onClick={() => openDrawer(req)}
                      className={`cursor-pointer transition-colors hover:bg-gray-50/70 ${stale ? 'border-s-2 border-s-danger-400' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={getStudentName(req)} size="sm" />
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900">{getStudentName(req) || '—'}</p>
                            <p className="truncate text-xs text-gray-400" dir="ltr">{getStudentEmail(req)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-[200px] truncate font-medium text-gray-700">{getTopic(req) || '—'}</p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {[experienceLabel(req.experience), preferredTimeLabel(req.preferredTime)].filter(Boolean).map((c) => (
                            <span key={c} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{c}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3"><ContactButtons phone={getStudentPhone(req)} onCopied={() => toast('success', 'تم نسخ الرقم')} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                        {relativeTime(req.createdAt)}
                        {stale && <span className="ms-1 inline-flex items-center gap-0.5 font-semibold text-danger-500"><Flame className="h-3 w-3" /></span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={req.status} /></td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {primary && (
                            <button onClick={() => setStatus(req, primary.to)} disabled={!!isBusy}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
                              {isBusy === 'status' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <primary.icon className="h-3.5 w-3.5" />} {primary.label}
                            </button>
                          )}
                          <button onClick={() => openDrawer(req)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                            <Eye className="h-3.5 w-3.5" /> عرض
                          </button>
                          <RowMenu status={req.status}
                            onFollowUp={() => setStatus(req, STATUS.FOLLOWING_UP)}
                            onClose={() => { setCloseReason(''); setCloseTarget(req); }}
                            onReopen={() => setStatus(req, STATUS.NEW)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {rows.map((req) => {
              const primary = primaryActionFor(req.status);
              const isBusy = busy[req.id];
              const s = normalizeStatus(req.status);
              const stale = s === STATUS.NEW && ageInDays(req.createdAt) >= STALE_DAYS;
              return (
                <div key={req.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${stale ? 'border-danger-200' : 'border-gray-100'}`}>
                  <div className="flex items-start gap-3" onClick={() => openDrawer(req)}>
                    <Avatar name={getStudentName(req)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900">{getStudentName(req) || '—'}</p>
                          <p className="mt-0.5 truncate text-sm font-medium text-primary">{getTopic(req) || '—'}</p>
                        </div>
                        <StatusBadge status={req.status} />
                      </div>
                      <p className="mt-1 text-xs text-gray-400">{relativeTime(req.createdAt)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                    <ContactButtons phone={getStudentPhone(req)} onCopied={() => toast('success', 'تم نسخ الرقم')} />
                    <div className="ms-auto flex items-center gap-2">
                      {primary && (
                        <button onClick={() => setStatus(req, primary.to)} disabled={!!isBusy}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                          {isBusy === 'status' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <primary.icon className="h-3.5 w-3.5" />} {primary.label}
                        </button>
                      )}
                      <button onClick={() => openDrawer(req)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600">
                        <ChevronLeft className="h-3.5 w-3.5" /> التفاصيل
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="px-1 text-xs text-gray-400">عرض {rows.length} من {requests.length} طلب</p>
        </>
      )}
    </div>
  );
};

export default TrainingRequestsPage;
