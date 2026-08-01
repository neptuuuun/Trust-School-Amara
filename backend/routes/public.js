/**
 * public.js
 * ---------
 * PUBLIC (no-auth) read endpoints for content the anonymous website needs.
 *
 * Why this exists: the public site must read owner-managed website content
 * (`config/website`). Reading it directly from Firestore on the client requires
 * the `config` public-read rule to be DEPLOYED — which is a separate, easily-missed
 * step. Serving it through the backend (Admin SDK) bypasses Firestore rules
 * entirely, so the live site reflects saved changes as soon as the backend is
 * deployed, with no rules-deployment dependency.
 */

const express = require('express');
const router = express.Router();
const ws = require('../services/websiteSettings');

// GET /api/public/website — the full public website settings (defaults applied).
router.get('/website', async (_req, res, next) => {
  try {
    const settings = await ws.getWebsiteSettings();
    // Never leak hidden FAQ items to the public site — the owner can hide a
    // question without deleting it, and its content must not reach visitors.
    // Already sorted by `order` in the service.
    const publicSettings = {
      ...settings,
      faq: (settings.faq || []).filter((f) => f.isVisible !== false),
    };
    // Short shared cache: fast for anonymous visitors, but fresh enough that a
    // save is reflected almost immediately. The client refetches on focus and
    // after an owner save, and uses no-store to bypass this on those explicit reads.
    res.set('Cache-Control', 'public, max-age=15');
    return res.json({ settings: publicSettings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
