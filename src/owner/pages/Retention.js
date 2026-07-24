import React, { useEffect, useState } from 'react';
import { UserPlus, RefreshCw, UserMinus, Users, TrendingUp } from 'lucide-react';
import { getOwnerRetention } from '../../services/ownerService';
import { useOwnerFilters } from '../ownerFilters';
import { LoadingState, Alert, EmptyState } from '../../components/ui/feedback';
import TrendChart from '../components/TrendChart';

const fmtNum = (n) => Number(n || 0).toLocaleString('ar-EG');

const BRANCH_OPTIONS = [
  { id: 'all', label: 'كل الفروع' },
  { id: 'boumerdes', label: 'بومرداس' },
  { id: 'bordj_menaiel', label: 'برج منايل' },
];

const Stat = ({ icon: Icon, label, value, tone }) => (
  <div className="bg-white rounded-xl shadow-md p-5 border border-gray-100">
    <div className="flex items-center gap-2 mb-2">
      <Icon className={`h-5 w-5 ${tone}`} />
      <span className="text-sm text-gray-600">{label}</span>
    </div>
    <p className={`text-2xl font-bold ${tone}`}>{fmtNum(value)}</p>
  </div>
);

const Rate = ({ v }) => {
  if (v == null) return <span className="text-gray-400">—</span>;
  const tone = v >= 0 ? 'text-success-600' : 'text-danger-600';
  return <span className={`font-semibold ${tone}`}>{v > 0 ? '+' : ''}{v}%</span>;
};

const Retention = () => {
  const { month } = useOwnerFilters();
  const [branchId, setBranchId] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getOwnerRetention({ month, months: 6, branchId: branchId === 'all' ? undefined : branchId })
      .then((res) => { if (active) setData(res); })
      .catch((e) => { if (active) setError(e.message || 'تعذر تحميل البيانات'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, branchId]);

  const chartData = (data?.series || []).map((s) => ({ label: s.month.slice(2), bar: s.remaining, line: s.retentionRate }));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1">الاحتفاظ والنمو</h1>
          <p className="text-gray-600">تدفق الطلاب الشهري ومعدلات الاحتفاظ والنمو (اشتراكات الدعم) — آخر 6 أشهر</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span>الفرع</span>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
            {BRANCH_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <LoadingState label="جاري تحميل بيانات الاحتفاظ..." />
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : !data || data.series.length === 0 ? (
        <EmptyState icon={Users} title="لا توجد بيانات" description="لا توجد اشتراكات دعم لحساب الاحتفاظ." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={UserPlus} label="جدد هذا الشهر" value={data.latest.new} tone="text-success-600" />
            <Stat icon={RefreshCw} label="عائدون" value={data.latest.returning} tone="text-secondary-600" />
            <Stat icon={UserMinus} label="مغادرون" value={data.latest.lost} tone="text-danger-600" />
            <Stat icon={Users} label="نشطون" value={data.latest.active} tone="text-primary-600" />
          </div>

          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-100">
            <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> الاتجاه الشهري
            </h2>
            <p className="text-xs text-gray-500 mb-2">الأعمدة = الطلاب النشطون · الخط = معدل الاحتفاظ %</p>
            <TrendChart data={chartData} />
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="text-start px-4 py-3 font-semibold">الشهر</th>
                  <th className="text-center px-4 py-3 font-semibold">في البداية</th>
                  <th className="text-center px-4 py-3 font-semibold">انضموا</th>
                  <th className="text-center px-4 py-3 font-semibold">غادروا</th>
                  <th className="text-center px-4 py-3 font-semibold">المتبقون</th>
                  <th className="text-center px-4 py-3 font-semibold">الاحتفاظ</th>
                  <th className="text-center px-4 py-3 font-semibold">النمو</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.series.map((s) => (
                  <tr key={s.month} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.month}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{fmtNum(s.studentsAtStart)}</td>
                    <td className="px-4 py-3 text-center text-success-600">{fmtNum(s.joined)}</td>
                    <td className="px-4 py-3 text-center text-danger-600">{fmtNum(s.left)}</td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900">{fmtNum(s.remaining)}</td>
                    <td className="px-4 py-3 text-center">{s.retentionRate == null ? '—' : `${s.retentionRate}%`}</td>
                    <td className="px-4 py-3 text-center"><Rate v={s.growthRate} /></td>
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

export default Retention;
