import React, { useState } from 'react';
import { Users2, ShieldCheck, Activity } from 'lucide-react';
import AdminManagement from './AdminManagement';
import AdminPerformance from './AdminPerformance';

/**
 * Team / Admins — the single home for everything about the branch admins.
 * Merges what used to be two separate nav sections:
 *   • "الإدارة" tab  → account management (create / deactivate / reactivate),
 *                       branch assignment, status, last active.
 *   • "النشاط" tab   → per-admin activity over a time window.
 * Both tabs reuse the original, fully-featured components (nothing lost); this
 * page only supplies the shared header + tab switch, keeping governance tidy.
 */

const TABS = [
  { id: 'management', label: 'الإدارة',  icon: ShieldCheck },
  { id: 'activity',   label: 'النشاط',   icon: Activity },
];

const Team = () => {
  const [tab, setTab] = useState('management');

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1 flex items-center gap-2">
          <Users2 className="h-7 w-7" /> الفريق / المسؤولون
        </h1>
        <p className="text-gray-600">إدارة حسابات الموظفين، صلاحياتهم، الفرع المُسنَد، والنشاط — كل إجراء مُسجَّل في سجل التدقيق.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'management' ? <AdminManagement embedded /> : <AdminPerformance embedded />}
    </div>
  );
};

export default Team;
