/**
 * /api/audit — read-only access to the immutable audit log for record-level
 * accountability. The history endpoint is reachable by the owner (any branch)
 * and by a branch admin (own branch only); the authorization is enforced inside
 * the handler because it depends on the requested record's branch.
 */
const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const { getEntityHistory } = require('../controllers/auditController');

router.get('/history', verifyToken, getEntityHistory);

module.exports = router;
