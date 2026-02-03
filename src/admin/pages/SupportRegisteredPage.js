import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Calendar, BookOpen, Mail, MapPin, BadgeCheck, Download } from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import { getUsersByIds, streamSupportLessonRegistrations } from '../../services/firestoreService';
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

const StatusBadge = ({ status }) => {
  const normalized = String(status || 'pending').toLowerCase();
  const variants = {
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    approved: 'bg-green-100 text-green-700 border-green-200',
    verified: 'bg-green-100 text-green-700 border-green-200',
    rejected: 'bg-red-100 text-red-700 border-red-200'
  };
  const labelMap = {
    pending: 'قيد المراجعة',
    approved: 'مقبول',
    verified: 'مؤكد',
    rejected: 'مرفوض'
  };
  const classes = variants[normalized] || variants.pending;
  const label = labelMap[normalized] || 'قيد المراجعة';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>
      <BadgeCheck className="h-3.5 w-3.5" />
      {label}
    </span>
  );
};

const SupportRegisteredPage = () => {
  const { selectedBranchId } = useBranch();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userProfiles, setUserProfiles] = useState(new Map());
  const [exporting, setExporting] = useState(false);


  useEffect(() => {
    if (!selectedBranchId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = streamSupportLessonRegistrations(selectedBranchId, (list) => {
      const sorted = [...list].sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
      });
      setEntries(sorted);
      setLoading(false);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [selectedBranchId]);

  useEffect(() => {
    let isMounted = true;
    const loadUsers = async () => {
      if (!selectedBranchId) {
        if (isMounted) setUserProfiles(new Map());
        return;
      }
      const userIds = entries
        .map((entry) => entry.studentId || entry.userId || '')
        .filter(Boolean);
      if (userIds.length === 0) {
        if (isMounted) setUserProfiles(new Map());
        return;
      }
      try {
        const profilesMap = await getUsersByIds(selectedBranchId, userIds);
        if (isMounted) {
          setUserProfiles(new Map(profilesMap));
        }
      } catch (error) {
        console.error('Failed to load user profiles for support registrations:', error);
        if (isMounted) {
          setUserProfiles(new Map());
        }
      }
    };
    loadUsers();
    return () => {
      isMounted = false;
    };
  }, [entries, selectedBranchId]);

  const resolveUserName = (entry) => {
    const userId = entry.studentId || entry.userId;
    const profile = userId ? userProfiles.get(userId) : null;
    return profile?.fullName?.trim() || null;
  };

  const statusOptions = useMemo(() => {
    const set = new Set();
    entries.forEach((entry) => {
      if (entry.status) {
        set.add(String(entry.status).toLowerCase());
      }
    });
    return Array.from(set);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const resolvedName = resolveUserName(entry);
      const matchesSearch = term
        ? `${resolvedName || ''} ${entry.subjectName || ''} ${entry.courseName || ''} ${entry.userEmail || ''}`
            .toLowerCase()
            .includes(term)
        : true;
      const normalizedStatus = String(entry.status || 'pending').toLowerCase();
      const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [entries, search, statusFilter]);

  const handleExportCsv = () => {
    if (!selectedBranchId || exporting || filteredEntries.length === 0) {
      if (filteredEntries.length === 0) {
        alert('لا توجد بيانات للتصدير.');
      }
      return;
    }

    setExporting(true);
    try {
      // Prepare data with resolved user names
      const exportData = filteredEntries.map(entry => {
        const userName = resolveUserName(entry);
        return {
          ...entry,
          studentName: userName || entry.studentName || ''
        };
      });

      // Define CSV columns with Arabic headers
      const columns = [
        { key: 'studentName', header: 'اسم الطالب' },
        { key: 'userEmail', header: 'البريد الإلكتروني' },
        { key: 'subjectName', header: 'المادة' },
        { 
          key: 'status', 
          header: 'الحالة',
          transform: (value) => {
            const statusMap = {
              'pending': 'قيد المراجعة',
              'approved': 'مقبول',
              'verified': 'مؤكد',
              'rejected': 'مرفوض'
            };
            return statusMap[String(value || 'pending').toLowerCase()] || 'قيد المراجعة';
          }
        },
        { key: 'createdAt', header: 'تاريخ التسجيل', type: 'date' },
        { 
          key: 'selectedMonths', 
          header: 'الأشهر المختارة',
          transform: (value) => {
            if (Array.isArray(value)) return value.join(' | ');
            return value || '';
          }
        },
        { key: 'studentId', header: 'معرف الطالب' },
        { key: 'id', header: 'معرف التسجيل' },
        { key: 'branchId', header: 'الفرع' }
      ];

      // Generate filename with current date
      const filename = generateFilename('support-registrations', 'csv');

      // Export to CSV
      exportToCsv(exportData, columns, filename);
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
        <p className="text-gray-600">يرجى اختيار الفرع لعرض المسجلين في دروس الدعم.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">دروس الدعم المسجلون</h1>
          <p className="text-gray-600">عرض مباشر لكل الطلبات المسجلة في دروس الدعم</p>
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
              placeholder="ابحث باسم الطالب أو الدرس"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pr-9 pl-3 focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm font-medium text-gray-700 focus:border-primary focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">جميع الحالات</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === 'pending'
                  ? 'قيد المراجعة'
                  : status === 'approved'
                  ? 'مقبول'
                  : status === 'verified'
                  ? 'مؤكد'
                  : status === 'rejected'
                  ? 'مرفوض'
                  : status}
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
          <BookOpen className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p className="text-gray-600">لا توجد تسجيلات في دروس الدعم حالياً.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-3 text-lg font-semibold text-gray-900">
                    <BadgeCheck className="h-5 w-5 text-primary" />
                    {resolveUserName(entry) || 'طالب غير مسمى'}
                  </div>
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {entry.branchId || selectedBranchId}
                  </p>
                </div>
                <StatusBadge status={entry.status || (entry.verified ? 'verified' : 'pending')} />
              </div>

              <div className="mt-4 grid gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm md:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col">
                  <span className="text-gray-500">اسم الدرس</span>
                  <span className="font-semibold text-gray-900">{entry.subjectName || entry.courseName || '—'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500">البريد الإلكتروني</span>
                  <span className="font-semibold text-gray-900">{entry.userEmail || entry.studentEmail || '—'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500">تاريخ التسجيل</span>
                  <span className="font-semibold text-gray-900">{formatDateTime(entry.createdAt || entry.submittedAt)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500">الفرع</span>
                  <span className="font-semibold text-gray-900">{entry.branchId || selectedBranchId}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {entry.userEmail || entry.studentEmail || '—'}
                </span>
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatDateTime(entry.createdAt || entry.submittedAt)}
                </span>
                {Array.isArray(entry.selectedMonths) && entry.selectedMonths.length > 0 && (
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    {entry.selectedMonths.join('، ')}
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

export default SupportRegisteredPage;
