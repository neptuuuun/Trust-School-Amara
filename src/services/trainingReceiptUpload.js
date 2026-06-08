import { supabase } from '../supabase';
import { validateImageFile, optimizeImage } from '../utils/imageOptimizer';

const UPLOAD_ERROR = 'تعذر رفع صورة الإيصال. يرجى المحاولة مرة أخرى. · Échec du téléchargement du reçu. Veuillez réessayer.';

const inferExtension = (filename = '', fallback = 'webp') => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return fallback;
  if (ext === 'jpeg') return 'jpg';
  return ext;
};

export const uploadTrainingReceipt = async (file, branchId, userId) => {
  if (!file) {
    throw new Error('يرجى إرفاق صورة الإيصال. · Veuillez joindre une image du reçu.');
  }
  if (!branchId || !userId) {
    throw new Error(UPLOAD_ERROR);
  }

  // Strict validation (type + 5MB max) with bilingual messages.
  const { valid, error: validationError } = validateImageFile(file);
  if (!valid) {
    throw new Error(validationError);
  }
  if (!supabase) {
    throw new Error(UPLOAD_ERROR);
  }

  // Optimize (resize → WebP → compress); safe fallback to the original file.
  const optimizedFile = await optimizeImage(file);

  const extension = inferExtension(optimizedFile.name, 'webp');
  const objectPath = `trainings/${branchId}/${userId}/${Date.now()}.${extension}`;

  try {
    const { error } = await supabase.storage
      .from('training-receipts')
      .upload(objectPath, optimizedFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: optimizedFile.type || 'image/webp',
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error(UPLOAD_ERROR);
    }

    const { data } = supabase.storage.from('training-receipts').getPublicUrl(objectPath);
    if (!data?.publicUrl) {
      throw new Error(UPLOAD_ERROR);
    }

    return { publicUrl: data.publicUrl, path: objectPath };
  } catch (err) {
    console.error('Training receipt upload failed:', err);
    throw new Error(UPLOAD_ERROR);
  }
};
