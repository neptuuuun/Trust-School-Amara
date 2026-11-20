/**
 * teacherGroups.js
 * ----------------
 * Pure helpers shared by the teacher-first selection UI (TeacherGroupPicker) and
 * the category-scoped teacher dropdown (ClassFormModal / TeacherManagerModal).
 *
 * Two independent concerns live here:
 *
 *  1. Grouping a flat list of classes/groups BY TEACHER, so an admin registering
 *     a student first picks the teacher, then (only when needed) the group.
 *
 *  2. Resolving which lesson CATEGORY (serviceType) a teacher belongs to, so the
 *     class form only offers teachers relevant to the category being created.
 *
 * The data model stores a teacher as a plain `{ name }` record; a class references
 * its teacher by NAME snapshot (`teacherName`) and carries a `serviceType`. A
 * teacher's categories are therefore DERIVED from the classes that reference them
 * — no migration needed — with an optional explicit `serviceTypes` array on the
 * teacher record as a forward-looking override (union, never destructive).
 */

/** The three lesson categories (class.serviceType values). */
export const SERVICE_TYPES = ['language', 'training', 'support'];

/** Short Arabic labels for each category (UI). */
export const SERVICE_TYPE_LABELS = {
  language: 'اللغات',
  training: 'الدورات',
  support: 'الدعم',
};

/**
 * Canonicalize a teacher name for comparison/dedup: trim, collapse internal
 * whitespace, lowercase. Mirrors the `norm` used elsewhere for teacher names.
 * @param {string} name
 * @returns {string}
 */
export const normalizeTeacherName = (name) =>
  String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Group a flat list of selectable groups by their teacher.
 *
 * Each item is expected to carry at least `{ id, teacherName }` (any extra
 * display fields are preserved untouched). Items that share the same teacher
 * name (case/space-insensitive) collapse into ONE teacher entry whose `groups`
 * holds every one of that teacher's groups — so a teacher never appears twice.
 *
 * @param {Array<{id:string, teacherName?:string}>} items
 * @returns {Array<{ teacherKey:string, teacherName:string, groups:Array }>}
 *          sorted by teacher name (Arabic collation), original group order kept.
 */
export const groupByTeacher = (items = []) => {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((it) => {
    const display = String(it?.teacherName || '').trim().replace(/\s+/g, ' ');
    const key = display.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { teacherKey: key, teacherName: display, groups: [] });
    }
    map.get(key).groups.push(it);
  });
  return Array.from(map.values()).sort((a, b) =>
    a.teacherName.localeCompare(b.teacherName, 'ar'));
};

/**
 * Build a map of teacherName(normalized) → Set(serviceType) DERIVED from the
 * classes that reference each teacher. This is the backward-compatible source of
 * truth for "which categories does this teacher teach".
 *
 * @param {Array<{teacherName?:string, serviceType?:string}>} classes
 * @returns {Map<string, Set<string>>}
 */
export const deriveTeacherCategories = (classes = []) => {
  const map = new Map();
  (Array.isArray(classes) ? classes : []).forEach((c) => {
    const key = normalizeTeacherName(c?.teacherName);
    const st = c?.serviceType;
    if (!key || !st) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(st);
  });
  return map;
};

/**
 * Effective category set for a teacher = union of their EXPLICIT `serviceTypes`
 * (admin-assigned) and the categories DERIVED from their existing classes.
 * Union — never subtractive — so a teacher with a real class in a category is
 * always shown there, whatever the explicit field says.
 *
 * @param {{name?:string, serviceTypes?:string[]}} teacher
 * @param {Map<string, Set<string>>} [derivedByName]
 * @returns {Set<string>}
 */
export const teacherCategorySet = (teacher, derivedByName = new Map()) => {
  const set = new Set();
  if (Array.isArray(teacher?.serviceTypes)) {
    teacher.serviceTypes.forEach((s) => { if (s) set.add(s); });
  }
  const derived = derivedByName.get(normalizeTeacherName(teacher?.name));
  if (derived) derived.forEach((s) => set.add(s));
  return set;
};

/**
 * Does a teacher belong to a given category?
 *
 * A teacher with NO known categories at all (brand-new, never assigned, no
 * classes yet) is treated as belonging to ALL categories — so they remain
 * pickable for their first class and are never silently hidden. Once a teacher
 * has ANY category (explicit or derived) they are scoped strictly to those.
 *
 * @param {{name?:string, serviceTypes?:string[]}} teacher
 * @param {string} serviceType
 * @param {Map<string, Set<string>>} [derivedByName]
 * @returns {boolean}
 */
export const teacherTeachesCategory = (teacher, serviceType, derivedByName = new Map()) => {
  const set = teacherCategorySet(teacher, derivedByName);
  return set.size === 0 ? true : set.has(serviceType);
};
