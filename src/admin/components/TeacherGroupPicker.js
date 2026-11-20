/**
 * TeacherGroupPicker — teacher-first group selection.
 *
 * An admin registering a student picks the TEACHER first; the group is chosen
 * only when it's ambiguous:
 *   • teacher with a single group  → selecting the teacher auto-selects it
 *   • teacher with multiple groups → a second step asks which group
 *
 * Controlled component: the parent owns the selected group id (`value`) and is
 * notified via `onChange(id | null)`. The full group object stays with the
 * parent (it looks it up by id), so each caller keeps its own save logic.
 *
 * Each item: { id, teacherName, groupLabel, subLabel?, disabled?, disabledReason? }
 * Works on desktop and mobile (chips wrap; generous tap targets).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Users, ChevronRight, Check } from 'lucide-react';
import { groupByTeacher } from '../../utils/teacherGroups';

const TeacherGroupPicker = ({
  items = [],
  value = '',
  onChange,
  groupQuestion = 'ما هي المجموعة التي تريد تعيين الطالب فيها؟',
  teacherLabel = 'اختر الأستاذ',
  emptyLabel = 'لا يوجد أساتذة متاحون.',
}) => {
  const teachers = useMemo(() => groupByTeacher(items), [items]);
  // Signature of the current teacher set — when it changes (different subject /
  // student / eligibility), the two-step state resets to the teacher step.
  const teacherSig = useMemo(() => teachers.map((t) => t.teacherKey).join('|'), [teachers]);

  const [activeTeacherKey, setActiveTeacherKey] = useState(null);

  // Reset to the teacher step whenever the underlying set of teachers changes.
  useEffect(() => { setActiveTeacherKey(null); }, [teacherSig]);

  // If the parent sets/keeps a selected value, surface that teacher's group step
  // so the selection stays visible and editable.
  useEffect(() => {
    if (!value) return;
    const owner = teachers.find((t) => t.groups.some((g) => g.id === value));
    if (owner) setActiveTeacherKey(owner.teacherKey);
  }, [value, teachers]);

  const activeTeacher = teachers.find((t) => t.teacherKey === activeTeacherKey) || null;

  const selectableOf = (teacher) => teacher.groups.filter((g) => !g.disabled);
  const isTeacherDisabled = (teacher) => selectableOf(teacher).length === 0;

  const handlePickTeacher = (teacher) => {
    if (isTeacherDisabled(teacher)) return;
    setActiveTeacherKey(teacher.teacherKey);
    const selectable = selectableOf(teacher);
    if (selectable.length === 1) {
      // Single group → auto-select it immediately.
      onChange?.(selectable[0].id);
    } else if (!teacher.groups.some((g) => g.id === value)) {
      // Multiple groups and nothing of this teacher chosen yet → force a choice.
      onChange?.(null);
    }
  };

  const handlePickGroup = (group) => {
    if (group.disabled) return;
    onChange?.(group.id);
  };

  const backToTeachers = () => {
    setActiveTeacherKey(null);
    onChange?.(null);
  };

  if (teachers.length === 0) {
    return (
      <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700">
        {emptyLabel}
      </p>
    );
  }

  // ── Step 2 — group picker for the active teacher ────────────────────────────
  if (activeTeacher) {
    const label = activeTeacher.teacherName || 'بدون أستاذ';
    const single = selectableOf(activeTeacher).length <= 1;
    return (
      <div>
        {/* Chosen teacher header + change affordance */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-gray-800">
            <GraduationCap className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{label}</span>
          </span>
          {teachers.length > 1 && (
            <button
              type="button"
              onClick={backToTeachers}
              className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              تغيير الأستاذ
            </button>
          )}
        </div>

        <p className="mb-1.5 text-xs font-medium text-gray-600">
          {single ? 'المجموعة' : groupQuestion}
        </p>
        <div className="flex flex-wrap gap-2">
          {activeTeacher.groups.map((g) => {
            const selected = g.id === value;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => handlePickGroup(g)}
                disabled={g.disabled}
                title={g.disabled ? (g.disabledReason || undefined) : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  g.disabled
                    ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 line-through'
                    : selected
                    ? 'border-primary bg-primary text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-primary hover:text-primary'
                }`}
              >
                {selected && <Check className="h-3.5 w-3.5" />}
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 opacity-70" />
                  {g.groupLabel || 'مجموعة'}
                </span>
                {g.subLabel && (
                  <span className={`text-xs ${selected ? 'text-white/80' : 'text-gray-400'}`}>
                    · {g.subLabel}
                  </span>
                )}
                {g.disabled && g.disabledReason && (
                  <span className="text-xs">({g.disabledReason})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Step 1 — teacher picker ─────────────────────────────────────────────────
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-gray-600">{teacherLabel}</p>
      <div className="flex flex-wrap gap-2">
        {teachers.map((t) => {
          const disabled = isTeacherDisabled(t);
          const count = t.groups.length;
          const name = t.teacherName || 'بدون أستاذ';
          return (
            <button
              key={t.teacherKey}
              type="button"
              onClick={() => handlePickTeacher(t)}
              disabled={disabled}
              title={disabled ? 'جميع مجموعات هذا الأستاذ غير متاحة' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                disabled
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-primary hover:text-primary'
              }`}
            >
              <GraduationCap className="h-4 w-4 shrink-0 opacity-70" />
              <span className="truncate">{name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${disabled ? 'bg-gray-200 text-gray-500' : 'bg-gray-100 text-gray-500'}`}>
                {count} {count === 1 ? 'مجموعة' : 'مجموعات'}
              </span>
              {!disabled && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300 rtl:rotate-180" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TeacherGroupPicker;
