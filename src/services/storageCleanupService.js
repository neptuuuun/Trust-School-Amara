/**
 * Storage Cleanup Service
 * ------------------------------------------------------------------
 * The single, centralized place for DELETING files from Supabase Storage.
 *
 * Why this exists:
 *   - Supabase free tier gives us only 1 GB. Orphaned files (rejected
 *     requests, approved-payment receipts, deleted accounts) must be removed
 *     automatically so storage stays sustainable with hundreds of students.
 *
 * Design rules (see spec §7 & §8):
 *   - Reusable, no duplicated deletion code anywhere else in the app.
 *   - Safe: every public helper is best-effort and NEVER throws. A failed
 *     cleanup must never crash an admin action or block a user.
 *   - Handles missing files gracefully (a "Not Found" is treated as success).
 *   - Logs every operation so issues are traceable.
 *
 * Buckets in use:
 *   - user-uploads ............ profile photos + ID cards
 *   - annual-fee .............. annual-fee receipts + language-form receipts
 *   - support-lesson-payments . monthly support-lesson receipts
 *   - training-receipts ....... training-course receipts
 */

import { supabase } from '../supabase';

const LOG = '[storageCleanup]';

export const STORAGE_BUCKETS = Object.freeze({
  USER_UPLOADS: 'user-uploads',
  ANNUAL_FEE: 'annual-fee',
  SUPPORT_LESSON_PAYMENTS: 'support-lesson-payments',
  TRAINING_RECEIPTS: 'training-receipts',
});

/** All buckets we may need to sweep when wiping a student's media. */
const ALL_MEDIA_BUCKETS = Object.values(STORAGE_BUCKETS);

const isMissingFileError = (error) => {
  if (!error) return false;
  const msg = String(error.message || error).toLowerCase();
  return (
    msg.includes('not found') ||
    msg.includes('does not exist') ||
    msg.includes('no such') ||
    error.statusCode === '404' ||
    error.statusCode === 404
  );
};

/**
 * Parse a stored reference into `{ bucket, path }`.
 *
 * Accepts every shape the codebase has ever stored:
 *   - `{ bucket, path }`            (explicit)
 *   - `{ publicUrl, path }`         (uploadToSupabase return value)
 *   - a public URL string          ".../object/public/<bucket>/<path>"
 *   - a signed URL string          ".../object/sign/<bucket>/<path>?token=…"
 *
 * @param {string|object|null} value
 * @returns {{ bucket: string, path: string }|null}
 */
export const parseStorageRef = (value) => {
  if (!value) return null;

  // Object forms ------------------------------------------------------------
  if (typeof value === 'object') {
    // Already explicit
    if (value.bucket && value.path) {
      return { bucket: value.bucket, path: stripLeadingSlash(value.path) };
    }
    // { publicUrl, path } — path has no bucket prefix, so resolve via the URL
    if (value.publicUrl) {
      const fromUrl = parseStorageRef(value.publicUrl);
      if (fromUrl) return fromUrl;
    }
    // A bare { path } can't be deleted without a bucket
    return null;
  }

  if (typeof value !== 'string') return null;

  const url = value.trim();
  if (!url) return null;

  // URL forms ---------------------------------------------------------------
  // Public:  /storage/v1/object/public/<bucket>/<path>
  // Signed:  /storage/v1/object/sign/<bucket>/<path>?token=...
  // Generic: /object/<bucket>/<path>
  const marker = url.match(/\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+)$/);
  if (marker) {
    const bucket = decodeURIComponent(marker[1]);
    const path = decodeURIComponent(marker[2].split('?')[0]);
    return { bucket, path: stripLeadingSlash(path) };
  }

  return null;
};

const stripLeadingSlash = (p) => String(p || '').replace(/^\/+/, '');

/**
 * Delete a single file from a bucket.
 * Safe: never throws; missing files count as success.
 *
 * @param {string} bucket
 * @param {string} path
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string }>}
 */
export const deleteFile = async (bucket, path) => {
  return deleteFiles(bucket, [path]);
};

/**
 * Delete multiple files from the SAME bucket in one request.
 * Safe: never throws; missing files count as success.
 *
 * @param {string} bucket
 * @param {string[]} paths
 * @returns {Promise<{ ok: boolean, deleted: number, skipped?: boolean, error?: string }>}
 */
