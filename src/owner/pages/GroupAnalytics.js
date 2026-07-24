import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, AlertTriangle, LifeBuoy, ChevronRight } from 'lucide-react';
import { getOwnerGroups, getOwnerSupportOverview } from '../../services/ownerService';
import { useOwnerFilters } from '../ownerFilters';
import { groupTypeBadge } from '../../utils/supportClassification';
import { LoadingState, Alert, EmptyState } from '../../components/ui/feedback';
import ExportButtons from '../components/ExportButtons';
import { generateFilename } from '../../utils/csvExport';

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US')} دج`;
const fmtNum = (n) => Number(n || 0).toLocaleString('ar-EG');

const BRANCH_OPTIONS = [
  { id: 'all', label: 'كل الفروع' },
  { id: 'boumerdes', label: 'بومرداس' },
  { id: 'bordj_menaiel', label: 'برج منايل' },
];

const CSV_COLUMNS = [
  { key: 'groupName', header: 'المجموعة' },
  { key: 'subjectName', header: 'المادة' },
  { key: 'branchName', header: 'الفرع' },
  { key: 'teacherName', header: 'الأستاذ' },
  { key: 'activeStudents', header: 'الطلاب' },
  { key: 'monthlyFee', header: 'الرسم (دج)' },
  { key: 'expectedRevenue', header: 'المتوقع (دج)' },
  { key: 'actualRevenue', header: 'الفعلي (دج)' },
  { key: 'difference', header: 'الفرق (دج)' },
  { key: 'retentionRate', header: 'الاحتفاظ %', transform: (v) => (v == null ? '' : v) },
];

const RetentionBadge = ({ rate }) => {
  if (rate == null) return <span className="text-gray-400 text-xs">—</span>;
  const tone = rate >= 80 ? 'bg-success-50 text-success-700' : rate >= 50 ? 'bg-warning-50 text-warning-700' : 'bg-danger-50 text-danger-700';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${tone}`}>{rate}%</span>;
};

const GroupAnalytics = () => {
  const { month } = useOwnerFilters();
  const [branchId, setBranchId] = useState('all');
  const [groups, setGroups] = useState([]);
  const [support, setSupport] = useState(null); // { branches, totals }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const scope = branchId === 'all' ? undefined : branchId;
    Promise.all([
      getOwnerGroups({ month, branchId: scope }),
      getOwnerSupportOverview({ branchId: scope }).catch(() => null),
    ])
      .then(([g, s]) => { if (active) { setGroups(g.groups || []); setSupport(s); } })
      .catch((e) => { if (active) setError(e.message || 'تعذر تحميل البيانات'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, branchId]);

  const discrepancies = groups.filter((g) => g.discrepancy).length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/owner/reports" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-primary">
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> التقارير
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1">تحليل المجموعات</h1>
          <p className="text-gray-600">المتوقع مقابل الفعلي والاحتفاظ لكل مجموعة — {month}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportButtons rows={groups} columns={CSV_COLUMNS} filename={generateFilename(`groups-${branchId}-${month}`)} />
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
        <LoadingState label="جاري تحميل المجموعات..." />
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : groups.length === 0 ? (
        <EmptyState icon={Layers} title="لا توجد مجموعات" description="لا توجد مجموعات نشطة لعرضها." />
      ) : (
        <>
          {discrepancies > 0 && (
            <Alert variant="warning" title="تنبيه فروقات">
              {fmtNum(discrepancies)} مجموعة تُحصّل أقل من الإيراد المتوقع.
            </Alert>
          )}

          {/* Support-level (دروس الدعم) per-branch snapshot */}
          {support && Array.isArray(support.branches) && support.branches.length > 0 && (
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-5">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-primary">
                <LifeBuoy className="h-5 w-5" />
                طلاب مستوى الدعم حسب الفرع
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {support.branches.map((b) => (
                  <div key={b.branchId} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="mb-2 font-semibold text-gray-900">{b.branchName}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <div><p className="text-lg font-bold text-danger-600">{fmtNum(b.supportStudents)}</p><p className="text-xs text-gray-500">طلاب الدعم</p></div>
                      <div><p className="text-lg font-bold text-success-600">{fmtNum(b.assigned)}</p><p className="text-xs text-gray-500">مسجّلون</p></div>
                      <div><p className={`text-lg font-bold ${b.waiting > 0 ? 'text-warning-600' : 'text-gray-700'}`}>{fmtNum(b.waiting)}</p><p className="text-xs text-gray-500">بانتظار التسجيل</p></div>
                      <div><p className="text-lg font-bold text-secondary-600">{fmtNum(b.lowLevelGroups)}</p><p className="text-xs text-gray-500">مجموعات دعم خاصة</p></div>
                    </div>
                    {b.waiting > 0 && b.lowLevelGroups === 0 && (
                      <p className="mt-2 rounded-md bg-warning-50 px-2 py-1 text-xs text-warning-700">
                        يحتاج هذا الفرع إلى إنشاء مجموعات دعم خاصة.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="text-start px-4 py-3 font-semibold">المجموعة</th>
                  <th className="text-start px-4 py-3 font-semibold">الفرع</th>
                  <th className="text-start px-4 py-3 font-semibold">الأستاذ</th>
                  <th className="text-center px-4 py-3 font-semibold">طلاب</th>
                  <th className="text-center px-4 py-3 font-semibold">الرسم</th>
                  <th className="text-center px-4 py-3 font-semibold">المتوقع</th>
                  <th className="text-center px-4 py-3 font-semibold">الفعلي</th>
                  <th className="text-center px-4 py-3 font-semibold">الفرق</th>
                  <th className="text-center px-4 py-3 font-semibold">الاحتفاظ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groups.map((g) => (
                  <tr key={g.classId} className={g.discrepancy ? 'bg-warning-50/40' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 flex items-center gap-1.5">
                        {g.discrepancy && <AlertTriangle className="h-3.5 w-3.5 text-warning-600" />}
                        {g.groupName}
                      </div>
                      {g.subjectName && <div className="text-xs text-gray-500">{g.subjectName}</div>}
                      {g.groupType && (() => {
                        const gt = groupTypeBadge(g.groupType);
                        return (
                          <span className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${gt.classes}`}>
                            <gt.Icon className={`h-2 w-2 shrink-0 ${gt.iconClass}`} fill="currentColor" aria-hidden="true" /> {gt.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{g.branchName}</td>
                    <td className="px-4 py-3 text-gray-600">{g.teacherName}</td>
                    <td className="px-4 py-3 text-center">{fmtNum(g.activeStudents)}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{fmtMoney(g.monthlyFee)}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{fmtMoney(g.expectedRevenue)}</td>
                    <td className="px-4 py-3 text-center font-semibold text-success-700">{fmtMoney(g.actualRevenue)}</td>
                    <td className={`px-4 py-3 text-center font-semibold ${g.difference > 0 ? 'text-danger-600' : 'text-gray-500'}`}>
                      {fmtMoney(g.difference)}
                    </td>
                    <td className="px-4 py-3 text-center"><RetentionBadge rate={g.retentionRate} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default GroupAnalytics;
