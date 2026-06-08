require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const adminRoutes    = require('./routes/admin');
const regRoutes      = require('./routes/registrations');
const supportLessonRegRoutes = require('./routes/supportLessonRegistrations');
const correctionRoutes = require('./routes/corrections');
const notifyRoutes   = require('./routes/notify');
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
app.use('/api/registrations',               sensitiveLimiter, regRoutes);
app.use('/api/support-lesson-registrations', sensitiveLimiter, supportLessonRegRoutes);
app.use('/api/corrections',                 sensitiveLimiter, correctionRoutes);
app.use('/api/notify',                      notifyRoutes);

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
