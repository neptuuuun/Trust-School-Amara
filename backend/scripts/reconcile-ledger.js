/**
 * reconcile-ledger.js — convert ORPHANED ledger entries into proper reversals.
 *
 * An orphan is a ledger entry whose source registration / payment document no
 * longer exists and for which no `reversal` was ever appended. Orphans are
 * created by any deletion that bypassed the backend: the old client-side
 * `deleteDoc` on languagesRegistered / trainingsRegistered, the old
 * non-cascading student delete, or a manual delete from the Firebase console.
 *
 * The owner's state-based alerts already ignore orphans at read time
 * (services/liveStateService.js), so this script is NOT required for alerts to
 * be correct. It exists so the RAW ledger — which /owner/revenue and the
 * financial reports read directly — agrees with them. After a run, both views
 * report the same numbers.
 *
 * The ledger stays append-only: nothing is edited or deleted, a negative
 * `reversal` entry is appended per orphan (idempotent — re-running is a no-op).
 *
 * Usage:
 *   node backend/scripts/reconcile-ledger.js              # dry run (default)
 *   node backend/scripts/reconcile-ledger.js --apply      # write reversals
 *   node backend/scripts/reconcile-ledger.js --apply --since=2026-01
 */

require('dotenv').config();
const { db } = require('../config/firebase');
const ledger = require('../services/ledgerService');
const live = require('../services/liveStateService');

const APPLY = process.argv.includes('--apply');
const sinceArg = (process.argv.find((a) => a.startsWith('--since=')) || '').split('=')[1];

const mode = () => (APPLY ? 'APPLY' : 'DRY-RUN');
const log = (...a) => console.log(...a);

async function main() {
  log(`\n[${mode()}] Reconciling /ledger against live source documents…\n`);

  let q = db.collection('ledger');
  if (sinceArg && /^\d{4}-\d{2}$/.test(sinceArg)) {
    const [y, m] = sinceArg.split('-').map(Number);
    q = q.where('paidAt', '>=', require('firebase-admin').firestore.Timestamp.fromDate(new Date(y, m - 1, 1)));
    log(`  window: paidAt >= ${sinceArg}-01`);
  }

  const snap = await q.get();
  const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  log(`  ${entries.length} ledger entries read.`);

  // Reuse the exact projection the alert engine applies, so "what the script
  // heals" and "what the alerts ignore" can never drift apart.
  const { entries: liveEntries, stats } = await live.filterLiveEntries(entries);
  const liveIds = new Set(liveEntries.map((e) => e.id));

  const alreadyReversed = new Set();
  entries.forEach((e) => { if (e.type === 'reversal' && e.reversalOf) alreadyReversed.add(e.reversalOf); });

  // Orphans only: skip reversal entries themselves and anything already reversed.
  const orphans = entries.filter((e) =>
    e.type !== 'reversal' &&
    !alreadyReversed.has(e.id) &&
    !liveIds.has(e.id) &&
    live.sourceRefFor(e) // unresolvable provenance is left alone, never guessed
  );

  log(`\n  live: ${stats.live}   reversed: ${stats.reversed}   orphaned: ${stats.orphaned}   unresolved provenance: ${stats.unresolved}`);
  log(`  ${orphans.length} orphan(s) need a reversal.\n`);

  if (!orphans.length) { log('  Nothing to do — ledger already agrees with live state.\n'); return; }

  let amountFreed = 0;
  for (const e of orphans) {
    const amt = ledger.toNumber(e.amount);
    amountFreed += amt;
    log(`  [${mode()}] ${e.id}`);
    log(`           ${e.serviceType || '—'}  ${amt} DZD  student=${e.studentId || '—'}  source=${e.sourceCollection}/${e.sourceDocId}`);
    if (APPLY) {
      await ledger.recordReversal(e.id, {
        recordedBy: { uid: 'system', role: 'system' },
        reason: 'reconcile: source document no longer exists',
      });
    }
  }

  log(`\n  [${mode()}] ${orphans.length} reversal(s), ${amountFreed} DZD removed from net revenue.`);
  if (!APPLY) log('  Re-run with --apply to write them.\n');
  else log('  Done — /owner/revenue now matches the alert engine.\n');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
