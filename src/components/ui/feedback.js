import React from 'react';
import { Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

/**
 * Consistent loading / empty / inline-message states so every list and form
 * communicates status the same way across the app.
 */

const cx = (...parts) => parts.join(' ').replace(/\s+/g, ' ').trim();

export function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' };
  return <Loader2 className={cx('animate-spin text-primary', sizes[size] || sizes.md, className)} aria-hidden="true" />;
}

export function LoadingState({ label = 'جاري التحميل…', className = '' }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-3 py-16 text-gray-500', className)} role="status" aria-live="polite">
      <Spinner size="lg" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center gap-3 py-16 px-6', className)}>
      {Icon && (
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 text-gray-400">
          <Icon className="w-7 h-7" aria-hidden="true" />
        </div>
      )}
      {title && <h3 className="text-lg font-semibold text-gray-800">{title}</h3>}
      {description && <p className="text-sm text-gray-500 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const alertStyles = {
  info:    { wrap: 'bg-secondary-50 text-secondary-800 border-secondary-200', Icon: Info },
  success: { wrap: 'bg-success-50 text-success-800 border-success-200', Icon: CheckCircle2 },
  warning: { wrap: 'bg-warning-50 text-warning-800 border-warning-200', Icon: AlertTriangle },
  danger:  { wrap: 'bg-danger-50 text-danger-800 border-danger-200', Icon: AlertCircle },
};

/** Inline contextual message (form errors, notices). Border on the inline-start edge for RTL. */
export function Alert({ variant = 'info', title, children, className = '' }) {
  const { wrap, Icon } = alertStyles[variant] || alertStyles.info;
  return (
    <div className={cx('flex items-start gap-3 rounded-lg border border-s-4 p-4', wrap, className)} role="alert">
      <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div className="text-sm leading-relaxed">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        {children}
      </div>
    </div>
  );
}
