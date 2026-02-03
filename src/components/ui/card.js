import React from 'react';

export function Card({ className = '', children }) {
  return <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>{children}</div>;
}

export function CardHeader({ className = '', children }) {
  return <div className={`p-6 border-b ${className}`}>{children}</div>;
}

export function CardContent({ className = '', children }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

export function CardFooter({ className = '', children }) {
  return <div className={`p-6 border-t ${className}`}>{children}</div>;
}

export default Card;




















