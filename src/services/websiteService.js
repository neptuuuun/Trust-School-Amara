/**
 * websiteService.js
 * -----------------
 * Owner-facing Website Management client.
 *
 * Two responsibilities, matching the existing app split:
 *   1. Image bytes → Supabase Storage (client-side, like userService.uploadToSupabase).
 *   2. Content metadata → owner-only Express backend (`/api/owner/website/*`),
 *      which persists `config/website` via the Admin SDK and audit-logs the change.
 *
 * The public site reads `config/website` directly from Firestore (see
 * WebsiteSettingsContext) — these endpoints are the ONLY write path, owner-gated.
 */

import apiCall from '../utils/apiClient';
import { supabase } from '../supabase';
import { validateImageFile, optimizeImage } from '../utils/imageOptimizer';

const BUCKET = 'user-uploads';
const HERO_PATH = 'website/hero/background.webp'; // fixed path → upsert replaces (no duplicates)

// ── Supabase image helpers ───────────────────────────────────────────────────

/**
 * Optimize + upload a website image to Supabase. Returns { publicUrl, path }.
 * A cache-busting `?t=` param is appended so a replaced image (same path) is not
 * served stale from the CDN/browser cache.
 *
 * @param {File} file
 * @param {{ path: string, maxDim?: number }} opts  fixed storage path (deterministic
 *        for hero → replaces; unique for gallery items)
 */
async function uploadImage(file, { path, maxDim = 1920 }) {
  if (!supabase) throw new Error('Supabase غير مهيأ. تحقق من إعدادات البيئة.');

  const { valid, error } = validateImageFile(file);
  if (!valid) { const e = new Error(error); e.code = 'invalid-image'; throw e; }

  const optimized = await optimizeImage(file, { maxDim });

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, optimized, { upsert: true, cacheControl: '3600', contentType: 'image/webp' });
  if (uploadError) throw new Error(`فشل رفع الصورة: ${uploadError.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('تعذر الحصول على رابط الصورة.');

  return { publicUrl: `${data.publicUrl}?t=${Date.now()}`, path };
}

/** Best-effort removal of a website image from Supabase (never throws). */
async function removeImage(path) {
  if (!supabase || !path) return;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch (e) {
    console.warn('[websiteService] failed to remove image:', path, e?.message);
  }
}

/** Upload/replace the single hero background image. */
export const uploadHeroImage = (file) => uploadImage(file, { path: HERO_PATH, maxDim: 1920 });

/** Upload one gallery image under a unique path. */
export const uploadGalleryImage = (file) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return uploadImage(file, { path: `website/gallery/${id}.webp`, maxDim: 1600 });
};

export { removeImage };

// ── Backend content API (owner-only) ─────────────────────────────────────────

/** Full website settings (with server defaults applied). */
export const getWebsiteSettings = () => apiCall('/api/owner/website');

export const updateHero = (hero) =>
  apiCall('/api/owner/website/hero', { method: 'PATCH', body: JSON.stringify(hero) });

export const updateContact = (contact) =>
  apiCall('/api/owner/website/contact', { method: 'PATCH', body: JSON.stringify(contact) });

export const updateSocial = (social) =>
  apiCall('/api/owner/website/social', { method: 'PATCH', body: JSON.stringify(social) });

export const updateBranches = (branches) =>
  apiCall('/api/owner/website/branches', { method: 'PATCH', body: JSON.stringify({ branches }) });

export const addGalleryImage = ({ url, path, caption }) =>
  apiCall('/api/owner/website/gallery', { method: 'POST', body: JSON.stringify({ url, path, caption }) });

export const reorderGallery = (order) =>
  apiCall('/api/owner/website/gallery/order', { method: 'PATCH', body: JSON.stringify({ order }) });

export const deleteGalleryImage = (id) =>
  apiCall(`/api/owner/website/gallery/${id}`, { method: 'DELETE' });
