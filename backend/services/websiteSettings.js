/**
 * websiteSettings.js
 * ------------------
 * Owner-controlled PUBLIC website content (cross-branch). Stored in a single
 * global doc `config/website` so the whole public site loads it in one read.
 *
 * Shape:
 *   config/website {
 *     hero:     { imageUrl, imagePath, title, subtitle, buttonText, buttonLink },
 *     contact:  { phone, email, address, mapsLink, workingHours },
 *     social:   { facebook, instagram, ... }   // extensible: add tiktok/youtube later
 *     branches: [ { id, name, address, phone, mapsLink } ],
 *     gallery:  [ { id, url, path, caption, order } ],
 *     faq:      [ { id, question, answer, order, isVisible, createdAt, updatedAt } ],
 *     updatedAt, updatedBy
 *   }
 *
 * Read broadly (public site) — Firestore rules allow `config/*` public read.
 * Written ONLY by the owner via the Express backend (Admin SDK); the rules deny
 * every client write to /config. Mirrors the financeSettings pattern.
 */

const { admin, db } = require('../config/firebase');

const CONFIG_COLLECTION = 'config';
const WEBSITE_DOC = 'website';

// Default content mirrors the historical hardcoded values so the public site is
// unchanged until an owner edits anything. `imageUrl: ''` means "use the bundled
// default asset" — the frontend falls back to its imported hero image.
const DEFAULTS = Object.freeze({
  hero: {
    imageUrl: '',
    imagePath: '',
    title: 'مرحباً بكم في Trust School Amara',
    subtitle: 'الثقة في التعليم هو شغفنا، وبناء مستقبل مشرق هو هدفنا',
    buttonText: 'تواصل معنا',
    buttonLink: '/contact',
  },
  contact: {
    // General contact info only — the Google Maps link is branch-specific (see
    // `branches` below), never a single global link.
    phone: '0554 56 29 97',
    email: 'trustschoolamara@gmail.com',
    address: 'الجزائر، بومرداس / برج منايل',
    workingHours: 'السبت – الخميس: 8:00 ص – 8:00 م',
  },
  social: {
    facebook: '',
    instagram: '',
    tiktok: '',
  },
  branches: [
    { id: 'boumerdes',    name: 'الفرع الأول',  address: 'إقامة يسرف بومرداس مركز المدينة',        phone: '0554 56 29 97', mapsLink: 'https://maps.google.com/?q=إقامة+يسرف+بومرداس+مركز+المدينة' },
    { id: 'bordj_menaiel', name: 'الفرع الثاني', address: 'التعاونية العقارية الياسمين برج منايل', phone: '0554 56 29 97', mapsLink: 'https://maps.google.com/?q=التعاونية+العقارية+الياسمين+برج+منايل' },
  ],
  gallery: [],
  faq: [],
});

function websiteRef() {
  return db.collection(CONFIG_COLLECTION).doc(WEBSITE_DOC);
}

const str = (v) => (v == null ? '' : String(v));

/** Merge a stored section over its defaults so missing fields never break the UI. */
function withDefaults(data = {}) {
  // Drop any legacy global contact.mapsLink so it never surfaces to the site,
  // even before the owner re-saves contact (maps links are branch-specific now).
  const { mapsLink: _legacyContactMaps, ...contactData } = data.contact || {};
  return {
    hero:     { ...DEFAULTS.hero,    ...(data.hero || {}) },
    contact:  { ...DEFAULTS.contact, ...contactData },
    social:   { ...DEFAULTS.social,  ...(data.social || {}) },
    branches: Array.isArray(data.branches) && data.branches.length ? data.branches : DEFAULTS.branches,
    gallery:  Array.isArray(data.gallery) ? [...data.gallery].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [],
    faq:      Array.isArray(data.faq) ? [...data.faq].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [],
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
    isDefault: !data || Object.keys(data).length === 0,
  };
}

/** Full website settings (with defaults applied). */
async function getWebsiteSettings() {
  try {
    const snap = await websiteRef().get();
    if (snap.exists) return withDefaults(snap.data() || {});
  } catch (e) {
    console.warn('[websiteSettings] read failed:', e.message);
  }
  return withDefaults({});
}

function stamp(actor) {
  return {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: actor ? { uid: actor.uid || '', email: actor.email || '', name: actor.name || '' } : null,
  };
}

/** Persist one top-level section (hero|contact|social|branches|gallery). */
async function setSection(section, value, actor = null) {
  await websiteRef().set({ [section]: value, ...stamp(actor) }, { merge: true });
}

// ── Sanitizers (defence-in-depth; the frontend validates too) ────────────────

function sanitizeHero(input = {}) {
  return {
    imageUrl:   str(input.imageUrl).trim(),
    imagePath:  str(input.imagePath).trim(),
    title:      str(input.title).trim(),
    subtitle:   str(input.subtitle).trim(),
    buttonText: str(input.buttonText).trim(),
    buttonLink: str(input.buttonLink).trim(),
  };
}

// General contact info only. `mapsLink` is intentionally NOT part of this shape —
// the Google Maps link is branch-specific (see sanitizeBranches). Any legacy
// global `contact.mapsLink` is stripped on the next contact save (controller).
function sanitizeContact(input = {}) {
  return {
    phone:        str(input.phone).trim(),
    email:        str(input.email).trim(),
    address:      str(input.address).trim(),
    workingHours: str(input.workingHours).trim(),
  };
}

// Only http(s) links are stored; anything else becomes '' (icon hidden on the site).
function sanitizeUrl(v) {
  const s = str(v).trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? s : '';
  } catch {
    return '';
  }
}

function sanitizeSocial(input = {}) {
  const out = {};
  Object.keys({ ...DEFAULTS.social, ...input }).forEach((k) => {
    out[k] = sanitizeUrl(input[k]);
  });
  return out;
}

function sanitizeBranches(input) {
  if (!Array.isArray(input)) return DEFAULTS.branches;
  return input.map((b, i) => ({
    id:       str(b.id).trim() || `branch_${i}`,
    name:     str(b.name).trim(),
    address:  str(b.address).trim(),
    phone:    str(b.phone).trim(),
    mapsLink: str(b.mapsLink).trim(),
  }));
}

function sanitizeGalleryItem(item, order) {
  return {
    id:      str(item.id).trim(),
    url:     str(item.url).trim(),
    path:    str(item.path).trim(),
    caption: str(item.caption).trim(),
    order:   Number.isFinite(Number(order)) ? Number(order) : 0,
  };
}

// Normalize one FAQ item. `createdAt`/`updatedAt` are ISO strings (NOT
// serverTimestamp — Firestore forbids FieldValue sentinels inside array
// elements). The caller supplies fresh timestamps; existing values are preserved
// through `item` on edits.
function sanitizeFaqItem(item = {}, order = 0) {
  const now = new Date().toISOString();
  return {
    id:        str(item.id).trim(),
    question:  str(item.question).trim(),
    answer:    str(item.answer).trim(),
    order:     Number.isFinite(Number(order)) ? Number(order) : 0,
    isVisible: item.isVisible === undefined ? true : Boolean(item.isVisible),
    createdAt: str(item.createdAt).trim() || now,
    updatedAt: str(item.updatedAt).trim() || now,
  };
}

module.exports = {
  DEFAULTS,
  getWebsiteSettings,
  setSection,
  sanitizeHero,
  sanitizeContact,
  sanitizeSocial,
  sanitizeBranches,
  sanitizeGalleryItem,
  sanitizeFaqItem,
  websiteRef,
};
