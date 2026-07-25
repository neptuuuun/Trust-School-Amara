import React, { useState, useRef } from 'react';
import { Loader2, Trash2, GripVertical, Info, LayoutGrid, Check } from 'lucide-react';
import {
  uploadGalleryImage, addGalleryImage, deleteGalleryImage, reorderGallery, removeImage,
} from '../../../services/websiteService';
import { Alert, EmptyState } from '../../../components/ui/feedback';
import ImageDropzone from './ImageDropzone';
import ConfirmDialog from './ConfirmDialog';
import SectionIntro from './SectionIntro';

const GALLERY_HINT = 'JPG أو PNG أو WebP — بحد أقصى 5 ميغابايت لكل صورة. يمكن اختيار عدة صور دفعة واحدة.';
const GALLERY_RECOMMENDATIONS = [
  'استخدم صوراً عالية الجودة',
  'صور حفلات التخرج، الإنجازات، المسابقات، الأنشطة والفعاليات',
  'الحجم الأقصى: 5 ميغابايت لكل صورة',
];

/**
 * GallerySettings — owner gallery manager: multi-upload (auto-compressed),
 * drag-to-reorder, and delete-with-confirmation. Uploads go to Supabase; metadata
 * and ordering are persisted through the owner backend. The public homepage reads
 * the same ordered list.
 */
const GallerySettings = ({ settings, onSaved }) => {
  const [images, setImages] = useState(() => settings.gallery || []);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [banner, setBanner] = useState(null);
  const [confirm, setConfirm] = useState(null); // image to delete
  const [deleting, setDeleting] = useState(false);
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const commit = (gallery) => { setImages(gallery); onSaved?.('gallery', gallery); };

  // ── Upload (sequential so ordering is deterministic) ───────────────────────
  const handleFiles = async (file) => {
    // ImageDropzone(multiple) calls onSelect once per file; batch by accumulating.
    // We instead process immediately per-file but guard concurrent saves.
    try {
      const uploaded = await uploadGalleryImage(file);
      const res = await addGalleryImage({ url: uploaded.publicUrl, path: uploaded.path });
      commit(res.gallery);
    } catch (err) {
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر رفع إحدى الصور.' });
    }
  };

  // Because ImageDropzone fires onSelect per file, we queue them to run in series.
  const queue = useRef(Promise.resolve());
  const onSelect = (file) => {
    setBanner(null);
    setUploading(true);
    setProgress((p) => ({ done: p.done, total: p.total + 1 }));
    queue.current = queue.current
      .then(() => handleFiles(file))
      .finally(() => {
        setProgress((p) => {
          const done = p.done + 1;
          if (done >= p.total) { setUploading(false); return { done: 0, total: 0 }; }
          return { ...p, done };
        });
      });
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const doDelete = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      const res = await deleteGalleryImage(confirm.id);
      commit(res.gallery);
      // Best-effort file cleanup (metadata is already gone — the source of truth).
      if (res.removed?.path) removeImage(res.removed.path);
      setBanner({ variant: 'success', msg: 'تم حذف الصورة.' });
      setConfirm(null);
    } catch (err) {
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر حذف الصورة.' });
    } finally {
      setDeleting(false);
    }
  };

  // ── Reorder (native drag & drop; persists on drop) ─────────────────────────
  const onDrop = async (dropIndex) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    setDragOverIndex(null);
    if (from === null || from === dropIndex) return;

    const reordered = [...images];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIndex, 0, moved);
    const prev = images;
    commit(reordered); // optimistic

    try {
      const res = await reorderGallery(reordered.map((g) => g.id));
      commit(res.gallery);
    } catch (err) {
      commit(prev); // rollback
      setBanner({ variant: 'danger', msg: err.message || 'تعذّر حفظ الترتيب.' });
    }
  };

  return (
    <div className="space-y-6">
      <SectionIntro title="معرض الصور">
        صور المدرسة الظاهرة في قسم «معرض الصور» على الصفحة الرئيسية. يظهر القسم للزوار فقط عند وجود صورة واحدة على الأقل، ويحترم الترتيب أدناه.
      </SectionIntro>

      {banner && <Alert variant={banner.variant}>{banner.msg}</Alert>}

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-gray-700">رفع صور جديدة</label>
        <ImageDropzone multiple onSelect={onSelect} onError={(msg) => setBanner({ variant: 'danger', msg })} hint={GALLERY_HINT} disabled={uploading} />
        <ul className="mt-2 space-y-1">
          {GALLERY_RECOMMENDATIONS.map((r) => (
            <li key={r} className="flex items-center gap-1.5 text-xs text-gray-500">
              <Check className="h-3.5 w-3.5 flex-shrink-0 text-success-600" />
              {r}
            </li>
          ))}
        </ul>
        {uploading && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري الرفع... ({progress.done}/{progress.total})
          </p>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3 text-xs text-secondary-800">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>اسحب الصور لإعادة ترتيبها — يُحفظ الترتيب تلقائياً. يظهر هذا الترتيب نفسه على الموقع.</span>
      </div>

      {images.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="لا توجد صور بعد" description="ارفع أول صورة لتظهر في معرض الصفحة الرئيسية." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => { dragIndex.current = i; }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
              onDragLeave={() => setDragOverIndex((idx) => (idx === i ? null : idx))}
              onDrop={() => onDrop(i)}
              className={`group relative aspect-square overflow-hidden rounded-xl border bg-gray-100 shadow-sm transition-all
                ${dragOverIndex === i ? 'border-primary ring-2 ring-primary/40' : 'border-gray-200'}`}
            >
              <img src={img.url} alt={img.caption || 'صورة'} loading="lazy" className="h-full w-full object-cover" />

              <span className="absolute top-1.5 start-1.5 flex h-7 w-7 cursor-grab items-center justify-center rounded-lg bg-black/50 text-white active:cursor-grabbing" title="اسحب لإعادة الترتيب">
                <GripVertical className="h-4 w-4" />
              </span>

              <button
                type="button"
                onClick={() => setConfirm(img)}
                className="absolute top-1.5 end-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-danger-600/90 text-white opacity-0 transition-opacity hover:bg-danger-700 group-hover:opacity-100"
                aria-label="حذف الصورة"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title="حذف الصورة"
        message="سيُحذف هذا العنصر نهائياً من المعرض ومن مساحة التخزين. لا يمكن التراجع. متابعة؟"
        confirmLabel="حذف"
        loading={deleting}
        onConfirm={doDelete}
        onCancel={() => (deleting ? null : setConfirm(null))}
      />
    </div>
  );
};

export default GallerySettings;
