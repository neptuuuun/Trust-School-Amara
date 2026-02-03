import React, { useEffect, useMemo, useState } from 'react';
import { useBranch } from '../../contexts/BranchContext';
import { streamRegisteredLanguages } from '../../services/firestoreService';
import { Loader2, Search, GraduationCap, Phone, FileText, BadgeCheck, Download } from 'lucide-react';
import { exportToCsv, generateFilename } from '../../utils/csvExport';

const formatDate = (ts) => {
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

const LanguageRegisteredPage = () => {
  const { selectedBranchId } = useBranch();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [exporting, setExporting] = useState(false);


  useEffect(() => {
    if (!selectedBranchId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = streamRegisteredLanguages(selectedBranchId, (list) => {
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

  const levelOptions = useMemo(() => {
    const set = new Set();
    entries.forEach((entry) => {
      if (entry.levelLabel) {
        set.add(entry.levelLabel);
      }
    });
    return Array.from(set);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesSearch = term
        ? `${entry.studentName || ''} ${entry.languageName || ''} ${entry.levelLabel || ''}`
            .toLowerCase()
            .includes(term)
        : true;
      const matchesLevel = levelFilter === 'all' || entry.levelLabel === levelFilter;
      return matchesSearch && matchesLevel;
    });
  }, [entries, search, levelFilter]);

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
        { key: 'languageName', header: 'اللغة' },
        { key: 'levelLabel', header: 'المستوى' },
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
        { key: 'studentPhone', header: 'هاتف الطالب' },
        { key: 'guardianPhone', header: 'هاتف الولي' },
        { key: 'teacherName', header: 'اسم الأستاذ' },
        { key: 'languagePrice', header: 'السعر' },
        { key: 'receiptUrl', header: 'رابط الإيصال' },
        { key: 'branchId', header: 'الفرع' }
      ];

      // Generate filename with current date
      const filename = generateFilename('languages-registrations', 'csv');

      // Export to CSV using filtered entries (respects search and filters)
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
          <h1 className="text-3xl font-bold text-gray-900">قائمة المسجلين في دورات اللغات</h1>
          <p className="text-gray-600">عرض دائم لكل طلبات اللغات المقبولة</p>
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
              placeholder="ابحث باسم الطالب أو اللغة"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pr-9 pl-3 focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm font-medium text-gray-700 focus:border-primary focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">جميع المستويات</option>
            {levelOptions.map((level) => (
              <option key={level} value={level}>
                {level}
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
          <GraduationCap className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p className="text-gray-600">لا توجد تسجيلات مؤكدة حالياً.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredEntries.map((entry) => (
            <div key={entry.formId} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-3 text-lg font-semibold text-gray-900">
                    <BadgeCheck className="h-5 w-5 text-green-500" />
                    {entry.studentName || 'طالب غير مسمى'}
                  </div>
                  <p className="text-sm text-gray-500">{entry.branchId}</p>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <Detail label="المستوى" value={entry.levelLabel} />
                  <Detail label="اللغة" value={entry.languageName} />
                  <Detail label="طريقة الدفع" value={entry.paymentMethod} />
                  <Detail label="هاتف الطالب" value={entry.studentPhone} />
                  <Detail label="هاتف الولي" value={entry.guardianPhone} />
                </div>
              </div>

              <div className="mt-4 grid gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm md:grid-cols-2 lg:grid-cols-4">
                <Detail label="اسم الأستاذ" value={entry.teacherName || '—'} />
                <Detail label="سعر الدورة" value={entry.languagePrice ? `${entry.languagePrice} دج` : '—'} />
                <Detail label="وقت التحقق" value={formatDate(entry.verifiedAt || entry.registeredAt)} />
                <Detail label="البريد" value={entry.studentEmail} />
              </div>

              {entry.receiptUrl && (
                <div className="mt-4 flex items-center gap-2 text-sm text-primary-600">
                  <FileText className="h-4 w-4" />
                  <a href={entry.receiptUrl} target="_blank" rel="noreferrer" className="underline">
                    عرض إيصال الدفع
                  </a>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {entry.studentPhone || '—'}
                </span>
                <span className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  {entry.levelId || 'غير محدد'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageRegisteredPage;

