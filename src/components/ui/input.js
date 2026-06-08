import React from 'react';

/**
 * Form control primitives. Mirror the existing `.input` look (so adoption is seamless)
 * but as composable, ref-forwarding React components that work with react-hook-form.
 * RTL-aware: text-start, single logical start/end padding (never physical pl/pr, and
 * never two competing inline-start utilities), logical label/error spacing.
 *
 * Input supports optional `startIcon` and `endAdornment` (e.g. a password-visibility
 * toggle) — both positioned with logical inset utilities so they mirror correctly.
 */

const cx = (...parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

// Base WITHOUT horizontal padding — each control adds exactly one ps-* and one pe-*.
const controlBase =
  'w-full rounded-lg border bg-white text-gray-900 placeholder:text-gray-400 ' +
  'py-3 text-base text-start transition-colors duration-200 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary ' +
  'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed';

const stateClasses = (error) =>
  error ? 'border-danger focus:ring-danger/40 focus:border-danger' : 'border-gray-300';

export const Input = React.forwardRef(function Input(
  { error, className = '', startIcon, endAdornment, wrapperClassName = '', ...props },
  ref
) {
  const ps = startIcon ? 'ps-11' : 'ps-4';
  const pe = endAdornment ? 'pe-11' : 'pe-4';
  const control = (
    <input
      ref={ref}
      aria-invalid={!!error || undefined}
      className={cx(controlBase, ps, pe, stateClasses(error), className)}
      {...props}
    />
  );

  if (!startIcon && !endAdornment) return control;

  return (
    <div className={cx('relative', wrapperClassName)}>
      {startIcon && (
        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-gray-400">
          {startIcon}
        </span>
      )}
      {control}
      {endAdornment && (
        <span className="absolute inset-y-0 end-0 flex items-center pe-2">{endAdornment}</span>
      )}
    </div>
  );
});

export const Textarea = React.forwardRef(function Textarea({ error, className = '', rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={!!error || undefined}
      className={cx(controlBase, 'ps-4 pe-4 resize-y', stateClasses(error), className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef(function Select({ error, className = '', children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={!!error || undefined}
      className={cx(controlBase, 'ps-4 pe-10', stateClasses(error), className)}
      {...props}
    >
      {children}
    </select>
  );
});

export function Label({ htmlFor, required, className = '', children, ...props }) {
  return (
    <label htmlFor={htmlFor} className={cx('block text-sm font-medium text-gray-700 mb-2', className)} {...props}>
      {children}
      {required && <span className="text-danger ms-1" aria-hidden="true">*</span>}
    </label>
  );
}

export function FieldHint({ className = '', children }) {
  return <p className={cx('mt-1 text-xs text-gray-500', className)}>{children}</p>;
}

export function FieldError({ className = '', children }) {
  if (!children) return null;
  return <p className={cx('mt-1 text-xs text-danger', className)} role="alert">{children}</p>;
}

/**
 * Field composes label + control + error/hint with consistent vertical rhythm.
 * Pass the control as children; show an error OR a hint below it.
 */
export function Field({ label, htmlFor, required, error, hint, className = '', children }) {
  return (
    <div className={cx('w-full', className)}>
      {label && <Label htmlFor={htmlFor} required={required}>{label}</Label>}
      {children}
      {error ? <FieldError>{error}</FieldError> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}
