# Production Deployment Audit — Trust School Amara

**Date:** 2026-07-24
**Branch:** `main` @ `456ab92`
**Target stack:** React/Vercel · Express/Render · Firebase Auth + Firestore · Supabase Storage · Chargily Live · `trustschoolamara.com`
**Status:** ⛔ **NOT READY TO DEPLOY** — 6 Critical, 4 High blockers.
**Code modified:** none. This document only.

---

## 0. Executive summary

The **application logic is production-grade.** Auth guards, branch isolation, webhook
signature verification, server-side price resolution, duplicate-payment prevention,
immutable ledger, and Firestore/Storage rules are all correctly implemented and
consistent. No secret has ever been committed to git history.

**Every Critical finding is a configuration gap, not a code defect.** The backend and
frontend are still wired to local-development values (`localhost`, placeholder CORS
origin, empty webhook URL). Deployed as-is, the site would take real money via the live
Chargily key and then redirect the payer to `http://localhost:3000` — with no webhook
registered to record the payment.

| Severity | Count | Theme |
|---|---|---|
| 🔴 Critical | 6 | Prod env vars unset / still local; live key on a dev workstation; orphan Admin SDK key in repo folder |
| 🟠 High | 4 | Webhook rate-limited; no SPA rewrite on Vercel; public ID-card bucket; indexes not deployed |
| 🟡 Medium | 9 | Cron on free tier, email unconfigured, no IaC, dead code paths |
| 🟢 Low | 5 | Console noise, dead `.env.local`, CDN deps |

---

## 1. Production environment variables

### 🔴 C1 — Live Chargily secret key sits on a developer workstation, and local dev bills the live gateway

**File:** `backend/.env:4-7`

```
# ── Chargily Pay — LIVE MODE ──
CHARGILY_PUBLIC_KEY=live_pk_QpEmFM…  ← REDACTED (real live key is in backend/.env)
CHARGILY_SECRET_KEY=live_sk_5meqi7…  ← REDACTED (real live key is in backend/.env)
```

> **Note:** the two keys above are masked in this committed document on purpose —
> reproducing the full live secret in a git-tracked file is the very exposure this
> finding is about. The real values live only in the gitignored `backend/.env`.

`resolveApi()` (`backend/services/chargilyService.js:27-33`) picks the endpoint from the
key prefix, so this file makes **every local `npm run dev` transact against live
Chargily** — real cards, real money, real payouts, polluting production `paymentOrders`.
The key is also plaintext on a laptop in a synced `Desktop/Projects` folder.

It is **not** in git history (verified: `git log --all --diff-filter=A` shows only
`.env.example` files ever added), so this is disk exposure, not public exposure.

**Fix**
1. Rotate the pair in the Chargily dashboard → Developers → API Keys. Treat the values above as burned.
2. Put the **new** live pair only in the Render dashboard env vars.
3. Replace `backend/.env` with the `test_pk_` / `test_sk_` pair so local dev hits `/test/api/v2`.

---

### 🔴 C2 — Firebase Admin SDK private key stored inside the project folder

**File:** `backend/serviceAccountKey.json` (2.4 KB, contains `-----BEGIN PRIVATE KEY-----`)

This grants **unrestricted owner access to all of Firestore and Firebase Auth** —
it bypasses every rule in `firestore.rules`.

Two aggravating facts:
- It is an **orphan**. Nothing loads it: `backend/config/firebase.js:5-19` reads
  `FIREBASE_SERVICE_ACCOUNT_BASE64` or `GOOGLE_APPLICATION_CREDENTIALS`, and
  `backend/.env:15` points that at `C:\Users\PC\Desktop\trust-school-serviceAccount.json`
  — a different file. Grepping `backend/**/*.js` for `serviceAccountKey` returns nothing.
- `backend/.env.example:29-33` explicitly warns never to store the key inside the project
  directory. The warning was written and then not followed.

Gitignored (`backend/.gitignore:3`) and never committed — but any zip, cloud-sync,
`docker build` context, or screen-share of the folder leaks full database control.

**Fix**
1. Google Cloud Console → IAM → Service Accounts → Keys → **revoke the key with this `private_key_id`** (`backend/serviceAccountKey.json:4`).
2. Delete the file.
3. For Render, use Option B from `backend/.env.example:36-40`: base64 the JSON into `FIREBASE_SERVICE_ACCOUNT_BASE64`. Never upload the file.

---

### 🔴 C3 — `BACKEND_URL` empty ⇒ no webhook is registered on any checkout

**Files:** `backend/.env:8` · `backend/controllers/chargilyController.js:36, 194-206`

```js
// chargilyController.js:36
const BACKEND_URL = (process.env.BACKEND_URL || '').replace(/\/$/, '');
// :194-195
const webhookUrl = BACKEND_URL ? `${BACKEND_URL}/api/chargily/webhook` : undefined;
// :206
webhookEndpoint: webhookUrl,
```

