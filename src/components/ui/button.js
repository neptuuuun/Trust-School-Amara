import React from 'react';

/**
 * Canonical button styling for the whole app.
 *
 * Built on the semantic palette tokens (bg-primary, bg-accent, bg-warning, …) so the
 * brand palette can be retuned in ONE place (tailwind.config.js / design-tokens.css)
 * without touching a single call site.
 *
 * - <Button>            renders a real <button>.
 * - buttonClasses(...)  returns the class string, for styling a non-button such as a
 *                       react-router <Link> or an <a>:  <Link className={buttonClasses({ variant: 'warning' })}>
 */

const base =
  'inline-flex items-center justify-center gap-2 font-semibold rounded-lg select-none ' +
  'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

const variants = {
  primary:   'bg-primary text-white hover:bg-primary-700 focus-visible:ring-primary/50',
  secondary: 'bg-secondary text-white hover:bg-secondary-600 focus-visible:ring-secondary/50',
  accent:    'bg-accent text-white hover:bg-accent-600 focus-visible:ring-accent/50',
  warning:   'bg-warning text-primary-900 hover:bg-warning-600 focus-visible:ring-warning/50',
  danger:    'bg-danger text-white hover:bg-danger-600 focus-visible:ring-danger/50',
  success:   'bg-success text-white hover:bg-success-700 focus-visible:ring-success/50',
  outline:   'border-2 border-primary text-primary bg-transparent hover:bg-primary hover:text-white focus-visible:ring-primary/50',
  ghost:     'text-primary bg-transparent hover:bg-primary-50 focus-visible:ring-primary/40',
  subtle:    'bg-primary-50 text-primary-700 hover:bg-primary-100 focus-visible:ring-primary/40',
  neutral:   'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-300',
};

const sizes = {
  sm:   'px-4 py-2 text-sm',
  md:   'px-6 py-3 text-base',
  lg:   'px-8 py-4 text-lg',
  icon: 'p-2.5',
};

// Backward-compat aliases for the previous primitive API.
const variantAliases = { default: 'primary', destructive: 'danger' };

export function buttonClasses({ variant = 'primary', size = 'md', fullWidth = false, className = '' } = {}) {
  const v = variants[variantAliases[variant] || variant] || variants.primary;
  const s = sizes[size] || sizes.md;
  return `${base} ${v} ${s} ${fullWidth ? 'w-full' : ''} ${className}`.replace(/\s+/g, ' ').trim();
}

export function Button({ variant = 'primary', size = 'md', fullWidth = false, className = '', type = 'button', ...props }) {
  return <button type={type} className={buttonClasses({ variant, size, fullWidth, className })} {...props} />;
}

export default Button;
