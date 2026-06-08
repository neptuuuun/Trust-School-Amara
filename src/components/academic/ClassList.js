/**
 * ClassList — step 2 of the student browse flow: the classes available under a
 * chosen subject, each rendered as a ClassCard. Includes a header with the
 * subject name and a back control.
 */

import React from 'react';
import { ArrowRight, Inbox } from 'lucide-react';
import ClassCard from './ClassCard';

const ClassList = ({
  subject,
  classes = [],
  getStatus = () => ({ type: 'none' }),
  onRegister,
  onBack,
  backLabel = 'العودة',
  emptyText = 'لا توجد مجموعات متاحة لهذه المادة بعد.',
}) => (
  <div>
    <div className="mb-6 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold text-primary sm:text-3xl">{subject?.name}</h2>
        {subject?.description && <p className="mt-1 text-gray-600">{subject.description}</p>}
      </div>
      {onBack && (
        <button
          onClick={onBack}
          className="flex flex-shrink-0 items-center font-medium text-secondary hover:text-primary"
        >
          <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
          {backLabel}
        </button>
      )}
    </div>

    {classes.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center">
        <Inbox className="mx-auto mb-4 h-14 w-14 text-gray-200" aria-hidden="true" />
        <p className="text-lg text-gray-500">{emptyText}</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {classes.map((cls) => (
          <ClassCard key={cls.id} cls={cls} status={getStatus(cls)} onRegister={onRegister} />
        ))}
      </div>
    )}
  </div>
);

export default ClassList;