With `BACKEND_URL` blank, `webhook_endpoint` is omitted from the Chargily payload. The
**only** remaining path that turns a payment into an enrollment is the student's browser
polling `POST /api/chargily/verify/:orderId` (`src/pages/PaymentStatusPage.js:146-163`).

Failure mode: student pays → closes the tab / loses signal on the redirect → order stays
`pending_payment` forever. Money taken, no seat, no `needsAttention` flag (that only gets
set once finalization is *attempted*), so it won't even surface in the admin
stuck-payment queue.

**Fix:** Render env → `BACKEND_URL=https://<your-render-service>.onrender.com`
(or the API subdomain if you add one). Redeploy, then confirm a test checkout's response
carries `webhook_endpoint`.

---

### 🔴 C4 — `FRONTEND_URL` is `localhost` ⇒ payers are redirected to a dead page

**Files:** `backend/.env:9` · `backend/controllers/chargilyController.js:35, 204-205`

```js
// :35
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
// :204-205
successUrl: `${FRONTEND_URL}/payment/status?orderId=${orderId}&result=success`,
failureUrl: `${FRONTEND_URL}/payment/status?orderId=${orderId}&result=failure`,
```

After a successful charge Chargily sends the customer to
`http://localhost:3000/payment/status?...` — a connection error on their phone.
Combined with C3, the payment is never finalized by any path.

**Fix:** Render env → `FRONTEND_URL=https://trustschoolamara.com`

---

### 🔴 C5 — `ALLOWED_ORIGINS` still holds the placeholder; the production domain is absent

**Files:** `backend/.env:12` · `backend/server.js:35-49`

```
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app
```

`server.js:43` rejects any origin not in the list. `trustschoolamara.com` is not in it, so
**every browser API call from production fails CORS** — login-adjacent flows, admin
dashboard, owner dashboard, checkout creation: all dead.

**Fix:** Render env →
`ALLOWED_ORIGINS=https://trustschoolamara.com,https://www.trustschoolamara.com,https://<project>.vercel.app`
Include the `.vercel.app` domain so preview/rollback deployments keep working.

---

### 🔴 C6 — Frontend `REACT_APP_BACKEND_URL` points at localhost

**Files:** `.env:6` · `src/utils/apiClient.js:3`

```js
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
```

CRA inlines `REACT_APP_*` at **build time**. If the variable is not defined in Vercel's
Production environment, this fallback is baked into the bundle. Browsers then block it as
mixed content (https page → http request), and the entire API layer is unreachable.

**Fix:** Vercel → Settings → Environment Variables → **Production** scope:
`REACT_APP_BACKEND_URL=https://<your-render-service>.onrender.com`
Then **redeploy** — changing a Vercel env var does not rebuild existing deployments.

---

### Frontend variables required in Vercel (all scopes: Production + Preview)

From `src/firebase.js:8-14` and `src/supabase.js:3-4`. All 9 must be set or the app throws
on boot (`firebase.js:17-22`, `supabase.js:6-15` — good fail-fast guards):

| Variable | Value |
|---|---|
| `REACT_APP_BACKEND_URL` | `https://<render>.onrender.com` ← **currently localhost** |
| `REACT_APP_FIREBASE_API_KEY` | `AIzaSyD8mLBRnnuflkQ3lKTHVxxYji0ffPVE780` |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | `trust-school.firebaseapp.com` |
| `REACT_APP_FIREBASE_PROJECT_ID` | `trust-school` |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | `trust-school.appspot.com` |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | `488208060844` |
| `REACT_APP_FIREBASE_APP_ID` | `1:488208060844:web:a6b2e9e65d154b3cddaa09` |
| `REACT_APP_FIREBASE_MEASUREMENT_ID` | `G-BKGJLY224G` |
| `REACT_APP_SUPABASE_URL` | `https://jzplbnzmsfbsmeaobamg.supabase.co` |
| `REACT_APP_SUPABASE_ANON_KEY` | (the JWT in `.env:3`) |

These are public client identifiers by design — safe in the bundle **provided** the
Firebase key is referrer-restricted (§3) and Supabase RLS is on (§6).

### Backend variables required in Render

| Variable | Current | Required |
|---|---|---|
| `CHARGILY_SECRET_KEY` | live key, on laptop | **rotated** live key, Render only |
| `CHARGILY_PUBLIC_KEY` | live key, on laptop | **rotated** live key, Render only |
| `BACKEND_URL` | *empty* 🔴 | `https://<render>.onrender.com` |
| `FRONTEND_URL` | `localhost:3000` 🔴 | `https://trustschoolamara.com` |
| `ALLOWED_ORIGINS` | placeholder 🔴 | prod + www + vercel.app |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | unset | base64 of a **fresh** key |
| `FIREBASE_PROJECT_ID` | `trust-school` | ✅ |
| `SMTP_HOST` / `SMTP_*` / `MAIL_*` | unset (legacy gmail placeholders) 🟡 | see M3 |
| `WEBSITE_URL` | `https://trust-school.web.app` 🟡 | `https://trustschoolamara.com` |
| `SUPPORT_LESSON_EXPIRY_MINUTES` | commented out ✅ | **must stay unset** |
| `CHARGILY_DEBUG` | unset ✅ | leave unset (logs full API bodies) |
| `PORT` | 3001 | omit — Render injects it; `server.js:23` already honours it ✅ |

