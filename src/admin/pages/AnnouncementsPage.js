import React, { useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Pin,
  PinOff,
  Megaphone,
  Loader2,
  CalendarClock,
  Users,
  FileText,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBranch } from '../../contexts/BranchContext';
import {
  streamAdminAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  ANNOUNCEMENT_STYLES,
  ANNOUNCEMENT_CATEGORIES,
  PAGE_TARGETS,
} from '../../services/announcementService';
import AnnouncementFormModal from '../components/AnnouncementFormModal';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import Breadcrumb from '../components/Breadcrumb';
import { formatDateTime as formatDate } from '../../utils/dateUtils';

const isExpired = (ts) => {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d < new Date();
};

// ─── Component ────────────────────────────────────────────────────────────────

const AnnouncementsPage = () => {
  const { user } = useAuth();
  const { selectedBranchId } = useBranch();

  const [announcements, setAnnouncements]     = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState(null);
  const [showModal, setShowModal]             = useState(false);
  const [editTarget, setEditTarget]           = useState(null);
  const [deleteConfirm, setDeleteConfirm]     = useState(null);
  const [filterStyle, setFilterStyle]         = useState('all');
  const [filterStatus, setFilterStatus]       = useState('all');

  // ── Stream announcements for this branch only ─────────────────────────────
  useEffect(() => {
    if (!selectedBranchId) { setLoading(false); return; }
    setLoading(true);

    const unsub = streamAdminAnnouncements(
      selectedBranchId,
      (data) => { setAnnouncements(data); setLoading(false); },
      (err)  => { console.error(err); setLoading(false); setError('تعذّر تحميل الإعلانات'); }
    );
    return unsub;
  }, [selectedBranchId]);

  // ── Save (create or update) ───────────────────────────────────────────────
  const handleSave = async (formData) => {
    if (!selectedBranchId || !user?.uid) return;
    setSaving(true);
    setError(null);
    try {
      if (editTarget) {
        await updateAnnouncement(selectedBranchId, editTarget.id, formData);
      } else {
        await createAnnouncement(selectedBranchId, formData, user.uid);
      }
      setShowModal(false);
      setEditTarget(null);
    } catch (e) {
      setError('حدث خطأ أثناء الحفظ: ' + (e?.message || 'خطأ غير معروف'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a) => {
    try {
      await deleteAnnouncement(selectedBranchId, a.id);
      setDeleteConfirm(null);
    } catch {
      setError('فشل الحذف');
    }
  };

  const togglePublish = async (a) => {
    try { await updateAnnouncement(selectedBranchId, a.id, { isPublished: !a.isPublished }); }
    catch { setError('فشل التحديث'); }
  };

  const togglePin = async (a) => {
    try { await updateAnnouncement(selectedBranchId, a.id, { isPinned: !a.isPinned }); }
    catch { setError('فشل التحديث'); }
  };

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = announcements.filter((a) => {
    if (filterStyle !== 'all' && a.style !== filterStyle) return false;
    if (filterStatus === 'published'   && !a.isPublished)              return false;
    if (filterStatus === 'draft'       && a.isPublished)               return false;
    if (filterStatus === 'expired'     && !isExpired(a.expiresAt))     return false;
    if (filterStatus === 'active'      && (!a.isPublished || isExpired(a.expiresAt))) return false;
    return true;
  });

  const stats = {
    total:     announcements.length,
    active:    announcements.filter((a) => a.isPublished && !isExpired(a.expiresAt)).length,
    drafts:    announcements.filter((a) => !a.isPublished).length,
    expired:   announcements.filter((a) => isExpired(a.expiresAt)).length,
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6" dir="rtl">
      <Breadcrumb trail={['الإعلانات']} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Megaphone className="w-6 h-6 text-primary" />
            إعلانات الفرع
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            الإعلانات مرئية فقط لطلاب هذا الفرع
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowModal(true); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          إعلان جديد
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-danger-50 border border-danger-200 rounded-xl px-4 py-3 text-danger-700 text-sm">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="p-1 rounded text-danger-400 hover:text-danger-700 hover:bg-danger-100" aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'الإجمالي',  value: stats.total,   bg: 'bg-gray-50',     text: 'text-gray-800'    },
          { label: 'نشطة',      value: stats.active,  bg: 'bg-success-50',  text: 'text-success-800' },
          { label: 'مسودة',     value: stats.drafts,  bg: 'bg-warning-50',  text: 'text-warning-800' },
          { label: 'منتهية',    value: stats.expired, bg: 'bg-danger-50',   text: 'text-danger-800'  },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${s.text}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3">
        <span className="text-xs font-semibold text-gray-400 me-1">تصفية:</span>
        <select
          value={filterStyle}
          onChange={(e) => setFilterStyle(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:ring-2 focus:ring-primary/20 outline-none"
        >
          <option value="all">كل الأنواع</option>
          {Object.entries(ANNOUNCEMENT_STYLES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:ring-2 focus:ring-primary/20 outline-none"
        >
          <option value="all">كل الحالات</option>
          <option value="active">نشطة</option>
          <option value="draft">مسودة</option>
          <option value="expired">منتهية</option>
        </select>
        {(filterStyle !== 'all' || filterStatus !== 'all') && (
          <button
            onClick={() => { setFilterStyle('all'); setFilterStatus('all'); }}
            className="text-xs text-gray-400 hover:text-gray-700 underline"
          >
            مسح
          </button>
        )}
        <span className="text-xs text-gray-400 ms-auto">
          {filtered.length} / {announcements.length}
        </span>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-dashed border-gray-200">
          <Megaphone className="w-12 h-12 text-gray-200 mb-3" />
          <p className="text-gray-400 font-medium text-sm">لا توجد إعلانات</p>
          <button
            onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="mt-4 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 transition-colors"
          >
            أنشئ أول إعلان
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const st = ANNOUNCEMENT_STYLES[a.style] || ANNOUNCEMENT_STYLES.info;
            const cat = ANNOUNCEMENT_CATEGORIES[a.category];
            const expired = isExpired(a.expiresAt);
            const targetPageLabel = PAGE_TARGETS[a.targetPage] || a.targetPage;

            return (
              <div
                key={a.id}
                className={`bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm transition-opacity ${!a.isPublished || expired ? 'opacity-60' : ''}`}
              >
                {/* Left accent bar */}
                <div className="flex">
                  <div className="w-1 flex-shrink-0" style={{ background: st.accent }} />

                  <div className="flex-1 p-4">
                    <div className="flex items-start gap-3">
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Badges row */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: st.lightBg, color: st.darkText }}
                          >
                            {st.label}
                          </span>
                          {cat && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                              {cat.label}
                            </span>
                          )}
                          {a.isPinned && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 font-medium border border-primary-100">
                              <Pin className="w-3 h-3" />
                              مثبت
                            </span>
                          )}
                          {!a.isPublished && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              مسودة
                            </span>
                          )}
                          {expired && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-danger-50 text-danger-600">
                              منتهي الصلاحية
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <p className="font-bold text-gray-900 text-sm leading-snug">
                          {a.title}
                        </p>
                        {a.body && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.body}</p>
                        )}

                        {/* Meta */}
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                          {targetPageLabel && (
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {targetPageLabel}
                            </span>
                          )}
                          {(a.targetYear || a.targetGroup) && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {[a.targetYear, a.targetGroup].filter(Boolean).join(' · ')}
                            </span>
                          )}
                          {a.expiresAt && (
                            <span className={`flex items-center gap-1 ${expired ? 'text-danger-500' : ''}`}>
                              <CalendarClock className="w-3 h-3" />
                              {formatDate(a.expiresAt)}
                            </span>
                          )}
                          <span className="text-gray-300">
                            أنشئ: {formatDate(a.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex-shrink-0 flex items-center gap-0.5">
                        <button
                          onClick={() => togglePin(a)}
                          title={a.isPinned ? 'إلغاء التثبيت' : 'تثبيت'}
                          className={`p-2 rounded-lg transition-colors ${
                            a.isPinned
                              ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                        >
                          {a.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => togglePublish(a)}
                          title={a.isPublished ? 'إخفاء' : 'نشر'}
                          className={`p-2 rounded-lg transition-colors ${
                            a.isPublished
                              ? 'text-success-600 bg-success-50 hover:bg-success-100'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                        >
                          {a.isPublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => { setEditTarget(a); setShowModal(true); }}
                          title="تعديل"
                          className="p-2 rounded-lg text-secondary-600 bg-secondary-50 hover:bg-secondary-100 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(a)}
                          title="حذف"
                          className="p-2 rounded-lg text-danger-500 bg-danger-50 hover:bg-danger-100 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <AnnouncementFormModal
          announcement={editTarget}
          saving={saving}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}

      {/* Delete confirmation */}
      <AdminConfirmDialog
        open={!!deleteConfirm}
        title="تأكيد الحذف"
        message={deleteConfirm ? `هل أنت متأكد من حذف الإعلان "${deleteConfirm.title}" نهائياً؟` : ''}
        confirmLabel="حذف نهائياً"
        danger
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
};

export default AnnouncementsPage;
