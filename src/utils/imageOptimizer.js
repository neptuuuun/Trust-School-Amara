/**
 * Image Optimizer
 * ------------------------------------------------------------------
 * Client-side image validation + optimization used before EVERY upload
 * to Supabase Storage (profile photos, ID cards, payment receipts, …).
 *
 * Goals (see Storage Optimization spec):
 *   1. Resize large images down to a sensible max width.
 *   2. Convert to WebP for the best size/quality ratio.
 *   3. Compress automatically while preserving readability of text/IDs.
 *   4. Stay fully automatic & transparent for non-technical users.
 *
 * Everything here runs in the browser using <canvas>; there is no external
 * dependency. If anything goes wrong we fail safe and return the original
 * file so an upload is never blocked by the optimizer itself.
 */

// ── Public configuration ────────────────────────────────────────────────────

/** Accepted MIME types for any image upload. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/** Accepted file extensions (lower-case, no dot). */
export const ACCEPTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

/** Maximum ORIGINAL upload size, before optimization: 5 MB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Optimization targets. */
export const OPTIMIZE_DEFAULTS = Object.freeze({
  maxWidth: 1200,   // px — downscale anything wider than this
  maxHeight: 1600,  // px — guard portrait scans (IDs) from being huge
  quality: 0.8,     // WebP quality (0.75–0.80 keeps text crisp)
  mimeType: 'image/webp',
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Human-readable byte size, e.g. 153600 -> "150 KB".
 * @param {number} bytes
 * @returns {string}
 */
export const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const getExtension = (fileName = '') => {
  const ext = String(fileName).split('.').pop()?.toLowerCase() || '';
  return ext === 'jpeg' ? 'jpg' : ext;
};

/**
 * Validate an image file BEFORE upload.
 * Checks the MIME type / extension and the 5 MB original-size limit.
 * Returns a bilingual (Arabic + French) error so it can be shown directly.
 *
 * @param {File} file
 * @returns {{ valid: boolean, error: string|null }}
 */
export const validateImageFile = (file) => {
  if (!file) {
    return {
      valid: false,
      error: 'لم يتم اختيار أي ملف. · Aucun fichier sélectionné.',
    };
  }

  const type = String(file.type || '').toLowerCase();
  const ext = getExtension(file.name);
  const typeOk = ACCEPTED_IMAGE_TYPES.includes(type) || ACCEPTED_IMAGE_EXTENSIONS.includes(ext);

  if (!typeOk) {
    return {
      valid: false,
      error:
        'صيغة غير مدعومة. الصيغ المقبولة: JPG، PNG، WEBP. · ' +
        'Format non supporté. Formats acceptés : JPG, PNG, WEBP.',
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      valid: false,
      error:
        `حجم الصورة كبير جداً (${formatBytes(file.size)}). الحد الأقصى المسموح به هو 5 ميجابايت. · ` +
        `Image trop volumineuse (${formatBytes(file.size)}). La taille maximale autorisée est de 5 Mo.`,
    };
  }

  return { valid: true, error: null };
};

const readFileAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = src;
  });

const canvasToBlob = (canvas, mimeType, quality) =>
  new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
    } else {
      // Fallback for very old browsers
      try {
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const byteString = atob(dataUrl.split(',')[1]);
        const arr = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i += 1) arr[i] = byteString.charCodeAt(i);
        resolve(new Blob([arr], { type: mimeType }));
      } catch {
        resolve(null);
      }
    }
  });

const computeTargetSize = (width, height, maxWidth, maxHeight) => {
  let w = width;
  let h = height;
  if (w > maxWidth) {
    h = Math.round((h * maxWidth) / w);
    w = maxWidth;
  }
  if (h > maxHeight) {
    w = Math.round((w * maxHeight) / h);
    h = maxHeight;
  }
  return { w, h };
};

/**
 * Optimize an image file: resize → WebP → compress.
 *
 * Always resolves with a File. On any failure (decode error, unsupported
 * browser, …) it resolves with the ORIGINAL file so uploads never break.
 *
 * @param {File} file - The source image file.
 * @param {object} [options]
 * @param {number} [options.maxWidth=1200]
 * @param {number} [options.maxHeight=1600]
 * @param {number} [options.quality=0.8]
 * @param {(progress:number, stage:string)=>void} [options.onProgress] 0..100
 * @returns {Promise<File>}
 */
export const optimizeImage = async (file, options = {}) => {
  const {
    maxWidth = OPTIMIZE_DEFAULTS.maxWidth,
    maxHeight = OPTIMIZE_DEFAULTS.maxHeight,
    quality = OPTIMIZE_DEFAULTS.quality,
    onProgress,
  } = options;

  const report = (progress, stage) => {
    if (typeof onProgress === 'function') {
      try { onProgress(progress, stage); } catch { /* ignore */ }
    }
  };

  // Not an image we can process — return as-is.
  if (!file || !String(file.type || '').startsWith('image/')) {
    report(100, 'done');
    return file;
  }

  try {
    report(5, 'reading');
    const dataUrl = await readFileAsDataURL(file);

    report(25, 'decoding');
    const img = await loadImage(dataUrl);

    const { w, h } = computeTargetSize(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      maxWidth,
      maxHeight
    );

    report(50, 'resizing');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      report(100, 'done');
      return file;
    }
    // White matte so transparent PNGs don't turn black when flattened to WebP.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    report(75, 'compressing');
    const blob = await canvasToBlob(canvas, OPTIMIZE_DEFAULTS.mimeType, quality);

    // If conversion failed or didn't actually help, keep the smaller original.
    if (!blob || blob.size >= file.size) {
      report(100, 'done');
      return file;
    }

    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
    const optimized = new File([blob], `${baseName}.webp`, {
      type: OPTIMIZE_DEFAULTS.mimeType,
      lastModified: Date.now(),
    });

    report(100, 'done');
    return optimized;
  } catch (error) {
    console.warn('⚠️ Image optimization failed, using original file:', error?.message || error);
    report(100, 'done');
    return file;
  }
};

/**
 * Convenience: validate then optimize.
 * Throws an Error (with a bilingual message) when validation fails so callers
 * can surface it; otherwise resolves with the optimized File.
 *
 * @param {File} file
 * @param {object} [options] - forwarded to optimizeImage
 * @returns {Promise<File>}
 */
export const validateAndOptimizeImage = async (file, options = {}) => {
  const { valid, error } = validateImageFile(file);
  if (!valid) {
    const err = new Error(error);
    err.code = 'invalid-image';
    throw err;
  }
  return optimizeImage(file, options);
};
