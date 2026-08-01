/**
 * Supabase Storage cleanup (server-authoritative).
 *
 * Sensitive student media (national-ID scans, profile photos) lives in the
 * Supabase `user-uploads` bucket. Deleting a student MUST remove those files so
 * no identity document is left behind. This runs server-side with the
 * service-role key so cleanup does not depend on the admin's browser staying
 * open, and so it works even when the stored URL reference is missing — files
 * are also removed by their DETERMINISTIC per-user path (see
 * src/services/userService.js → uploadToSupabase).
 *
 * Configuration (backend/.env / Render dashboard):
 *   SUPABASE_URL              — project URL, e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (NEVER the anon key; server only)
 *
 * If either is unset (or @supabase/supabase-js is not installed yet) every
 * function degrades to a logged no-op, so the rest of the account deletion still
 * succeeds and the existing client-side best-effort cleanup remains the fallback.
 */

const BUCKET = 'user-uploads';

let clientResolved = false;
let cachedClient = null;

function getClient() {
  if (clientResolved) return cachedClient;
  clientResolved = true;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn(
      '[supabaseStorage] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — ' +
        'server-side storage cleanup is disabled (client fallback still runs).'
    );
    cachedClient = null;
    return cachedClient;
  }

  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (e) {
    console.warn(
      '[supabaseStorage] @supabase/supabase-js not installed — run `npm install` ' +
        'in backend/. Server-side storage cleanup disabled.'
    );
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

// Extract a bucket-relative object path from a stored reference, which may be:
//   - a { path } object    → path
//   - a public/sign URL    → the segment after /object/<public|sign>/<bucket>/
//   - a bare path string   → returned as-is
function pathFromRef(ref) {
  if (!ref) return null;
  if (typeof ref === 'object' && ref.path) return String(ref.path);
  if (typeof ref === 'string') {
    const m = ref.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/([^?]+)/);
    if (m) return decodeURIComponent(m[1]);
    if (!/^https?:\/\//i.test(ref)) return ref; // already a bare path
  }
  return null;
}

// The deterministic per-user object paths written by uploadToSupabase
// (userPhoto + idPhoto). Deleting by derivation catches files whose stored URL
// reference was lost (e.g. a rejected doc that already nulled the ref, or a
// registration whose Firestore write failed after the upload).
function deterministicPaths(userId) {
  return [`userPhotos/${userId}/userPhoto.webp`, `${userId}/idPhoto.webp`];
}

// SECURITY: only ever delete objects that belong to THIS user. Every legitimate
// path is uid-scoped (`<uid>/…` or `userPhotos/<uid>/…`); anything else — a
// tampered or legacy reference pointing elsewhere — is skipped, so a bad ref can
// never delete another user's, or an unrelated, file.
function isOwnedByUser(path, userId) {
  return path.startsWith(`${userId}/`) || path.startsWith(`userPhotos/${userId}/`);
}

/**
 * Delete every storage object owned by `userId`. Idempotent (removing an absent
 * object is a no-op) and best-effort (never throws) so it cannot block or break
 * the account deletion it is part of.
 *
 * `ok` is the truthful cleanup signal: it is false ONLY when server-side cleanup
 * was attempted (configured) and the remove call actually failed — i.e. an orphan
 * may now exist. When cleanup is not configured, nothing was attempted, so `ok`
 * stays true and the caller relies on `configured` to know the server did no work.
 *
 * @param {string} userId
 * @param {Array<string|{path:string}>} [extraRefs] stored photoUrl/idCardUrl/doc refs
 * @returns {Promise<{configured:boolean, ok:boolean, removed:string[], skipped:string[]}>}
 */
async function deleteUserFiles(userId, extraRefs = []) {
  const result = { configured: false, ok: true, removed: [], skipped: [] };
  if (!userId) return result;

  const client = getClient();
  if (!client) return result; // unconfigured → no-op (client fallback covers it)
  result.configured = true;

  const candidates = new Set(deterministicPaths(userId));
  const refs = Array.isArray(extraRefs) ? extraRefs : [extraRefs];
  for (const ref of refs) {
    const p = pathFromRef(ref);
    if (p) candidates.add(p);
  }

  const paths = [];
  for (const p of candidates) {
    if (isOwnedByUser(p, userId)) paths.push(p);
    else result.skipped.push(p);
  }
  if (paths.length === 0) return result;

  try {
    const { error } = await client.storage.from(BUCKET).remove(paths);
    if (error) {
      result.ok = false;
      console.warn(`[supabaseStorage] remove failed for ${userId}:`, error.message);
    } else {
      result.removed = paths;
    }
  } catch (e) {
    result.ok = false;
    console.warn(`[supabaseStorage] remove threw for ${userId}:`, e && e.message);
  }
  return result;
}

module.exports = { deleteUserFiles, pathFromRef, deterministicPaths };
