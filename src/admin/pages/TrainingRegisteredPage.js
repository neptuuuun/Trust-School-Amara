import React, { useEffect, useMemo, useState } from 'react';
import { useBranch } from '../../contexts/BranchContext';
import { streamRegisteredTrainings } from '../../services/firestoreService';
import { Loader2, Search, Briefcase, DollarSign, Phone, FileText, BadgeCheck, Download } from 'lucide-react';
import { exportToCsv, generateFilename } from '../../utils/csvExport';

const formatDateTime = (ts) => {
  if (!ts) return '—';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString('ar-DZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const Detail = ({ label, value }) => (
  <div className="flex flex-col text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="font-semibold text-gray-900">{value || '—'}</span>
  </div>
);

const TrainingRegisteredPage = () => {
  const { selectedBranchId } = useBranch();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [trainingFilter, setTrainingFilter] = useState('all');
  const [exporting, setExporting] = useState(false);


  useEffect(() => {
    if (!selectedBranchId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = streamRegisteredTrainings(selectedBranchId, (list) => {
      const sorted = [...list].sort((a, b) => {
        const dateA = a.verifiedAt?.toDate ? a.verifiedAt.toDate() : (a.registeredAt?.toDate ? a.registeredAt.toDate() : new Date(a.registeredAt || 0));
        const dateB = b.verifiedAt?.toDate ? b.verifiedAt.toDate() : (b.registeredAt?.toDate ? b.registeredAt.toDate() : new Date(b.registeredAt || 0));
        return dateB - dateA;
      });
      setEntries(sorted);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedBranchId]);

  const trainingOptions = useMemo(() => {
    const set = new Set();
    entries.forEach((entry) => {
      if (entry.trainingTitle) {
        set.add(entry.trainingTitle);
      }
    });
    return Array.from(set);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesSearch = term
        ? `${entry.studentName || ''} ${entry.trainingTitle || ''}`.toLowerCase().includes(term)
        : true;
      const matchesTraining = trainingFilter === 'all' || entry.trainingTitle === trainingFilter;
      return matchesSearch && matchesTraining;
    });
  }, [entries, search, trainingFilter]);

  const handleExportCsv = () => {
    if (!selectedBranchId || exporting || filteredEntries.length === 0) {
      if (filteredEntries.length === 0) {
        alert('لا توجد بيانات للتصدير.');
      }
      return;
    }

    setExporting(true);
    try {
      // Define CSV columns with Arabic headers
      const columns = [
        { key: 'studentName', header: 'اسم الطالب' },
        { key: 'studentEmail', header: 'البريد الإلكتروني' },
        { key: 'trainingTitle', header: 'الدورة التكوينية' },
        { 
          key: 'status', 
          header: 'الحالة',
          transform: (value, row) => {
            if (value) return value;
            return row.verifiedAt ? 'مؤكد' : 'موافق عليه';
          }
        },
        { key: 'registeredAt', header: 'تاريخ التسجيل', type: 'date' },
        { key: 'verifiedAt', header: 'تاريخ التأكيد', type: 'date' },
        { key: 'paymentMethod', header: 'طريقة الدفع' },
        { key: 'trainingPrice', header: 'السعر' },
        { key: 'studentPhone', header: 'هاتف الطالب' },
        { key: 'trainingId', header: 'معرف الدورة' },
        { key: 'registrationId', header: 'معرف التسجيل' },
        { key: 'paymentProof', header: 'إثبات الدفع' },
        { key: 'trainingDescription', header: 'وصف الدورة' },
        { key: 'branchId', header: 'الفرع' }
      ];

      // Generate filename with current date
      const filename = generateFilename('trainings-registrations', 'csv');

      // Export to CSV using filtered entries
      exportToCsv(filteredEntries, columns, filename);
    } catch (e) {
      console.error('CSV export failed:', e);
      alert('فشل تصدير الملف.');
    } finally {
      setExporting(false);
    }
  };

  if (!selectedBranchId) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <p className="text-gray-600">يرجى اختيار الفرع لعرض قائمة المسجلين.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">المسجلون في الدورات التكوينية</h1>
          <p className="text-gray-600">جميع الطلبات المقبولة مع تفاصيل الدفع</p>
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'جاري التصدير...' : 'تصدير CSV'}
          </button>
          <div className="relative w-full md:w-72">
            <Search className="absolute right-3 top-3.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الطالب أو الدورة"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pr-9 pl-3 focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={trainingFilter}
            onChange={(e) => setTrainingFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm font-medium text-gray-700 focus:border-primary focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">جميع الدورات</option>
            {trainingOptions.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <Briefcase className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p className="text-gray-600">لا توجد تسجيلات مؤكدة حالياً.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredEntries.map((entry) => (
            <div key={entry.registrationId} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-3 text-lg font-semibold text-gray-900">
                    <BadgeCheck className="h-5 w-5 text-green-500" />
                    {entry.studentName || 'طالب غير مسمى'}
                  </div>
                  <p className="text-sm text-gray-500">{entry.branchId}</p>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <Detail label="اسم الدورة" value={entry.trainingTitle} />
                  <Detail label="السعر" value={entry.trainingPrice ? `${entry.trainingPrice} دج` : '—'} />
                  <Detail label="طريقة الدفع" value={entry.paymentMethod || '—'} />
                  <Detail label="هاتف الطالب" value={entry.studentPhone} />
                </div>
              </div>

              <div className="mt-4 grid gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm md:grid-cols-2 lg:grid-cols-4">
                <Detail label="البريد" value={entry.studentEmail || entry.userEmail} />
                <Detail label="رقم التسجيل" value={entry.registrationId} />
                <Detail label="تاريخ التحقق" value={formatDateTime(entry.verifiedAt || entry.registeredAt)} />
                <Detail label="معرّف الدورة" value={entry.trainingId || '—'} />
              </div>

              {entry.paymentProof && (
                <div className="mt-4 flex items-center gap-2 text-sm text-primary-600">
                  <FileText className="h-4 w-4" />
                  <a href={entry.paymentProof} target="_blank" rel="noreferrer" className="underline">
                    عرض إيصال الدفع
                  </a>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {entry.studentPhone || '—'}
                </span>
                {entry.trainingDescription && (
                  <span className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    {entry.trainingDescription}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrainingRegisteredPage;
