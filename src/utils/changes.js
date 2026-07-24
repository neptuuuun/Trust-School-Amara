/**
 * Field-level change tracking for the accountability system.
 *
 * `diffFields(before, after)` compares two state snapshots (as stored on an
 * audit entry's `before`/`after`) and returns ONLY the fields that actually
 * changed, in the shape `{ field: { old, new } }`. This powers both the Entity
 * History Panel ("Sara updated room: 02 → 03") and the owner activity feed.
 *
 * - System/provenance timestamps are ignored by default (createdAt/updatedAt/…)
 *   so a routine `updatedAt` bump never shows up as a "change".
 * - Nested plain objects are diffed one level deep with dotted keys
 *   (`schedule.startTime`). Firestore Timestamps and Dates are normalized to ISO
 *   strings so equal instants compare equal.
 */

export const DEFAULT_IGNORE = ['createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'at'];

// A plain, diff-able object — excludes arrays, Dates, and Firestore Timestamps
// (which expose toDate()), all of which we compare as opaque values.
function isPlainObject(v) {
  return (
    v != null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof v.toDate !== 'function' &&
    !(v instanceof Date)
  );
}

// Normalize a value for stable comparison/display: timestamps → ISO strings.
function normalize(v) {
  if (v && typeof v.toDate === 'function') {
    try { return v.toDate().toISOString(); } catch { return v; }
  }
  if (v instanceof Date) return v.toISOString();
  return v;
}

function valuesEqual(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na == null || nb == null) return false;
  if (typeof na === 'object' && typeof nb === 'object') {
    try { return JSON.stringify(na) === JSON.stringify(nb); } catch { return false; }
  }
  return false;
}

/**
 * @param {object|null} before
 * @param {object|null} after
 * @param {string[]} [ignore] field names to skip (defaults to system timestamps + provenance)
 * @returns {Object<string, {old:*, new:*}>} only the changed fields
 */
export function diffFields(before, after, ignore = DEFAULT_IGNORE) {
  const b = before || {};
  const a = after || {};
  const skip = new Set(ignore);
  const out = {};

  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const key of keys) {
    if (skip.has(key)) continue;
    const ov = b[key];
    const nv = a[key];

    // One level of nesting → dotted child keys.
    if (isPlainObject(ov) && isPlainObject(nv)) {
      const nested = diffFields(ov, nv, ignore);
      for (const [nk, nval] of Object.entries(nested)) out[`${key}.${nk}`] = nval;
      continue;
    }

    if (!valuesEqual(ov, nv)) {
      out[key] = { old: normalize(ov), new: normalize(nv) };
    }
  }
  return out;
}

/** True when there is at least one tracked change between the snapshots. */
export function hasChanges(before, after, ignore = DEFAULT_IGNORE) {
  return Object.keys(diffFields(before, after, ignore)).length > 0;
}

export default diffFields;
