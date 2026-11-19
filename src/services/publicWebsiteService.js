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

// Statuses worth a second attempt: throttling, and a backend that is briefly
// unavailable (cold start / restart / upstream hiccup). Anything else (404, and
// the 4xx family generally) is a real answer — retrying it only wastes requests.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch the public website settings. `no-store` guarantees a fresh read on the
 * explicit calls (mount / focus / after an owner save) so a save is reflected
 * immediately, bypassing the endpoint's short shared cache.
 *
 * Retries transient failures with exponential backoff. This matters more than it
 * looks: every owner-managed section that defaults to EMPTY (the homepage photo
 * gallery, the contact-page FAQ) is rendered only when it has items, so a single
 * failed read used to silently delete those sections from the public site until
 * the next focus event. A 429 was the common trigger — see the dedicated
 * publicContentLimiter in backend/server.js for the other half of that fix.
 *
 * @returns {Promise<{ settings: object }>}
 */
export const fetchPublicWebsite = async ({ attempts = MAX_ATTEMPTS } = {}) => {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/public/website`, {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) return await res.json();

      const err = new Error(`Failed to load website settings (${res.status})`);
      err.status = res.status;
      if (!RETRYABLE_STATUS.has(res.status)) throw err;
      lastError = err;
    } catch (err) {
      // A thrown non-retryable HTTP error propagates as-is; anything else is a
      // network/parse failure, which is worth retrying.
      if (err?.status && !RETRYABLE_STATUS.has(err.status)) throw err;
      lastError = err;
    }

    if (attempt < attempts) await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
  }

  throw lastError;
};
