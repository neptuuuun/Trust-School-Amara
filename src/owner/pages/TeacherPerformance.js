import React, { useEffect, useState } from 'react';
import { GraduationCap, TrendingUp, TrendingDown, Award, AlertTriangle } from 'lucide-react';
import { getOwnerTeachers } from '../../services/ownerService';
import { useOwnerFilters } from '../ownerFilters';
import { LoadingState, Alert, EmptyState } from '../../components/ui/feedback';
import ExportButtons from '../components/ExportButtons';
import { generateFilename } from '../../utils/csvExport';

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US')} دج`;
const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');

const BRANCH_OPTIONS = [
  { id: 'all', label: 'كل الفروع' },
  { id: 'boumerdes', label: 'بومرداس' },
  { id: 'bordj_menaiel', label: 'برج منايل' },
];

const CSV_COLUMNS = [
  { key: 'teacherName', header: 'الأستاذ' },
  { key: 'branches', header: 'الفروع' },
  { key: 'subjects', header: 'المواد' },
  { key: 'groups', header: 'المجموعات' },
  { key: 'students', header: 'الطلاب' },
  { key: 'revenue', header: 'الإيراد (دج)' },
  { key: 'retentionRate', header: 'الاحتفاظ %', transform: (v) => (v == null ? '' : v) },
  { key: 'growthRate', header: 'النمو %', transform: (v) => (v == null ? '' : v) },
];

const Pct = ({ v, invert = false }) => {
  if (v == null) return <span className="text-gray-400">—</span>;
  const good = invert ? v <= 0 : v >= 0;
  const Icon = v >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${good ? 'text-success-600' : 'text-danger-600'}`}>
      <Icon className="h-3.5 w-3.5" />{v > 0 ? '+' : ''}{v}%
    </span>
  );
};

const TeacherPerformance = () => {
  const { month } = useOwnerFilters();
  const [branchId, setBranchId] = useState('all');
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getOwnerTeachers({ month, branchId: branchId === 'all' ? undefined : branchId })
      .then((res) => { if (active) setTeachers(res.teachers || []); })
      .catch((e) => { if (active) setError(e.message || 'تعذر تحميل البيانات'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, branchId]);

  const topRevenue = Math.max(0, ...teachers.map((t) => t.revenue || 0));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1">أداء الأساتذة</h1>
          <p className="text-gray-600">المجموعات، الطلاب، الإيراد، والاحتفاظ لكل أستاذ — {month}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportButtons rows={teachers} columns={CSV_COLUMNS} filename={generateFilename(`teachers-${branchId}-${month}`)} />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span>الفرع</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              {BRANCH_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <LoadingState label="جاري تحميل بيانات الأساتذة..." />
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : teachers.length === 0 ? (
        <EmptyState icon={GraduationCap} title="لا يوجد أساتذة" description="لا توجد مجموعات بأسماء أساتذة لعرضها." />
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs">
                <th className="text-start px-4 py-3 font-semibold">الأستاذ</th>
                <th className="text-center px-4 py-3 font-semibold">المجموعات</th>
                <th className="text-center px-4 py-3 font-semibold">الطلاب</th>
                <th className="text-center px-4 py-3 font-semibold">الإيراد</th>
                <th className="text-center px-4 py-3 font-semibold">الاحتفاظ</th>
                <th className="text-center px-4 py-3 font-semibold">النمو</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {teachers.map((t) => (
                <tr key={t.teacherName} className={t.losingStudents ? 'bg-danger-50/30' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 flex items-center gap-1.5">
                      {topRevenue > 0 && t.revenue === topRevenue && <Award className="h-4 w-4 text-warning-500" title="الأعلى إيراداً" />}
                      {t.losingStudents && <AlertTriangle className="h-3.5 w-3.5 text-danger-500" title="يفقد طلاباً" />}
                      {t.teacherName}
                    </div>
                    <div className="text-xs text-gray-500">{t.subjects?.slice(0, 3).join('، ')}{t.branches?.length ? ` · ${t.branches.join('، ')}` : ''}</div>
                  </td>
                  <td className="px-4 py-3 text-center">{fmtNum(t.groups)}</td>
                  <td className="px-4 py-3 text-center">{fmtNum(t.students)}</td>
                  <td className="px-4 py-3 text-center font-semibold text-success-700">{fmtMoney(t.revenue)}</td>
                  <td className="px-4 py-3 text-center">{t.retentionRate == null ? '—' : `${t.retentionRate}%`}</td>
                  <td className="px-4 py-3 text-center"><Pct v={t.growthRate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TeacherPerformance;
