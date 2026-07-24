/**
 * SubjectClassManager — reusable admin catalog screen for the Subject → Class
 * model, shared by all services (language | training | support).
 *
 * Hierarchy shown:  Subject  ▸  Classes (teacher · group · schedules)
 *
 * Props:
 *   serviceType : 'language' | 'training' | 'support'   (required)
 *   scope       : { studyYear, level }  — extra context for support subjects
 *   headerTrail : string[]              — optional breadcrumb trail override
 *
 * Data is fully branch-isolated via streamSubjects / streamClasses.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Edit2, Trash2, AlertCircle, Search, Loader2,
  ChevronDown, ChevronUp, BookOpen, Users, Clock, GraduationCap,
  UserCog, Eye, EyeOff, History,
} from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import { useToast } from './ToastNotifications';
import Breadcrumb from './Breadcrumb';
import AdminConfirmDialog from './AdminConfirmDialog';
import SubjectFormModal from './SubjectFormModal';
import ClassFormModal from './ClassFormModal';
import TeacherManagerModal from './TeacherManagerModal';
import EntityHistoryPanel from './EntityHistoryPanel';
import {
  streamSubjects, streamClasses, deleteSubject, deleteClass, updateClass,
} from '../../services/firestoreService';
import { groupTypeBadge, normalizeGroupType } from '../../utils/supportClassification';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { LoadingState } from '../../components/ui/feedback';
import OwnershipBadge from '../../components/ui/OwnershipBadge';

// ── Per-service labels ──────────────────────────────────────────────────────
const SERVICE_CONFIG = {
  language: {
    subjectWord: 'اللغة', subjectsTitle: 'اللغات', addSubjectLabel: 'إضافة لغة',
    subjectDesc: 'أضف اللغات ثم المجموعات (الأستاذ والمواعيد) داخل كل لغة.',
    namePlaceholder: 'مثال: الإنجليزية، الفرنسية، الإسبانية...',
    classWord: 'مجموعة', showLevel: true, levelLabel: 'المستوى (CEFR)',
    subjectsStatLabel: 'إجمالي اللغات', classesStatLabel: 'إجمالي المجموعات',
    searchPlaceholder: 'ابحث باسم اللغة أو الأستاذ أو المجموعة...',
    emptyText: 'لم تتم إضافة أي لغة بعد.', emptyCta: 'إضافة أول لغة',
    trail: ['إدارة اللغات'],
  },
  training: {
    subjectWord: 'الدورة', subjectsTitle: 'الدورات التكوينية', addSubjectLabel: 'إضافة دورة',
    subjectDesc: 'أضف الدورات ثم المجموعات (الأستاذ والمواعيد) داخل كل دورة.',
    namePlaceholder: 'مثال: تطوير الويب، التصميم...',
    classWord: 'مجموعة', showLevel: false, levelLabel: 'المستوى',
    subjectsStatLabel: 'إجمالي الدورات', classesStatLabel: 'إجمالي المجموعات',
    searchPlaceholder: 'ابحث باسم الدورة أو الأستاذ أو المجموعة...',
    emptyText: 'لم تتم إضافة أي دورة بعد.', emptyCta: 'إضافة أول دورة',
    trail: ['إدارة الدورات التكوينية'],
  },
  support: {
    subjectWord: 'المادة', subjectsTitle: 'المواد', addSubjectLabel: 'إضافة مادة',
    subjectDesc: 'أضف المواد ثم المجموعات (الأستاذ والمواعيد) داخل كل مادة.',
    namePlaceholder: 'مثال: الرياضيات، الفيزياء...',
    classWord: 'مجموعة', showLevel: false, levelLabel: 'المستوى',
    subjectsStatLabel: 'إجمالي المواد', classesStatLabel: 'إجمالي المجموعات',
    searchPlaceholder: 'ابحث باسم المادة أو الأستاذ أو المجموعة...',
    emptyText: 'لم تتم إضافة أي مادة بعد.', emptyCta: 'إضافة أول مادة',
    trail: ['إدارة دروس الدعم'],
  },
};

const formatScheduleSummary = (schedules) => {
  if (!Array.isArray(schedules) || schedules.length === 0) return null;
  const first = schedules[0];
  const slot = [first.day, first.start && first.end ? `${first.start}–${first.end}` : '']
    .filter(Boolean).join(' ');
  return schedules.length > 1 ? `${slot} (+${schedules.length - 1})` : slot;
};

const SubjectClassManager = ({ serviceType, scope = {}, headerTrail }) => {
  const cfg = SERVICE_CONFIG[serviceType] || SERVICE_CONFIG.support;
  const { selectedBranchId } = useBranch();
  const { show: showToast } = useToast();

  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({}); // subjectId -> true when collapsed
  const [groupTypeFilter, setGroupTypeFilter] = useState('all'); // support only: all|normal_support|low_level_support

  // Modal state
  const [subjectModal, setSubjectModal] = useState(undefined); // undefined=closed, null=add, object=edit
  const [classModal, setClassModal] = useState(null);          // { subject, classData }
  const [deleteState, setDeleteState] = useState({ open: false, kind: null, id: null, name: '' });
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [busyClassId, setBusyClassId] = useState(null);
  // { targetType, targetId, title } for the record-level "View History" panel.
  const [historyTarget, setHistoryTarget] = useState(null);

  const isSupport = serviceType === 'support';

  // ── Streams (branch-scoped) ────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedBranchId) { setSubjects([]); setClasses([]); setLoading(false); return undefined; }
    setLoading(true);
    let loadedSubjects = false;
    const unsubSubjects = streamSubjects(selectedBranchId, serviceType, scope, (rows) => {
      setSubjects(rows);
      loadedSubjects = true;
      setLoading(false);
    });
    const unsubClasses = streamClasses(selectedBranchId, { serviceType }, (rows) => {
      setClasses(scope.studyYear ? rows.filter((r) => r.studyYear === scope.studyYear) : rows);
      if (loadedSubjects) setLoading(false);
    });
    return () => { unsubSubjects?.(); unsubClasses?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, serviceType, scope.studyYear]);

  // ── Group classes by subject ───────────────────────────────────────────────
  const classesBySubject = useMemo(() => {
    const map = {};
    classes.forEach((c) => { (map[c.subjectId] = map[c.subjectId] || []).push(c); });
    return map;
  }, [classes]);

  // Support-only group-type counts for the filter pills.
  const groupTypeCounts = useMemo(() => {
    const c = { all: classes.length, normal_support: 0, low_level_support: 0 };
    classes.forEach((cl) => { c[normalizeGroupType(cl.groupType)] += 1; });
    return c;
  }, [classes]);

  const matchesGroupType = (c) =>
    !isSupport || groupTypeFilter === 'all' || normalizeGroupType(c.groupType) === groupTypeFilter;

  // ── Search filter ──────────────────────────────────────────────────────────
  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return subjects;
    return subjects.filter((s) => {
      if (String(s.name || '').toLowerCase().includes(term)) return true;
      const cls = classesBySubject[s.id] || [];
      return cls.some((c) =>
        String(c.teacherName || '').toLowerCase().includes(term) ||
        String(c.groupName || '').toLowerCase().includes(term));
    });
  }, [subjects, classesBySubject, term]);

  const isExpanded = (id) => term ? true : !collapsed[id];
  const toggle = (id) => setCollapsed((p) => ({ ...p, [id]: !p[id] }));

  // ── Delete handlers ────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    const { kind, id } = deleteState;
    setDeleteState({ open: false, kind: null, id: null, name: '' });
    try {
      if (kind === 'subject') {
        await deleteSubject(selectedBranchId, id);
        showToast('info', `تم حذف ${cfg.subjectWord} وجميع مجموعاتها`);
      } else {
        await deleteClass(selectedBranchId, id);
        showToast('info', 'تم حذف المجموعة');
      }
    } catch (err) {
      // Safe-delete guard: block when approved registrations exist; suggest deactivating.
      if (err?.code === 'class-has-registrations') {
        showToast('error', `لا يمكن الحذف: توجد ${err.count} تسجيلات معتمدة. عطّل المجموعة بدلاً من ذلك.`);
      } else if (err?.code === 'subject-has-registrations') {
        showToast('error', `لا يمكن الحذف: توجد ${err.count} تسجيلات معتمدة ضمن مجموعاتها. عطّل المجموعات بدلاً من ذلك.`);
      } else {
        console.error('delete error:', err);
        showToast('error', 'حدث خطأ أثناء الحذف');
      }
    }
  };

  // Activate / deactivate a class (safe alternative to deletion — preserves
  // enrolled students' registration references; deactivated classes are hidden
  // from students via the activeOnly stream filter).
  const toggleClassStatus = async (cls) => {
    const next = (cls.status || 'active') === 'active' ? 'inactive' : 'active';
    setBusyClassId(cls.id);
    try {
      await updateClass(selectedBranchId, cls.id, { status: next });
      showToast('success', next === 'active' ? 'تم تفعيل المجموعة' : 'تم تعطيل المجموعة');
    } catch {
      showToast('error', 'تعذر تغيير حالة المجموعة');
    } finally {
      setBusyClassId(null);
    }
  };

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!selectedBranchId) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-warning-400" />
        <p className="text-gray-600">يرجى اختيار الفرع أولاً</p>
      </div>
    );
  }

  return (
    <motion.div className="space-y-5" dir="rtl" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {/* Overlays */}
      {subjectModal !== undefined && (
        <SubjectFormModal
          branchId={selectedBranchId}
          serviceType={serviceType}
          subject={subjectModal}
          scope={scope}
          terms={{ subjectWord: cfg.subjectWord, namePlaceholder: cfg.namePlaceholder }}
          onClose={() => setSubjectModal(undefined)}
        />
      )}
      {classModal && (
        <ClassFormModal
          branchId={selectedBranchId}
          serviceType={serviceType}
          subject={classModal.subject}
          classData={classModal.classData}
          showLevel={cfg.showLevel}
          terms={{ classWord: cfg.classWord, levelLabel: cfg.levelLabel }}
          onClose={() => setClassModal(null)}
        />
      )}
      <AdminConfirmDialog
        open={deleteState.open}
        title={deleteState.kind === 'subject' ? `حذف ${cfg.subjectWord}` : 'حذف المجموعة'}
        message={
          deleteState.kind === 'subject'
            ? `هل أنت متأكد من حذف "${deleteState.name}"؟ سيتم حذف جميع المجموعات بداخلها. لا يمكن التراجع.`
            : `هل أنت متأكد من حذف "${deleteState.name}"؟ لا يمكن التراجع عن هذا الإجراء.`
        }
        confirmLabel="حذف"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteState({ open: false, kind: null, id: null, name: '' })}
      />
      {teacherModalOpen && (
        <TeacherManagerModal branchId={selectedBranchId} onClose={() => setTeacherModalOpen(false)} />
      )}
      {historyTarget && (
        <EntityHistoryPanel
          targetType={historyTarget.targetType}
          targetId={historyTarget.targetId}
          branchId={selectedBranchId}
          title={historyTarget.title}
          onClose={() => setHistoryTarget(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Breadcrumb trail={headerTrail || cfg.trail} />
          <h1 className="text-2xl font-bold text-gray-900">{cfg.subjectsTitle}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{cfg.subjectDesc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="neutral" size="sm" onClick={() => setTeacherModalOpen(true)}>
            <UserCog className="h-4 w-4" />
            إدارة الأساتذة
          </Button>
          <Button variant="primary" size="sm" onClick={() => setSubjectModal(null)}>
            <Plus className="h-4 w-4" />
            {cfg.addSubjectLabel}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{subjects.length}</p>
          <p className="mt-1 text-xs text-gray-500">{cfg.subjectsStatLabel}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{classes.length}</p>
          <p className="mt-1 text-xs text-gray-500">{cfg.classesStatLabel}</p>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-sm">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={cfg.searchPlaceholder}
          startIcon={<Search className="h-4 w-4" />}
        />
      </div>

      {/* Group-type filter — support only */}
      {isSupport && (
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'all', label: 'كل المجموعات', count: groupTypeCounts.all },
            { value: 'normal_support', label: '🟢 مجموعات عادية', count: groupTypeCounts.normal_support },
            { value: 'low_level_support', label: '🟠 مجموعات دعم خاصة', count: groupTypeCounts.low_level_support },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setGroupTypeFilter(f.value)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                groupTypeFilter === f.value ? 'bg-primary text-white shadow-sm' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {f.label}
              <span className={`ms-1.5 rounded-full px-1.5 py-0.5 text-xs ${groupTypeFilter === f.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-14 text-center">
          <BookOpen className="mx-auto mb-4 h-12 w-12 text-gray-200" />
          <p className="mb-4 text-gray-400">{search ? 'لا توجد نتائج تطابق بحثك.' : cfg.emptyText}</p>
          {!search && (
            <Button variant="primary" size="sm" onClick={() => setSubjectModal(null)}>
              <Plus className="h-4 w-4" />
              {cfg.emptyCta}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((subject) => {
            const subjectClasses = (classesBySubject[subject.id] || []).filter(matchesGroupType);
            // When a group-type filter is active, hide subjects with no matching groups.
            if (isSupport && groupTypeFilter !== 'all' && subjectClasses.length === 0) return null;
            const expanded = isExpanded(subject.id);
            return (
              <div key={subject.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                {/* Subject header */}
                <div className="flex items-start justify-between gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => toggle(subject.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-start"
                  >
                    <span className="mt-0.5 text-gray-400">
                      {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <h3 className="truncate text-base font-bold text-gray-900">{subject.name || 'بدون اسم'}</h3>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          {subjectClasses.length} مجموعة
                        </span>
                      </span>
                      {subject.description && (
                        <p className="mt-0.5 truncate text-xs text-gray-500">{subject.description}</p>
                      )}
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => setHistoryTarget({ targetType: 'subject', targetId: subject.id, title: subject.name || cfg.subjectWord })}
                      title="عرض السجل"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <History className="h-3.5 w-3.5" />
                      السجل
                    </button>
                    <button
                      onClick={() => setSubjectModal(subject)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      تعديل
                    </button>
                    <button
                      onClick={() => setDeleteState({ open: true, kind: 'subject', id: subject.id, name: subject.name || cfg.subjectWord })}
                      className="inline-flex items-center gap-1 rounded-lg border border-danger-100 bg-danger-50 px-2.5 py-1.5 text-xs font-medium text-danger-600 hover:bg-danger-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </button>
                  </div>
                </div>
                {(subject.createdBy || subject.updatedBy) && (
                  <div className="-mt-1 px-4 pb-2">
                    <OwnershipBadge
                      compact
                      createdBy={subject.createdBy}
                      createdAt={subject.createdAt}
                      updatedBy={subject.updatedBy}
                      updatedAt={subject.updatedAt}
                    />
                  </div>
                )}

                {/* Classes */}
                {expanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50 p-4">
                    {subjectClasses.length === 0 ? (
                      <p className="mb-3 text-sm text-gray-400">لا توجد مجموعات بعد.</p>
                    ) : (
                      <div className="mb-3 space-y-2">
                        {subjectClasses.map((c) => {
                          const summary = formatScheduleSummary(c.schedules);
                          const cap = Number(c.capacity) || 0;
                          const enrolled = Number(c.enrollmentCount) || 0;
                          const isFull = cap > 0 && enrolled >= cap;
                          const inactive = (c.status || 'active') !== 'active';
                          return (
                            <div key={c.id} className={`flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3 ${inactive ? 'opacity-60' : ''}`}>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">
                                    <GraduationCap className="h-4 w-4 text-primary" />
                                    {c.teacherName || '—'}
                                  </span>
                                  <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                    <Users className="h-3 w-3" />
                                    {c.groupName || '—'}
                                  </span>
                                  {isSupport && (() => {
                                    const gt = groupTypeBadge(c.groupType);
                                    return (
                                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${gt.classes}`}>
                                        <gt.Icon className={`h-2.5 w-2.5 shrink-0 ${gt.iconClass}`} fill="currentColor" aria-hidden="true" />
                                        {gt.label}
                                      </span>
                                    );
                                  })()}
                                  {c.level && (
                                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{c.level}</span>
                                  )}
                                  {c.price > 0 && <span className="text-xs text-gray-500">· {c.price} دج{isSupport ? '/شهر' : ''}</span>}
                                  {isSupport && Array.isArray(c.schedules) && c.schedules.length > 0 && (
                                    <span className="text-xs text-gray-500">· {c.schedules.length} حصة/أسبوع</span>
                                  )}
                                  {cap > 0 && (
                                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${isFull ? 'bg-danger-100 text-danger-700' : 'bg-success-50 text-success-700'}`}>
                                      {enrolled}/{cap} مقعد{isFull ? ' (مكتمل)' : ''}
                                    </span>
                                  )}
                                  {cap === 0 && enrolled > 0 && (
                                    <span className="text-xs text-gray-500">· {enrolled} مسجل</span>
                                  )}
                                  {inactive && (
                                    <span className="rounded-md bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">معطّلة</span>
                                  )}
                                </div>
                                <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                                  <Clock className="h-3 w-3" />
                                  {summary
                                    ? `${summary} — ${c.schedules.length} ${c.schedules.length === 1 ? 'موعد' : 'مواعيد'}`
                                    : 'لا مواعيد'}
                                </p>
                                {(c.createdBy || c.updatedBy) && (
                                  <OwnershipBadge
                                    className="mt-1.5"
                                    createdBy={c.createdBy}
                                    createdAt={c.createdAt}
                                    updatedBy={c.updatedBy}
                                    updatedAt={c.updatedAt}
                                  />
                                )}
                              </div>
                              <div className="flex shrink-0 gap-1.5">
                                <button
                                  onClick={() => setHistoryTarget({ targetType: 'class', targetId: c.id, title: `${c.teacherName || ''} — ${c.groupName || ''}` })}
                                  aria-label="عرض السجل"
                                  title="عرض السجل"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                                >
                                  <History className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => toggleClassStatus(c)}
                                  disabled={busyClassId === c.id}
                                  aria-label={inactive ? 'تفعيل المجموعة' : 'تعطيل المجموعة'}
                                  title={inactive ? 'تفعيل (إظهار للطلاب)' : 'تعطيل (إخفاء عن الطلاب)'}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                >
                                  {busyClassId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (inactive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />)}
                                </button>
                                <button
                                  onClick={() => setClassModal({ subject, classData: c })}
                                  aria-label="تعديل المجموعة"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteState({ open: true, kind: 'class', id: c.id, name: `${c.teacherName} — ${c.groupName}` })}
                                  aria-label="حذف المجموعة"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-danger-100 bg-danger-50 text-danger-500 hover:bg-danger-100"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button
                      onClick={() => setClassModal({ subject, classData: null })}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
                    >
                      <Plus className="h-4 w-4" />
                      إضافة مجموعة
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default SubjectClassManager;
