/**
 * /api/academic — server-authoritative academic writes (Admin SDK).
 * Every endpoint is admin-only and branch-bound (requireAdmin). These are the
 * ONLY writers of class schedules and the primary writers of approved
 * registrations, so schedule-conflict detection here cannot be bypassed.
 */
const express = require('express');
const router  = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
  createClass,
  updateClass,
  deleteClass,
  verifyLanguage,
  verifyTraining,
  adminAddLanguage,
  adminAddTraining,
} = require('../controllers/academicController');

// Classes — transactional teacher/classroom conflict check.
router.post('/classes',       verifyToken, requireAdmin, createClass);
router.patch('/classes/:id',  verifyToken, requireAdmin, updateClass);
router.delete('/classes/:id', verifyToken, requireAdmin, deleteClass);

// Approvals + class-based admin-add — transactional capacity + student conflict.
router.post('/registrations/language/verify',     verifyToken, requireAdmin, verifyLanguage);
router.post('/registrations/training/verify',     verifyToken, requireAdmin, verifyTraining);
router.post('/registrations/language/admin-add',  verifyToken, requireAdmin, adminAddLanguage);
router.post('/registrations/training/admin-add',  verifyToken, requireAdmin, adminAddTraining);

module.exports = router;
