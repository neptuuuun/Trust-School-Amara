/**
 * AdminModal — the single, reusable modal foundation for the whole admin dashboard.
 *
 * Every admin popup (create/edit forms, detail views, confirmations, image viewers)
 * is built on top of this component so behaviour and layout stay 100% consistent.
 *
 * Guarantees (see the global modal spec):
 *   • Perfectly centered horizontally & vertically via flexbox on a `position: fixed` overlay.
 *   • Rendered through a React portal into <body>, so it is NEVER affected by a
 *     transformed ancestor (e.g. framer-motion `<motion.div>`), which was the root
 *     cause of the "shifted / off-center" drawers.
 *   • Responsive width: w-full + max-w-* → 95vw on mobile, capped on tablet/desktop.
 *   • max-h-[90vh] with an internal scroll area — only the body scrolls, never the page.
 *   • Sticky header + sticky footer that never disappear while the body scrolls.
 *   • Background page scroll locked while open (ref-counted for stacked modals).
 *   • Closes on: close button, backdrop click (press+release on backdrop), Escape.
 *   • Focus moves into the dialog on open and is restored to the trigger on close.
 *   • Layered z-index tiers so dropdowns / confirmations / image viewers never clip.
 *
 * Structure rendered:
 *   ┌─────────────────────────────┐
 *   │ Header  (icon · title · ✕)  │  ← flex-shrink-0, sticky
 *   ├─────────────────────────────┤
 *   │ Scrollable body (children)  │  ← flex-1, overflow-y-auto
 *   ├─────────────────────────────┤
 *   │ Sticky footer (actions)     │  ← flex-shrink-0, optional
 *   └─────────────────────────────┘
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// ── Responsive width presets ────────────────────────────────────────────────
// w-full keeps it ~95vw on mobile (minus padding); max-w-* caps it on larger screens.
const SIZE = {
  sm: 'max-w-md',   // ~448px — confirmation dialogs / very small forms
  md: 'max-w-xl',   // ~576px — detail panels / slim forms
  lg: 'max-w-3xl',  // ~768px — standard create/edit forms (700–900px range)
  xl: 'max-w-5xl',  // ~1024px — large, multi-column forms
};

// ── Stacking tiers ──────────────────────────────────────────────────────────
// overlay/base modal = 1000, raised (confirmations on top of a modal) = 1100,
// top (image / file viewers) = 1200. Toasts live at 9999 and always win.
const TIER = {
  base:   'z-[1000]',
  raised: 'z-[1100]',
  top:    'z-[1200]',
};

/**
 * Lock <body> scroll while at least one modal is open.
 * Ref-counted on window so stacked modals (e.g. a confirm dialog opened from
 * inside a detail modal) don't prematurely restore scrolling.
 */
export const useBodyScrollLock = (active) => {
  useEffect(() => {
    if (!active) return undefined;
    const w = window;
    w.__adminModalLockCount = (w.__adminModalLockCount || 0) + 1;
    const previousOverflow = document.body.style.overflow;
    if (w.__adminModalLockCount === 1) {
      w.__adminModalPrevOverflow = previousOverflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      w.__adminModalLockCount = Math.max(0, (w.__adminModalLockCount || 1) - 1);
      if (w.__adminModalLockCount === 0) {
        document.body.style.overflow = w.__adminModalPrevOverflow || '';
      }
    };
  }, [active]);
};

const AdminModal = ({
  open = true,
  onClose,
  title,
  subtitle,
  icon: Icon,
  badge,
  size = 'lg',
  tier = 'base',
  footer,
  children,
  closeOnBackdrop = true,
  initialFocusRef,
  bodyClassName = '',
  ariaLabel,
}) => {
  const cardRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const pressedOnBackdrop = useRef(false);

  useBodyScrollLock(open);

  // Escape-to-close + focus management.
  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement;

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);

    // Move focus into the dialog (after paint) for accessibility.
    const focusId = window.setTimeout(() => {
      const target = initialFocusRef?.current || cardRef.current;
      target?.focus?.();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(focusId);
      const prev = restoreFocusRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [open, onClose, initialFocusRef]);

  // Backdrop close only when BOTH press and release happen on the backdrop —
  // prevents accidental close when a drag/selection starts inside and ends outside.
  const handleMouseDown = useCallback((e) => {
    pressedOnBackdrop.current = e.target === e.currentTarget;
  }, []);
  const handleMouseUp = useCallback((e) => {
    if (closeOnBackdrop && pressedOnBackdrop.current && e.target === e.currentTarget) {
      onClose?.();
    }
    pressedOnBackdrop.current = false;
  }, [closeOnBackdrop, onClose]);

  if (!open) return null;

  const hasHeader = title != null || Icon || badge;

  return createPortal(
    <div
      className={`fixed inset-0 ${TIER[tier] || TIER.base} flex items-center justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 backdrop-blur-sm sm:p-6`}
      dir="rtl"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (typeof title === 'string' ? title : undefined)}
        tabIndex={-1}
        className={`relative my-auto flex w-full ${SIZE[size] || SIZE.lg} max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none`}
      >
        {/* Header — always visible */}
        {hasHeader && (
          <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              {Icon && <Icon className="h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />}
              {badge}
              <div className="min-w-0">
                {title != null && (
                  <h2 className="truncate text-base font-bold text-gray-900 sm:text-lg">{title}</h2>
                )}
                {subtitle && <div className="mt-0.5 text-xs text-gray-400">{subtitle}</div>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Body — the ONLY scrollable region */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-5 sm:px-6 ${bodyClassName}`}
        >
          {children}
        </div>

        {/* Footer — sticky, always visible */}
        {footer && (
          <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/60 px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default AdminModal;
