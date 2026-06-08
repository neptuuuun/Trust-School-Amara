import React from 'react';

/**
 * Card surface primitive. Standardized radius (rounded-xl), border, shadow and a
 * consistent 24px (p-6) inner padding rhythm. Pass `hover` for an interactive lift.
 */

export function Card({ className = '', hover = false, children, ...props }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-200 ${hover ? 'transition-shadow duration-200 hover:shadow-md' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...props }) {
  return <div className={`p-6 border-b border-gray-100 ${className}`.trim()} {...props}>{children}</div>;
}

export function CardContent({ className = '', children, ...props }) {
  return <div className={`p-6 ${className}`.trim()} {...props}>{children}</div>;
}

export function CardFooter({ className = '', children, ...props }) {
  return <div className={`p-6 border-t border-gray-100 ${className}`.trim()} {...props}>{children}</div>;
}

export default Card;
