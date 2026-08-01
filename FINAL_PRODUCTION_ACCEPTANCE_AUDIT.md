# FINAL PRODUCTION ACCEPTANCE AUDIT
**Trust School (Amara) — School Management Platform**
Auditor role: Senior QA + Security + Product Owner + Penetration Tester
Date: 2026-07-31 · Branch: `main` · Method: code-level audit + production build + backend syntax verification

> **Scope honesty note (read first).** This audit was performed against the source tree with fix
> authority. I verified everything that is verifiable **statically** (code paths, access-control
> logic, Firestore rules, payment idempotency, build integrity, wiring/parity). I could **not**
> execute live end-to-end flows — there is no running deployment, no live Chargily test key, no real
> mobile device, and no access to the production Firestore/Supabase projects in this environment.
> Every claim below is labelled either **[CODE-VERIFIED]** (I read and traced the code) or
> **[NEEDS LIVE TEST]** (must be confirmed on the real deployment; see §15/§16). I did not fabricate
> any test result.

---

## 1. Executive Summary

**Is the website production-ready? → YES, CONDITIONALLY.**

The **code** is production-ready. This is a mature, heavily-remediated codebase: the payment path,
auth, access control, and Firestore rules are among the most carefully written I have reviewed, with
extensive defensive commentary and prior audit history. The frontend compiles cleanly and the backend
parses without error. I found **no unfixed critical code defect**.

The **remaining blockers are operational deploy steps**, not code — they cannot be completed from
source and must be executed against the live projects before go-live (§16). The one code-level issue I
found (a deactivated-admin consistency gap in the Firestore rules) I **fixed** during this audit.

