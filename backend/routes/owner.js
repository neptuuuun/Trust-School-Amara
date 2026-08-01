const express = require('express');
const router  = express.Router();
const { verifyToken, requireOwner } = require('../middleware/auth');
const { getSummary, getBranches, getRevenue } = require('../controllers/ownerController');
const { getGroups, getRetention, getStudents, getTeachers, getSupportOverview } = require('../controllers/ownerAnalyticsController');
const { getAuditLog, getAdminActivity } = require('../controllers/ownerAuditController');
const { getAlerts } = require('../controllers/ownerAlertsController');
const { listAdmins, createAdmin, deactivateAdmin, reactivateAdmin } = require('../controllers/ownerAdminController');
const { getSettings, updateAnnualFee } = require('../controllers/ownerSettingsController');
const {
  getWebsite, updateHero, updateContact, updateSocial, updateBranches,
  addGalleryImage, deleteGalleryImage, reorderGallery,
  addFaq, updateFaq, deleteFaq, reorderFaq,
} = require('../controllers/ownerWebsiteController');

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

// Website management — owner-controlled PUBLIC website content (hero, contact,
// social, branches, gallery). All owner-only + audit-logged in the controller.
router.get('/website',                    verifyToken, requireOwner, getWebsite);
router.patch('/website/hero',             verifyToken, requireOwner, updateHero);
router.patch('/website/contact',          verifyToken, requireOwner, updateContact);
router.patch('/website/social',           verifyToken, requireOwner, updateSocial);
router.patch('/website/branches',         verifyToken, requireOwner, updateBranches);
router.post('/website/gallery',           verifyToken, requireOwner, addGalleryImage);
router.patch('/website/gallery/order',    verifyToken, requireOwner, reorderGallery);
router.delete('/website/gallery/:id',     verifyToken, requireOwner, deleteGalleryImage);

// FAQ (Frequently Asked Questions) — owner-managed, shown on the «اتصل بنا» page.
// `/faq/order` is declared before `/faq/:id` so "order" is never captured as an id.
router.post('/website/faq',               verifyToken, requireOwner, addFaq);
router.patch('/website/faq/order',        verifyToken, requireOwner, reorderFaq);
router.patch('/website/faq/:id',          verifyToken, requireOwner, updateFaq);
router.delete('/website/faq/:id',         verifyToken, requireOwner, deleteFaq);

module.exports = router;
