/**
 * apiErrors — turn any thrown error into a message that is SAFE to show a user.
 *
 * `apiClient` throws two very different kinds of error:
 *   1. HTTP errors  → `new Error(body.message)` with `.status` / `.code` set.
 *      These carry the backend's own friendly (Arabic) message and are safe.
 *   2. Network errors → `fetch()` itself throws a `TypeError` with a raw message
 *      like "Failed to fetch" / "NetworkError" / a CORS complaint, and NO `.status`.
 *      These must NEVER reach the UI — they are meaningless to the user and can
 *      leak transport/CORS details.
 *
 * Use `safeErrorMessage(err, fallback)` anywhere an API error is shown to a user.
 */

const GENERIC_MESSAGE =
  'حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى لاحقاً.';

// Substrings that identify a raw transport/CORS failure. Matched case-insensitively.
const NETWORK_HINTS = [
  'failed to fetch',
  'networkerror',
  'network error',
  'load failed',
  'cors',
  'err_network',
  'err_connection',
  'err_internet_disconnected',
  'connection refused',
  'econnrefused',
];

/**
 * True when the error is a raw transport/CORS failure (no HTTP response came back).
 */
export function isNetworkError(err) {
  if (!err) return false;
  if (err.status) return false; // an HTTP response was received → not a transport failure
  const msg = String(err.message || err).toLowerCase();
  if (typeof TypeError !== 'undefined' && err instanceof TypeError) return true;
  return NETWORK_HINTS.some((hint) => msg.includes(hint));
}

/**
 * Return a user-safe message for `err`, never a raw exception / CORS / stack string.
 *
 * @param {unknown} err       The caught error.
 * @param {string}  fallback  Message to use for network/unknown errors.
 */
export function safeErrorMessage(err, fallback = GENERIC_MESSAGE) {
  if (isNetworkError(err)) return fallback;

  const msg = String(err?.message || '').trim();
  if (!msg) return fallback;

  // Even for HTTP errors, refuse to echo anything that looks like a transport
  // detail (defensive — such a message should carry no useful info for a user).
  const lower = msg.toLowerCase();
  if (NETWORK_HINTS.some((hint) => lower.includes(hint))) return fallback;

  return msg;
}

export { GENERIC_MESSAGE };
