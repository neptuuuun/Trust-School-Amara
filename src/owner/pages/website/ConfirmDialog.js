import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * ConfirmDialog — lightweight confirmation modal matching the Owner dashboard's
 * existing inline-modal style (see AdminManagement). Used before destructive
 * actions in Website Management (e.g. deleting a gallery image).
 */
const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4" onClick={loading ? undefined : onCancel}>
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="flex items-start gap-3">
          {danger && (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-danger-100">
              <AlertTriangle className="h-5 w-5 text-danger-600" aria-hidden="true" />
            </span>
          )}
          <div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            {message && <p className="mt-1 text-sm leading-relaxed text-gray-600">{message}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              danger ? 'bg-danger-600 hover:bg-danger-700' : 'bg-primary hover:bg-primary/90'
            }`}
          >
            {loading ? 'جاري المعالجة...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
