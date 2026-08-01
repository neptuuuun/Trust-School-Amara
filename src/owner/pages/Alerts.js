import React, { useEffect, useState } from 'react';
import { Bell, AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { getOwnerAlerts } from '../../services/ownerService';
import { useOwnerFilters } from '../ownerFilters';
import { LoadingState, Alert } from '../../components/ui/feedback';
import AlertsPanel from '../components/AlertsPanel';

const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');

const BRANCH_OPTIONS = [
  { id: 'all', label: 'كل الفروع' },
  { id: 'boumerdes', label: 'بومرداس' },
  { id: 'bordj_menaiel', label: 'برج منايل' },
];

const COUNT_CARDS = [
  { key: 'critical', label: 'حرجة',  icon: AlertOctagon,  tone: 'text-danger-600',    bg: 'bg-danger-50' },
  { key: 'warning',  label: 'تحذير', icon: AlertTriangle, tone: 'text-warning-600',   bg: 'bg-warning-50' },
  { key: 'info',     label: 'معلومة', icon: Info,         tone: 'text-secondary-600', bg: 'bg-secondary-50' },
];

const Alerts = () => {
  const { month } = useOwnerFilters();
  const [branchId, setBranchId] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getOwnerAlerts({ month, branchId: branchId === 'all' ? undefined : branchId })
      .then((res) => { if (active) setData(res); })
      .catch((e) => { if (active) setError(e.message || 'تعذر تحميل البيانات'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, branchId]);

  const counts = data?.counts || {};

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1 flex items-center gap-2">
            <Bell className="h-7 w-7" /> التنبيهات
          </h1>
          <p className="text-gray-600">مؤشرات تحتاج انتباهك — انخفاض الإيرادات، عجز التحصيل، التسرّب، والمراجعات الحساسة — {month}</p>
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
        <LoadingState label="جاري تحميل التنبيهات..." />
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {COUNT_CARDS.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.key} className="bg-white rounded-xl shadow-md p-4 border border-gray-100 flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${c.bg}`}><Icon className={`h-5 w-5 ${c.tone}`} /></div>
                  <div>
                    <p className="text-xs text-gray-500">{c.label}</p>
                    <p className={`text-2xl font-bold ${c.tone}`}>{fmtNum(counts[c.key])}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-5">
            <AlertsPanel alerts={data?.alerts || []} defaultOpen />
          </div>
        </>
      )}
    </div>
  );
};

export default Alerts;
