import React, { useEffect, useState } from 'react';
import { PieChart, ChevronDown, ChevronUp, Users, Layers } from 'lucide-react';
import { getOwnerRevenue } from '../../services/ownerService';
import { useOwnerFilters } from '../ownerFilters';
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
  { key: 'label', header: 'الخدمة' },
  { key: 'revenue', header: 'الإيراد (دج)' },
  { key: 'studentCount', header: 'عدد الطلاب' },
  { key: 'groupCount', header: 'عدد المجموعات' },
];

const ServiceBlock = ({ s }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-start"
        aria-expanded={open}
      >
        <div>
          <p className="text-lg font-bold text-primary">{s.label}</p>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {fmtNum(s.studentCount)} طالب</span>
            <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {fmtNum(s.groupCount)} مجموعة</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-success-600">{fmtMoney(s.revenue)}</span>
          {s.subjects?.length > 0 && (open ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />)}
        </div>
      </button>

      {open && s.subjects?.length > 0 && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {s.subjects.map((sub, i) => (
            <div key={sub.subjectId || sub.subjectName || i} className="flex items-center justify-between px-6 py-3 bg-gray-50/50">
              <div>
                <p className="text-sm font-medium text-gray-800">{sub.subjectName}</p>
                <p className="text-xs text-gray-500">{fmtNum(sub.studentCount)} طالب · {fmtNum(sub.groupCount)} مجموعة</p>
              </div>
              <span className="text-sm font-semibold text-gray-900">{fmtMoney(sub.revenue)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const RevenueBreakdown = () => {
  const { month } = useOwnerFilters();
  const [branchId, setBranchId] = useState('all');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getOwnerRevenue({ month, branchId: branchId === 'all' ? undefined : branchId })
      .then((res) => { if (active) setServices(res.services || []); })
      .catch((e) => { if (active) setError(e.message || 'تعذر تحميل البيانات'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, branchId]);

  const total = services.reduce((a, s) => a + (s.revenue || 0), 0);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1">تفصيل الإيرادات</h1>
          <p className="text-gray-600">حسب نوع الخدمة ثم المادة — {month}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportButtons rows={services} columns={CSV_COLUMNS} filename={generateFilename(`revenue-${branchId}-${month}`)} />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span>الفرع</span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              {BRANCH_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <LoadingState label="جاري تحميل الإيرادات..." />
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : services.length === 0 ? (
        <EmptyState icon={PieChart} title="لا توجد إيرادات" description="لا توجد مدفوعات مسجلة لهذا الشهر." />
      ) : (
        <>
          <div className="bg-primary-50 border border-primary-100 rounded-xl p-5 flex items-center justify-between">
            <span className="text-sm font-medium text-primary-800">إجمالي الإيرادات</span>
            <span className="text-2xl font-bold text-primary">{fmtMoney(total)}</span>
          </div>
          <div className="space-y-3">
            {services.map((s) => <ServiceBlock key={s.serviceType} s={s} />)}
          </div>
        </>
      )}
    </div>
  );
};

export default RevenueBreakdown;
