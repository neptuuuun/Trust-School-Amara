import React, { useEffect, useState } from 'react';
import { Building2, TrendingUp, TrendingDown, Users, UserPlus, UserMinus, Layers, DollarSign, Scale } from 'lucide-react';
import { getOwnerBranches } from '../../services/ownerService';
import { useOwnerFilters } from '../ownerFilters';
import { LoadingState, Alert, EmptyState } from '../../components/ui/feedback';

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US')} دج`;
const fmtNum = (n) => Number(n || 0).toLocaleString('ar-EG');

const Metric = ({ icon: Icon, label, value, tone = 'text-gray-900' }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
    <span className="flex items-center gap-2 text-sm text-gray-600">
      <Icon className="h-4 w-4 text-gray-400" />
      {label}
    </span>
    <span className={`text-sm font-semibold ${tone}`}>{value}</span>
  </div>
);

const BranchCard = ({ b, isTop }) => {
  const growthUp = (b.growthRate || 0) >= 0;
  const collectionGap = (b.expectedRevenue || 0) - (b.actualRevenue || 0);
  return (
    <div className={`bg-white rounded-xl shadow-md p-6 border-2 ${isTop ? 'border-success-300' : 'border-gray-100'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-primary flex items-center gap-2">
          <Building2 className="h-5 w-5" /> {b.name}
        </h3>
        {isTop && <span className="text-xs font-bold px-2 py-1 rounded-full bg-success-50 text-success-700">الأعلى إيراداً</span>}
      </div>

      <div className="mb-4 p-4 rounded-lg bg-gray-50">
        <p className="text-xs text-gray-500 mb-1">إيرادات الشهر</p>
        <p className="text-2xl font-bold text-success-600">{fmtMoney(b.revenue)}</p>
      </div>

      <Metric icon={Users}     label="طلاب نشطون"  value={fmtNum(b.activeStudents)} />
      <Metric icon={UserPlus}  label="طلاب جدد"    value={fmtNum(b.newStudents)} tone="text-success-600" />
      <Metric icon={UserMinus} label="طلاب متوقفون" value={fmtNum(b.lostStudents)} tone="text-danger-600" />
      <Metric icon={Layers}    label="المجموعات"   value={fmtNum(b.groups)} />
      <Metric icon={DollarSign} label="المتوقع (دعم)" value={fmtMoney(b.expectedRevenue)} />
      <Metric
        icon={Scale}
        label="عجز التحصيل (دعم)"
        value={fmtMoney(collectionGap)}
        tone={collectionGap > 0 ? 'text-warning-700' : 'text-gray-500'}
      />
      <Metric
        icon={growthUp ? TrendingUp : TrendingDown}
        label="معدل النمو"
        value={`${b.growthRate}%`}
        tone={growthUp ? 'text-success-600' : 'text-danger-600'}
      />
    </div>
  );
};

const BranchAnalytics = () => {
  const { month } = useOwnerFilters();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getOwnerBranches(month)
      .then((res) => { if (active) setBranches(res.branches || []); })
      .catch((e) => { if (active) setError(e.message || 'تعذر تحميل البيانات'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month]);

  if (loading) return <LoadingState label="جاري تحميل تحليل الفروع..." />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  const topRevenue = Math.max(0, ...branches.map((b) => b.revenue || 0));

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1">تحليل الفروع</h1>
        <p className="text-gray-600">مقارنة أداء الفروع جنباً إلى جنب — {month}</p>
      </div>

      {branches.length === 0 ? (
        <EmptyState icon={Building2} title="لا توجد بيانات" description="لا توجد فروع لعرضها." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {branches.map((b) => (
            <BranchCard key={b.branchId} b={b} isTop={topRevenue > 0 && b.revenue === topRevenue} />
          ))}
        </div>
      )}
    </div>
  );
};

export default BranchAnalytics;
