const express = require('express');
const router  = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { recordEntry } = require('../controllers/ledgerController');

// POST /api/ledger/record  — append a payment entry to the financial ledger.
router.post('/record', verifyToken, requireAdmin, recordEntry);

// NOTE: POST /api/ledger/audit is registered directly in server.js, BEFORE this
// router's sensitive limiter, so audit logging runs under the general limiter
// (complete coverage). The handler is still ledgerController.logAudit.

module.exports = router;
