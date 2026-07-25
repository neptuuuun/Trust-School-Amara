import React, { useRef, useState } from 'react';
import { UploadCloud, ImageIcon } from 'lucide-react';
import { validateImageFile } from '../../../utils/imageOptimizer';

/**
 * ImageDropzone — drag & drop + click-to-pick image input with live preview and
 * client-side validation (type + 5MB, via the shared validateImageFile). Purely
 * presentational: the parent owns the selected File and does the upload.
 *
 * Props:
 *   previewUrl  — current image to show (existing or a freshly-picked object URL)
 *   onSelect    — (file) => void, called with a VALID file
 *   onError     — (message) => void, called on a rejected file
 *   hint        — recommendation text under the label
 *   multiple    — allow selecting several files (gallery); calls onSelect per file
 *   disabled
 */
const ImageDropzone = ({ previewUrl, onSelect, onError, hint, multiple = false, disabled = false }) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const toProcess = multiple ? files : [files[0]];
    for (const file of toProcess) {
      const { valid, error } = validateImageFile(file);
      if (!valid) { onError?.(error); continue; }
      onSelect?.(file);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-disabled={disabled}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors
          ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
          ${dragging ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary/60 hover:bg-gray-50'}`}
      >
        {previewUrl && !multiple ? (
          <img src={previewUrl} alt="معاينة" className="max-h-56 w-full rounded-xl object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-gray-500">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              {dragging ? <UploadCloud className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
            </div>
            <p className="text-sm font-medium text-gray-700">اسحب وأفلت الصورة هنا أو انقر للاختيار</p>
            {hint && <p className="text-xs text-gray-400">{hint}</p>}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          className="hidden"
        />
      </div>
      {previewUrl && !multiple && hint && (
        <p className="mt-2 text-xs text-gray-400">{hint}</p>
      )}
    </div>
  );
};

export default ImageDropzone;