export const deleteFiles = async (bucket, paths) => {
  const cleanPaths = (Array.isArray(paths) ? paths : [paths])
    .map(stripLeadingSlash)
    .filter(Boolean);

  if (!bucket || cleanPaths.length === 0) {
    return { ok: true, deleted: 0, skipped: true };
  }

  if (!supabase) {
    console.warn(`${LOG} Supabase not configured — skipping delete of`, cleanPaths);
    return { ok: false, deleted: 0, skipped: true, error: 'supabase-unconfigured' };
  }

  try {
    const { data, error } = await supabase.storage.from(bucket).remove(cleanPaths);

    if (error && !isMissingFileError(error)) {
      console.error(`${LOG} ❌ Failed to delete from "${bucket}":`, error.message, cleanPaths);
      return { ok: false, deleted: 0, error: error.message };
    }

    const deleted = Array.isArray(data) ? data.length : cleanPaths.length;
    console.log(`${LOG} 🧹 Deleted ${deleted} file(s) from "${bucket}":`, cleanPaths);
    return { ok: true, deleted };
  } catch (error) {
    // Defensive: a thrown error must never bubble up to the caller.
    console.error(`${LOG} ❌ Unexpected error deleting from "${bucket}":`, error?.message || error);
    return { ok: false, deleted: 0, error: error?.message || 'unknown' };
  }
};

/**
 * Delete one or many files given arbitrary references (URLs / objects / mixed
 * buckets). References are parsed and grouped per-bucket for efficiency.
 *
 * @param {(string|object)[]} refs
 * @returns {Promise<{ ok: boolean, deleted: number, unresolved: number }>}
 */
export const deleteByRefs = async (refs) => {
  const list = (Array.isArray(refs) ? refs : [refs]).filter(Boolean);
  if (list.length === 0) return { ok: true, deleted: 0, unresolved: 0 };

  const byBucket = new Map();
  let unresolved = 0;

  for (const ref of list) {
    const parsed = parseStorageRef(ref);
    if (!parsed) {
      unresolved += 1;
      console.warn(`${LOG} ⚠️ Could not resolve storage reference:`, ref);
      continue;
    }
    if (!byBucket.has(parsed.bucket)) byBucket.set(parsed.bucket, new Set());
    byBucket.get(parsed.bucket).add(parsed.path);
  }

  let deleted = 0;
  let ok = true;
  for (const [bucket, pathSet] of byBucket.entries()) {
    const res = await deleteFiles(bucket, Array.from(pathSet));
    deleted += res.deleted || 0;
    if (!res.ok) ok = false;
  }

  return { ok, deleted, unresolved };
};

/** Delete a single reference (URL / object). */
export const deleteByRef = async (ref) => deleteByRefs([ref]);

// ── High-level cleanup flows ────────────────────────────────────────────────

/**
 * Registration rejected → remove the applicant's uploaded identity media.
 *
 * @param {object} params
 * @param {string|object} [params.photoUrl]   profile photo ref
 * @param {string|object} [params.idCardUrl]  ID card ref
 * @param {(string|object)[]} [params.documents] any extra uploaded docs
 * @returns {Promise<{ ok: boolean, deleted: number }>}
 */
export const cleanupRejectedRegistration = async ({ photoUrl, idCardUrl, documents = [] } = {}) => {
  console.log(`${LOG} ▶ cleanupRejectedRegistration`);
  const refs = [photoUrl, idCardUrl, ...(Array.isArray(documents) ? documents : [])].filter(Boolean);
  const res = await deleteByRefs(refs);
  console.log(`${LOG} ✓ cleanupRejectedRegistration removed ${res.deleted} file(s)`);
  return res;
};

/**
 * Payment rejected OR approved → remove the receipt image.
 * (After approval the receipt is no longer required — spec §5.)
 *
 * Accepts any number of receipt references (URL strings / objects).
 *
 * @param {...(string|object|null)} receiptRefs
 * @returns {Promise<{ ok: boolean, deleted: number }>}
 */
