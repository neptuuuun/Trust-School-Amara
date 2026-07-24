# Audit Log & Reporting — Data Structures and Query Recipes

This documents the **data structures** prepared for admin-productivity reports,
activity history, and branch statistics. No reporting UI is built here — these are
the schemas + indexes + query patterns the future Owner Dashboard / reports build on.

## Collections

### `auditLogs/{id}` — immutable activity trail (server-write-only)
Written ONLY by the Express backend (Admin SDK). Firestore rules:
`allow write: if false` (immutable); read by the owner (all branches) or a branch
admin (own branch only).

```
{
  branchId,
  actor: { uid, name, email, role },   // name is resolved server-side from admins/owners
  action,                              // dot-notation, e.g. 'student.create', 'payment.verify'
  targetType, targetId,
  before, after,                       // optional state snapshots
  reason,                              // optional (rejections, corrections)
  at                                   // serverTimestamp
}
```

**Action vocabulary** (`<entity>.<verb>`): `student.create|update|delete`,
`document.approve|reject`, `payment.verify|reject|edit|delete|correction`,
`group.create|update` (class), `subject.create|update|delete`,
`announcement.create|update|delete`, `teacher.*`.

The `actor.name` is the school employee's real name, resolved authoritatively from
`admins/{uid}` (or `owners/{uid}`) by `backend/services/auditService.resolveActor`,
so reports attribute every action to a person — never just a uid.

### `ledger/{id}` — append-only financial ledger (server-write-only)
Revenue source of truth. Corrections append a `reversal` (negative `amount`) — history
is never mutated, so net revenue for any slice is `SUM(amount)`.

```
{
  branchId, studentId, studentName,
  serviceType: 'language'|'support'|'training'|'annualFee',
  subjectId, subjectName, classId, className, teacherId, teacherName,
  amount (signed), currency: 'DZD', period,            // 'YYYY-MM' (support) | 'YYYY-YYYY'
  type: 'payment'|'reversal'|'adjustment', status: 'active',
  sourceCollection, sourceDocId, reversalOf?,
  recordedBy: { uid, email, role }, recordedAt, paidAt
}
```

### `admins/{uid}` rollup fields (Phase 5)
`writeAudit` best-effort stamps the acting admin's doc with:
`lastActivityAt` (serverTimestamp) and `lastActivityType` (the last action). This gives
"last seen / last action" without scanning the log.

## Indexes (in `firestore.indexes.json`)
- `auditLogs (branchId ASC, at DESC)` — branch activity feed.
- `auditLogs (actor.uid ASC, at DESC)` — one admin's activity history.
- `auditLogs (branchId ASC, action ASC, at DESC)` — branch activity by action type.
- `auditLogs (actor.uid ASC, action ASC)` — per-admin per-action counts.
- `ledger (branchId ASC, paidAt ASC)`, `(branchId, serviceType, period)`,
  `(teacherId, period)`, `(classId, period)` — revenue slices.

## Query recipes

**Action count per admin** (productivity):
```js
getCountFromServer(query(collection(db,'auditLogs'),
  where('actor.uid','==', adminUid)))            // + where('action','==', 'payment.verify') for a breakdown
```

**One admin's recent activity**:
```js
query(collection(db,'auditLogs'), where('actor.uid','==', adminUid),
  orderBy('at','desc'), limit(50))
```

**Branch activity feed**:
```js
query(collection(db,'auditLogs'), where('branchId','==', branchId),
  orderBy('at','desc'), limit(100))
```

**Last activity per admin**: read `admins/{uid}.lastActivityAt` / `.lastActivityType`,
or take the top-1 of the per-admin activity query above.

**Branch revenue for a period**:
```js
const snap = await getDocs(query(collection(db,'ledger'),
  where('branchId','==', branchId), where('period','==', '2025-2026')));
const net = snap.docs.reduce((s,d) => s + (d.data().amount||0), 0);   // reversals net out
```

The cross-branch owner views are exposed server-side under `/api/owner/*`
(`requireOwner`) in `backend/controllers/owner*Controller.js`.

## Known limitation
Client-initiated audit entries are logged via `POST /api/ledger/audit`, which sits
behind the **sensitive** rate limiter (30 req / 15 min / IP). Because audit logging is
best-effort (it never blocks the underlying action), a burst of client-side admin
actions could drop some audit entries. Backend-initiated actions (verify/create/delete,
which are the bulk of important mutations) are logged in-process and unaffected. If
client-side audit completeness becomes important, move `/api/ledger/audit` to the
general limiter (or a dedicated lenient one).
