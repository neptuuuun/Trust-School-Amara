/**
 * ScheduleConflictPanel — actionable, non-generic display of one or more
 * schedule conflicts (teacher / classroom / student) surfaced by the conflict
 * engine. Used by ClassFormModal and the enrolment modals.
 *
 * Each conflict descriptor (see src/utils/scheduleConflicts.js) carries the
 * entity name, the existing group + time, and the attempted time — everything
 * the spec's warning blocks require.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

const TITLES = {
  teacher: '⚠ تعارض في جدول الأستاذ',
  classroom: '⚠ تعارض في القاعة',
  student: '⚠ تعارض في جدول الطالب',
};

const ENTITY_LABEL = {
  teacher: 'الأستاذ',
  classroom: 'القاعة',
  student: 'الطالب',
};

const Row = ({ label, value }) => (
  <div className="flex flex-wrap gap-1">
    <span className="font-semibold text-danger-800">{label}:</span>
    <span className="text-danger-700">{value || '—'}</span>
  </div>
);

const ConflictCard = ({ c }) => (
  <div className="rounded-lg border border-danger-200 bg-white/70 p-3 text-sm">
    <p className="mb-2 font-bold text-danger-800">{TITLES[c.type] || TITLES.student}</p>
    <div className="space-y-1.5">
      <Row label={ENTITY_LABEL[c.type] || 'الكيان'} value={c.entityName} />
      <Row label="المجموعة الحالية" value={c.existingGroupName} />
      <Row label="الموعد الحالي" value={`${c.day} ${c.existingStart} - ${c.existingEnd}`} />
      <Row
        label="الموعد المطلوب"
        value={`${c.attemptedDay || c.day} ${c.attemptedStart || c.existingStart} - ${c.attemptedEnd || c.existingEnd}`}
      />
    </div>
    <p className="mt-2 text-xs text-danger-600">
      {c.type === 'classroom'
        ? 'هذه القاعة محجوزة خلال هذه الفترة.'
        : c.type === 'student'
          ? 'هذا الطالب مسجّل بالفعل خلال هذه الفترة.'
          : 'هذا الأستاذ مُسند بالفعل خلال هذه الفترة.'}
    </p>
  </div>
);

const ScheduleConflictPanel = ({ conflicts = [] }) => {
  if (!conflicts.length) return null;
  return (
    <div className="space-y-3 rounded-xl border border-danger-300 bg-danger-50 p-4" dir="rtl">
      <div className="flex items-center gap-2 text-danger-800">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <p className="text-sm font-bold">
          تعذّر الحفظ — يوجد {conflicts.length} تعارض في الجدول الزمني. عالج التعارضات التالية ثم أعد المحاولة.
        </p>
      </div>
      <div className="space-y-2">
        {conflicts.slice(0, 8).map((c, i) => <ConflictCard key={i} c={c} />)}
        {conflicts.length > 8 && (
          <p className="text-xs text-danger-600">…و {conflicts.length - 8} تعارضات أخرى.</p>
        )}
      </div>
    </div>
  );
};

export default ScheduleConflictPanel;
