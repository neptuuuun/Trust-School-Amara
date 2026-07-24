# Deployment Checklist — Trust School Amara

**Date:** 2026-07-24
**Companion to:** `PRODUCTION_DEPLOYMENT_AUDIT.md`
**Scope of this pass:** deployment configuration only. No business logic, payment
flow, Firestore schema, or authentication logic was modified.

---

## Part 1 — What changed in this pass

| # | Item | File | Status |
|---|---|---|---|
| 1 | `BACKEND_URL` | `render.yaml` (new) | ✅ Declared — **verify service name** |
| 2 | `FRONTEND_URL` → `https://trustschoolamara.com` | `render.yaml` | ✅ Declared |
| 3 | `ALLOWED_ORIGINS` → apex + www | `render.yaml` | ✅ Declared |
| 4 | `REACT_APP_BACKEND_URL` | `.env.example` | ⚠️ **Verified as WRONG — you must set it in Vercel** |
| 5 | Vercel SPA rewrite | `vercel.json` | ✅ Fixed |
| 6 | Webhook out of the rate limiter | `backend/server.js` | ✅ Fixed + tested |
| 7 | `serviceAccountKey.json` tracking | — | ✅ Verified ignored — **no rotation performed** |
| 8 | Supabase bucket exposure | — | ⚠️ **Could not verify — project is paused** |

Files touched:

```
 M  vercel.json            +3   SPA rewrite
 M  backend/server.js      +29  webhook mount + limiter (comments included)
 M  .env.example           +17  documentation only
 M  backend/.env.example   +25  documentation only
 M  backend/.env           local-dev clarity; NO credential changed
 ?? render.yaml            new — production Blueprint
 ?? DEPLOYMENT_CHECKLIST.md
```

`backend/server.js` is the only executable file changed. The diff is a middleware
mount and a limiter definition — no handler logic was altered.

---

## Part 2 — Where production config now lives

Production values are **not** in `backend/.env`. That file is gitignored, never read
by Render, and its `localhost` values are correct for local development — copying
production URLs into it would make `npm run dev` redirect real payers to your laptop.

Instead:

- **`render.yaml`** — committed Blueprint. Non-secret production values are declared
  literally so a redeploy can't drift back to a dev value. Secrets are `sync: false`
  (dashboard-entered, never in git).
- **Vercel dashboard** — the ten `REACT_APP_*` variables. CRA inlines these at build
  time, so they cannot be declared in a repo file that Vercel reads at runtime.

### ⚠️ One value needs your confirmation before deploying

`render.yaml` sets:

```yaml
name: trust-school-backend
BACKEND_URL: https://trust-school-backend.onrender.com
```

I don't know your actual Render service name, so I derived the URL from the service
name declared in the same file — self-consistent if you apply this Blueprint fresh.

**If you already have a Render service under a different name, change BOTH lines.**
They must agree: `BACKEND_URL` is what gets registered as the Chargily webhook
endpoint on every checkout. A mismatch means webhooks are delivered to a URL that
doesn't exist, and paid students silently never get enrolled.

---

## Part 3 — Item 7: service-account key — verified, NOT rotated

**Result: ignored, never tracked. No rotation performed, as instructed.**

```
$ git ls-files --error-unmatch backend/serviceAccountKey.json
error: pathspec ... did not match any file(s) known to git

$ git check-ignore -v backend/serviceAccountKey.json
backend/.gitignore:3:serviceAccountKey.json    backend/serviceAccountKey.json

$ git log --all --oneline -- backend/serviceAccountKey.json
(no output — never committed)
```

Confirmed across **all** branches and the full history: this file has never been in
a commit. It is matched by `backend/.gitignore:3`. It was never pushed anywhere.

The exposure is therefore **local disk only**, not public. It remains true that it
is an orphaned admin credential inside the project directory (nothing loads it —
`GOOGLE_APPLICATION_CREDENTIALS` points at a different path outside the project),
so deleting it costs nothing and removes a footgun. But that is cleanup, **not an
emergency**, and no rotation is warranted on this evidence.

---

## Part 4 — Item 8: Supabase — could not verify, and found a new blocker

### 🔴 NEW BLOCKER — the Supabase project is currently **paused**

Querying the live project (`jzplbnzmsfbsmeaobamg`, which matches
`REACT_APP_SUPABASE_URL` in `.env:2`) returns:

```
status: "INACTIVE"
execute_sql → "Connection terminated due to connection timeout"
```

Free-tier Supabase projects pause after ~7 days of inactivity. **While paused, every
student ID-card and photo upload fails** (`src/services/userService.js:68`). This is
a launch blocker independent of the exposure question, and it will recur on the free
tier whenever the project goes quiet.

**Action:** restore the project (Supabase Dashboard → the project → Restore) and
upgrade to Pro so it cannot auto-pause. Do this *before* the verification below.

### What I can and cannot say about public exposure

