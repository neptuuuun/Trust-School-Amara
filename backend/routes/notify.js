const router = require('express').Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { userDecision, paymentEvent } = require('../controllers/notifyController');

// Admin approves / rejects a user account → notify student by email + in-app
router.post('/user-decision', verifyToken, requireAdmin, userDecision);

// Admin approves / rejects a payment → notify student in-app
router.post('/payment-event', verifyToken, requireAdmin, paymentEvent);

module.exports = router;
