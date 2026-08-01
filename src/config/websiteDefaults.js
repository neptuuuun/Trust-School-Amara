/**
 * websiteDefaults.js (frontend)
 * -----------------------------
 * Fallback PUBLIC website content, mirroring backend/services/websiteSettings.js
 * DEFAULTS. Used when `config/website` is missing a field so the public site is
 * never blank. Keep the two in lockstep.
 *
 * `hero.imageUrl: ''` means "use the bundled default asset" — HomePage falls back
 * to its imported hero image when this is empty.
 */

export const WEBSITE_DEFAULTS = Object.freeze({
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
  // FAQ starts empty by default — the public «اتصل بنا» page renders the FAQ
  // section ONLY when at least one visible FAQ exists, so an empty list simply
  // omits the section. No hardcoded content anywhere.
  faq: [],
});

/**
 * Hero button destinations — the owner picks a page by NAME (never types a route).
 * `value` is the internal route stored in hero.buttonLink and consumed by HomePage.
 * The SINGLE source of truth for the "Button Destination" dropdown.
 */
export const HERO_DESTINATIONS = [
  { label: 'الصفحة الرئيسية',    value: '/home' },
  { label: 'دروس الدعم',         value: '/support-lessons' },
  { label: 'تعليم اللغات',       value: '/languages' },
  { label: 'الدورات التكوينية',  value: '/trainings' },
  { label: 'اتصل بنا',           value: '/contact' },
];

/** The default destination when none is set or a stored value is unrecognized. */
export const DEFAULT_HERO_DESTINATION = '/contact';

/**
 * Social platform registry — the SINGLE place platforms are declared. Adding
 * TikTok/YouTube later is just one entry here (+ a matching field in social).
 * `icon` names map to lucide-react icons resolved at the call site.
 */
export const SOCIAL_PLATFORMS = [
  { key: 'facebook',  label: 'Facebook',  icon: 'Facebook',  placeholder: 'https://facebook.com/...' },
  { key: 'instagram', label: 'Instagram', icon: 'Instagram', placeholder: 'https://instagram.com/...' },
  {
    key: 'tiktok',
    label: 'TikTok',
    icon: 'TikTok',
    placeholder: 'https://www.tiktok.com/@username',
    // Accepts https://www.tiktok.com/@username and https://tiktok.com/@username
    // (http/https, optional www, a @handle, optional trailing path/query).
    validate: /^https?:\/\/(www\.)?tiktok\.com\/@[^/\s?]+(\/[^\s]*)?$/i,
    invalidMsg: 'رابط TikTok غير صالح — مثال صحيح: https://www.tiktok.com/@username',
  },
  // Future: { key: 'youtube', label: 'YouTube', icon: 'Youtube', placeholder: 'https://youtube.com/@...' },
];

/** Merge stored settings over the defaults (shallow per section). */
export function mergeWebsiteSettings(data = {}) {
  return {
    hero:     { ...WEBSITE_DEFAULTS.hero,    ...(data.hero || {}) },
    contact:  { ...WEBSITE_DEFAULTS.contact, ...(data.contact || {}) },
    social:   { ...WEBSITE_DEFAULTS.social,  ...(data.social || {}) },
    branches: Array.isArray(data.branches) && data.branches.length ? data.branches : WEBSITE_DEFAULTS.branches,
    gallery:  Array.isArray(data.gallery)
      ? [...data.gallery].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : [],
    faq:      Array.isArray(data.faq)
      ? [...data.faq].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : [],
  };
}
