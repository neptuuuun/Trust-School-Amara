/**
 * adminSearchService — thin client wrappers over the branch-scoped admin
 * search + Student 360 backend endpoints (Admin SDK, requireAdmin).
 */

import apiCall from '../utils/apiClient';

/** Global search across students + all payment types for the admin's branch. */
export const searchAdmin = (q) =>
  apiCall(`/api/admin/search?q=${encodeURIComponent(q || '')}`);

/** Full "Student 360" aggregate for one student. */
export const getStudentProfile = (userId) =>
  apiCall(`/api/admin/students/${encodeURIComponent(userId)}/profile`);
