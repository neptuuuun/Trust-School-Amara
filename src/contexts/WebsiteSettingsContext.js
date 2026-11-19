/**
 * WebsiteSettingsContext
 * ----------------------
 * Single source of PUBLIC website content for the whole public site (hero,
 * contact, social, branches, gallery).
 *
 * Reads through the backend (`GET /api/public/website`, Admin SDK) rather than
 * directly from Firestore. This is deliberate: a direct client read of
 * `config/website` requires the `config` public-read Firestore rule to be
 * DEPLOYED — and if it isn't, the read is denied and the site silently falls back
 * to defaults (the exact "save succeeds but the site doesn't change" bug). Going
 * through the backend bypasses Firestore rules, so the live site reflects saved
 * changes as soon as the backend is deployed.
 *
 * Freshness ("immediately reflected after saving") without a realtime listener:
 *   - refetch on mount,
 *   - refetch when the tab regains focus / becomes visible,
 *   - `refresh()` is called by the Owner dashboard right after a successful save.
 *
 * Consumers never see a blank UI: values are merged over WEBSITE_DEFAULTS, so a
 * missing doc/field (or a backend hiccup) falls back to the historical content.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { fetchPublicWebsite } from '../services/publicWebsiteService';
import { WEBSITE_DEFAULTS, mergeWebsiteSettings } from '../config/websiteDefaults';

const WebsiteSettingsContext = createContext(null);

export const useWebsiteSettings = () => {
  const ctx = useContext(WebsiteSettingsContext);
  // Defensive: if a component renders outside the provider, fall back to defaults
  // rather than throwing (keeps the public site resilient).
  return ctx || { settings: mergeWebsiteSettings({}), loading: false, error: null, refresh: () => {} };
};

export const WebsiteSettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => mergeWebsiteSettings({}));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const lastLoadedAtRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetchPublicWebsite();
      if (!mountedRef.current) return;
      lastLoadedAtRef.current = Date.now();
      setSettings(mergeWebsiteSettings(res?.settings || {}));
      setError(null);
    } catch (e) {
      // On failure keep whatever we have (defaults on first load) — the public
      // site must always render.
      console.warn('[WebsiteSettings] load failed, using defaults:', e?.message);
      if (!mountedRef.current) return;
      setError(e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();

    // Refetch when the owner (or a visitor) returns to the tab, so a saved change
    // shows up without a manual reload.
    //
    // Throttled, because `focus` and `visibilitychange` both fire on a single tab
    // switch: unthrottled, an active session re-reads this endpoint on every
    // alt-tab. That is pure waste for content that changes a few times a month,
    // and it is what pushed signed-in users over the shared /api rate limit —
    // whose 429 then blanked the owner-managed sections. An explicit refresh()
    // (owner save) bypasses the throttle and is always immediate.
    const REFETCH_THROTTLE_MS = 30 * 1000;
    const loadIfStale = () => {
      if (Date.now() - lastLoadedAtRef.current < REFETCH_THROTTLE_MS) return;
      load();
    };
    const onFocus = () => loadIfStale();
    const onVisible = () => { if (document.visibilityState === 'visible') loadIfStale(); };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return (
    <WebsiteSettingsContext.Provider value={{ settings, loading, error, refresh: load }}>
      {children}
    </WebsiteSettingsContext.Provider>
  );
};

export { WEBSITE_DEFAULTS };
