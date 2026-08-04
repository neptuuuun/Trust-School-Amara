const router = require('express').Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { userDecision, paymentEvent, markRead, markAllRead } = require('../controllers/notifyController');

// Admin approves / rejects a user account → notify student by email + in-app
router.post('/user-decision', verifyToken, requireAdmin, userDecision);

// Admin approves / rejects a payment → notify student in-app
router.post('/payment-event', verifyToken, requireAdmin, paymentEvent);

// Any authenticated recipient (student OR admin) marks their notifications read.
// Read-tracking is server-only because /notifications is `write: if false`.
router.post('/read',     verifyToken, markRead);
router.post('/read-all', verifyToken, markAllRead);

module.exports = router;
