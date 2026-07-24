const express = require('express');
const router  = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
  createStudent,
  recordAnnualFee,
  deleteStudent,
  setStudentDistinguishedAverage,
} = require('../controllers/adminController');
const { getOverview, resolveStuckOrder } = require('../controllers/adminOverviewController');

// GET /api/admin/overview
// One round-trip snapshot of what needs the branch admin today: the document
// verification queue, paid-but-unseated payment orders, un-triaged training
// requests, expiring support subscriptions, captured revenue, catalog pressure.
router.get('/overview', verifyToken, requireAdmin, getOverview);

// POST /api/admin/payment-orders/:orderId/resolve
// Close the operational alert on a paid-but-unseated order after handling it
// out-of-band. Never edits money or the ledger — only clears needsAttention and
// records who closed it, with an audit entry.
router.post('/payment-orders/:orderId/resolve', verifyToken, requireAdmin, resolveStuckOrder);

// POST /api/admin/create-student
router.post('/create-student', verifyToken, requireAdmin, createStudent);

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
