const express = require('express');
const router  = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
  createStudent,
  verifyAnnualPayment,
  rejectAnnualPayment,
  recordAnnualFee,
  deleteStudent,
  setStudentDistinguishedAverage,
} = require('../controllers/adminController');

// POST /api/admin/create-student
router.post('/create-student', verifyToken, requireAdmin, createStudent);

// POST /api/admin/verify-annual-payment
// Atomically verifies payment + branch registrations + supportLessonRegistrations + user profile.
router.post('/verify-annual-payment', verifyToken, requireAdmin, verifyAnnualPayment);

// POST /api/admin/reject-annual-payment
router.post('/reject-annual-payment', verifyToken, requireAdmin, rejectAnnualPayment);

// POST /api/admin/record-annual-fee
// Records a verified annual fee for ANY student (standalone financial record).
// Amount comes from owner config; dedupes per student + academic year.
router.post('/record-annual-fee', verifyToken, requireAdmin, recordAnnualFee);

// POST /api/admin/delete-student
// Deletes Firebase Auth account + Firestore profile.
// Returns photoUrl/idCardUrl so the frontend can clean up Supabase storage.
router.post('/delete-student', verifyToken, requireAdmin, deleteStudent);

// PATCH /api/admin/students/:userId/distinguished-average
// Set/correct «معدل المواد المميزة» + recompute support classification.
router.patch('/students/:userId/distinguished-average', verifyToken, requireAdmin, setStudentDistinguishedAverage);

module.exports = router;
