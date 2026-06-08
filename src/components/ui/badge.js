import React from 'react';

/**
 * Status pill. Variants map onto the semantic palette tokens (no raw Tailwind colors)
 * so badges stay coherent with the rest of the brand.
 */

const variants = {
  neutral:   'bg-gray-100 text-gray-700',
  primary:   'bg-primary-100 text-primary-800',
  secondary: 'bg-secondary-100 text-secondary-800',
  accent:    'bg-accent-100 text-accent-800',
  success:   'bg-success-100 text-success-800',
  warning:   'bg-warning-100 text-warning-800',
  danger:    'bg-danger-100 text-danger-800',
  info:      'bg-secondary-100 text-secondary-800',
};

// Backward-compat alias for the previous primitive API.
const aliases = { destructive: 'danger' };

export function Badge({ variant = 'neutral', children, className = '', ...props }) {
  const v = variants[aliases[variant] || variant] || variants.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${v} ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;
