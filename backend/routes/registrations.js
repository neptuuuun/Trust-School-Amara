const express                              = require('express');
const router                               = express.Router();
const { verifyToken }                      = require('../middleware/auth');
const {
  createSupportLessonRegistration,
  setDistinguishedAverage,
} = require('../controllers/registrationController');

// POST /api/registrations/support
// Authenticated student: register for a support lesson.
router.post('/support', verifyToken, createSupportLessonRegistration);

// POST /api/registrations/support-average
// Authenticated student: save «معدل المواد المميزة» and get the classification
// (so the browse page can route them to the right group type before enrolling).
router.post('/support-average', verifyToken, setDistinguishedAverage);

module.exports = router;
