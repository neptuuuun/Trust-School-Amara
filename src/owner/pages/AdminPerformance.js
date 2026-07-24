import React, { useEffect, useState } from 'react';
import { UserCog, UserPlus, CreditCard, FileCheck, Layers } from 'lucide-react';
import { getOwnerAdminActivity } from '../../services/ownerService';
import { LoadingState, Alert, EmptyState } from '../../components/ui/feedback';
import ExportButtons from '../components/ExportButtons';
import { generateFilename } from '../../utils/csvExport';

const fmtNum = (n) => Number(n || 0).toLocaleString('ar-EG');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

const BRANCH_OPTIONS = [
  { id: 'all', label: 'كل الفروع' },
  { id: 'boumerdes', label: 'بومرداس' },
  { id: 'bordj_menaiel', label: 'برج منايل' },
];

const CSV_COLUMNS = [
  { key: 'name', header: 'المسؤول' },
  { key: 'branchName', header: 'الفرع' },
  { key: 'email', header: 'البريد' },
  { key: 'active', header: 'نشط', transform: (v) => (v ? 'نعم' : 'لا') },
  { key: 'studentsCreated', header: 'طلاب أُنشئوا' },
  { key: 'paymentsRegistered', header: 'مدفوعات' },
  { key: 'documentsApproved', header: 'وثائق' },
  { key: 'groupsManaged', header: 'مجموعات' },
  { key: 'totalActions', header: 'إجمالي الإجراءات' },
  { key: 'lastActivity', header: 'آخر نشاط', transform: (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '') },
];

const AdminPerformance = ({ embedded = false }) => {
  const [branchId, setBranchId] = useState('all');
  const [days, setDays] = useState(90);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getOwnerAdminActivity({ branchId: branchId === 'all' ? undefined : branchId, days })
      .then((res) => { if (active) setAdmins(res.admins || []); })
      .catch((e) => { if (active) setError(e.message || 'تعذر تحميل البيانات'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [branchId, days]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {!embedded && (
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1">أداء المسؤولين</h1>
            <p className="text-gray-600">نشاط كل مسؤول — آخر {fmtNum(days)} يوم</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 ms-auto">
          <ExportButtons rows={admins} columns={CSV_COLUMNS} filename={generateFilename(`admin-activity-${branchId}-${days}d`)} />
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value={30}>30 يوم</option>
            <option value={90}>90 يوم</option>
            <option value={180}>180 يوم</option>
            <option value={365}>سنة</option>
          </select>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
            {BRANCH_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState label="جاري تحميل نشاط المسؤولين..." />
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : admins.length === 0 ? (
        <EmptyState icon={UserCog} title="لا يوجد مسؤولون" description="لا توجد حسابات مسؤولين لعرضها." />
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs">
                <th className="text-start px-4 py-3 font-semibold">المسؤول</th>
                <th className="text-center px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" />طلاب أُنشئوا</span></th>
                <th className="text-center px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" />مدفوعات</span></th>
                <th className="text-center px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1"><FileCheck className="h-3.5 w-3.5" />وثائق</span></th>
                <th className="text-center px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" />مجموعات</span></th>
                <th className="text-center px-4 py-3 font-semibold">آخر نشاط</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map((a) => (
                <tr key={a.uid} className={a.active ? 'hover:bg-gray-50' : 'bg-gray-50/60 opacity-70'}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      {a.name}
                      {!a.active && <span className="text-xs px-2 py-0.5 rounded bg-danger-50 text-danger-700">معطّل</span>}
                    </div>
                    <div className="text-xs text-gray-500">{a.branchName}{a.email ? ` · ${a.email}` : ''}</div>
                  </td>
                  <td className="px-4 py-3 text-center">{fmtNum(a.studentsCreated)}</td>
                  <td className="px-4 py-3 text-center">{fmtNum(a.paymentsRegistered)}</td>
                  <td className="px-4 py-3 text-center">{fmtNum(a.documentsApproved)}</td>
                  <td className="px-4 py-3 text-center">{fmtNum(a.groupsManaged)}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{fmtDate(a.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminPerformance;
