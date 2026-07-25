/**
 * publicWebsiteService.js
 * -----------------------
 * PUBLIC (no-auth) read of the website settings, used by the anonymous public
 * site. Goes through the backend (`GET /api/public/website`, Admin SDK) rather
 * than reading Firestore directly, so it works regardless of whether the
 * `config` public-read Firestore rule has been deployed.
 *
 * Kept deliberately dependency-light (a bare fetch — no Firebase/Supabase imports)
 * so it adds nothing to the public bundle's critical path.
 */

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

/**
 * Fetch the public website settings. `no-store` guarantees a fresh read on the
 * explicit calls (mount / focus / after an owner save) so a save is reflected
 * immediately, bypassing the endpoint's short shared cache.
 *
 * @returns {Promise<{ settings: object }>}
 */
export const fetchPublicWebsite = async () => {
  const res = await fetch(`${BACKEND_URL}/api/public/website`, {
    method: 'GET',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`Failed to load website settings (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
};