**Cannot confirm** — the `storage.buckets.public` flag is only readable from the
database, which is unreachable while paused.

**Strong code-level evidence that it IS public** — `src/services/userService.js:81-83`
calls `getPublicUrl()` and then **throws if no URL comes back** (`:85-87`).
`getPublicUrl` only yields a working URL on a public bucket. Since uploads have been
working in this app, the bucket is almost certainly public. Treat that as the
working assumption until confirmed.

**Verify once restored** (read-only, changes nothing):

```sql
select id, name, public from storage.buckets where id = 'user-uploads';
select policyname, cmd, roles, qual
from pg_policies where schemaname = 'storage' and tablename = 'objects';
```

`public = true` confirms the exposure. The second query reveals whether an anonymous
`DELETE` policy exists — which `src/services/storageCleanupService.js:6` needs in
order to work at all, and which would let any anonymous visitor delete any object in
the bucket.

### Safest migration path — sequenced so nothing breaks mid-flight

As requested, this is the plan **only**. No Supabase changes have been made.

The hazard: flipping the bucket to private instantly breaks every stored
`publicUrl` in Firestore — admin document review would go blank across the app. So
the read path must be migrated *before* the bucket is locked down.

> **Note on RLS:** this app authenticates with **Firebase**, not Supabase Auth, so
> `auth.uid()` is **null** in every Supabase RLS policy. Ordinary owner-scoped
> policies cannot work here. Whatever currently permits these uploads is most likely
> an `anon`-role blanket policy — which is also why moving writes server-side
> (step 4) is the real fix, not just a hardening step.

**Phase 0 — Restore and confirm (no changes)**
1. Restore the project; upgrade off free so it can't re-pause.
2. Run the two queries above. Record the bucket flag and the exact policy list.

**Phase 1 — Add signed-URL reads alongside the existing public ones**
3. Add a backend endpoint (service-role key, server-side only) that takes a storage
   path and returns `createSignedUrl(path, 300)`.
4. Change every consumer that renders a document to fetch a signed URL, falling back
   to the stored `publicUrl` if the call fails. Both paths work while the bucket is
   still public — deploy and confirm in production with zero user impact.

**Phase 2 — Move writes and deletes server-side**
5. Move the upload in `userService.js` behind an authenticated backend endpoint that
   verifies the Firebase ID token, then uploads with the service-role key. The
   browser stops holding any Supabase write capability.
6. Move `storageCleanupService.js` deletion server-side the same way. Drop the anon
   `DELETE` policy.

**Phase 3 — Close the bucket**
7. Flip `user-uploads` to private. Public URLs stop resolving; signed URLs keep working.
8. Replace the anon policies with service-role-only access.
9. Spot-check an old stored `publicUrl` in a logged-out browser → must 400/404.

**Phase 4 — Clean up**
10. Stop storing raw `publicUrl` values in Firestore; store the storage **path** and
    sign on demand. Backfill existing documents by stripping the URL prefix.
11. Remove the ID-card URL from the browser console log (`userService.js:89`).

Phases 1–2 are safe to run any time. **Phase 3 is the breaking step** — do it only
after Phase 1 is confirmed live, and expect previously-shared public URLs to keep
working until then (they cannot be un-shared retroactively; that is inherent to
having used a public bucket, and is the reason to close it).

---

## Part 5 — Pre-deploy actions you must take

### 5.1 Render

- [ ] Confirm/fix the service name + `BACKEND_URL` pair in `render.yaml` (Part 2)
- [ ] Apply the Blueprint: Dashboard → New → Blueprint → this repo
- [ ] Enter the `sync: false` secrets when prompted:
  - [ ] `CHARGILY_SECRET_KEY` / `CHARGILY_PUBLIC_KEY` (live pair)
  - [ ] `FIREBASE_SERVICE_ACCOUNT_BASE64`
  - [ ] `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD`
- [ ] Confirm the plan is **not** `free` (cron jobs + webhook cold starts)
- [ ] Confirm `SUPPORT_LESSON_EXPIRY_MINUTES` and `CHARGILY_DEBUG` are **absent**

### 5.2 Vercel

- [ ] Set all ten `REACT_APP_*` variables, **Production** scope
  (full table in `PRODUCTION_DEPLOYMENT_AUDIT.md` §1)
- [ ] `REACT_APP_BACKEND_URL` = the same Render URL as `BACKEND_URL`
- [ ] **Redeploy** — Vercel does not rebuild existing deployments when env vars change
- [ ] Add `trustschoolamara.com` + `www`; pick the canonical host

### 5.3 Firebase

- [ ] Auth → Settings → Authorized domains: add `trustschoolamara.com`,
      `www.trustschoolamara.com`, and your `*.vercel.app` domain
      *(without this, Google sign-in fails with `auth/unauthorized-domain`)*
