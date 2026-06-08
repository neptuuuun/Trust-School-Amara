/**
 * Admin · Support lessons — Middle school (دروس الدعم — المتوسط)
 *
 * New Subject → Class → Schedule model, scoped per study year. The admin first
 * picks a year (each year is an independent namespace of subjects), then manages
 * that year's subjects and their classes via the shared SubjectClassManager.
 *
 * Branch-isolated. Subjects/classes carry { level:'middle', studyYear } so the
 * per-year annual-fee gating in the Express backend keeps working.
 */

import React, { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { getYearsByLevel, getLevelById } from '../../data/studyLevels';
import SubjectClassManager from '../components/SubjectClassManager';

const LEVEL = 'middle';

const SupportLessonsMiddlePage = () => {
  const years = getYearsByLevel(LEVEL);
  const levelName = getLevelById(LEVEL)?.name || 'المتوسط';
  const [yearId, setYearId] = useState(years[0]?.id || null);
  const selected = years.find((y) => y.id === yearId) || null;

  return (
    <div dir="rtl" className="space-y-5">
      {/* Year picker */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <GraduationCap className="h-4 w-4 text-primary" />
          اختر السنة الدراسية
        </p>
        <div className="flex flex-wrap gap-2">
          {years.map((y) => (
            <button
              key={y.id}
              onClick={() => setYearId(y.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                y.id === yearId ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {y.nameShort}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <SubjectClassManager
          key={selected.id}
          serviceType="support"
          scope={{ studyYear: selected.id, level: LEVEL }}
          headerTrail={[`دروس الدعم — ${levelName}`, selected.nameShort]}
        />
      )}
    </div>
  );
};

export default SupportLessonsMiddlePage;
