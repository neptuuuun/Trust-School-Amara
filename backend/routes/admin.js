const express = require('express');
const router  = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
  createStudent,
  verifyAnnualPayment,
  rejectAnnualPayment,
} = require('../controllers/adminController');

// POST /api/admin/create-student
router.post('/create-student', verifyToken, requireAdmin, createStudent);

// POST /api/admin/verify-annual-payment
// Atomically verifies payment + branch registrations + supportLessonRegistrations + user profile.
router.post('/verify-annual-payment', verifyToken, requireAdmin, verifyAnnualPayment);

// POST /api/admin/reject-annual-payment
router.post('/reject-annual-payment', verifyToken, requireAdmin, rejectAnnualPayment);

module.exports = router;
