const express = require('express');
const router  = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
  adminCreateSupportLessonRegistration,
  adminVerifySupportLessonRegistration,
  adminRejectSupportLessonRegistration,
  adminRenewSupportLessonRegistration,
  adminDeleteSupportLessonRegistration,
  adminEditSupportLessonRegistration,
} = require('../controllers/registrationController');

// POST /api/support-lesson-registrations/admin-create
router.post('/admin-create', verifyToken, requireAdmin, adminCreateSupportLessonRegistration);

// PATCH /api/support-lesson-registrations/:id/verify
router.patch('/:id/verify', verifyToken, requireAdmin, adminVerifySupportLessonRegistration);

// PATCH /api/support-lesson-registrations/:id/reject
router.patch('/:id/reject', verifyToken, requireAdmin, adminRejectSupportLessonRegistration);

// PATCH /api/support-lesson-registrations/:id/renew
router.patch('/:id/renew', verifyToken, requireAdmin, adminRenewSupportLessonRegistration);

// DELETE /api/support-lesson-registrations/:id
router.delete('/:id', verifyToken, requireAdmin, adminDeleteSupportLessonRegistration);

// PATCH /api/support-lesson-registrations/:id/edit
router.patch('/:id/edit', verifyToken, requireAdmin, adminEditSupportLessonRegistration);

module.exports = router;
