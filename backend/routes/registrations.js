const express                              = require('express');
const router                               = express.Router();
const { verifyToken }                      = require('../middleware/auth');
const { createSupportLessonRegistration }  = require('../controllers/registrationController');

// POST /api/registrations/support
// Authenticated student: register for a support lesson.
router.post('/support', verifyToken, createSupportLessonRegistration);

module.exports = router;
