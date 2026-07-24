import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Users2, ScrollText, SlidersHorizontal, ChevronLeft } from 'lucide-react';

/**
 * Governance — the home for oversight & control tools that are used on-exception,
 * not day to day: managing the team, investigating the audit trail, and setting
 * school-wide financial policy. Grouping them here keeps the primary navigation
 * focused on executive analytics while preserving every capability.
 */

const ITEMS = [
  {
    to: '/owner/team',
    icon: Users2,
    title: 'الفريق / المسؤولون',
    desc: 'إنشاء حسابات الموظفين وتفعيلها أو تعطيلها، الفرع المُسنَد، والنشاط.',
    tone: { bg: 'bg-primary-50', text: 'text-primary-600' },
  },
  {
    to: '/owner/audit',
    icon: ScrollText,
    title: 'سجل التدقيق',
    desc: 'من فعل ماذا ومتى — سجل دائم لكل إجراء حسّاس، للمراجعات والتحقيقات.',
    tone: { bg: 'bg-secondary-50', text: 'text-secondary-600' },
  },
  {
    to: '/owner/settings',
    icon: SlidersHorizontal,
    title: 'الإعدادات المالية',
    desc: 'سياسات الرسوم على مستوى المدرسة (الرسوم السنوية) لجميع الفروع.',
    tone: { bg: 'bg-accent-50', text: 'text-accent-600' },
  },
];

const Governance = () => (
  <div className="space-y-6" dir="rtl">
    <div>
      <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1 flex items-center gap-2">
        <ShieldCheck className="h-7 w-7" /> الحوكمة
      </h1>
      <p className="text-gray-600">أدوات الإشراف والتحكّم — تُستخدم عند الحاجة وليست جزءاً من المتابعة اليومية.</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {ITEMS.map((it) => {
        const Icon = it.icon;
        return (
          <Link
            key={it.to}
            to={it.to}
            className="group flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-md transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg"
          >
            <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${it.tone.bg}`}>
              <Icon className={`h-6 w-6 ${it.tone.text}`} />
            </div>
            <h2 className="mb-1 text-lg font-bold text-gray-900">{it.title}</h2>
            <p className="flex-1 text-sm text-gray-500">{it.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:text-primary-600">
              فتح
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        );
      })}
    </div>
  </div>
);

export default Governance;
