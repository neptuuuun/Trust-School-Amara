/**
 * WeeklyTimetable
 * ---------------
 * "جدولي الأسبوعي" — a clean, responsive weekly view of a student's active
 * classes. Groups slots by weekday (Saturday-first), highlights today and the
 * next upcoming class, flags any ongoing class, and shows an informative empty
 * state when there are no active classes.
 *
 * Data is derived from the student's existing enrollment records (support /
 * languages / trainings / academic subjects) via buildWeeklyTimetable — no extra
 * Firestore reads.
 */

import React, { useMemo } from 'react';
import { CalendarClock, Clock, User, MapPin, Users, CalendarDays, BookOpen } from 'lucide-react';
import { buildWeeklyTimetable } from '../utils/timetable';

/** Friendly Arabic "time until" label. */
function humanizeUntil(mins) {
  if (mins == null) return '';
  if (mins <= 0) return 'الآن';
  if (mins < 60) return `بعد ${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (mins < 24 * 60) return m ? `بعد ${h} س ${m} د` : `بعد ${h} ساعة`;
  const d = Math.floor(mins / (24 * 60));
  if (d === 1) return 'غداً';
  return `بعد ${d} أيام`;
}

const SlotRow = ({ slot }) => {
  const highlight = slot.isOngoing
    ? 'border-green-300 bg-green-50'
    : slot.isNext
    ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
    : 'border-gray-100 bg-white';

  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${highlight}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-bold text-gray-900">{slot.subject}</p>
          {slot.isOngoing && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">جارية الآن</span>
          )}
          {slot.isNext && !slot.isOngoing && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">الحصة القادمة</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {slot.group && (
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{slot.group}</span>
          )}
          {slot.teacher && (
            <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{slot.teacher}</span>
          )}
          {slot.classroom && (
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{slot.classroom}</span>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5 self-start rounded-lg bg-gray-50 px-2.5 py-1.5 text-sm font-semibold text-gray-700 sm:self-auto">
        <Clock className="h-4 w-4 text-gray-400" />
        <span dir="ltr">{slot.start}{slot.end ? ` - ${slot.end}` : ''}</span>
      </div>
    </div>
  );
};

export default function WeeklyTimetable({ enrollments, now }) {
  const model = useMemo(
    () => buildWeeklyTimetable(enrollments, now ? { now } : {}),
    [enrollments, now]
  );

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-5">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold text-gray-900">جدولي الأسبوعي</h2>
            <p className="text-xs text-gray-500">
              {model.hasClasses ? `${model.totalSlots} حصة أسبوعياً` : 'حصصك المجدولة'}
            </p>
          </div>
        </div>
        {model.hasClasses && (
          <span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary sm:inline">
            {model.todayLabel}
          </span>
        )}
      </div>

      {/* Body */}
      {!model.hasClasses ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
            <CalendarDays className="h-8 w-8 text-gray-300" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">لا توجد حصص مجدولة حالياً</h3>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            بمجرد تفعيل تسجيلك في درس دعم أو لغة أو دورة تكوينية بجدول أسبوعي، ستظهر حصصك هنا.
          </p>
        </div>
      ) : (
        <div className="space-y-4 p-5">
          {/* Next-class callout */}
          {model.nextSlot && (
            <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5">
              <BookOpen className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-primary">
                  الحصة القادمة: {model.nextSlot.subject}
                </p>
                <p className="mt-0.5 text-gray-600">
                  {model.nextSlot.day} · <span dir="ltr">{model.nextSlot.start}</span>
                  {' '}· <span className="font-medium text-primary/80">{humanizeUntil(model.nextSlot.minutesUntil)}</span>
                </p>
              </div>
            </div>
          )}

          {/* Day groups */}
          {model.days.map((d) => (
            <div
              key={d.dayIndex}
              className={`rounded-xl border p-3 ${d.isToday ? 'border-primary/30 bg-primary/[0.03]' : 'border-gray-100'}`}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900">{d.day}</h3>
                {d.isToday && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">اليوم</span>
                )}
                <span className="text-xs text-gray-400">{d.slots.length} حصة</span>
              </div>
              <div className="space-y-2">
                {d.slots.map((slot) => (
                  <SlotRow key={slot.key} slot={slot} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
