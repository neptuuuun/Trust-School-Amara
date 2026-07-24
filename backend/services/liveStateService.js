/**
 * Live-state resolver — the bridge between the IMMUTABLE ledger and the
 * CURRENT database state.
 *
 * WHY THIS EXISTS
 * ---------------
 * `/ledger` is append-only by design (see ledgerService.js): it is the financial
 * history and must never be edited. That is correct for revenue *reporting*, but
 * it is the wrong source for a *state-based alert*, which must answer "is this
 * still true right now?".
 *
 * A ledger entry can become detached from reality in three ways:
 *
 *   1. REVERSED   — a `reversal` entry was appended (the supported correction
 *                   path). Net amount is already 0, but the ORIGINAL entry still
 *                   carries a studentId, so any code that builds "who paid this
 *                   month" sets from raw entries counts that student as paying.
 *   2. ORPHANED   — the source registration / payment document was deleted
 *                   (admin UI, a cascade, or straight from the Firebase console)
 *                   and no reversal was appended. The entry keeps inflating
 *                   revenue and retention forever.
 *   3. SUPERSEDED — nothing here yet; reserved for future amount corrections.
 *
 * `filterLiveEntries` removes (1) and (2) so every state-based alert is derived
 * from records that STILL EXIST. Nothing is written or mutated — the ledger is
 * untouched; this is a read-time projection.
 *
 * Cost: one batched `getAll` per ~300 entries in the window (2 months), i.e. a
 * couple of extra reads per alert request. `backend/scripts/reconcile-ledger.js`
 * converts standing orphans into proper reversals so the raw ledger and this
 * projection converge.
 */

const { db } = require('../config/firebase');

// Firestore getAll() is comfortable well past this; 300 keeps each round-trip small.
const GETALL_CHUNK = 300;

/** Archives that mean "this student is currently enrolled in this class". */
const BRANCH_ARCHIVES = ['languagesRegistered', 'trainingsRegistered'];

/**
 * The live document a ledger entry was derived from, or null when the entry's
 * provenance is unknown (legacy/backfilled entries with no recognised
 * sourceCollection — those are kept, never silently dropped).
 */
function sourceRefFor(entry = {}) {
  const col = entry.sourceCollection;
  const id = entry.sourceDocId;
  const branchId = entry.branchId;
  if (!col || !id) return null;

  switch (col) {
    case 'supportLessonRegistrations': {
      // Support bills per cycle, so sourceDocId is `${registrationId}_${YYYY-MM}`.
      // Liveness is a property of the REGISTRATION, not of the cycle suffix.
      const m = /^(.*)_(\d{4}-\d{2})$/.exec(id);
      return db.collection('supportLessonRegistrations').doc(m ? m[1] : id);
    }
    case 'languagesRegistered':
    case 'trainingsRegistered':
    case 'annualPayments':
      return branchId
        ? db.collection('branches').doc(branchId).collection(col).doc(id)
        : null;
    default:
      return null;
  }
}

/**
 * Project a raw ledger window onto entries that are still backed by live data.
 *
 * @param   {Array}  entries  raw ledger docs ({ id, ...data })
 * @returns {Promise<{ entries: Array, stats: object }>}
 *          `entries` — safe to build revenue sums AND paying-student sets from.
 *          `stats`   — what was removed and why (surfaced in the alerts payload
 *                      so drift is visible instead of silent).
 */
async function filterLiveEntries(entries = []) {
  const stats = { total: entries.length, reversed: 0, orphaned: 0, unresolved: 0, live: 0 };
  if (!entries.length) return { entries: [], stats };

  // ── 1. Reversals cancel themselves AND their original ───────────────────────
  const reversedIds = new Set();
  for (const e of entries) {
    if (e.type === 'reversal' && e.reversalOf) reversedIds.add(e.reversalOf);
  }

  const candidates = [];
  for (const e of entries) {
    if (e.type === 'reversal' || reversedIds.has(e.id)) { stats.reversed += 1; continue; }
    candidates.push(e);
  }

  // ── 2. Orphan check — does the source document still exist? ─────────────────
  const refs = [];
  const refIndex = []; // candidates index parallel to refs
  candidates.forEach((e, i) => {
    const ref = sourceRefFor(e);
    if (ref) { refs.push(ref); refIndex.push(i); }
  });

  const exists = new Array(candidates.length).fill(true); // unresolved ⇒ fail-open
  for (let i = 0; i < refs.length; i += GETALL_CHUNK) {
    const slice = refs.slice(i, i + GETALL_CHUNK);
    const snaps = await db.getAll(...slice);
    snaps.forEach((snap, j) => { exists[refIndex[i + j]] = snap.exists; });
  }

  const live = [];
  candidates.forEach((e, i) => {
    if (!sourceRefFor(e)) stats.unresolved += 1;
    if (exists[i]) live.push(e);
    else stats.orphaned += 1;
  });

  stats.live = live.length;
  return { entries: live, stats };
}

/**
 * Live enrollment per class, counted from the approved archives rather than the
 * denormalized `classes/{id}.enrollmentCount` counter.
 *
 * `enrollmentCount` is maintained by increments/decrements spread across several
 * write paths and drifts the moment anything is deleted outside them (a console
 * delete, a student-profile delete). Using it as the "expected revenue" basis is
 * what kept the collection-gap alert frozen: both sides of the comparison were
 * reading stale data, so the gap never moved.
 *
 * Presence in `*Registered` IS enrollment — those archives are approved-only
 * (rejected/pending records live in the `*Forms` collections).
 *
 * @returns {Promise<{ byClass: Map<string, Set<string>>, studentsSeen: Set<string> }>}
 */
async function loadLiveClassEnrollment(branchId) {
  const byClass = new Map();
  const studentsSeen = new Set();
  const add = (classId, studentId, docId) => {
    if (!classId) return;
    if (!byClass.has(classId)) byClass.set(classId, new Set());
    // Fall back to the doc id so a record with no userId still occupies a seat.
    byClass.get(classId).add(studentId || `doc:${docId}`);
    if (studentId) studentsSeen.add(studentId);
  };

  await Promise.all(BRANCH_ARCHIVES.map(async (col) => {
    const snap = await db.collection('branches').doc(branchId).collection(col).get();
    snap.docs.forEach((d) => {
      const x = d.data() || {};
      add(x.classId || null, x.userId || x.studentId || null, d.id);
    });
  }));

  // Support is a subscription: enrolled == verified AND not expired (same rule
  // recomputeSupportClassEnrollment uses, so the two never disagree).
  const now = new Date();
  const supportSnap = await db.collection('supportLessonRegistrations')
    .where('branchId', '==', branchId).get();
  supportSnap.docs.forEach((d) => {
    const x = d.data() || {};
    if (String(x.status || '').toLowerCase() !== 'verified') return;
    const end = x.endDate?.toDate ? x.endDate.toDate() : (x.endDate ? new Date(x.endDate) : null);
    if (end && end <= now) return;
    add(x.classId || x.lessonId || null, x.userId || x.studentId || null, d.id);
  });

  return { byClass, studentsSeen };
}

module.exports = {
  sourceRefFor,
  filterLiveEntries,
  loadLiveClassEnrollment,
};
