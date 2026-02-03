import React from 'react';
import { Book, Clock, Calendar, User } from 'lucide-react';
import useBranchSupportLessons from '../hooks/useBranchSupportLessons';
import { getYearById } from '../data/studyLevels';

const dayMap = {
  Monday: 'الإثنين',
  Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء',
  Thursday: 'الخميس',
  Friday: 'الجمعة',
  Saturday: 'السبت',
  Sunday: 'الأحد',
};

const formatDay = (day) => dayMap[day] || day || 'غير محدد';
const formatDate = (date) =>
  date instanceof Date ? date.toLocaleString('ar-DZ') : 'غير محدد';
const getYearLabel = (lesson) => {
  const yearMeta = getYearById(lesson.studyYear || lesson.year || lesson.grade || '');
  return yearMeta?.nameShort || lesson.studyLevel || lesson.studyYear || lesson.year || lesson.grade || '';
};

/**
 * BranchSupportLessonsList
 *
 * Presentation component that renders the lessons returned by `useBranchSupportLessons`.
 * Usage on any branch detail page:
 *
 * ```jsx
 * import BranchSupportLessonsList from '../components/BranchSupportLessonsList';
 * import { useBranch } from '../contexts/BranchContext';
 *
 * function BranchSupportLessonsSection() {
 *   const { selectedBranchId } = useBranch(); // <-- ensure this resolves to the active branch
 *   return (
 *     <BranchSupportLessonsList
 *       branchId={selectedBranchId}
 *       onSelectLesson={(lesson) => console.log('Clicked lesson', lesson)}
 *     />
 *   );
 * }
 * ```
 *
 * Props:
 *  - `branchId` (string, required): the exact branch document id whose lessons should display.
 *  - `onSelectLesson` (function, optional): invoked when the CTA button is clicked.
 *  - `ctaLabel` (string, optional): customize CTA text (defaults to Arabic "التسجيل").
 *  - `ctaDisabled` (boolean, optional): pass `true` to disable CTA (e.g. until user pays).
 */
function BranchSupportLessonsList({
  branchId,
  onSelectLesson,
  ctaLabel = 'التسجيل',
  ctaDisabled = false,
  userStudyYear = null,
  userYearlyFeePaid = null,
}) {
  const {
    lessons, loading, error,
  } = useBranchSupportLessons(branchId);

  if (!branchId) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center text-yellow-800">
        يرجى اختيار الفرع لعرض دروس الدعم المتاحة.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2 space-x-reverse">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          <span className="text-primary font-semibold">جاري تحميل دروس الفرع...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-center">
        حدث خطأ أثناء جلب دروس الدعم. يرجى المحاولة مجدداً.
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl py-12 px-6 text-center">
        <Book className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-lg text-gray-600">لا توجد دروس دعم لهذا الفرع حالياً.</p>
        <p className="text-sm text-gray-500 mt-2">ستظهر الدروس الجديدة مباشرة بعد إضافتها.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {lessons.map((lesson) => {
        const yearLabel = getYearLabel(lesson);
        const lessonStudyYear = String(lesson?.studyYear || lesson?.year || lesson?.grade || '').trim() || null;
        const mismatch = Boolean(userStudyYear && lessonStudyYear && userStudyYear !== lessonStudyYear);
        const blockedByFee = userYearlyFeePaid === false;
        const effectiveDisabled = ctaDisabled || mismatch || blockedByFee;
        return (
          <div
            key={lesson.id}
            className="bg-gray-50 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden"
          >
            <div className="p-6 flex flex-col h-full">
              <div className="flex items-center mb-4">
                <Book className="w-8 h-8 text-primary ml-3" />
                <div>
                  <h3 className="text-xl font-bold text-primary">
                    {lesson.name || lesson.subject || 'مادة غير معروفة'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    آخر تحديث: {formatDate(lesson.createdAt)}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-6 flex-1">
                {lesson.teacher && (
                  <div className="flex items-center text-gray-700">
                    <User className="w-5 h-5 text-gray-500 ml-2" />
                    <span className="font-medium">{lesson.teacher}</span>
                  </div>
                )}

                {yearLabel && (
                  <div className="flex items-center text-gray-700">
                    <Calendar className="w-5 h-5 text-gray-500 ml-2" />
                    <span className="text-sm">الصف: {yearLabel}</span>
                  </div>
                )}

                {Array.isArray(lesson.timings) && lesson.timings.length > 0 && (
                  <div className="space-y-1">
                    {lesson.timings.map((time, idx) => (
                      <div key={idx} className="flex items-center text-gray-700">
                        <Clock className="w-5 h-5 text-gray-500 ml-2" />
                        <span className="text-sm">
                          {formatDay(time.day)} - من {time.start} إلى {time.end}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onSelectLesson?.(lesson)}
                disabled={effectiveDisabled}
                className={`w-full font-semibold py-3 px-6 rounded-lg transition-colors duration-300 ${
                  effectiveDisabled
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-primary hover:bg-primary-600 text-white'
                }`}
              >
                {ctaLabel}
              </button>

              {mismatch && userStudyYear && (
                <p className="mt-3 text-sm text-gray-600">
                  يمكنك التسجيل فقط في الدروس الخاصة بسنتك الدراسية: {userStudyYear}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BranchSupportLessonsList;

