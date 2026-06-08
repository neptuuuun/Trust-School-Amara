import React from 'react';
import { Camera, CheckCircle2 } from 'lucide-react';

/**
 * UploadGuide
 * ------------------------------------------------------------------
 * A clean, friendly visual guide shown ABOVE every image-upload field so
 * non-technical users know what makes a good photo. Bilingual (Arabic +
 * French) to match the audience.
 *
 * Props:
 *   - compact  {boolean}  smaller padding/text for tight layouts
 *   - className {string}  extra classes for the wrapper
 */

const AR_ITEMS = [
  'يجب أن تكون واضحة ومقروءة',
  'يجب أن تظهر جميع المعلومات',
  'لا تقم بقص البيانات المهمة',
  'الحد الأقصى للحجم 5MB',
  'سيتم تحسين الصورة تلقائياً',
];

const FR_ITEMS = [
  'Photo claire et lisible',
  'Toutes les informations doivent être visibles',
  'Ne pas couper les informations importantes',
  'Taille maximale : 5 MB',
  "L'image sera optimisée automatiquement",
];

const UploadGuide = ({ compact = false, className = '' }) => {
  const pad = compact ? 'p-3' : 'p-4';
  const titleSize = compact ? 'text-sm' : 'text-base';
  const itemSize = compact ? 'text-xs' : 'text-sm';

  return (
    <div
      className={`rounded-xl border border-primary/20 bg-primary/5 ${pad} ${className}`}
      dir="rtl"
    >
      {/* Arabic */}
      <div className="flex items-center gap-2 mb-2">
        <Camera className={`text-primary ${compact ? 'w-4 h-4' : 'w-5 h-5'} flex-shrink-0`} />
        <h4 className={`font-bold text-primary ${titleSize}`}>شروط الصورة</h4>
      </div>
      <ul className={`space-y-1 ${itemSize} text-gray-700`}>
        {AR_ITEMS.map((item) => (
          <li key={item} className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary/70 mt-0.5 flex-shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {/* French */}
      <div className="mt-3 pt-3 border-t border-primary/10" dir="ltr">
        <div className="flex items-center gap-2 mb-2">
          <Camera className={`text-primary ${compact ? 'w-4 h-4' : 'w-5 h-5'} flex-shrink-0`} />
          <h4 className={`font-bold text-primary ${titleSize}`}>Conditions de la photo</h4>
        </div>
        <ul className={`space-y-1 ${itemSize} text-gray-700`}>
          {FR_ITEMS.map((item) => (
            <li key={item} className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary/70 mt-0.5 flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default UploadGuide;
