/**
 * bulkImportValidation.js
 * -----------------------
 * Pure, firebase-free validation + duplicate-decision helpers for the student
 * bulk importer. Kept separate from the controller (which owns the Firestore
 * reads + creation) so this critical logic is unit-testable without the Admin SDK.
 *
 * Mirrors the manual-create rules: name + valid email required; school blank →
 * «حر»; a per-row branch that differs from the admin's branch is rejected.
 */

const { normalizeSchool } = require('../constants');

const MAX_ROWS = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strip spaces / dashes / parentheses so phone comparison is format-agnostic. */
const cleanPhone = (v) => String(v == null ? '' : v).replace(/[\s\-()]/g, '').trim();

/**
 * Validate + normalize one raw row into a creation candidate.
 * @returns {{candidate: {fullName,email,phone,school}} | {error: string}}
 */
function normalizeRow(raw = {}, branchId) {
  const fullName = String(raw.fullName || raw.name || '').trim();
  const email = String(raw.email || '').trim().toLowerCase();
  const phone = cleanPhone(raw.phone || raw.phoneNumber);
  const school = normalizeSchool(raw.school); // blank → «حر»
  const rowBranch = String(raw.branch || raw.branchId || '').trim();

  if (!fullName) return { error: 'الاسم الكامل مطلوب' };
  if (!email) return { error: 'البريد الإلكتروني مطلوب' };
  if (!EMAIL_RE.test(email)) return { error: 'صيغة البريد الإلكتروني غير صحيحة' };
  if (rowBranch && rowBranch !== branchId) return { error: 'الفرع لا يطابق فرع المشرف' };

  return { candidate: { fullName, email, phone, school } };
}

/**
 * Decide whether a candidate is a duplicate — within the current batch or against
 * existing students. Returns an Arabic reason string, or null when unique.
 * @param {{email:string, phone:string}} candidate
 * @param {{seenEmails:Set, seenPhones:Set, existingEmails:Set, existingPhones:Set}} sets
 */
function duplicateReason(candidate, sets) {
  const { seenEmails, seenPhones, existingEmails, existingPhones } = sets;
  const { email, phone } = candidate;
  if (seenEmails.has(email)) return 'بريد مكرر داخل الملف';
  if (phone && seenPhones.has(phone)) return 'هاتف مكرر داخل الملف';
  if (existingEmails.has(email)) return 'البريد مسجل مسبقاً';
  if (phone && existingPhones.has(phone)) return 'الهاتف مسجل مسبقاً';
  return null;
}

module.exports = { MAX_ROWS, EMAIL_RE, cleanPhone, normalizeRow, duplicateReason };
