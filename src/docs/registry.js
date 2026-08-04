/**
 * registry.js — the registry for the Trust School Amara Help Centers.
 *
 * Each entry is a COMPLETELY INDEPENDENT help center (its own URL, landing,
 * search, navigation, theme and audience). There is no role switcher and no
 * shared navigation — a visitor to one center never sees the others.
 *
 * To publish a new standalone center (e.g. Parent Guide, Teacher Guide, Privacy
 * Policy) add a Markdown file in `public/docs/guides/` and one entry here, then
 * mount a route for it in App.js.
 */

export const GUIDES = [
  {
    id: 'student',
    title: 'دليل الطالب',
    name: 'مركز مساعدة الطلاب',
    hero: 'كيف يمكننا مساعدتك؟',
    tagline: 'دليلك الكامل لاستخدام منصّة Trust School Amara — من إنشاء الحساب إلى التسجيل والدفع.',
    icon: 'GraduationCap',
    theme: 'student',
    file: 'student.md',
    popular: ['إنشاء-حساب', 'تأكيد-بريدك', 'دروس-الدعم', 'الدفع-والرسوم', 'نظام-الحجز', 'الأسئلة-المتكررة'],
  },
  {
    id: 'admin',
    title: 'دليل المسؤول',
    name: 'مركز مساعدة المسؤولين',
    hero: 'كيف يمكننا مساعدتك؟',
    tagline: 'مرجع عمليات مسؤول الفرع على Trust School Amara — الطلاب، التسجيلات، البرامج، والمالية.',
    icon: 'BookOpen',
    theme: 'admin',
    file: 'admin.md',
    popular: ['لوحة-التحكم', 'إدارة-الطلاب', 'التسجيلات', 'دروس-الدعم', 'المالية', 'استكشاف-الأخطاء'],
  },
  {
    id: 'owner',
    title: 'دليل المالك',
    name: 'مركز مساعدة المالك',
    hero: 'كيف يمكننا مساعدتك؟',
    tagline: 'مركز قيادة المالك على Trust School Amara — التحليلات، الإيرادات، الحوكمة، والموقع.',
    icon: 'ShieldCheck',
    theme: 'owner',
    file: 'owner.md',
    popular: ['النظرة-التنفيذية', 'التنبيهات', 'الإيرادات', 'إدارة-الفريق', 'سجل-التدقيق', 'الصلاحيات'],
  },
];

export const getGuide = (id) => GUIDES.find((g) => g.id === id) || null;

// Public URL of a guide's markdown file (served from /public/docs/guides).
export const guideUrl = (guide) => `${process.env.PUBLIC_URL || ''}/docs/guides/${guide.file}`;

// Route base path of a center.
export const basePathFor = (id) => `/help/${id}`;
