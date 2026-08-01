import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Search, AlertTriangle, ChevronRight } from 'lucide-react';
import { getOwnerStudents } from '../../services/ownerService';
import { LoadingState, Alert, EmptyState } from '../../components/ui/feedback';
import ExportButtons from '../components/ExportButtons';
import { generateFilename } from '../../utils/csvExport';

const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');
const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US')} دج`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

const BRANCH_OPTIONS = [
  { id: 'all', label: 'كل الفروع' },
  { id: 'boumerdes', label: 'بومرداس' },
  { id: 'bordj_menaiel', label: 'برج منايل' },
];

const REPORTS = [
  { id: 'all', label: 'الكل' },
  { id: 'missing_payment', label: 'لم يدفعوا هذا الشهر' },
  { id: 'left', label: 'غادروا' },
  { id: 'inactive', label: 'غير نشطين' },
];

const STATUS = {
  active:   { label: 'نشط',       cls: 'bg-success-50 text-success-700' },
  at_risk:  { label: 'في خطر',    cls: 'bg-warning-50 text-warning-700' },
  inactive: { label: 'غير نشط',   cls: 'bg-danger-50 text-danger-700' },
};

const BRANCH_LABEL = (id) => BRANCH_OPTIONS.find((b) => b.id === id)?.label || id;

const CSV_COLUMNS = [
  { key: 'name', header: 'الطالب' },
  { key: 'email', header: 'البريد' },
  { key: 'branchId', header: 'الفرع', transform: (v) => BRANCH_LABEL(v) },
  { key: 'joinDate', header: 'تاريخ الانضمام', transform: (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '') },
  { key: 'status', header: 'الحالة', transform: (v) => (STATUS[v]?.label || v) },
  { key: 'lastPaymentDate', header: 'آخر دفعة', transform: (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '') },
  { key: 'daysSinceLastPayment', header: 'أيام منذ آخر دفعة', transform: (v) => (v == null ? '' : v) },
  { key: 'paymentCount', header: 'عدد الدفعات' },
  { key: 'totalPaid', header: 'الإجمالي (دج)' },
];

const StatusBadge = ({ s }) => {
  const m = STATUS[s] || STATUS.inactive;
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${m.cls}`}>{m.label}</span>;
};

const StudentLifecycle = () => {
  const [branchId, setBranchId] = useState('all');
  const [report, setReport] = useState('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getOwnerStudents({
      branchId: branchId === 'all' ? undefined : branchId,
      report: report === 'all' ? undefined : report,
    })
      .then((res) => { if (active) setData(res); })
      .catch((e) => { if (active) setError(e.message || 'تعذر تحميل البيانات'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [branchId, report]);

  const rows = useMemo(() => {
    const list = data?.students || [];
    const q = search.trim().toLowerCase();
    return q ? list.filter((s) => (s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)) : list;
  }, [data, search]);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <Link to="/owner/reports" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-primary">
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> التقارير
        </Link>
        <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1">دورة حياة الطالب</h1>
        <p className="text-gray-600">الحالة، آخر دفعة، وسجل المجموعات — كشف الطلاب المتوقفين عن الدفع</p>
      </div>

      {data?.summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 text-center">
            <p className="text-xs text-gray-500">نشطون</p>
            <p className="text-2xl font-bold text-success-600">{fmtNum(data.summary.active)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 text-center">
            <p className="text-xs text-gray-500">في خطر</p>
            <p className="text-2xl font-bold text-warning-600">{fmtNum(data.summary.at_risk)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 text-center">
            <p className="text-xs text-gray-500">غير نشطين</p>
            <p className="text-2xl font-bold text-danger-600">{fmtNum(data.summary.inactive)}</p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {REPORTS.map((r) => (
            <button key={r.id} onClick={() => setReport(r.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${report === r.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 ms-auto">
          <ExportButtons rows={rows} columns={CSV_COLUMNS} filename={generateFilename(`students-${branchId}-${report}`)} />
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
            {BRANCH_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <div className="relative">
            <Search className="h-4 w-4 text-gray-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد"
              className="border border-gray-300 rounded-lg ps-9 pe-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingState label="جاري تحميل الطلاب..." />
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title="لا يوجد طلاب" description="لا توجد نتائج مطابقة لهذا الفلتر." />
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs">
                <th className="text-start px-4 py-3 font-semibold">الطالب</th>
                <th className="text-start px-4 py-3 font-semibold">الفرع</th>
                <th className="text-center px-4 py-3 font-semibold">الانضمام</th>
                <th className="text-center px-4 py-3 font-semibold">الحالة</th>
                <th className="text-center px-4 py-3 font-semibold">آخر دفعة</th>
                <th className="text-center px-4 py-3 font-semibold">أيام</th>
                <th className="text-center px-4 py-3 font-semibold">دفعات</th>
                <th className="text-center px-4 py-3 font-semibold">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((s) => (
                <tr key={`${s.branchId}_${s.userId}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 flex items-center gap-1.5">
                      {s.stoppedPaying && <AlertTriangle className="h-3.5 w-3.5 text-warning-600" title="توقف عن الدفع" />}
                      {s.name}
                    </div>
                    {s.email && <div className="text-xs text-gray-500">{s.email}</div>}
                    {s.groupHistory?.length > 0 && (
                      <div className="text-xs text-gray-400 mt-0.5">{s.groupHistory.slice(0, 3).join('، ')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{BRANCH_OPTIONS.find((b) => b.id === s.branchId)?.label || s.branchId}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{fmtDate(s.joinDate)}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge s={s.status} /></td>
                  <td className="px-4 py-3 text-center text-gray-600">{fmtDate(s.lastPaymentDate)}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{s.daysSinceLastPayment == null ? '—' : fmtNum(s.daysSinceLastPayment)}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{fmtNum(s.paymentCount)}</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-900">{fmtMoney(s.totalPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StudentLifecycle;