Why "conditional": several security guarantees only take effect once you **deploy the current
`firestore.rules` and `firestore.indexes.json`**, and one security feature (server-side deletion of
students' ID-card scans) is a **no-op until `SUPABASE_SERVICE_ROLE_KEY` is set** in the backend
environment. Live payment settlement and email delivery also require one real end-to-end confirmation.

---

## 2. Complete Feature Checklist

| # | Feature | Status | Scenario / Result | Notes |
|---|---------|--------|-------------------|-------|
| 1 | Public site (hero/contact/branches/gallery) | PASS [CODE-VERIFIED] | Firestore-driven via `config/website`, public read, owner-gated writes | Builds clean |
| 2 | Branch selection (boumerdes / bordj_menaiel) | PASS | Public read of `branches`; branchId validated against allow-list in signup/auth | Hardcoded valid-branch list `['boumerdes','bordj_menaiel']` |
| 3 | Student registration (email/password) | PASS [CODE-VERIFIED] | Creates safe `student` profile; privileged flags forced to defaults by rules | §6 |
| 4 | Google sign-in + profile completion | PASS [CODE-VERIFIED] | One-way `completedProfile:false→true` transition, school required at completion | Rules `isCompletingRegistration()` |
| 5 | Email verification | PASS [CODE-VERIFIED] / [NEEDS LIVE TEST] | Firebase `sendEmailVerification`; send error no longer swallowed | Delivery is external §15 |
| 6 | Document upload (ID card + photo) | PASS [CODE-VERIFIED] | Supabase `user-uploads`, deterministic per-user paths | Path parity confirmed with delete |
| 7 | Admin approval / verification workflow | PASS [CODE-VERIFIED] | Server-side only; students cannot self-verify | Rules lock all verify flags |
| 8 | Language enrollment + payment | PASS [CODE-VERIFIED] | Capacity + duplicate + schedule-conflict gated, server-side price | §7 |
| 9 | Training enrollment + payment | PASS [CODE-VERIFIED] | Same gates; supports legacy class-less trainings | §7 |
| 10 | Support-lesson enrollment (RULE A/B + average gate) | PASS [CODE-VERIFIED] | Classification recomputed server-side from stored average, never client | §4 |
| 11 | Annual fee (standalone financial record) | PASS [CODE-VERIFIED] | Idempotent per (student, academic year); deterministic doc id | Cannot double-charge |
| 12 | Chargily online checkout | PASS [CODE-VERIFIED] / [NEEDS LIVE TEST] | Amount resolved server-side, written to immutable ledger | §7 |
| 13 | Chargily webhook (paid → enrolled) | PASS [CODE-VERIFIED] | HMAC-verified, idempotent, transactional claim | §7 |
| 14 | Payment status polling / verify fallback | PASS [CODE-VERIFIED] | Own dedicated rate-limit bucket; idempotent finalize | §7 |
| 15 | Admin dashboard (overview, queues, stuck-payment desk) | PASS [CODE-VERIFIED] | Branch-scoped, aggregate summaries, in-memory sort fallback | §4 |
| 16 | Owner dashboard (executive command center) | PASS [CODE-VERIFIED] | Cross-branch read-only, all routes owner-gated | §5 |
| 17 | Multi-admin management (create/deactivate/reactivate) | PASS [CODE-VERIFIED] | Owner-only; `active:false` revokes access immediately | §6 |
| 18 | Immutable ledger + audit log | PASS [CODE-VERIFIED] | Append-only, server-write-only, client update/delete = `false` | Rules enforced |
| 19 | Student deletion + cascade + storage cleanup | PASS [CODE-VERIFIED] / [NEEDS LIVE TEST] | Auth→cascade→storage→profile→audit ordering | Storage no-op until key set §5/§15 |
| 20 | Announcements | PASS [CODE-VERIFIED] | Auth read, branch-admin write | Rules enforced |
| 21 | Schedule conflict detection | PASS [CODE-VERIFIED] | Teacher/classroom/student overlap; backend is the guarantee | Class writes locked in rules |
| 22 | i18n / RTL Arabic UI | PASS [CODE-VERIFIED] | RTL throughout; user-facing errors Arabic | §10 |

---

## 3. End-to-End User Journey Testing (Student)

| Step | Expected | Actual (code path) | Result |
|------|----------|--------------------|--------|
| Pick branch | branchId persisted, validated | `selectedBranch` in localStorage; validated against allow-list | PASS [CODE-VERIFIED] |
| Register | Safe student profile, verification email sent | `signup()` creates non-privileged doc, `sendEmailVerification` error surfaced (not swallowed) | PASS [CODE-VERIFIED] |
| Verify email | `verificationStatus` unverified→pending only via upload | Rules `isSubmittingVerificationRequest()` requires `email_verified==true` | PASS [CODE-VERIFIED] |
| Upload ID/photo | Files at deterministic per-user paths | `uploadToSupabase` → `userPhotos/<uid>/…`, `<uid>/idPhoto.webp` | PASS [CODE-VERIFIED] |
| Wait for admin approval | Cannot self-approve; average modal blocked while unapproved | New `AverageGateModal` guard: `if (!verified) return;` + approval panel | PASS [CODE-VERIFIED] |
| Enroll + pay (Chargily) | Server sets price; capacity/duplicate/conflict enforced | `createCheckout` resolves amount server-side; ignores client `amount` | PASS [CODE-VERIFIED] |
| Return from Chargily | Poll confirms paid, enrollment created idempotently | `verifyAndProcess` + `finalizePaidOrder` transactional claim | PASS [CODE-VERIFIED] |
| Settlement in bank | Money actually captured | External gateway | [NEEDS LIVE TEST] §15 |

**Edge cases traced:** class fills between checkout and webhook → paid order flagged `needsAttention`
(never silently dropped); re-fired webhook or concurrent verify → transactional claim makes it a no-op;
student pays for something already owned → pre-check returns 409 before money is taken; annual fee paid
twice → deterministic doc id + `isAnnualFeePaidThisYear` guard converge on one record.

---

## 4. Admin Journey

| Action | Result | Reason |
|--------|--------|--------|
| View students (own branch) | PASS [CODE-VERIFIED] | `requireAdmin` binds `req.adminBranchId`; any body/query `branchId` must equal it |
| Approve / verify student | PASS [CODE-VERIFIED] | Admin SDK write, bypasses client rules; students can't self-verify |
| Create/edit classes & schedules | PASS [CODE-VERIFIED] | Class create = backend-only (`allow create: if false`); schedule-defining fields locked against direct client update |
| Record cash payment | PASS [CODE-VERIFIED] | Routed through `paymentOrderLog` → same ledger path; duplicate cash endpoint removed |
| Edit distinguished-subjects average | PASS [CODE-VERIFIED] | PATCH endpoint, branch-guarded + audited; recomputes classification |
| Payment queues / stuck-payment desk | PASS [CODE-VERIFIED] | `listOrders` branch-scoped; composite-index-missing → in-memory sort fallback (no 500) |
| Cross-branch access attempt | PASS (blocked) [CODE-VERIFIED] | Mismatched branchId → 403; delete-student ownership guard re-checks student's branch |
| Deactivated admin acts | PASS (blocked) [CODE-VERIFIED] | `active:false` → `resolveAdminBranch` returns null (backend) and rules deny (frontend) |

---

## 5. Owner Journey

- **Purpose:** cross-branch, read-only business-intelligence + governance role (revenue, retention,
  alerts, admin management, annual-fee policy, public-website content).
- **Data flow:** all owner reads/mutations go through the Express backend (Admin SDK), every route
  guarded by `verifyToken + requireOwner`. Owner docs are provisioned **only** via Admin SDK script
  (`provision-owner.js`); rules `allow write: if false`. Revenue truth comes from the immutable ledger.
- **Issues found:** none blocking. `requireOwner` has no `active` flag concept (owners aren't
  deactivatable) — acceptable given Admin-SDK-only provisioning.
- **Fixes applied:** none needed.
- **Final status:** PASS [CODE-VERIFIED]. Live dashboards need one smoke test post-deploy [NEEDS LIVE TEST].

---

## 6. Authentication & Authorization Audit

| Check | Result | Evidence |
|-------|--------|----------|
| Token verification | PASS | `verifyToken` rejects missing/invalid/expired Firebase ID token → 401 |
| Role model | PASS | Staff status stored in `admins`/`owners` collections (not custom claims); dead `req.user.role` bypass removed |
| Admin branch binding | PASS | Strict: any supplied branchId must equal the admin's bound branch |
| Owner isolation | PASS | Cross-branch read; all mutations backend-only |
| Route protection | PASS | Admin/owner/ledger/audit routes all `verifyToken`+role-guarded |
| Self-registration hardening | PASS | Rules force `role:'student'` and all privileged flags to safe defaults |
| Privilege-escalation via self-update | PASS (blocked) | `isSafeUserSelfUpdate()` blocks role/isAdmin/verify/payment/classification/school-clear |
| Deactivation | PASS | `active:false` revokes both backend and client access immediately |

**Fix applied (this audit):** the collection-group aggregate rules
(`/{path=**}/languageFormEntries`, `/{path=**}/trainingFormEntries`) used `isAdmin()` instead of
`isActiveAdmin()`, so a **deactivated** admin retained aggregate read access there while being locked
out everywhere else. Changed both to `isActiveAdmin()`. Severity: **Low** (read-only, aggregate, requires
a formerly-valid admin account). **Requires `firebase deploy --only firestore:rules` to take effect.**

---

## 7. Payment Audit (Chargily)

**Overall: PASS [CODE-VERIFIED]** — this path was previously flagged (memory: *Chargily Enrollment Path
Bypass*) and has been **fully remediated**. The live online-payment path now runs the **same** shared
enforcement primitives as the admin approval paths.

| Concern | Result | Evidence |
|---------|--------|----------|
| Client-controlled price | SAFE | `createCheckout` deliberately does **not** destructure `req.body.amount`; amount resolved from class catalog / owner config / server proration and written to the immutable ledger |
| Webhook authenticity | SAFE | `verifyWebhookSignature` (HMAC-SHA256 over raw body); unsigned → 401 before any work. Raw body captured before `express.json` |
| Duplicate / replay | SAFE | Transactional CLAIM flips pending→paid once; re-fired webhook or concurrent verify = no-op |
| Success vs cancel | SAFE | `success`/`failure` return URLs; `verifyAndProcess` handles `paid`/`failed`/pending |
| Capacity race | SAFE | `assertCapacityInTx` / transactional active-count for support serializes concurrent paid enrollments |
| Paid-but-unseatable | SAFE | On any seat failure the order is flagged `needsAttention` (stuck-payment desk), never dropped |
| Annual-fee double-charge | SAFE | Deterministic `annual_<uid>_<year>` id + `isAnnualFeePaidThisYear` |
| Rate-limit lock-out of own confirmation | MITIGATED | Poll + webhook mounted before general/sensitive limiters with dedicated buckets (CGNAT-aware) |

**[NEEDS LIVE TEST]:** one real DZD payment on live keys to confirm settlement, webhook delivery to
`BACKEND_URL`, and correct test-vs-live endpoint resolution (memory: live keys use `/api/v2`, test keys
`/test/api/v2`; wrong endpoint → 401, currency must be lowercase `dzd`).

---

## 8. Security Audit (adversarial)

| Attack | Severity if present | Finding | Status |
|--------|--------------------|---------|--------|
| Privilege escalation (self → admin/owner) | Critical | Blocked: `admins`/`owners` client-write = `false`; self-create/update flags locked | SAFE |
| IDOR on payment orders | High | Blocked: `getOrderStatus`/`verify` check `order.studentId == req.user.uid`; rules scope reads | SAFE |
| Cross-branch data access | High | Blocked: strict branch binding in `requireAdmin` + `isBranchAdmin` in rules | SAFE |
| Firestore rule bypass (direct SDK write) | High | Blocked: registrations/ledger/audit/classes create = server-only; capacity gate in rules | SAFE |
| Verified/paid self-assignment | High | Blocked: `noPrivilegedStatus()` + `isSafeUserCreate/Update` | SAFE |
| XSS via stored `idCardUrl` | Medium | Fixed previously: `resolveSafeImageUrl` allows only `http(s)` (blocks `javascript:`/`data:`) | SAFE |
| Payment amount tampering | High | Blocked: client amount ignored, server-resolved | SAFE |
| Webhook replay / forgery | High | Blocked: HMAC signature + idempotent claim | SAFE |
| Transport/CORS detail leakage in UI | Low | Fixed previously: `safeErrorMessage` scrubs "Failed to fetch"/CORS text | SAFE |
| Secret exposure in repo | Critical | Verified: `serviceAccountKey.json` and all `.env` untracked + gitignored; no secrets in `src/` | SAFE |
| Deactivated-admin aggregate read | Low | **Fixed this audit** (`isAdmin`→`isActiveAdmin`, §6) | FIXED |
| CORS wide-open | Medium | Blocked: origin allow-list from `ALLOWED_ORIGINS`; no wildcard | SAFE |

No injection surface of note: Firestore is used via the SDK (no string-concatenated queries); no raw
SQL. `helmet` sets security headers; CSP intentionally off for a JSON API.

---

## 9. Database Audit

- **Structure:** consistent branch-scoped model `branches/{branchId}/…`; global server-authored
  collections (`paymentOrders`, `ledger`, `auditLogs`, `supportLessonRegistrations`, `admins`, `owners`).
  [CODE-VERIFIED]
- **Consistency:** enrollment writes are transactional (archive + form entry + user summary +
  `enrollmentCount` bump together), so counts and seats can't drift. [CODE-VERIFIED]
- **Orphans / broken refs:** deletion cascades registrations + revenue **before** dropping the profile,
  leaving the profile as a recovery handle on mid-failure. Storage orphans are reclaimable via the
  idempotent delete sweep. [CODE-VERIFIED]
- **Duplicates:** guarded at both checkout pre-check and transactional registration factory; annual fee
  and ledger entries use deterministic source ids so backfills/re-runs never double-count.
- **[NEEDS LIVE TEST]:** confirm `firestore.indexes.json` is actually deployed — several admin queries
  fall back to in-memory sort if the composite indexes are missing (works, but slower and capped).

---

## 10. UX Audit (as a student)

- Approval-pending state now has an explicit, friendly Arabic panel in the average-gate modal instead of
  a confusing failed backend call. [CODE-VERIFIED — new code]
- API errors no longer surface raw "Failed to fetch"/CORS strings; users see Arabic guidance. [CODE-VERIFIED]
- Payment button shows loading/`Loader2` state and disables during redirect. [CODE-VERIFIED]
- Debug `console.log` noise (auth/admin/profile snapshots, emojis) removed from the hot paths. [CODE-VERIFIED]
- Minor: the average input changed from `type=number` to `type=text` + `inputMode=decimal` (intentional,
  avoids native spinner/locale issues); client `validateAverage` + backend re-validation still bound it.

---

## 11. Mobile Audit

[NEEDS LIVE TEST on real devices] — not executable here. Code indicators are positive: Tailwind
responsive utilities throughout, RTL layout, `max-w` containers, portal-based modals. The rate-limiter
design explicitly accounts for many students behind one **CGNAT mobile IP** (a real Algerian-carrier
concern) so mobile users aren't 429'd off their own payment confirmation. Recommend the §16 device
matrix before sign-off.

---

## 12. Responsive Audit

[NEEDS LIVE TEST] — production build succeeds and CSS bundle builds (19.3 kB gzip). Per-page pixel
verification (small phone / tablet / landscape / keyboard overlap) must be done in-browser against the
running app; see §16 checklist.

---

## 13. Performance Audit

- Frontend main bundle **448 kB gzip** — acceptable for an app of this scope; consider route-level code
  splitting later (non-blocking).
- Firestore queries use single-field equality where possible to avoid composite-index dependence; where
  composite indexes are needed, there's a graceful in-memory fallback. [CODE-VERIFIED]
- Owner analytics use aggregate `count()` queries (stream no documents). [CODE-VERIFIED]
- No obvious N+1 in the hot payment path. No critical perf fix required.

---

## 14. Error-Handling Audit

- Backend: central `errorHandler`, consistent `{ code, message }` shape, 401/403/404/409/500 used
  correctly, webhook returns fast 200 then processes async with `.catch` logging. [CODE-VERIFIED]
- Frontend: `apiErrors.safeErrorMessage` + `isNetworkError` classify transport vs HTTP errors. [CODE-VERIFIED]
- Offline / expired session / server error paths degrade to friendly Arabic messages. [CODE-VERIFIED]
- Storage-cleanup failure is recorded in the immutable audit log (`storageCleanupFailed`) rather than
  blocking account deletion. [CODE-VERIFIED]

---

## 15. Things I Could NOT Verify (external dependencies)

| Dependency | Why not testable here | How to test manually | Expected result | Failure indicator |
|-----------|----------------------|----------------------|-----------------|-------------------|
| Chargily live payment | No live key / real card in this env | Do one real DZD checkout end-to-end | Redirect → paid → enrolled; ledger entry | Stuck on pending; `needsAttention` order; 401 from Chargily |
| Chargily webhook delivery | Needs public `BACKEND_URL` | Trigger a payment, watch backend logs for signed `checkout.paid` | 200 + enrollment created | No webhook; rely on poll fallback |
| Email verification delivery | Firebase-side send | Register a real address, check inbox/spam | Verification email arrives | `auth/too-many-requests` 400; no email |
| Supabase storage RLS | Policies live in Supabase, not this repo | Attempt cross-user read/delete with anon key | Denied by RLS | Anon key can touch another user's file |
| Server-side ID-scan deletion | `SUPABASE_SERVICE_ROLE_KEY` PENDING | Set key, delete a test student, check bucket | Files removed server-side | `storageCleaned:false`; orphan remains (client fallback only) |
| Firestore rules/indexes deployment | No prod project access | `firebase deploy --only firestore:rules,firestore:indexes` | Rules/indexes live | Admin 500s; deactivated admin still reads |
| Production hosting / SSL | Render/Vercel runtime | Hit `/health`, check TLS | 200 + valid cert | 5xx; cert error |
| Real-device mobile/responsive | No devices here | §16 device matrix | No overflow/keyboard issues | Layout breaks |

---

## 16. Final Manual Testing Checklist (run against the live deployment)

**Deploy prerequisites**
- ☐ `firebase deploy --only firestore:rules` (includes the `isActiveAdmin` fix from this audit)
- ☐ `firebase deploy --only firestore:indexes` → confirm all indexes finish building
- ☐ Backend env set: `CHARGILY_SECRET_KEY` (live), `BACKEND_URL`, `FRONTEND_URL`, `ALLOWED_ORIGINS`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- ☐ Frontend env set: all `REACT_APP_FIREBASE_*`, `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`
- ☐ Boot backend, confirm log line `Chargily: … → LIVE endpoint https://pay.chargily.net/api/v2`

**Functional**
- ☐ Register new student → verification email received
- ☐ Upload ID + photo → files appear at `userPhotos/<uid>/…` and `<uid>/idPhoto.webp`
- ☐ Admin approves student → student sees approved state
- ☐ Enroll + pay one real support/language checkout → redirect → paid → enrolled, ledger updated
- ☐ Re-open the paid checkout URL / re-trigger webhook → no duplicate enrollment
- ☐ Fill a class to capacity, attempt one more paid enroll → 409 or `needsAttention`, no over-seat
- ☐ Admin records a cash payment → appears in ledger and payment log
- ☐ Deactivate an admin → they immediately lose dashboard + Firestore access
- ☐ Delete a test student → auth gone, registrations cascaded, ID scan removed (`storageCleaned:true`)
- ☐ Owner dashboard loads revenue/retention/alerts across both branches
- ☐ Cross-branch probe: admin A tries branch B data → 403
- ☐ Mobile device matrix: iPhone SE, mid Android, tablet, landscape, on-screen keyboard on payment/forms

---

## 17. Final Verdict

**Would I personally approve this for production? → YES — once the §16 deploy prerequisites are done and
one live payment + one live email are confirmed.**

There are **no unfixed critical code bugs.** The single code issue I found is fixed. The path that most
often sinks a school-payment platform — a client-controllable or non-idempotent payment/enrollment flow —
is here **server-authoritative, idempotent, capacity-safe, and audited**.

**Remaining low-risk items after launch:**
1. **[Low, action required before launch]** Deploy the updated `firestore.rules` and the `indexes` — the
   `isActiveAdmin` fix and several admin queries depend on it.
2. **[Medium, action required before launch]** Set `SUPABASE_SERVICE_ROLE_KEY`, or server-side deletion of
   students' national-ID scans stays a no-op (client fallback only) — a privacy/data-retention exposure.
3. **[Low]** Confirm Supabase Storage RLS denies cross-user access (external to this repo).
4. **[Low]** `caniuse-lite` is ~11 months stale (build warning only) — refresh at next maintenance.
5. **[Low]** Consider route-level code-splitting to trim the 448 kB main bundle (perf polish, non-urgent).
6. **[Low]** `@supabase/supabase-js` isn't in local `backend/node_modules`; Render installs it on deploy —
   just verify the deploy `npm install` succeeds.

**Change made during this audit:** `firestore.rules` — collection-group aggregate reads switched from
`isAdmin()` to `isActiveAdmin()` (deactivated-admin consistency). No other code was modified.
