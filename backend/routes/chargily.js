const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/chargilyController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// Webhook must receive the raw body (Buffer) so we can verify the HMAC signature.
// Mount it BEFORE express.json() applies to this path.
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  ctrl.handleWebhook
);

// Student: create a Chargily checkout (returns { orderId, checkoutUrl })
router.post('/checkout', verifyToken, ctrl.createCheckout);

// Student: poll the order status after returning from Chargily
router.get('/order/:orderId', verifyToken, ctrl.getOrderStatus);

// Student: manual fallback if webhook was missed (checks Chargily API directly)
router.post('/verify/:orderId', verifyToken, ctrl.verifyAndProcess);

// Admin / Owner: list payment orders
router.get('/orders', verifyToken, requireAdmin, ctrl.listOrders);

module.exports = router;
