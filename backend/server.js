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
const notifyRoutes   = require('./routes/notify');
const auditRoutes    = require('./routes/audit');
const { verifyToken, requireAdmin } = require('./middleware/auth');
const { logAudit }   = require('./controllers/ledgerController');
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
  startCronJobs();
});

module.exports = app;
