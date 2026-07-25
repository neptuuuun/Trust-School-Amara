const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function validateImageFile(file) {
  if (!file) return { valid: false, error: 'لم يتم اختيار ملف' };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'نوع الملف غير مدعوم. يُسمح فقط بـ: JPG, PNG, WebP' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { valid: false, error: 'حجم الملف يتجاوز 5 ميغابايت' };
  }
  return { valid: true };
}

export async function optimizeImage(file, { maxDim = 1200, quality = 0.85 } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const MAX_DIM = maxDim;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            const name = file.name.replace(/\.[^.]+$/, '.webp');
            resolve(new File([blob], name, { type: 'image/webp' }));
          },
          'image/webp',
          quality
        );
      } catch {
        resolve(file);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