---

## 2. API URLs

✅ **Clean.** Exactly one `localhost` reference exists in the entire frontend source
(`src/utils/apiClient.js:3`), and it is a defensive dev fallback. No hardcoded `http://`
API hosts anywhere in `src/`. All calls route through the single `apiCall` helper, which
attaches the Firebase ID token as a Bearer header (`apiClient.js:17, 26`).

🔴 The **value** is wrong for production — see C6. The architecture is right; only the env var is missing.

---

## 3. Firebase configuration

| Item | Status | Notes |
|---|---|---|
| Client config env-driven | ✅ | `src/firebase.js:7-15`, with placeholder guards at `:17-22` |
| SDK version pinned | ✅ | `firebase` exactly `12.2.1` (`package.json:15`) — required; 12.3.0 crashes |
| Auth (Email + Google) | ✅ | `googleProvider` centralized at `firebase.js:44-45` |
| Firestore | ✅ | rules reviewed §9 |
| Storage rules | ✅ | `storage.rules` — default-deny, 5 MB image-only, owner+admin read |
| Admin SDK init | ✅ | `backend/config/firebase.js:5-19` supports base64 (cloud) and file path (local) |
| Admin SDK credential source | 🔴 | see C2 |

### 🟠 Manual console steps (cannot be verified from code — you must confirm these)

1. **Authorized domains** — Firebase Console → Authentication → Settings → Authorized
   domains. Add `trustschoolamara.com`, `www.trustschoolamara.com`, and your
   `*.vercel.app` domain. **Without this, Google sign-in fails on the live domain**
   with `auth/unauthorized-domain`.
2. **API key restriction** — Google Cloud Console → APIs & Services → Credentials →
   the browser key `AIzaSyD8...`. Set *Application restrictions → HTTP referrers* to
   `https://trustschoolamara.com/*`, `https://www.trustschoolamara.com/*`,
   `https://*.vercel.app/*`. This is what makes a public API key safe.
3. **Storage bucket** — `storage.rules` is written and `firebase.json:6-8` targets it,
   but the app actually uploads to **Supabase**, not Firebase Storage
   (`src/services/userService.js:68`). Firebase Storage appears unused; the rules are
   correct-but-inert. Harmless — deploy them anyway as defence in depth.

---

## 4. Chargily

### What is correct — verified line by line ✅

| Requirement | Evidence |
|---|---|
| Endpoint follows key mode | `chargilyService.js:27-33` — `live_sk_` → `pay.chargily.net/api/v2` |
| Currency lowercase | `chargilyController.js:200` — `'dzd'` with a comment explaining `'DZD'` → 422 |
| Webhook signature verified | `chargilyService.js:112-126` — HMAC-SHA256 + `crypto.timingSafeEqual` |
| Raw body preserved for HMAC | `server.js:54` mounts `express.raw()` on the webhook path **before** `express.json()` at `:57` |
| Invalid signature rejected | `chargilyController.js:229-232` → 401, no processing |
| Amount never trusted from client | `chargilyController.js:88-91` — `req.body.amount` deliberately not destructured; resolved server-side at `:102-165` |
| Success / failure URLs | `chargilyController.js:204-205` → `/payment/status?orderId=…&result=…`; route exists at `src/App.js:328` and is public (correct — Chargily redirects unauthenticated) |
| Fast webhook ack | `chargilyController.js:242-246` — 200 first, process async |

### Duplicate-payment prevention — verified, genuinely robust ✅

Four independent layers:

1. **Pre-checkout refusal** (`chargilyController.js:111-131`) — 409 before any money moves:
   `already-paid` for annual fee, `already-registered` for language/training,
   active-subscription check for support.
2. **Atomic order claim** (`chargilyController.js:294-312`) — `runTransaction` flips
   `pending → paid` exactly once. A re-fired webhook racing the browser's `/verify` call
   is a guaranteed no-op (`:298`, `:318`).
3. **Transactional duplicate + capacity gates** inside each registration factory
   (`:600-617` language, `:671-684` training, `:717-719` + `:771-785` support).
4. **Deterministic annual-fee doc id** (`chargilyController.js:838`):
   `annual_${studentId}_${yr}` — simultaneous webhooks converge on one document.

