const express = require('express');
const router  = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
  createStudent,
  verifyAnnualPayment,
  rejectAnnualPayment,
  deleteStudent,
} = require('../controllers/adminController');

// POST /api/admin/create-student
router.post('/create-student', verifyToken, requireAdmin, createStudent);

// POST /api/admin/verify-annual-payment
// Atomically verifies payment + branch registrations + supportLessonRegistrations + user profile.
router.post('/verify-annual-payment', verifyToken, requireAdmin, verifyAnnualPayment);

// POST /api/admin/reject-annual-payment
router.post('/reject-annual-payment', verifyToken, requireAdmin, rejectAnnualPayment);

// POST /api/admin/delete-student
// Deletes Firebase Auth account + Firestore profile.
// Returns photoUrl/idCardUrl so the frontend can clean up Supabase storage.
router.post('/delete-student', verifyToken, requireAdmin, deleteStudent);

module.exports = router;
