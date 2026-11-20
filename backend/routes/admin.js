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
const { search } = require('../controllers/adminSearchController');
const { getStudentProfile } = require('../controllers/adminStudentController');
const { bulkImportStudents } = require('../controllers/adminBulkImportController');
const { issueCredentials } = require('../controllers/adminStudentAccountController');

// GET /api/admin/search?q=...
// Global branch-scoped search across students and all payment types.
router.get('/search', verifyToken, requireAdmin, search);

// GET /api/admin/students/:userId/profile
// Unified "Student 360" aggregate: profile, registrations, payments, audit.
router.get('/students/:userId/profile', verifyToken, requireAdmin, getStudentProfile);

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

// POST /api/admin/bulk-import-students
// Create many students from an uploaded CSV/Excel (validate + dedupe + audit).
// Same creation rules as manual add; supports dryRun for the preview step.
// NOTE: in this app the route is matched first by the dedicated mount in
// server.js (own rate-limit bucket, see bulkImportLimiter); this entry keeps the
// router valid if it is ever mounted standalone.
router.post('/bulk-import-students', verifyToken, requireAdmin, bulkImportStudents);

// POST /api/admin/students/:userId/credentials
// Create the missing login account (imported without email / failed creation)
// or issue a new temporary password while the admin-issued one is unchanged.
// The password is returned once (no-store) and never stored.
router.post('/students/:userId/credentials', verifyToken, requireAdmin, issueCredentials);

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