Paid-but-unseatable orders are flagged `needsAttention: true` (`:526-533`) and surfaced in
the admin recovery desk (`backend/routes/admin.js:22`). Good design.

### 🟠 H1 — The webhook is behind the strict rate limiter

**Files:** `backend/server.js:74-77, 89`

```js
const sensitiveLimiter = rateLimit({ windowMs: 15*60*1000, max: 30, … });   // :74-77
app.use('/api/chargily', sensitiveLimiter, chargilyRoutes);                  // :89
```

Two distinct failures from one line:

**(a) Webhook starvation.** Chargily's callbacks all originate from a small, fixed set of
Chargily IPs, so they share **one** 30-per-15-minute bucket. During an enrollment rush,
webhook #31 gets a 429. Chargily sees a rejection, not a delivery — payments go unrecorded.
The webhook is authenticated by HMAC, so IP throttling adds nothing.

**(b) Legitimate students throttled off their own confirmation.**
`src/pages/PaymentStatusPage.js:6` sets `MAX_POLLS = 12`, and lines `146-163` fire a
`POST /api/chargily/verify/:orderId` on **every** poll — up to 13 requests per payment
return. Algerian mobile carriers use CGNAT, so many students share one public IP. The
third student to return from Chargily in a 15-minute window starts eating 429s, and
`:160` swallows the error and keeps polling until `MAX_POLLS` → "verification took too
long". They paid; they are not enrolled.

**Fix**
```js
// Mount the webhook BEFORE the limiter — it is signature-authenticated, not IP-trusted
app.use('/api/chargily/webhook', chargilyWebhookRouter);
// Give student polling its own generous bucket; keep 30/15min for /checkout + /orders
const pollLimiter = rateLimit({ windowMs: 15*60*1000, max: 300, … });
```
Better still: replace `POST /verify` in the poll loop with the read-only
`GET /order/:orderId` after the first call, and reserve `/verify` for the initial attempt
plus a manual "retry" button.

### 🟠 Manual — Chargily dashboard

Confirm the dashboard webhook URL matches `https://<render>/api/chargily/webhook`. The
per-checkout `webhook_endpoint` (once C3 is fixed) takes precedence, but the dashboard
value is the safety net.

---

## 5. CORS

**File:** `backend/server.js:34-49`

✅ Implementation is correct: explicit allowlist, no wildcard, no
`origin: true` reflection, restricted methods and headers, `credentials: true`,
server-to-server (no `Origin`) permitted at `:43`.

🔴 The **list contents** are placeholder — see C5.

🟡 One nit: `server.js:44` rejects by calling `cb(new Error(...))`, which surfaces as a
generic 500 through `errorHandler`. A blocked origin reads as "the server is broken"
rather than "this origin isn't allowed." Prefer `cb(null, false)` so the browser gets a
clean CORS rejection and the log stays quiet.

---

## 6. Security audit

### Secrets

| Check | Result |
|---|---|
| Secrets in git history | ✅ **Clean** — `git log --all --diff-filter=A` shows only `.env.example` files ever added |
| `.gitignore` coverage | ✅ `.gitignore:18-30` covers all `.env*` variants, `serviceAccountKey*.json`, `*-firebase-adminsdk-*.json` |
| Hardcoded secrets in `src/` | ✅ None — full-tree regex scan for `AIza…`, `live_sk_`, JWTs, PEM blocks returned nothing outside `.env`/`serviceAccountKey.json` |
| Secrets on disk | 🔴 C1 (live Chargily key), C2 (Admin SDK key) |

### Admin & owner authorization ✅ — this is the strongest part of the codebase

- **Every** route across all 11 route files carries `verifyToken`. The only exception is
  `POST /api/chargily/webhook`, which is correct — it authenticates by HMAC.
- `requireAdmin` (`backend/middleware/auth.js:32-55`) resolves the caller's branch from
  the authoritative `admins/{uid}` doc, honours `active: false` deactivation (`:71`), and
  **hard-rejects any request whose `branchId` differs from the admin's own** (`:47-49`).
  Cross-branch takeover is closed.
- Branch-level fallbacks (`:79-92`) are scoped to the *requested* branch only, so they
  cannot widen access — a well-considered detail.
- `requireOwner` (`:114-129`) reads the separate `owners` collection, Admin-SDK-provisioned only.
- `listOrders` (`chargilyController.js:440`) **ignores** the client's `branchId` and uses
  `req.adminBranchId`. Correct.

### Unsafe endpoints

None found. Every mutating endpoint is admin- or owner-guarded; student endpoints
(`registrations.js:11,16`, `supportSessions.js:8`, `chargily.js:15,18,21`) act only on
`req.user.uid` and re-derive money server-side.

### 🟠 H3 — Supabase `user-uploads` bucket is public; it holds ID cards of minors

**Files:** `src/services/userService.js:60-93` · `src/services/storageCleanupService.js:3-10`

