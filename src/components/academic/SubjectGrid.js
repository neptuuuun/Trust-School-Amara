/**
 * SubjectGrid — step 1 of the student browse flow: large, tappable subject
 * cards. Mobile-first (1 col → 2 → 3). Shows class count per subject.
 */

import React from 'react';
import { BookOpen } from 'lucide-react';

const SubjectGrid = ({
  subjects = [],
  getClassCount = () => 0,
  onSelect,
  icon: Icon = BookOpen,
  emptyText = 'لا توجد عناصر متاحة حالياً',
}) => {
  if (!subjects.length) {
    return (
      <div className="col-span-full rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
        <Icon className="mx-auto mb-4 h-14 w-14 text-gray-200" aria-hidden="true" />
        <p className="text-lg text-gray-500">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.map((subject) => {
        const count = getClassCount(subject.id);
        return (
          <button
            key={subject.id}
            onClick={() => onSelect?.(subject)}
            className="group flex flex-col items-center rounded-2xl bg-gradient-primary p-8 text-center text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-primary/30"
          >
            <Icon className="mb-4 h-12 w-12" aria-hidden="true" />
            <h3 className="mb-2 text-2xl font-bold">{subject.name}</h3>
            {subject.description ? (
              <p className="text-sm text-primary-100 line-clamp-2">{subject.description}</p>
            ) : (
              <p className="text-primary-100">
                {count > 0 ? `${count} ${count === 1 ? 'مجموعة متاحة' : 'مجموعات متاحة'}` : 'انقر للعرض'}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default SubjectGrid;
