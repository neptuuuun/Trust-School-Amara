/**
 * ownerWebsiteController.js
 * -------------------------
 * Owner-only management of the PUBLIC website content (hero, contact, social,
 * branches, gallery). Owner-only (requireOwner); writes the client-write-protected
 * `config/website` doc via the Admin SDK. Every change is appended to the immutable
 * audit log.
 *
 * Image bytes live in Supabase Storage and are uploaded/removed CLIENT-SIDE (same
 * split as user photos: userService uploads, the backend persists metadata). These
 * handlers only validate and persist the resulting URLs/paths.
 */

const crypto = require('crypto');
const { admin } = require('../config/firebase');
const { writeAudit } = require('../services/auditService');
const ws = require('../services/websiteSettings');

/** Canonical actor for the acting owner (set by requireOwner). */
function ownerActor(req) {
  const o = req.owner || {};
  return { uid: o.uid || req.user?.uid || '', name: o.name || '', email: o.email || req.user?.email || '', role: 'owner' };
}

async function audit(req, action, before, after) {
  await writeAudit({
    actor: ownerActor(req),
    action,
    targetType: 'config',
    targetId: 'website',
    before,
    after,
  });
}

// ── GET /api/owner/website ──────────────────────────────────────────────────
const getWebsite = async (_req, res, next) => {
  try {
    const settings = await ws.getWebsiteSettings();
    return res.json({ settings });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/owner/website/hero ───────────────────────────────────────────
const updateHero = async (req, res, next) => {
  try {
    const hero = ws.sanitizeHero(req.body || {});
    if (!hero.title) {
      return res.status(400).json({ code: 'invalid-input', message: 'العنوان الرئيسي مطلوب.' });
    }
    const before = (await ws.getWebsiteSettings()).hero;
    await ws.setSection('hero', hero, ownerActor(req));
    await audit(req, 'website.hero.update', before, hero);
    return res.json({ hero });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/owner/website/contact ────────────────────────────────────────
const updateContact = async (req, res, next) => {
  try {
    const contact = ws.sanitizeContact(req.body || {});
    if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
      return res.status(400).json({ code: 'invalid-input', message: 'البريد الإلكتروني غير صالح.' });
    }
    const before = (await ws.getWebsiteSettings()).contact;
    // Persist the clean contact shape AND remove any legacy global `mapsLink`
    // (maps links are now branch-specific). FieldValue.delete() drops the stale
    // nested field under merge:true so the data model self-heals on first save.
    await ws.setSection('contact', { ...contact, mapsLink: admin.firestore.FieldValue.delete() }, ownerActor(req));
    await audit(req, 'website.contact.update', before, contact);
    return res.json({ contact });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/owner/website/social ─────────────────────────────────────────
const updateSocial = async (req, res, next) => {
  try {
    const social = ws.sanitizeSocial(req.body || {});
    const before = (await ws.getWebsiteSettings()).social;
    await ws.setSection('social', social, ownerActor(req));
    await audit(req, 'website.social.update', before, social);
    return res.json({ social });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/owner/website/branches ───────────────────────────────────────
const updateBranches = async (req, res, next) => {
  try {
    const branches = ws.sanitizeBranches(req.body?.branches);
    const before = (await ws.getWebsiteSettings()).branches;
    await ws.setSection('branches', branches, ownerActor(req));
    await audit(req, 'website.branches.update', { branches: before }, { branches });
    return res.json({ branches });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/owner/website/gallery ─────────────────────────────────────────
// Append one image (already uploaded to Supabase by the client). Body: { url, path, caption }
const addGalleryImage = async (req, res, next) => {
  try {
    const url = String(req.body?.url || '').trim();
    const path = String(req.body?.path || '').trim();
    if (!url || !path) {
      return res.status(400).json({ code: 'invalid-input', message: 'رابط الصورة ومسارها مطلوبان.' });
    }
    const current = (await ws.getWebsiteSettings()).gallery || [];
    const item = ws.sanitizeGalleryItem(
      { id: crypto.randomUUID(), url, path, caption: req.body?.caption },
      current.length
    );
    const gallery = [...current, item];
    await ws.setSection('gallery', gallery, ownerActor(req));
    await audit(req, 'website.gallery.add', { count: current.length }, { added: item.id, count: gallery.length });
    return res.json({ item, gallery });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/owner/website/gallery/:id ───────────────────────────────────
// Removes the metadata (source of truth). Returns the removed item so the client
// can delete the underlying Supabase file.
const deleteGalleryImage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const current = (await ws.getWebsiteSettings()).gallery || [];
    const removed = current.find((g) => g.id === id);
    if (!removed) {
      return res.status(404).json({ code: 'not-found', message: 'الصورة غير موجودة.' });
    }
    const gallery = current
      .filter((g) => g.id !== id)
      .map((g, i) => ({ ...g, order: i }));
    await ws.setSection('gallery', gallery, ownerActor(req));
    await audit(req, 'website.gallery.delete', { id, path: removed.path }, { count: gallery.length });
    return res.json({ removed, gallery });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/owner/website/gallery/order ──────────────────────────────────
// Body: { order: [id1, id2, ...] } — the full ordered list of gallery ids.
const reorderGallery = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.order) ? req.body.order.map(String) : null;
    if (!ids) {
      return res.status(400).json({ code: 'invalid-input', message: 'ترتيب غير صالح.' });
    }
    const current = (await ws.getWebsiteSettings()).gallery || [];
    const byId = new Map(current.map((g) => [g.id, g]));
    // Rebuild in the requested order; append any ids not present in the request
    // (defensive: never silently drop an image).
    const ordered = [];
    ids.forEach((id) => { if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); } });
    byId.forEach((g) => ordered.push(g));
    const gallery = ordered.map((g, i) => ({ ...g, order: i }));
    await ws.setSection('gallery', gallery, ownerActor(req));
    await audit(req, 'website.gallery.reorder', { count: current.length }, { count: gallery.length });
    return res.json({ gallery });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/owner/website/faq ─────────────────────────────────────────────
// Append one FAQ item. Body: { question, answer, isVisible? }
const addFaq = async (req, res, next) => {
  try {
    const question = String(req.body?.question || '').trim();
    const answer = String(req.body?.answer || '').trim();
    if (!question || !answer) {
      return res.status(400).json({ code: 'invalid-input', message: 'السؤال والجواب مطلوبان.' });
    }
    const current = (await ws.getWebsiteSettings()).faq || [];
    const item = ws.sanitizeFaqItem(
      {
        id: crypto.randomUUID(),
        question,
        answer,
        isVisible: req.body?.isVisible === undefined ? true : req.body.isVisible,
      },
      current.length
    );
    const faq = [...current, item];
    await ws.setSection('faq', faq, ownerActor(req));
    await audit(req, 'website.faq.add', { count: current.length }, { added: item.id, count: faq.length });
    return res.json({ item, faq });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/owner/website/faq/:id ────────────────────────────────────────
// Edit question/answer and/or toggle visibility. Body: { question?, answer?, isVisible? }
const updateFaq = async (req, res, next) => {
  try {
    const { id } = req.params;
    const current = (await ws.getWebsiteSettings()).faq || [];
    const existing = current.find((f) => f.id === id);
    if (!existing) {
      return res.status(404).json({ code: 'not-found', message: 'السؤال غير موجود.' });
    }

    // Apply only the provided fields over the existing item, then re-sanitize.
    const merged = {
      ...existing,
      ...(req.body?.question !== undefined ? { question: req.body.question } : {}),
      ...(req.body?.answer !== undefined ? { answer: req.body.answer } : {}),
      ...(req.body?.isVisible !== undefined ? { isVisible: req.body.isVisible } : {}),
      updatedAt: new Date().toISOString(), // force refresh (bypass preserve-existing)
    };
    const item = ws.sanitizeFaqItem(merged, existing.order);
    if (!item.question || !item.answer) {
      return res.status(400).json({ code: 'invalid-input', message: 'السؤال والجواب مطلوبان.' });
    }

    const faq = current.map((f) => (f.id === id ? item : f));
    await ws.setSection('faq', faq, ownerActor(req));
    await audit(req, 'website.faq.update', existing, item);
    return res.json({ item, faq });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/owner/website/faq/:id ───────────────────────────────────────
const deleteFaq = async (req, res, next) => {
  try {
    const { id } = req.params;
    const current = (await ws.getWebsiteSettings()).faq || [];
    const removed = current.find((f) => f.id === id);
    if (!removed) {
      return res.status(404).json({ code: 'not-found', message: 'السؤال غير موجود.' });
    }
    const faq = current
      .filter((f) => f.id !== id)
      .map((f, i) => ({ ...f, order: i }));
    await ws.setSection('faq', faq, ownerActor(req));
    await audit(req, 'website.faq.delete', { id, question: removed.question }, { count: faq.length });
    return res.json({ removed, faq });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/owner/website/faq/order ──────────────────────────────────────
// Body: { order: [id1, id2, ...] } — the full ordered list of FAQ ids.
const reorderFaq = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.order) ? req.body.order.map(String) : null;
    if (!ids) {
      return res.status(400).json({ code: 'invalid-input', message: 'ترتيب غير صالح.' });
    }
    const current = (await ws.getWebsiteSettings()).faq || [];
    const byId = new Map(current.map((f) => [f.id, f]));
    // Rebuild in the requested order; append any ids missing from the request
    // (defensive: never silently drop a question).
    const ordered = [];
    ids.forEach((id) => { if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); } });
    byId.forEach((f) => ordered.push(f));
    const faq = ordered.map((f, i) => ({ ...f, order: i }));
    await ws.setSection('faq', faq, ownerActor(req));
    await audit(req, 'website.faq.reorder', { count: current.length }, { count: faq.length });
    return res.json({ faq });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getWebsite,
  updateHero,
  updateContact,
  updateSocial,
  updateBranches,
  addGalleryImage,
  deleteGalleryImage,
  reorderGallery,
  addFaq,
  updateFaq,
  deleteFaq,
  reorderFaq,
};
