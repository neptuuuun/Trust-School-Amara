/**
 * FileViewerModal — full-bleed image / PDF viewer.
 *
 * Shared by every admin page that needs to preview a payment receipt or ID image,
 * so there is a single lightbox implementation instead of per-page copies.
 *
 * Rendered through a portal at the "top" stacking tier (z-1200) so it always appears
 * above base modals (z-1000) and confirmation dialogs (z-1100) — e.g. when a receipt
 * is opened from inside a registration detail modal.
 *
 * API: <FileViewerModal url={string|null} onClose={fn} />  (falsy url = closed)
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBodyScrollLock } from './AdminModal';

const isPdf = (url) => typeof url === 'string' && url.toLowerCase().includes('.pdf');

const backdrop = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } };
const panel = {
  hidden:  { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit:    { opacity: 0, scale: 0.95, y: 10 },
};

const FileViewerModal = ({ url, onClose }) => {
  useBodyScrollLock(Boolean(url));

  useEffect(() => {
    if (!url) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [url, onClose]);

  return createPortal(
    <AnimatePresence>
      {url && (
        <motion.div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4"
          onClick={onClose}
          variants={backdrop}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="relative w-full max-w-[95vw] rounded-xl bg-white shadow-2xl md:w-auto"
            onClick={(e) => e.stopPropagation()}
            variants={panel}
          >
            <button
              onClick={onClose}
              aria-label="إغلاق"
              className="absolute -top-3 -left-3 rounded-full bg-white p-2 text-gray-700 shadow hover:text-gray-900"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="p-2">
              {isPdf(url) ? (
                <object data={url} type="application/pdf" className="h-[85vh] w-[90vw] md:w-[70vw]">
                  <embed src={url} type="application/pdf" />
                </object>
              ) : (
                <img src={url} alt="Preview" className="max-h-[85vh] max-w-[90vw] rounded-lg" />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default FileViewerModal;
