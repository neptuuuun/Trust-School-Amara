import React from 'react';
import { Link } from 'react-router-dom';
import { FileBarChart2, UserCog, Layers, ChevronLeft } from 'lucide-react';

/**
 * Reports — the drill-down home for detailed, operational registers the owner
 * consults on demand (from an alert or a "view details" click) rather than
 * browsing daily. Keeps the full Student Lifecycle and Group Analytics tools —
 * with all their filters, search, and CSV exports — one click away, without
 * letting row-per-record tables crowd the executive dashboard.
 */

const ITEMS = [
  {
    to: '/owner/students',
    icon: UserCog,
    title: 'دورة حياة الطلاب',
    desc: 'سجل الطلاب: الحالة، آخر دفعة، وسجل المجموعات — لكشف المتوقفين عن الدفع. مع بحث وتصدير.',
    tone: { bg: 'bg-secondary-50', text: 'text-secondary-600' },
  },
  {
    to: '/owner/groups',
    icon: Layers,
    title: 'تحليل المجموعات',
    desc: 'المتوقّع مقابل الفعلي والاحتفاظ لكل مجموعة، وكشف الفروقات في التحصيل. مع تصدير.',
    tone: { bg: 'bg-accent-50', text: 'text-accent-600' },
  },
];

const Reports = () => (
  <div className="space-y-6" dir="rtl">
    <div>
      <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1 flex items-center gap-2">
        <FileBarChart2 className="h-7 w-7" /> التقارير
      </h1>
      <p className="text-gray-600">تقارير تفصيلية للمراجعة عند الحاجة — تُفتح من التنبيهات أو من هنا.</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
              عرض التفاصيل
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        );
      })}
    </div>
  </div>
);

export default Reports;
