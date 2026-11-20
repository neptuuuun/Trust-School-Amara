require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const adminRoutes    = require('./routes/admin');
const regRoutes      = require('./routes/registrations');
const supportLessonRegRoutes = require('./routes/supportLessonRegistrations');
const supportSessionRoutes = require('./routes/supportSessions');
const academicRoutes = require('./routes/academic');
const chargilyRoutes = require('./routes/chargily');
const ledgerRoutes   = require('./routes/ledger');
const ownerRoutes    = require('./routes/owner');
const publicRoutes   = require('./routes/public');
const notifyRoutes   = require('./routes/notify');
const auditRoutes    = require('./routes/audit');
const { verifyToken, requireAdmin } = require('./middleware/auth');
const { logAudit }   = require('./controllers/ledgerController');
const { handleWebhook, getOrderStatus, verifyAndProcess } = require('./controllers/chargilyController');
const { bulkImportStudents } = require('./controllers/adminBulkImportController');
const errorHandler   = require('./middleware/errorHandler');
const { startCronJobs } = require('./services/cronService');

const app  = express();
const PORT = process.env.PORT || 3001;

// Trust the first proxy hop (Render/Railway/Vercel/Nginx) so rate limiting and
// logging see the real client IP from X-Forwarded-For rather than the proxy's.
app.set('trust proxy', 1);

// ── Security headers ────────────────────────────────────────────────────────────
// helmet sets sane defaults (HSTS, no-sniff, frameguard, etc.). CSP is disabled
// because this is a JSON API, not an HTML surface.
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server calls (no origin header) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods:         ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders:  ['Authorization', 'Content-Type'],
  credentials:     true,
}));

// ── Webhook raw-body capture (MUST come before express.json) ─────────────────
// Chargily signature verification requires the untouched raw bytes.
// express.raw() for this path prevents express.json() from consuming the body.
app.use('/api/chargily/webhook', express.raw({ type: 'application/json' }));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ── Rate limiting ───────────────────────────────────────────────────────────────
// General cap for every API route, plus a stricter cap for sensitive/mutating
// routes (admin actions, registrations, payment corrections) to blunt brute-force
// and abuse. Keyed by client IP (see `trust proxy` above).
const rlMessage = { code: 'rate-limited', message: 'محاولات كثيرة جداً. يرجى المحاولة لاحقاً. · Too many requests. Please try again later.' };
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false, message: rlMessage,
});
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false, message: rlMessage,
});
// Payment-provider callbacks get their own high ceiling — protection against a
// flood, but far above any real delivery volume. See the webhook mount below.
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 1000,
  standardHeaders: true, legacyHeaders: false, message: rlMessage,
});
// Student payment-status polling gets its own generous bucket. After returning
// from Chargily, PaymentStatusPage fires POST /verify/:orderId up to ~13× per
// payment (1 initial + 12 retries at 5s), and Algerian mobile carriers put many
// students behind one CGNAT public IP. Under the 30/15min sensitiveLimiter those
// polls would otherwise share, a paid student can be 429'd off their own
// confirmation — the poll swallows the error and gives up ("verification took too
// long"), leaving them paid but unenrolled. See the poll mount below.
const pollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false, message: rlMessage,
});
// Public site content (`/api/public/*`) gets its own bucket. It is an anonymous,
// read-only, cacheable endpoint, but under the shared 300/15min general limiter it
// competed with every AUTHENTICATED call from the same IP — dashboards, notification
// polling, owner analytics. A signed-in user exhausts that bucket long before an
// anonymous visitor does, and the 429 landed on `GET /api/public/website`, which is
// what renders the owner-managed homepage gallery and contact FAQ. Those sections
// render only when non-empty, so the failed read silently DELETED them — a bug that
// looked like "the gallery disappears once you log in". Public content must not be
// collateral damage of authenticated traffic, so it gets a separate, generous cap.
const publicContentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 600,
  standardHeaders: true, legacyHeaders: false, message: rlMessage,
});
// Student bulk import is sent in chunks (one preview request + one request per
// ~50 students, so a progress bar is possible and no single request runs for
// minutes). A 500-student file is ~11 requests — under the shared 30/15min
// sensitiveLimiter, one import plus normal dashboard use would 429 the admin
// mid-import. Admin-only + token-verified, so it gets its own modest bucket.
const bulkImportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false, message: rlMessage,
});

// ── Chargily webhook — mounted BEFORE the general/sensitive limiters ──────────
// Chargily delivers every callback from its own small, fixed set of egress IPs, so
// an IP-keyed limiter puts ALL of our incoming payment notifications into ONE
// bucket. Under the 30-per-15-min sensitive cap that /api/chargily otherwise
// carries, an enrollment rush would start returning 429 to Chargily — and a
// dropped webhook means a student who paid is never enrolled and never appears in
// the stuck-payment queue.
//
// Rate limiting adds no security here: the endpoint is authenticated by HMAC-SHA256
// over the raw request body (verified in chargilyController.handleWebhook via
// chargilyService.verifyWebhookSignature), not by origin IP. An unsigned request is
// rejected with 401 before any work happens. webhookLimiter is retained purely as a
// flood backstop.
//
// Registered here — before `app.use('/api', generalLimiter)` — so Express matches
// this handler first and the request reaches neither limiter. The equivalent route
// inside routes/chargily.js is left in place but is now unreachable in this app;
// it stays valid if that router is ever mounted standalone.
// express.raw() for this path is already applied above (before express.json), so
// req.body is the untouched Buffer the signature check requires.
app.post('/api/chargily/webhook', webhookLimiter, handleWebhook);