export const cleanupPaymentReceipt = async (...receiptRefs) => {
  console.log(`${LOG} ▶ cleanupPaymentReceipt`);
  const res = await deleteByRefs(receiptRefs.filter(Boolean));
  console.log(`${LOG} ✓ cleanupPaymentReceipt removed ${res.deleted} file(s)`);
  return res;
};

// Spec-named aliases so call-sites read naturally.
export const cleanupRejectedPayment = cleanupPaymentReceipt;
export const cleanupApprovedPayment = cleanupPaymentReceipt;

/**
 * Account deleted → wipe ALL of a student's media so nothing is orphaned.
 *
 * Strategy:
 *   1. Delete the known refs we were handed (profile / ID / any receipts).
 *   2. Sweep each bucket for files stored under the student's user-id folder
 *      (`<bucket>/.../<userId>/…`) and remove whatever remains.
 *
 * @param {object} params
 * @param {string}  params.userId
 * @param {string|object} [params.photoUrl]
 * @param {string|object} [params.idCardUrl]
 * @param {(string|object)[]} [params.extraRefs]
 * @returns {Promise<{ ok: boolean, deleted: number }>}
 */
export const cleanupDeletedStudent = async ({ userId, photoUrl, idCardUrl, extraRefs = [] } = {}) => {
  console.log(`${LOG} ▶ cleanupDeletedStudent (${userId})`);
  let deleted = 0;
  let ok = true;

  // 1. Known references
  const knownRefs = [photoUrl, idCardUrl, ...(Array.isArray(extraRefs) ? extraRefs : [])].filter(Boolean);
  if (knownRefs.length) {
    const res = await deleteByRefs(knownRefs);
    deleted += res.deleted;
    if (!res.ok) ok = false;
  }

  // 2. Folder sweep per bucket (covers anything not referenced in Firestore)
  if (userId && supabase) {
    for (const bucket of ALL_MEDIA_BUCKETS) {
      const res = await deleteUserFolder(bucket, userId);
      deleted += res.deleted;
      if (!res.ok) ok = false;
    }
  }

  console.log(`${LOG} ✓ cleanupDeletedStudent removed ${deleted} file(s) for ${userId}`);
  return { ok, deleted };
};

/**
 * List & delete every object stored under a `<userId>` folder inside a bucket.
 * The known upload layouts are:
 *   user-uploads:            userPhotos/<uid>/...,  <uid>/idPhoto.*,  annual-payments/<uid>/...
 *   annual-fee:              <branch>/<uid>-*.*,     language-forms/<branch>/<uid>/...
 *   support-lesson-payments: support-lessons/<uid>/...
 *   training-receipts:       trainings/<branch>/<uid>/...
 *
 * Rather than guess every prefix, we recursively list the bucket (bounded) and
 * remove any object whose path contains the userId segment. Best-effort & safe.
 *
 * @param {string} bucket
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, deleted: number }>}
 */
const deleteUserFolder = async (bucket, userId) => {
  if (!supabase || !bucket || !userId) return { ok: true, deleted: 0 };

  try {
    const matches = await listObjectsContaining(bucket, userId);
    if (matches.length === 0) return { ok: true, deleted: 0 };
    const res = await deleteFiles(bucket, matches);
    return { ok: res.ok, deleted: res.deleted };
  } catch (error) {
    console.error(`${LOG} ❌ Folder sweep failed for "${bucket}/${userId}":`, error?.message || error);
    return { ok: false, deleted: 0 };
  }
};

/**
 * Recursively collect object paths in a bucket whose full path contains the
 * given `needle` (the userId). Depth-bounded to avoid runaway recursion.
 */
const listObjectsContaining = async (bucket, needle, prefix = '', depth = 0) => {
  if (depth > 4) return [];

  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error || !Array.isArray(data)) return [];

  const found = [];
  for (const entry of data) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Supabase marks folders as items with a null `id` (no metadata).
    const isFolder = entry.id === null || (entry.metadata == null && !entry.name.includes('.'));
    if (isFolder) {
      // Recurse into a folder if it could lead to the user's files.
      const nested = await listObjectsContaining(bucket, needle, entryPath, depth + 1);
      found.push(...nested);
    } else if (entryPath.includes(needle)) {
      found.push(entryPath);
    }
  }
  return found;
};
