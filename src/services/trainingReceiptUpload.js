import { supabase } from '../supabase';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg']);
const UPLOAD_ERROR = 'تعذر رفع صورة الإيصال. يرجى المحاولة مرة أخرى.';

const inferExtension = (filename = '', fallback = 'jpg') => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return fallback;
  if (ext === 'jpeg') return 'jpg';
  return ext;
};

export const uploadTrainingReceipt = async (file, branchId, userId) => {
  if (!file) {
    throw new Error('يرجى إرفاق صورة الإيصال.');
  }
  if (!branchId || !userId) {
    throw new Error(UPLOAD_ERROR);
  }
  if (!ALLOWED_TYPES.has(file.type || '')) {
    throw new Error('يجب رفع صورة بصيغة PNG أو JPG فقط.');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت.');
  }
  if (!supabase) {
    throw new Error(UPLOAD_ERROR);
  }

  const extension = inferExtension(file.name, file.type === 'image/png' ? 'png' : 'jpg');
  const objectPath = `trainings/${branchId}/${userId}/${Date.now()}.${extension}`;

  try {
    const { error } = await supabase.storage
      .from('training-receipts')
      .upload(objectPath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'image/jpeg',
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
