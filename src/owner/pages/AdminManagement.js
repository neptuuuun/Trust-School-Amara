import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, UserPlus, Power, RotateCcw, Search, X, Building2 } from 'lucide-react';
import {
  listOwnerAdmins,
  createOwnerAdmin,
  deactivateOwnerAdmin,
  reactivateOwnerAdmin,
} from '../../services/ownerService';
import { LoadingState, Alert, EmptyState, Spinner } from '../../components/ui/feedback';

const BRANCHES = [
  { id: 'boumerdes', label: 'بومرداس' },
  { id: 'bordj_menaiel', label: 'برج منايل' },
];
const branchLabel = (id) => BRANCHES.find((b) => b.id === id)?.label || id || '—';

const FILTERS = [
  { id: 'all', label: 'الكل' },
  { id: 'active', label: 'نشط' },
  { id: 'inactive', label: 'معطّل' },
];

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'لا نشاط بعد';

const EMPTY_FORM = { name: '', email: '', branchId: 'boumerdes', password: '' };

const AdminManagement = ({ embedded = false }) => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [busyUid, setBusyUid] = useState(null);
  const [confirm, setConfirm] = useState(null); // { admin, makeActive }
  const [banner, setBanner] = useState(null);    // { variant, msg }

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listOwnerAdmins();
      setAdmins(res?.admins || []);
    } catch (e) {
      setError(e.message || 'تعذّر تحميل قائمة المسؤولين');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const active = admins.filter((a) => a.active !== false).length;
    return { total: admins.length, active, inactive: admins.length - active };
  }, [admins]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return admins
      .filter((a) => (filter === 'all' ? true : filter === 'active' ? a.active !== false : a.active === false))
      .filter((a) => (q ? (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q) : true))
      .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), 'ar'));
  }, [admins, filter, search]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name) return setCreateError('الاسم مطلوب');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setCreateError('البريد الإلكتروني غير صالح');
    if (!form.password || form.password.length < 6) return setCreateError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');

    setCreating(true);
    try {
      await createOwnerAdmin({ name, email, branchId: form.branchId, password: form.password });
      setBanner({ variant: 'success', msg: `تم إنشاء حساب المسؤول "${name}" بنجاح.` });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await load();
    } catch (err) {
      setCreateError(
        err.code === 'already-exists'
          ? 'هذا الحساب مدير بالفعل.'
          : (err.message || 'تعذّر إنشاء الحساب')
      );
    } finally {
      setCreating(false);
    }
  };

  const runToggle = async () => {
    if (!confirm) return;
    const { admin, makeActive } = confirm;
    setConfirm(null);
    setBusyUid(admin.uid);
    try {
      if (makeActive) await reactivateOwnerAdmin(admin.uid);
      else await deactivateOwnerAdmin(admin.uid);
      setBanner({
        variant: makeActive ? 'success' : 'info',
        msg: makeActive ? `تمت إعادة تفعيل "${admin.name || admin.email}".` : `تم تعطيل "${admin.name || admin.email}".`,
      });
      await load();
    } catch (err) {
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر تنفيذ العملية' });
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!embedded && (
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-1">إدارة المسؤولين</h1>
            <p className="text-gray-600">إنشاء حسابات الموظفين وتفعيلها أو تعطيلها — كل إجراء مُسجَّل في سجل التدقيق.</p>
          </div>
        )}
        <button
          onClick={() => { setShowCreate((s) => !s); setCreateError(''); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-600 transition-colors ms-auto"
        >
          <UserPlus className="h-4 w-4" />
          مسؤول جديد
        </button>
      </div>

      {banner && (
        <Alert variant={banner.variant} className="relative">
          <span>{banner.msg}</span>
          <button onClick={() => setBanner(null)} className="absolute top-2 start-2 text-current opacity-60 hover:opacity-100" aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </Alert>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 text-center">
          <p className="text-xs text-gray-500">الإجمالي</p>
          <p className="text-2xl font-bold text-primary">{counts.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 text-center">
          <p className="text-xs text-gray-500">نشط</p>
          <p className="text-2xl font-bold text-success-600">{counts.active}</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 text-center">
          <p className="text-xs text-gray-500">معطّل</p>
          <p className="text-2xl font-bold text-danger-600">{counts.inactive}</p>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-md border border-gray-100 p-5 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">إنشاء حساب مسؤول</h2>
          {createError && <Alert variant="danger">{createError}</Alert>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الكامل</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="مثال: أمينة قاسمي" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="admin@example.com" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الفرع</label>
              <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
                {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
              <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="6 أحرف على الأقل" dir="ltr" autoComplete="new-password" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-60">
              {creating ? <><Spinner size="sm" className="text-white" /><span>جارٍ الإنشاء…</span></> : 'إنشاء الحساب'}
            </button>
            <button type="button" onClick={() => { setShowCreate(false); setCreateError(''); }}
              className="px-4 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50">إلغاء</button>
          </div>
        </form>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${filter === f.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ms-auto">
          <Search className="h-4 w-4 text-gray-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد"
            className="border border-gray-300 rounded-lg ps-9 pe-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
        </div>
      </div>

      {loading ? (
        <LoadingState label="جاري تحميل المسؤولين..." />
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="لا يوجد مسؤولون" description="ابدأ بإنشاء أول حساب مسؤول." />
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs">
                <th className="text-start px-4 py-3 font-semibold">المسؤول</th>
                <th className="text-start px-4 py-3 font-semibold">الفرع</th>
                <th className="text-center px-4 py-3 font-semibold">الحالة</th>
                <th className="text-center px-4 py-3 font-semibold">آخر نشاط</th>
                <th className="text-center px-4 py-3 font-semibold">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((a) => {
                const active = a.active !== false;
                const busy = busyUid === a.uid;
                return (
                  <tr key={a.uid} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{a.name || '—'}</div>
                      {a.email && <div className="text-xs text-gray-500" dir="ltr">{a.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-gray-400" />
                        {branchLabel(a.branchId)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${active ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
                        {active ? 'نشط' : 'معطّل'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{fmtDateTime(a.lastActivityAt)}</td>
                    <td className="px-4 py-3 text-center">
                      {active ? (
                        <button onClick={() => setConfirm({ admin: a, makeActive: false })} disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-danger-200 text-danger-700 hover:bg-danger-50 transition-colors disabled:opacity-60">
                          {busy ? <Spinner size="sm" /> : <Power className="h-3.5 w-3.5" />} تعطيل
                        </button>
                      ) : (
                        <button onClick={() => setConfirm({ admin: a, makeActive: true })} disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-success-200 text-success-700 hover:bg-success-50 transition-colors disabled:opacity-60">
                          {busy ? <Spinner size="sm" /> : <RotateCcw className="h-3.5 w-3.5" />} إعادة تفعيل
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()} dir="rtl">
            <h3 className="text-lg font-bold text-gray-900">
              {confirm.makeActive ? 'إعادة تفعيل المسؤول' : 'تعطيل المسؤول'}
            </h3>
            <p className="text-sm text-gray-600">
              {confirm.makeActive
                ? `سيستعيد "${confirm.admin.name || confirm.admin.email}" صلاحية الدخول إلى لوحة فرعه.`
                : `سيفقد "${confirm.admin.name || confirm.admin.email}" الدخول فوراً (يُعطَّل حسابه ويتوقف عن العمل).`}
            </p>
            <div className="flex items-center gap-3 justify-start">
              <button onClick={runToggle}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${confirm.makeActive ? 'bg-success-600 hover:bg-success-700' : 'bg-danger-600 hover:bg-danger-700'}`}>
                {confirm.makeActive ? 'إعادة التفعيل' : 'تعطيل'}
              </button>
              <button onClick={() => setConfirm(null)} className="px-4 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminManagement;