// ── Student payment-status polling — mounted BEFORE the general/sensitive limiters ──
// After returning from Chargily, PaymentStatusPage polls POST /verify/:orderId up
// to ~13× per payment. Mounting these here (like the webhook above, before
// `app.use('/api', generalLimiter)`) matches them first, so they get their own
// dedicated pollLimiter bucket and reach neither the 300/15min general cap nor the
// 30/15min sensitive cap that /api/chargily otherwise carries. Without this, many
// students behind one CGNAT IP exhaust the shared bucket and get 429'd off their
// own confirmation — paid but unenrolled.
//
// Both routes are verifyToken-gated (unauthenticated floods are rejected at the
// token check before any work). /verify is finalize-capable but idempotent — the
// four-layer duplicate-payment guard in verifyAndProcess makes re-runs safe. The
// equivalent routes inside routes/chargily.js stay in place but are unreachable in
// this app; they remain valid if that router is ever mounted standalone.
app.post('/api/chargily/verify/:orderId', pollLimiter, verifyToken, verifyAndProcess);
app.get('/api/chargily/order/:orderId',   pollLimiter, verifyToken, getOrderStatus);

// ── Public site content — mounted BEFORE the general limiter ──────────────────
// Same pattern as the webhook and poll mounts above: registering it here means
// Express matches it first, so it uses publicContentLimiter's dedicated bucket and
// never reaches the shared 300/15min general cap. No auth — the anonymous public
// site reads this.
app.use('/api/public', publicContentLimiter, publicRoutes);

// ── Student bulk import — mounted BEFORE the general/sensitive limiters ───────
// Same pattern as the mounts above: matched first, so it uses bulkImportLimiter's
// dedicated bucket. Still verifyToken + requireAdmin (branch-bound) gated. The
// equivalent route inside routes/admin.js stays valid if mounted standalone.
app.post('/api/admin/bulk-import-students', bulkImportLimiter, verifyToken, requireAdmin, bulkImportStudents);

app.use('/api', generalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/admin',                       sensitiveLimiter, adminRoutes);
app.use('/api/academic',                    sensitiveLimiter, academicRoutes);
app.use('/api/registrations',               sensitiveLimiter, regRoutes);
app.use('/api/support-lesson-registrations', sensitiveLimiter, supportLessonRegRoutes);
// Session tracking is high-frequency (an admin marks many sessions; students poll a
// quote) and low-risk → general limiter only (the global 300/15min on /api applies).
app.use('/api/support-sessions',            supportSessionRoutes);
app.use('/api/chargily',                    sensitiveLimiter, chargilyRoutes);
// Audit logging must capture EVERY admin action — completeness matters more than
// abuse-throttling — so it runs under the GENERAL limiter (300/15min, applied to
// all /api above), NOT the strict sensitive cap. Registered before the /api/ledger
// mount so this handler answers first and the request never reaches sensitiveLimiter.
app.post('/api/ledger/audit',               verifyToken, requireAdmin, logAudit);
// Ledger recorder (admin-bound) + owner analytics (owner-only, read).
app.use('/api/ledger',                      sensitiveLimiter, ledgerRoutes);
app.use('/api/owner',                       ownerRoutes);
// NOTE: /api/public is mounted above, before the general limiter, so it keeps its
// own rate-limit bucket. See publicContentLimiter.
app.use('/api/notify',                      notifyRoutes);
// Per-entity audit history (owner = any branch, admin = own branch; enforced in handler).
app.use('/api/audit',                       auditRoutes);

// ── 404 + global error handler ────────────────────────────────────────────────
app.use((_req, res) =>
  res.status(404).json({ code: 'not-found', message: 'Endpoint not found.' })
);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`School backend running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);

  // Surface the Chargily secret key + the endpoint it resolves to. Prints prefix +
  // length only, never the body. Makes a missing/wrong/test-vs-live key obvious on
  // boot instead of surfacing as a runtime 401 "Unauthenticated" from Chargily.
  try {
    const { maskKey, resolveApi } = require('./services/chargilyService');
    const { baseUrl, mode } = resolveApi();
    console.log(`Chargily: ${maskKey(process.env.CHARGILY_SECRET_KEY)} → ${mode.toUpperCase()} endpoint ${baseUrl}`);
  } catch (e) {
    console.warn(`⚠️  Chargily: ${e.message} — checkouts will fail.`);
  }

  startCronJobs();
});

module.exports = app;
