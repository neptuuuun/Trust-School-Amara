import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Edit3, Clock, UploadCloud, X, FileText, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../supabase';
import { resubmitPaymentProof } from '../../services/firestoreService';
import { formatDate } from '../../utils/dateUtils';

/**
 * PaymentCorrectionBanner
 * -----------------------
 * Student-facing alert shown when one or more of the student's payments was put
 * into the `needs_correction` state by the branch admin. Each item shows the
 * admin's reason + when it was requested, and a large "إعادة رفع الإيصال" button
 * that uploads a fresh proof and returns the payment to the admin queue.
 *
 * Props:
 *   items     Array  — normalized correction items (see StudentDashboard)
 *   branchId  String
 *   studentId String — current user's uid (owner)
 */

const PROOF_BUCKET = 'support-lesson-payments';
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB


const ResubmitModal = ({ item, branchId, studentId, onClose, onDone }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = (f) => {
    setError('');
    if (!f) { setFile(null); return; }
    const okType = f.type.startsWith('image/') || f.type === 'application/pdf';
    if (!okType) { setError('يرجى رفع صورة واضحة أو ملف PDF.'); return; }
    if (f.size > MAX_BYTES) { setError('حجم الملف كبير جداً (الحد الأقصى 6 ميغابايت).'); return; }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) { setError('يرجى اختيار ملف الإيصال الجديد.'); return; }
    if (!supabase) { setError('خدمة رفع الملفات غير متاحة حالياً. يرجى إبلاغ الإدارة.'); return; }

    setUploading(true);
    setError('');
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      // Mirror the support-lesson form's proven path shape (`support-lessons/{uid}/…`)
      // so any path-scoped Supabase bucket policy keeps allowing the upload.
      const filePath = `support-lessons/${studentId}/${Date.now()}-correction-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(PROOF_BUCKET).upload(filePath, file);
      if (uploadError) throw new Error('تعذر رفع صورة الإيصال. حاول مرة أخرى.');

      const { data: publicUrlData } = supabase.storage.from(PROOF_BUCKET).getPublicUrl(filePath);
      const newProofUrl = publicUrlData?.publicUrl;
      if (!newProofUrl) throw new Error('تعذر الحصول على رابط الإيصال.');

      await resubmitPaymentProof({
        branchId,
        type: item.type,
        source: item.source || null,
        studentId,
        formId: item.formId || null,
        entryId: item.entryId || null,
        registrationId: item.registrationId || null,
        paymentId: item.paymentId || null,
        newProofUrl,
      });

      onDone();
    } catch (e) {
      console.error('Resubmit failed:', e);
      setError(e.message || 'حدث خطأ أثناء إعادة الرفع. حاول مرة أخرى.');
    } finally {
      setUploading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      dir="rtl"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
              <UploadCloud className="w-5 h-5 text-amber-600" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 truncate">إعادة رفع الإيصال</h3>
              <p className="text-xs text-gray-500 truncate">{item.serviceName}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={uploading} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="إغلاق">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {item.reason && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
              <span className="font-semibold">المطلوب تصحيحه: </span>{item.reason}
            </div>
          )}

          <label
            htmlFor="resubmit-proof-input"
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-8 px-4 cursor-pointer hover:border-amber-400 hover:bg-amber-50/40 transition-colors text-center"
          >
            {file ? (
              <>
                <FileText className="w-7 h-7 text-amber-600" />
                <span className="text-sm font-medium text-gray-800 break-all">{file.name}</span>
                <span className="text-xs text-gray-500">اضغط لاختيار ملف آخر</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-7 h-7 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">اضغط لاختيار صورة الإيصال الجديد</span>
                <span className="text-xs text-gray-400">صورة أو PDF — حتى 6 ميغابايت</span>
              </>
            )}
            <input
              id="resubmit-proof-input"
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => handleFile(e.target.files?.[0] || null)}
            />
          </label>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={handleSubmit}
            disabled={uploading || !file}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
          >
            {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري الإرسال...</> : 'إرسال الإيصال الجديد'}
          </button>
          <button
            onClick={onClose}
            disabled={uploading}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const PaymentCorrectionBanner = ({ items = [], branchId, studentId }) => {
  const [activeItem, setActiveItem] = useState(null);
  const [justSent, setJustSent] = useState(false);

  if (!items.length && !justSent) return null;

  const handleDone = () => {
    setActiveItem(null);
    setJustSent(true);
    // The real-time listeners flip the item to 'pending' and it drops out of `items`.
    setTimeout(() => setJustSent(false), 6000);
  };

  return (
    <>
      {justSent && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span>تم استلام التعديل وسيتم مراجعته قريباً.</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-8 h-8 text-amber-600 flex-shrink-0 mt-1" />
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-amber-900 mb-1">يرجى تصحيح معلومات الدفع</h3>
              <p className="text-amber-800 mb-4 text-sm">
                طلبت الإدارة تصحيح إيصال الدفع لبعض طلباتك. لن يتم رفض تسجيلك — ما عليك سوى إعادة رفع إيصال صحيح.
              </p>

              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.key} className="bg-white rounded-xl border border-amber-200 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Edit3 className="w-4 h-4 text-amber-600 flex-shrink-0" />
                          <p className="font-bold text-gray-900 truncate">{item.serviceName}</p>
                        </div>
                        {item.reason && (
                          <p className="text-sm text-gray-700 mt-1.5">
                            <span className="font-semibold text-amber-700">المطلوب: </span>{item.reason}
                          </p>
                        )}
                        {item.requestedAt && (
                          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> طُلب في: {formatDate(item.requestedAt)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setActiveItem(item)}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm transition-colors whitespace-nowrap flex-shrink-0"
                      >
                        <UploadCloud className="w-4 h-4" /> إعادة رفع الإيصال
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeItem && (
        <ResubmitModal
          item={activeItem}
          branchId={branchId}
          studentId={studentId}
          onClose={() => setActiveItem(null)}
          onDone={handleDone}
        />
      )}
    </>
  );
};

export default PaymentCorrectionBanner;
