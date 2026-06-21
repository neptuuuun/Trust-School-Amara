const express = require('express');
const router  = express.Router();
const { verifyToken, requireOwner } = require('../middleware/auth');
const { getSummary, getBranches, getRevenue } = require('../controllers/ownerController');
const { getGroups, getRetention, getStudents, getTeachers, getSupportOverview } = require('../controllers/ownerAnalyticsController');
const { getAuditLog, getAdminActivity } = require('../controllers/ownerAuditController');
const { getAlerts } = require('../controllers/ownerAlertsController');
const { listAdmins, createAdmin, deactivateAdmin, reactivateAdmin } = require('../controllers/ownerAdminController');
const { getSettings, updateAnnualFee } = require('../controllers/ownerSettingsController');

// All owner analytics are cross-branch and owner-only.
router.get('/summary',  verifyToken, requireOwner, getSummary);
router.get('/branches', verifyToken, requireOwner, getBranches);
router.get('/revenue',  verifyToken, requireOwner, getRevenue);

// Phase 2 — groups, retention, student lifecycle.
router.get('/groups',    verifyToken, requireOwner, getGroups);
router.get('/retention', verifyToken, requireOwner, getRetention);
router.get('/students',  verifyToken, requireOwner, getStudents);
router.get('/support-overview', verifyToken, requireOwner, getSupportOverview);

// Phase 3 — teacher performance, admin activity, audit-log viewer.
router.get('/teachers',        verifyToken, requireOwner, getTeachers);
router.get('/admin-activity',  verifyToken, requireOwner, getAdminActivity);
router.get('/audit',           verifyToken, requireOwner, getAuditLog);

// Phase 4 — alerts engine (revenue drops, shortfalls, retention, sensitive audits).
router.get('/alerts',          verifyToken, requireOwner, getAlerts);

// Admin lifecycle — the canonical (and only) way admin accounts are managed.
// Each write is audit-logged with the acting owner as the actor.
router.get('/admins',                     verifyToken, requireOwner, listAdmins);
router.post('/admins',                    verifyToken, requireOwner, createAdmin);
router.patch('/admins/:uid/deactivate',   verifyToken, requireOwner, deactivateAdmin);
router.patch('/admins/:uid/reactivate',   verifyToken, requireOwner, reactivateAdmin);

// Financial settings — owner-controlled annual fee amount (cross-branch policy).
router.get('/settings',     verifyToken, requireOwner, getSettings);
router.patch('/annual-fee', verifyToken, requireOwner, updateAnnualFee);

module.exports = router;
