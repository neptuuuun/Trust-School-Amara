/**
 * appLinks.js — turns mentions of application pages inside an article into real,
 * clickable links that navigate the reader straight to that page in the app.
 *
 * Two mechanisms:
 *   1. Inline route tokens already written as code (e.g. `/admin/users`) become
 *      links when the path is a real route (whitelist below).
 *   2. A small curated set of page NAMES (دروس الدعم، الملف الشخصي، …) is linked
 *      on first mention per article.
 */

// Real, linkable routes in the application (public + role dashboards).
export const APP_ROUTES = new Set([
  // public / student
  '/home', '/support-lessons', '/languages', '/trainings', '/contact', '/internal-rules',
  '/login', '/register', '/select-branch', '/profile',
  '/course-registration', '/language-registration', '/support-lesson-registration',
  '/training-registration', '/registration-confirmation',
  // admin
  '/admin', '/admin/users', '/admin/annual-fees', '/admin/languages-registered',
  '/admin/support-registered', '/admin/trainings-registered', '/admin/training-requests',
  '/admin/languages-branch', '/admin/support-high', '/admin/support-middle',
  '/admin/trainings-branch', '/admin/payment-orders', '/admin/announcements',
  // owner
  '/owner', '/owner/alerts', '/owner/branches', '/owner/revenue', '/owner/retention',
  '/owner/teachers', '/owner/website', '/owner/reports', '/owner/groups', '/owner/students',
  '/owner/governance', '/owner/team', '/owner/audit', '/owner/settings',
]);

export function isAppRoute(path) {
  if (!path) return false;
  const clean = path.trim().replace(/\/+$/, '') || '/';
  return APP_ROUTES.has(clean);
}

// Curated page-name → route map. Only unambiguous names to avoid mis-linking.
export const PHRASE_LINKS = [
  { text: 'دروس الدعم', route: '/support-lessons' },
  { text: 'تعليم اللغات', route: '/languages' },
  { text: 'الدورات التكوينية', route: '/trainings' },
  { text: 'الملف الشخصي', route: '/profile' },
  { text: 'الصفحة الرئيسية', route: '/home' },
  { text: 'صفحة اتصل بنا', route: '/contact' },
];

/**
 * Replace inline `<code>/route</code>` tokens with links when the path is a real
 * app route. Safe: operates only on <code> spans whose text is escaped (no tags).
 */
export function linkifyRouteCode(html) {
  return String(html).replace(/<code>(\/[^<\s]*)<\/code>/g, (m, path) => {
    if (!isAppRoute(path)) return m;
    return `<a class="doc-applink" data-route="${path}" href="${path}"><code>${path}</code></a>`;
  });
}
