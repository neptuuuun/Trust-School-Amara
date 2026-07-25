import React, { useState, useCallback, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * GallerySection
 * --------------
 * Public, responsive image gallery for the homepage. Images are owner-managed
 * (Website Management → Gallery) and passed in already ordered. Renders nothing
 * when empty, so the section never shows a blank placeholder.
 *
 * - Responsive grid (2 → 3 → 4 columns).
 * - Native lazy loading (`loading="lazy"`) so off-screen images don't block load.
 * - Click opens a simple lightbox with keyboard (←/→/Esc) navigation.
 */
const GallerySection = ({ images = [] }) => {
  const [activeIndex, setActiveIndex] = useState(null);
  const isOpen = activeIndex !== null;

  const close = useCallback(() => setActiveIndex(null), []);
  const prev = useCallback(
    () => setActiveIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length)),
    [images.length]
  );
  const next = useCallback(
    () => setActiveIndex((i) => (i === null ? i : (i + 1) % images.length)),
    [images.length]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') next();   // RTL: left advances
      else if (e.key === 'ArrowRight') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close, next, prev]);

  if (!images.length) return null;

  return (
    <section id="gallery" className="py-12 px-6 md:px-12 bg-gray-50">
      <div className="container mx-auto">
        <div className="text-center mb-12" dir="rtl">
          <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">معرض الصور</h2>
          <p className="text-gray-700 text-lg">لحظات من حفلات التخرج، الإنجازات، المسابقات والأنشطة</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img, index) => (
            <button
              key={img.id || img.url}
              type="button"
              onClick={() => setActiveIndex(index)}
              className="group relative aspect-square overflow-hidden rounded-2xl bg-gray-200 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              aria-label={img.caption || `عرض الصورة ${index + 1}`}
            >
              <img
                src={img.url}
                alt={img.caption || 'صورة من معرض المدرسة'}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {img.caption && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-start text-sm font-medium text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100" dir="rtl">
                  {img.caption}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            className="absolute top-4 end-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            aria-label="إغلاق"
          >
            <X className="h-6 w-6" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); prev(); }}
                className="absolute start-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                aria-label="السابق"
              >
                <ChevronRight className="h-7 w-7" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); next(); }}
                className="absolute end-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                aria-label="التالي"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
            </>
          )}

          <figure className="max-h-[90vh] max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <img
              src={images[activeIndex].url}
              alt={images[activeIndex].caption || 'صورة من معرض المدرسة'}
              className="mx-auto max-h-[80vh] w-auto rounded-lg object-contain"
            />
            {images[activeIndex].caption && (
              <figcaption className="mt-3 text-center text-white" dir="rtl">
                {images[activeIndex].caption}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </section>
  );
};

export default GallerySection;