```js
// userService.js:63     — predictable path
filePath = `${userId}/idPhoto.webp`;
// userService.js:81-83  — public URL ⇒ the bucket is public
const { data: urlData } = supabase.storage.from('user-uploads').getPublicUrl(filePath);
```

`getPublicUrl` only returns a working URL when the bucket is public. That means **national
ID card scans and photographs of students — many of them minors — are readable by anyone
holding the URL, with no authentication, permanently.** URLs are stored in Firestore,
logged to the browser console (`userService.js:89`), and survive account deletion in any
cache, CDN, or chat where they were shared. Firebase UIDs are unguessable, so this is
security-by-obscurity, not access control — and it is the wrong control for identity
documents.

Second problem: `storageCleanupService.js:6` calls `.remove()` with the **anon** key.
For that to work, the bucket needs an anon `DELETE` policy — which would let any
anonymous visitor delete any object in the bucket. Either deletes silently fail (orphaned
ID scans accumulate forever, contradicting the deletion flow) or the bucket is wide open
to destruction. Both outcomes are bad; check which one you have.

**Fix**
1. Supabase → Storage → `user-uploads` → set **private**.
2. Replace `getPublicUrl` with `createSignedUrl(path, 60)` at the point of display.
3. Move deletion to an authenticated backend endpoint using the **service-role** key
   (server-side only — never expose it to the client), and drop any anon DELETE policy.
4. Confirm RLS policies scope `INSERT`/`SELECT` to `auth.uid()`-owned paths.

> ⚠️ Note: this app authenticates with **Firebase**, not Supabase Auth, so
> `auth.uid()` is null in Supabase RLS. Verify what policy currently permits these
> uploads — if it is "allow anon insert", any anonymous party can write to the bucket.
> This warrants a dedicated look before launch.

### 🟡 M1 — Dead staff-bypass branch in `getOrderStatus`

**File:** `backend/controllers/chargilyController.js:347`

```js
if (order.studentId !== req.user.uid && !['admin','owner'].includes(req.user.role)) {
```

`req.user` is the decoded Firebase ID token. This project stores admin status in the
Firestore `admins` collection and deliberately does **not** use custom claims (see
`middleware/auth.js:63-95`), so `req.user.role` is always `undefined`. The condition fails
closed — no security hole — but it is misleading dead code that implies a capability that
does not exist. Either add `requireAdmin`-style resolution or delete the clause.

---

## 7. Build configuration

### 🟠 H2 — No SPA rewrite in `vercel.json` ⇒ deep links and refreshes return 404

**File:** `vercel.json:1-6`

```json
{ "buildCommand": "npm run build", "outputDirectory": "build",
  "devCommand": "npm start", "framework": null }
```

`"framework": null` opts out of Vercel's Create-React-App preset, and with it the
automatic `index.html` fallback. Vercel then serves `build/` as plain static files: a
request for `/admin/students` looks for a file at that path, doesn't find one, and 404s.

This breaks the entire app on refresh — and specifically breaks
`/payment/status?orderId=…`, **which is the exact URL Chargily redirects payers to**
(`chargilyController.js:204-205`). Every single online payment would land on a 404.

**Fix**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "devCommand": "npm start",
  "framework": "create-react-app",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