- [ ] Cloud Console → Credentials → restrict the browser API key by HTTP referrer
- [ ] Deploy rules + indexes, then wait for **every** index to read *Enabled*:
      ```bash
      firebase deploy --only firestore:rules,firestore:indexes
      ```
- [ ] Seed `config/finance.annualFeeAmount`; provision owner + admins; create branch docs

### 5.4 Supabase

- [ ] **Restore the paused project** (Part 4) and upgrade off free
- [ ] Run the two verification queries; record the result

### 5.5 Chargily

- [ ] Dashboard webhook URL = `https://<render-url>/api/chargily/webhook`

---

## Part 6 — Post-deploy smoke test

Order matters: the cheap checks fail fast before you spend real money on step 6.

1. [ ] `GET https://<render>/health` → `{"status":"ok"}`
2. [ ] Render boot log shows
       `Chargily: live_sk_******** → LIVE endpoint https://pay.chargily.net/api/v2`
3. [ ] Load `https://trustschoolamara.com` → no CORS errors in the console
4. [ ] **Hard-refresh a deep link** (e.g. `/payment/status?orderId=test`) → the app
       renders, not a 404. *This is the `vercel.json` fix; if it 404s, the rewrite
       didn't apply and every payment redirect will land on a dead page.*
5. [ ] Sign up → verify email → log in. Test Google sign-in specifically (it is what
       breaks when authorized domains are missing).
6. [ ] **One real annual-fee payment**, smallest possible amount:
   - [ ] Redirect lands on `trustschoolamara.com`, not localhost
   - [ ] Render logs show the **webhook** firing — not only the browser poll.
         *This is the single most important line in the whole checklist: it proves
         `BACKEND_URL` is correct and the limiter fix works.*
   - [ ] `paymentOrders` doc → `status: 'paid'`, `registrationId` set, no `needsAttention`
   - [ ] Ledger entry + audit log written; owner revenue reflects it
7. [ ] Re-fire that same webhook from the Chargily dashboard → **no** duplicate
       registration, no double ledger entry
8. [ ] Upload an ID card (confirms Supabase is restored)
9. [ ] Admin sees only their own branch; owner sees all branches

---

## Part 7 — Known-open items (deliberately not fixed in this pass)

| Severity | Item | Why deferred |
|---|---|---|
| 🔴 | Supabase project paused | Needs dashboard action (Part 4) |
| 🟠 | Student `/verify` polling shares the 30/15min bucket | Half of H1. You scoped item 6 to the webhook. `PaymentStatusPage.js` fires up to 13 `POST /verify` calls per payment return, and CGNAT means students share IPs — the third student back from Chargily in a 15-min window starts eating 429s. **Recommend fixing next.** |
| 🟠 | `user-uploads` bucket public | Plan in Part 4; needs your approval |
| 🟠 | Firestore indexes not deployed | Checklist 5.3 |
| 🟡 | Live Chargily key in `backend/.env` | Rotation deferred per item 7. Local dev still bills the live gateway — swap in the `test_` pair when convenient. |
| 🟡 | Email not configured | Secrets are declared in `render.yaml`; SPF/DKIM/DMARC DNS still needed |
| 🟡 | `M1`, `M7`, `M8`, `M9`, `L1`–`L5` | Cleanup, no deployment impact |

---

## Appendix — Verification evidence for item 6

The webhook change was verified two ways, not by inspection alone.

**A. Behavioural** — an isolated harness replicating `server.js`'s exact middleware
order with stub handlers:

```
PASS  50 webhook deliveries all 200 (got 200)
PASS  all handled by the pre-limiter handler, not the router fallback
PASS  sensitiveLimiter never touched by webhook (hits=0)
PASS  generalLimiter never touched by webhook (hits=0)
PASS  webhook body is still a raw Buffer (HMAC-safe) = true
PASS  /checkout still capped at 30/15min (200s=30, 429s=5)
PASS  sensitiveLimiter DID see the checkout traffic (hits=35)
```

50 consecutive deliveries succeed where the old 30-request cap would have rejected
20 of them — while `/checkout` keeps its protection unchanged.

**B. Structural** — loading the **real** `server.js` with Firebase and cron stubbed,
then walking the Express layer stack:

```
 4 | rawParser        | /^\/api\/chargily\/webhook\/?(?=\/|$)/i   ← raw body preserved
 8 | bound dispatch   | ROUTE /api/chargily/webhook               ← new handler
 9 | <anonymous>      | /^\/api\/?(?=\/|$)/i                      ← general limiter (AFTER)
19 | <anonymous>      | /^\/api\/chargily\/?(?=\/|$)/i            ← sensitive limiter (AFTER)
20 | router           | /^\/api\/chargily\/?(?=\/|$)/i
```

Confirms the webhook is matched before either limiter, still receives the untouched
Buffer required for HMAC verification, and that `handleWebhook` resolves to a real
function (no circular-import hole from the new top-level import).
