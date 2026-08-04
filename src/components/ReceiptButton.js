/**
 * ReceiptButton
 * -------------
 * Drop-in "Download Receipt" control. Given a normalized receipt descriptor
 * (see src/utils/receipt.js → downloadReceipt), it renders a compact, on-brand
 * button that generates and downloads a professional PDF receipt, with a busy
 * state while the PDF renders and a graceful failure hook.
 *
 * Reused by the student dashboard enrollment cards, the admin archive detail
 * modals, and the Student 360 profile — one button, one receipt design.
 */

import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { downloadReceipt } from '../utils/receipt';

export default function ReceiptButton({
  data,
  label = 'تحميل الإيصال',
  size = 'sm',
  className = '',
  onError,
  onDone,
}) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await downloadReceipt(data);
      if (!ok) onError?.();
      else onDone?.();
    } catch (err) {
      console.error('[ReceiptButton] receipt generation failed:', err);
      onError?.(err);
    } finally {
      setBusy(false);
    }
  };

  const sizeClasses =
    size === 'md'
      ? 'px-3.5 py-2 text-sm'
      : 'px-2.5 py-1.5 text-xs';

  const Icon = busy ? Loader2 : Download;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60 ${sizeClasses} ${className}`}
    >
      <Icon className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
      <span>{busy ? 'جارٍ التحضير…' : label}</span>
    </button>
  );
}
