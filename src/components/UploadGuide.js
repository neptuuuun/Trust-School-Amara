import React from 'react';
import { Info } from 'lucide-react';

export default function UploadGuide({ compact = false, className = '' }) {
  if (compact) {
    return (
      <div className={`flex items-start gap-1.5 text-xs text-gray-500 ${className}`}>
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary/60" aria-hidden="true" />
        <span>صورة واضحة • JPG أو PNG • أقل من 5MB</span>
      </div>
    );
  }

  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 ${className}`}>
      <p className="font-medium mb-1 flex items-center gap-1.5">
        <Info className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        إرشادات رفع الصورة
      </p>
      <ul className="list-disc list-inside space-y-0.5 text-xs">
        <li>يجب أن تكون الصورة واضحة وغير ضبابية</li>
        <li>الصيغ المقبولة: JPG, PNG, WebP</li>
        <li>الحجم الأقصى: 5 ميغابايت</li>
      </ul>
    </div>
  );
}