(Setting `framework` restores the preset; the explicit `rewrites` block makes the
behaviour independent of Vercel's detection either way.)

### React build — ✅ verified: compiles clean

Ran `CI=false npx react-scripts build` against the current tree:

```
Compiled successfully.
  438.57 kB (gzip)  build/static/js/main.55ce7686.js
   19.03 kB         build/static/css/main.6b332b23.css
    1.77 kB         build/static/js/453.73dc4f22.chunk.js
```

No errors, no blocking warnings. Two observations:

- 🟡 **438 kB gzipped in one bundle** — essentially no code splitting. The public
  marketing pages pull in the entire admin and owner dashboards, jsPDF, and PapaParse.
  On the mobile connections most of your students will use, that is a slow first paint.
  Route-level `React.lazy()` around `/admin/*` and `/owner/*` would cut it substantially.
  Not a launch blocker.
- 🟢 `caniuse-lite` is 11 months stale — run `npx update-browserslist-db@latest` at some point.

- `package.json:32` — `"build": "CI=false react-scripts build"`. The `CI=false` prefix is
  POSIX shell syntax; Vercel builds on Linux, so it works. It suppresses
  warnings-as-errors — pragmatic, but it means lint regressions ship silently.
- `package.json:60-62` — `"engines": { "node": "24.x" }`. Confirm Vercel offers Node 24 for
  your project; if not, the build fails outright. Node 20 or 22 is the safer pin for
  `react-scripts@5`.

### Express startup

- `backend/package.json:7` — `"start": "node server.js"` ✅
- `server.js:23` honours `process.env.PORT` ✅ · `:27` sets `trust proxy` for Render ✅
- `server.js:32` helmet (HSTS, nosniff, frameguard) ✅
- `server.js:109-125` binds and logs a masked Chargily key + resolved endpoint on boot —
  a genuinely useful deploy smoke signal ✅
- 🟡 `backend/package.json:10` — `"node": ">=18"` is unpinned; a Render rebuild could
  silently jump majors. Pin to `"22.x"`.

### 🟡 M4 — No `render.yaml`

There is no `render.yaml`, `Procfile`, or Docker config in the repo, so the Render service
is dashboard-configured only and undocumented. Record (or commit as IaC):

```
Root Directory:  backend
Build Command:   npm install
Start Command:   npm start
Health Check:    /health          ← already implemented at server.js:61-63
```

### 🟡 M7 — Server-only packages in the frontend manifest

`package.json:11-16` lists `express@^5.2.1`, `firebase-admin@^13.6.1`, `body-parser`, and
`cors` as **frontend** dependencies. Verified: nothing in `src/` imports them, so webpack
does not bundle them — no leak. But they inflate install time and `firebase-admin` in a
browser project is a loaded footgun (one stray import ships Admin SDK code to the client).
Move them out.

### 🟡 M8 — Dev/test leftovers tracked in git

`server-minimal.js`, `test-server.js`, `test-backend.js`, `test-price-input.html`,
`backend-package.json`, `backend/_verify_email.js` (self-described at line 1 as
*"Temporary verification harness … deleted after running"*). `server-minimal.js` at the
repo root is an alternate Express server that could be started by mistake by a
misconfigured host. Delete them.

### 🟡 M9 — Orphaned Cloud Functions directory

`functions/` is tracked and contains a live nodemailer transporter with hardcoded
placeholder credentials (`functions/index.js:14-20`). `firebase.json` has **no** functions
target, so `firebase deploy` will not ship it — the risk is latent: if anyone adds a
functions block, a second unmaintained notification path goes live in parallel with
`backend/services/emailService.js`. Per project history, Cloud Functions were replaced by
the Express backend. Delete the directory.

---

## 8. Domain configuration

| Item | Status |
|---|---|
| HTTPS | ✅ Automatic on Vercel + Render; HSTS via helmet (`server.js:32`) |
| API URL | 🔴 C6 — frontend still points at `localhost` |
| SPA routing | 🟠 H2 — no rewrite; deep links 404 |
| Redirects | 🟡 Decide `www` → apex (or the reverse) in Vercel → Domains, and set the matching DNS |
| `homepage` field | ✅ Absent from `package.json` — correct for a root-domain deploy |
| CORS origins | 🔴 C5 |

**DNS/console checklist**
1. Vercel → Domains → add `trustschoolamara.com` + `www`, follow the A/CNAME instructions, pick a canonical host.
2. Firebase → Auth → Authorized domains → add both (see §3).
3. Google Cloud → API key referrer restrictions → both (see §3).
4. Render → optionally add `api.trustschoolamara.com`; if you do, `BACKEND_URL` and `REACT_APP_BACKEND_URL` must both use it.
5. 🟡 `backend/.env:26` — `WEBSITE_URL=https://trust-school.web.app` is stale; it is printed in every outbound email footer. Update to `https://trustschoolamara.com`.

---

## 9. Firestore

### Rules — ✅ reviewed in full, no gaps found

`firestore.rules` (482 lines):

- **Default deny** at `:481-483` (`match /{document=**} { allow read, write: if false; }`).
- **Ledger immutable** — `:200-203`: read for owner/branch-admin, `create, update, delete: if false`.
- **Audit logs immutable** — `:209-212`, server-write-only.
- **`paymentOrders` client-write-denied** — `:184-191`. Students read only their own; admins only their branch.
- **`admins` / `owners` self-write-denied** — `:165-178`. Privilege escalation via client write is impossible.
- **Deactivation propagates** — `isActiveAdmin()` (`:26-28`) checks `active != false`, and `isBranchAdmin()` (`:30-32`) builds on it, so a deactivated employee loses Firestore access instantly.
- **Privilege guard on student creates** — `noPrivilegedStatus()` (`:66-70`) blocks a client self-assigning `verified` / `paymentVerified` / `yearlyFeePaid`.
- **Capacity guard** — `classHasCapacity()` (`:56-61`) mirrors the backend check at the rules layer.
- **Classes are backend-only** — `:426` `allow create: if false`.

### 🟠 H4 — Indexes are declared but (per project history) not deployed

`firestore.indexes.json` declares 28 composite indexes. Project notes record them as
**declared but not deployed**. Consequences:

- `listOrders` degrades gracefully — `chargilyController.js:459-466` catches
  `FAILED_PRECONDITION` (code 9) and sorts in memory. Good defensive work.
- **Nothing else does.** Owner analytics over `ledger` (4 indexes), audit history over
  `auditLogs` (5 indexes), and the support-expiry query
  (`supportLessonRegistrations` × `branchId+status+endDate`, used by the daily cron)
  will throw 500s on first use.

**Fix — run before first traffic**
```bash
firebase deploy --only firestore:rules,firestore:indexes
```
Then watch Firebase Console → Firestore → Indexes until every entry reads **Enabled**.
Large collections can take minutes to hours; do this ahead of launch, not during.

### Required collections

Root: `paymentOrders`, `ledger`, `auditLogs`, `supportLessonRegistrations`, `admins`,
`owners`, `users` (legacy), `notifications`, `config/finance`.
Per-branch under `branches/{branchId}/`: `users`, `classes`, `subjects`, `teachers`,
`languagesRegistered`, `trainingsRegistered`, `languagesForms/*/languageFormEntries`,
`trainingsForms/*/trainingFormEntries`, `annualPayments`, `announcements`, `meta/info`.

**Must exist before launch:**
- `config/finance` with `annualFeeAmount` — read by `financeSettings.getAnnualFeeAmount()`
  (`chargilyController.js:114, 150, 731`). Missing ⇒ annual-fee checkouts break.
- At least one `owners/{uid}` doc — `backend/scripts/provision-owner.js`.
- One `admins/{uid}` doc per branch admin, each with a valid `branchId` and `active: true`
  — `backend/scripts/provision-admin.js`.
- `branches/{branchId}` docs for every operating branch.

---

## 10. Other findings

### 🟡 M2 — Cron jobs will not fire reliably on Render's free tier

**File:** `backend/services/cronService.js:6-27`

Two `node-cron` jobs: daily expiry check (05:00 UTC) and monthly lifecycle (01:00 UTC on
the 1st). Render free instances spin down after ~15 minutes of inactivity — at 05:00 the
process is almost certainly asleep, and `node-cron` does not replay missed runs. Support
subscriptions would never expire; monthly lifecycle would never process.

**Fix:** use a paid always-on instance, **or** move both to Render Cron Jobs / an external
scheduler hitting a protected endpoint. Note this also affects webhook latency —
a cold start on a sleeping free instance can exceed Chargily's timeout.

### 🟡 M3 — Email is not configured for production

`backend/.env:21-23` still carries the legacy path with placeholders
(`EMAIL_SERVICE=gmail`, `EMAIL_USER=your-email@gmail.com`,
`EMAIL_PASSWORD=your-app-password`). `emailService.js:36-59` prefers `SMTP_HOST` and only
falls back to the discouraged gmail transport — and `backend/.env` defines no `SMTP_*` or
`MAIL_*` variables at all.

Result: notification emails either fail outright or send from a free Gmail account through
a datacenter IP, which is the single most reliable way to land in spam. `.env.example:45-95`
already documents the correct setup.

**Fix:** provision Brevo/Resend/SendGrid on `trustschoolamara.com`, set the `SMTP_*` +
`MAIL_*` vars in Render, and add SPF + DKIM + DMARC DNS records.

### 🟡 M5 — Node version pins

Frontend `"node": "24.x"` (`package.json:61`) vs backend `">=18"` (`backend/package.json:10`).
Verify Vercel supports 24; pin the backend to a specific major.

### 🟡 M6 — `robots.txt` allows everything

`public/robots.txt` has a bare `Disallow:`. Admin and owner areas are client-side routes so
crawlers can't reach the data, but add `Disallow: /admin`, `Disallow: /owner` and a
`Sitemap:` line for hygiene and SEO.

### 🟢 Low

| ID | Finding | File |
|---|---|---|
| L1 | `.env.local` holds `NEXT_PUBLIC_*` vars from a Next.js scaffold. CRA ignores them, but `.env.local` **overrides** `.env` in CRA — a confusing dead file in a sensitive position. Delete. | `.env.local:1-7` |
| L2 | Production console noise, including **public ID-card URLs logged to the browser console** | `src/services/userService.js:66, 89`; `src/firebase.js:32` |
| L3 | Boot log prints Chargily key prefix + length — masked and intentional; keep, but never enable `CHARGILY_DEBUG` in prod (it logs full request/response bodies at `chargilyService.js:44-58`) | `backend/server.js:113-122` |
| L4 | Font Awesome + Google Fonts loaded from third-party CDNs with no SRI, render-blocking | `public/index.html:13-16` |
| L5 | CORS rejection returns a 500 rather than a clean CORS denial | `backend/server.js:44` |

---

## 11. Final production checklist

### Phase 1 — Rotate compromised credentials (do first)

- [ ] 🔴 Rotate the Chargily live key pair; treat the values in `backend/.env:6-7` as burned
- [ ] 🔴 Revoke the service-account key in `backend/serviceAccountKey.json`, then delete the file
- [ ] 🔴 Generate a fresh Admin SDK key; base64-encode it for `FIREBASE_SERVICE_ACCOUNT_BASE64`
- [ ] 🔴 Replace `backend/.env` Chargily values with the **test** pair for local dev

### Phase 2 — Configure Render

- [ ] 🔴 `BACKEND_URL=https://<render>.onrender.com`
- [ ] 🔴 `FRONTEND_URL=https://trustschoolamara.com`
- [ ] 🔴 `ALLOWED_ORIGINS=https://trustschoolamara.com,https://www.trustschoolamara.com,https://<project>.vercel.app`
- [ ] 🔴 `CHARGILY_SECRET_KEY` / `CHARGILY_PUBLIC_KEY` (rotated live pair)
- [ ] 🔴 `FIREBASE_SERVICE_ACCOUNT_BASE64`, `FIREBASE_PROJECT_ID=trust-school`
- [ ] 🟡 `SMTP_*` + `MAIL_*`; `WEBSITE_URL=https://trustschoolamara.com`
- [ ] ✅ Confirm `SUPPORT_LESSON_EXPIRY_MINUTES` and `CHARGILY_DEBUG` are **unset**
- [ ] 🟡 Root dir `backend`, start `npm start`, health check `/health`
- [ ] 🟡 Upgrade off the free tier (cron + cold-start latency)

### Phase 3 — Configure Vercel

- [ ] 🔴 All 10 `REACT_APP_*` vars in the **Production** scope, `REACT_APP_BACKEND_URL` → Render
- [ ] 🟠 Add `rewrites` + `framework` to `vercel.json` (H2)
- [ ] 🟡 Verify Node 24 availability, or repin
- [ ] Add both domains; choose canonical `www` vs apex

### Phase 4 — Firebase & Supabase consoles

- [ ] 🟠 Auth → Authorized domains: add both production domains
- [ ] 🟠 Cloud Console → restrict the browser API key by HTTP referrer
- [ ] 🟠 `firebase deploy --only firestore:rules,firestore:indexes` — wait for **Enabled**
- [ ] 🟠 Supabase: make `user-uploads` private; switch to signed URLs; audit RLS policies (H3)
- [ ] Seed `config/finance.annualFeeAmount`, provision owner + admins, create branch docs

### Phase 5 — Code fixes (awaiting your approval)

- [ ] 🟠 H1 — move the webhook outside `sensitiveLimiter`; separate poll limiter
- [ ] 🟠 H2 — `vercel.json` rewrites
- [ ] 🟠 H3 — signed URLs + backend-side deletion
- [ ] 🟡 M1 — remove/replace the dead `req.user.role` check
- [ ] 🟡 M7/M8/M9 — remove server deps from the frontend manifest; delete leftovers and `functions/`
- [ ] 🟢 L1/L2/L5 — delete `.env.local`, strip prod console logs, clean CORS rejection

### Phase 6 — Post-deploy smoke test (live money, small amount)

- [ ] `GET https://<render>/health` → 200
- [ ] Boot log shows `Chargily: live_sk_******** → LIVE endpoint https://pay.chargily.net/api/v2`
- [ ] Sign up, verify email, log in from `trustschoolamara.com` (Google sign-in included)
- [ ] Hard-refresh a deep link (e.g. `/payment/status?orderId=x`) → renders, not 404
- [ ] Real annual-fee payment end-to-end → redirect lands on the live domain
- [ ] Render logs show the **webhook** firing (not only the browser poll)
- [ ] `paymentOrders` doc → `status: 'paid'`, `registrationId` populated, `needsAttention` absent
- [ ] Ledger entry + audit log written; admin overview and owner revenue reflect it
- [ ] Re-fire the same webhook from the Chargily dashboard → no duplicate registration
- [ ] Admin can act only on their own branch; owner sees all branches

---

## Appendix — what was verified as correct

Not everything needs fixing. These were checked line by line and are sound:

- No secret has ever been committed (`git log --all --diff-filter=A`, full history)
- `.gitignore` correctly covers all `.env*` variants and every service-account filename pattern
- Every backend route is behind `verifyToken`; the sole exception is HMAC-authenticated
- Strict branch binding on every admin action; no cross-branch access path exists
- Webhook HMAC verified with `timingSafeEqual` against the untouched raw body, in the correct middleware order
- Payment amounts resolved entirely server-side; the client-supplied `amount` is deliberately ignored
- Four-layer duplicate-payment prevention, all transactional
- Paid-but-unseatable orders flagged and routed to an admin recovery queue
- Firestore rules: default-deny, immutable ledger + audit log, no client-side privilege escalation
- Storage rules: default-deny, size- and type-constrained
- Error handler does not leak stack traces on 5xx
- helmet, `trust proxy`, and rate limiting all present and correctly ordered
- Exactly one `localhost` reference in the frontend, and it is a dev fallback
- `firebase` pinned to exactly `12.2.1` as required
