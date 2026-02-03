import React from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const isPdf = (url) => typeof url === 'string' && url.toLowerCase().includes('.pdf');

const backdrop = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

const modal = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 }
};

const FileViewerModal = ({ url, onClose }) => {
  return (
    <AnimatePresence>
      {url && (
        <motion.div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={onClose}
          variants={backdrop}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="relative bg-white rounded-xl shadow-2xl max-w-[95vw] max-h-[92vh] w-full md:w-auto"
            onClick={(e) => e.stopPropagation()}
            variants={modal}
          >
            <button
              onClick={onClose}
              className="absolute -top-3 -left-3 bg-white shadow rounded-full p-2 text-gray-700 hover:text-gray-900"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="p-2">
              {isPdf(url) ? (
                <object data={url} type="application/pdf" className="w-[90vw] h-[85vh] md:w-[70vw]">
                  <embed src={url} type="application/pdf" />
                </object>
              ) : (
                <img src={url} alt="Preview" className="max-w-[90vw] max-h-[85vh] rounded-lg" />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FileViewerModal;




















