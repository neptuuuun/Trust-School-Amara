const express = require('express');
const router  = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { requestCorrection, resubmitProof } = require('../controllers/correctionController');

// POST /api/corrections/request — admin asks a student to fix their payment proof.
router.post('/request', verifyToken, requireAdmin, requestCorrection);

// POST /api/corrections/resubmit — student uploads a corrected proof (owner only).
router.post('/resubmit', verifyToken, resubmitProof);

module.exports = router;
