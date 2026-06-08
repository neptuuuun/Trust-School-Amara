import { auth } from '../firebase';

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

/**
 * Authenticated fetch helper.
 * Attaches the current user's Firebase ID token as a Bearer header,
 * sends / receives JSON, and throws structured errors with a `.code` property.
 *
 * @param {string} endpoint  Path like '/api/admin/create-student'
 * @param {RequestInit} opts Standard fetch options (method, body, …)
 * @returns {Promise<any>}   Parsed JSON response body
 */
const apiCall = async (endpoint, opts = {}) => {
  let token = null;
  try {
    token = await auth.currentUser?.getIdToken();
  } catch {
    // If token retrieval fails we still send the request — the server will reject it
  }

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });

  // Parse JSON whether success or error
  let body;
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    const err     = new Error(body.message || `Request failed (${response.status})`);
    err.code      = body.code    || 'unknown';
    err.status    = response.status;
    err.response  = body;
    throw err;
  }

  return body;
};

export default apiCall;
