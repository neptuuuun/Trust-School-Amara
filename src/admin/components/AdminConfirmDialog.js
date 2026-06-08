/**
 * AdminConfirmDialog
 *
 * A RTL-aware confirmation dialog covering three common admin patterns:
 *
 *   1. Simple confirm    — title + message + confirm/cancel
 *   2. Reject with reason — title + message + textarea + confirm/cancel
 *   3. Danger confirm     — same as (1) but red confirm button + warning icon
 *
 * Built on top of <AdminModal> so it inherits centering, scroll-lock, Escape-to-close,
 * focus management and the layered z-index. It renders at the "raised" tier so a
 * confirmation triggered from inside another modal always appears above it.
 *
 * Public API is unchanged from previous versions.
 *
 * Props:
 *   open, title, message, confirmLabel, cancelLabel, danger, withReason,
 *   reasonLabel, reasonPlaceholder, reason, onReasonChange, onConfirm, onCancel, loading
 */

import React, { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import AdminModal from './AdminModal';

const AdminConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel  = 'إلغاء',
  danger       = true,
  withReason   = false,
  reasonLabel  = 'السبب (اختياري)',
  reasonPlaceholder = 'أدخل السبب...',
  reason       = '',
  onReasonChange,
  onConfirm,
  onCancel,
  loading      = false,
}) => {
  const reasonRef = useRef(null);

  if (!open) return null;

  const dangerBadge = danger ? (
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-danger-100">
      <AlertTriangle className="h-5 w-5 text-danger-600" aria-hidden="true" />
    </span>
  ) : undefined;

  const footer = (
    <>
      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={loading}
        className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
          danger ? 'bg-danger-600 hover:bg-danger-700' : 'bg-primary hover:bg-primary/90'
        }`}
      >
        {loading ? 'جاري المعالجة...' : confirmLabel}
      </button>
    </>
  );

  return (
    <AdminModal
      open={open}
      onClose={onCancel}
      size="sm"
      tier="raised"
      title={title}
      badge={dangerBadge}
      closeOnBackdrop={!loading}
      initialFocusRef={withReason ? reasonRef : undefined}
      footer={footer}
    >
      {message && (
        <p className="text-sm leading-relaxed text-gray-600">{message}</p>
      )}

      {withReason && (
        <div className={message ? 'mt-4' : ''}>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {reasonLabel}
          </label>
          <textarea
            ref={reasonRef}
            value={reason}
            onChange={(e) => onReasonChange?.(e.target.value)}
            placeholder={reasonPlaceholder}
            rows={3}
            disabled={loading}
            className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>
      )}
    </AdminModal>
  );
};

export default AdminConfirmDialog;
