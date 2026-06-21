const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const { prorationQuote } = require('../controllers/sessionController');

// GET /api/support-sessions/quote — authoritative proration quote (any authed user).
// Billing is schedule-derived, so this is the only support-session endpoint.
router.get('/quote', verifyToken, prorationQuote);

module.exports = router;
