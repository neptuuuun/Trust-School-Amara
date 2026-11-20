/**
 * Firestore Service Helper
 * Centralized helper functions for branch-based Firestore operations
 */

import { db } from '../firebase';
import apiCall from '../utils/apiClient';
import { logAdminAction } from './auditService';
import { getCurrentAcademicYear, isAnnualPaymentForCurrentYear, toDate as toDateValue, ANNUAL_FEE_DZD } from '../utils/registrationUtils';
import { SERVICE_TYPES } from '../utils/teacherGroups';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  documentId,
  writeBatch,
  increment
} from 'firebase/firestore';

/**
 * The backend returns schedule conflicts as { code:'schedule-conflict', message,
 * conflicts:[…] }; apiClient surfaces the body on err.response. Re-shape it into
 * the { code, conflict, conflicts } contract the UI (ScheduleConflictPanel) reads.
 */
const reshapeConflictError = (err) => {
  if (err && err.code === 'schedule-conflict') {
    err.conflicts = err.response?.conflicts || (err.conflict ? [err.conflict] : []);
    err.conflict = err.conflicts[0] || null;
  }
  return err;
};

// ==================== Collection References ====================

/**
 * Get a reference to any collection under a specific branch
 * @param {string} branchId - The branch ID
 * @param {string} path - The collection path (e.g., 'users', 'languages')
 * @returns {CollectionReference}
 */
export const getBranchCollection = (branchId, path) => {
  if (!branchId) throw new Error('Branch ID is required');
  return collection(db, `branches/${branchId}/${path}`);
};


export const streamUserTrainingSignIns = (branchId, userId, callback) => {
  if (!branchId || !userId) {
    return () => {};
  }

  const entriesRef = collection(
    db,
    `branches/${branchId}/${TRAINING_FORM_CONTAINERS_COLLECTION}/${userId}/${TRAINING_FORM_ENTRIES_SUBCOLLECTION}`
  );

  return onSnapshot(entriesRef, (snapshot) => {
    const entries = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => {
        const dateA = a.submittedAt?.toDate ? a.submittedAt.toDate() : 0;
        const dateB = b.submittedAt?.toDate ? b.submittedAt.toDate() : 0;
        return dateB - dateA;
      });
    callback(entries);
  });
};

/**
 * Get a reference to a document under a specific branch
 * @param {string} branchId - The branch ID
 * @param {string} path - The collection path
 * @param {string} docId - The document ID
 * @returns {DocumentReference}
 */
export const getBranchDoc = (branchId, path, docId) => {
  if (!branchId) throw new Error('Branch ID is required');
  return doc(db, `branches/${branchId}/${path}/${docId}`);
};

// ==================== Subjects & Classes (unified academic model) ====================
//
// Branch-scoped catalog used by all three services (language | training | support).
//   branches/{branchId}/subjects/{subjectId}
//   branches/{branchId}/classes/{classId}
//
// Queries use a SINGLE equality filter + client-side sort on purpose: this avoids
// requiring composite indexes (which 400 until built) and keeps shipping safe.

const SUBJECTS_COLLECTION = 'subjects';
const CLASSES_COLLECTION = 'classes';

const sortByArabic = (key) => (a, b) =>
  String(a?.[key] || '').localeCompare(String(b?.[key] || ''), 'ar');

// ── Subjects ──────────────────────────────────────────────────────────────────

/**
 * One-shot fetch of subjects for a branch + serviceType (+ optional studyYear).
 * @returns {Promise<Array>}
 */
export const getSubjects = async (branchId, serviceType, options = {}) => {
  if (!branchId || !serviceType) return [];
  const ref = getBranchCollection(branchId, SUBJECTS_COLLECTION);
  const snap = await getDocs(query(ref, where('serviceType', '==', serviceType)));
  let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (options.studyYear) rows = rows.filter((r) => r.studyYear === options.studyYear);
  return rows.sort(sortByArabic('name'));
};

/**
 * Live stream of subjects. Signature is flexible:
 *   streamSubjects(branchId, serviceType, callback)
 *   streamSubjects(branchId, serviceType, { studyYear }, callback)
 * @returns {() => void} unsubscribe
 */
export const streamSubjects = (branchId, serviceType, options = {}, callback) => {
  if (typeof options === 'function') { callback = options; options = {}; }
  if (!branchId || !serviceType) { callback?.([]); return () => {}; }
  const ref = getBranchCollection(branchId, SUBJECTS_COLLECTION);
  const q = query(ref, where('serviceType', '==', serviceType));
  return onSnapshot(
    q,
    (snap) => {
      let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (options.studyYear) rows = rows.filter((r) => r.studyYear === options.studyYear);
      rows.sort(sortByArabic('name'));
      callback?.(rows);
    },
    (err) => { console.error('streamSubjects error:', err); callback?.([]); }
  );
};

/**
 * Create a subject. Enforces name-uniqueness within (branch, serviceType[, studyYear]).
 * @throws {Error & {code:'duplicate-subject'}} when a subject with the same name exists in scope.
 */
export const createSubject = async (branchId, serviceType, data = {}, adminInfo = {}) => {
  if (!branchId) throw new Error('branchId is required');
  if (!serviceType) throw new Error('serviceType is required');
  const name = String(data.name || '').trim();
  if (!name) throw new Error('subject name is required');

  const scope = data.studyYear ? { studyYear: data.studyYear } : {};
  const existing = await getSubjects(branchId, serviceType, scope);
  if (existing.some((s) => String(s.name || '').trim().toLowerCase() === name.toLowerCase())) {
    const e = new Error('duplicate-subject');
    e.code = 'duplicate-subject';
    throw e;
  }

  const payload = {
    serviceType,
    name,
    description: String(data.description || '').trim(),
    status: data.status || 'active',
    branchId,
    ...(data.level ? { level: data.level } : {}),
    ...(data.studyYear ? { studyYear: data.studyYear } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // Canonical actor shape {uid,name,email} — standardized across all writes.
    createdBy: { uid: adminInfo.uid || '', name: adminInfo.name || '', email: adminInfo.email || '' },
  };
  const docRef = await addDoc(getBranchCollection(branchId, SUBJECTS_COLLECTION), payload);
  await logAdminAction({ action: 'subject.create', branchId, targetType: 'subject', targetId: docRef.id, after: { name, serviceType } });
  return { id: docRef.id, ...payload };
};

/** Update a subject's editable fields (name, description, status). */
export const updateSubject = async (branchId, subjectId, updates = {}, adminInfo = {}) => {
  if (!branchId || !subjectId) throw new Error('branchId and subjectId are required');
  const ref = getBranchDoc(branchId, SUBJECTS_COLLECTION, subjectId);
  const beforeSnap = await getDoc(ref);
  const beforeData = beforeSnap.exists() ? beforeSnap.data() : {};
  const clean = {
    updatedAt: serverTimestamp(),
    updatedBy: { uid: adminInfo.uid || '', name: adminInfo.name || '', email: adminInfo.email || '' },
  };
  if (updates.name != null) clean.name = String(updates.name).trim();
  if (updates.description != null) clean.description = String(updates.description).trim();
  if (updates.status != null) clean.status = updates.status;
  await updateDoc(ref, clean);
  // Mirror the updated keys into `before` so the history/feed can diff them.
  const before = {};
  Object.keys(updates).forEach((k) => { before[k] = beforeData[k] ?? null; });
  await logAdminAction({ action: 'subject.update', branchId, targetType: 'subject', targetId: subjectId, before, after: updates });

  // Keep the snapshot name on existing classes consistent when a subject is renamed.
  if (updates.name != null) {
    const classesRef = getBranchCollection(branchId, CLASSES_COLLECTION);
    const snap = await getDocs(query(classesRef, where('subjectId', '==', subjectId)));
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.update(d.ref, { subjectName: clean.name }));
      await batch.commit();
    }
  }
};

/**
 * Delete a subject and cascade-delete all of its classes (branch-scoped).
 * Blocked when any of its classes has approved enrollments unless { force:true }.
 */
export const deleteSubject = async (branchId, subjectId, { force = false } = {}) => {
  if (!branchId || !subjectId) throw new Error('branchId and subjectId are required');
  const classesRef = getBranchCollection(branchId, CLASSES_COLLECTION);
  const snap = await getDocs(query(classesRef, where('subjectId', '==', subjectId)));
  if (!force) {
    const enrolled = snap.docs.reduce((sum, d) => sum + (Number(d.data().enrollmentCount) || 0), 0);
    if (enrolled > 0) {
      const e = new Error('subject-has-registrations');
      e.code = 'subject-has-registrations';
      e.count = enrolled;
      throw e;
    }
  }
  const subjSnap = await getDoc(getBranchDoc(branchId, SUBJECTS_COLLECTION, subjectId));
  const subjName = subjSnap.exists() ? (subjSnap.data().name || '') : '';
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(getBranchDoc(branchId, SUBJECTS_COLLECTION, subjectId));
  await batch.commit();
  await logAdminAction({ action: 'subject.delete', branchId, targetType: 'subject', targetId: subjectId, before: { name: subjName }, after: { cascadedClasses: snap.size } });
};

// ── Classes ───────────────────────────────────────────────────────────────────

/**
 * One-shot fetch of classes. Provide ONE primary filter to stay index-free:
 *   getClasses(branchId, { subjectId })       — classes of a subject
 *   getClasses(branchId, { serviceType })      — all classes of a service
 * Extra in-memory filters: { studyYear, activeOnly }.
 */
export const getClasses = async (branchId, options = {}) => {
  if (!branchId) return [];
  const ref = getBranchCollection(branchId, CLASSES_COLLECTION);
  let q;
  if (options.subjectId) q = query(ref, where('subjectId', '==', options.subjectId));
  else if (options.serviceType) q = query(ref, where('serviceType', '==', options.serviceType));
  else q = query(ref);
  const snap = await getDocs(q);
  return applyClassFilters(snap.docs.map((d) => ({ id: d.id, ...d.data() })), options);
};

/** Live stream of classes. Same options as getClasses; last arg is the callback. */
export const streamClasses = (branchId, options = {}, callback) => {
  if (typeof options === 'function') { callback = options; options = {}; }
  if (!branchId) { callback?.([]); return () => {}; }
  const ref = getBranchCollection(branchId, CLASSES_COLLECTION);
  let q;
  if (options.subjectId) q = query(ref, where('subjectId', '==', options.subjectId));
  else if (options.serviceType) q = query(ref, where('serviceType', '==', options.serviceType));
  else q = query(ref);
  return onSnapshot(
    q,
    (snap) => callback?.(applyClassFilters(snap.docs.map((d) => ({ id: d.id, ...d.data() })), options)),
    (err) => { console.error('streamClasses error:', err); callback?.([]); }
  );
};

const applyClassFilters = (rows, options = {}) => {
  let out = rows;
  if (options.serviceType) out = out.filter((r) => r.serviceType === options.serviceType);
  if (options.subjectId) out = out.filter((r) => r.subjectId === options.subjectId);
  if (options.studyYear) out = out.filter((r) => r.studyYear === options.studyYear);
  // Academic-year scope — BACKWARDS-COMPATIBLE. Only groups that carry an
  // EXPLICIT `academicYear` field are scoped to the requested year. Legacy groups
  // written before the academic-year system (no field) are ALWAYS shown.
  //
  // Why not derive the year from `startMonth` for legacy groups? Because that
  // silently hides EVERY pre-existing group the moment the year rolls over: all
  // current-year views request the new AY label (e.g. "2026-2027"), while a legacy
  // group's startMonth still resolves to the previous one ("2025-2026"). New groups
  // are stamped server-side and scope correctly; unstamped legacy groups stay
  // visible until the backfill migration (or a re-save) stamps them — restoring the
  // pre-filter behaviour without touching any data.
  if (options.academicYear) {
    out = out.filter((r) => !r.academicYear || r.academicYear === options.academicYear);
  }
  if (options.activeOnly) out = out.filter((r) => (r.status || 'active') === 'active');
  return out.sort(sortByArabic('groupName'));
};

/**
 * Create a class under a subject. SERVER-AUTHORITATIVE: the write + the teacher /
 * classroom conflict check run inside a Firestore transaction on the backend
 * (Admin SDK). Firestore rules forbid clients from creating classes directly, so
 * this endpoint is the only way a class can come into existence — every class is
 * therefore conflict-checked. `adminInfo` is ignored (derived from the token).
 */
export const createClass = async (branchId, serviceType, data = {}) => {
  if (!branchId) throw new Error('branchId is required');
  if (!serviceType) throw new Error('serviceType is required');
  if (!data.subjectId) throw new Error('subjectId is required');
  try {
    return await apiCall('/api/academic/classes', {
      method: 'POST',
      body: JSON.stringify({ branchId, serviceType, data }),
    });
  } catch (err) {
    throw reshapeConflictError(err);
  }
};

/**
 * Update a class's editable fields. SERVER-AUTHORITATIVE: schedule/teacher/
 * classroom changes are rejected by Firestore rules for clients, so they route
 * here, where the conflict check runs inside a transaction. (enrollmentCount
 * bumps and subjectName renames stay direct client writes — they don't touch the
 * schedule-defining fields and are permitted by the rules.)
 */
export const updateClass = async (branchId, classId, updates = {}) => {
  if (!branchId || !classId) throw new Error('branchId and classId are required');
  try {
    return await apiCall(`/api/academic/classes/${classId}`, {
      method: 'PATCH',
      body: JSON.stringify({ branchId, updates }),
    });
  } catch (err) {
    throw reshapeConflictError(err);
  }
};

/** Fetch a single class document, or null. */
export const getClassById = async (branchId, classId) => {
  if (!branchId || !classId) return null;
  const snap = await getDoc(getBranchDoc(branchId, CLASSES_COLLECTION, classId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

/**
 * Delete a single class. Blocked when the class has approved enrollments
 * (enrollmentCount > 0) unless { force:true } — deactivate instead so the
 * enrolled students' registration references stay valid.
 */
export const deleteClass = async (branchId, classId, { force = false } = {}) => {
  if (!branchId || !classId) throw new Error('branchId and classId are required');
  // SERVER-AUTHORITATIVE: deletion runs through the Express backend so it is
  // audit-logged (group.delete) with a server-resolved actor and the same
  // approved-enrollment safe-delete guard. Direct client deletes are no longer used.
  try {
    return await apiCall(
      `/api/academic/classes/${classId}?branchId=${encodeURIComponent(branchId)}&force=${force ? 'true' : 'false'}`,
      { method: 'DELETE' },
    );
  } catch (err) {
    // apiCall puts extra body fields on err.response — surface `count` where the UI reads it.
    if (err?.code === 'class-has-registrations' && err.count == null) err.count = err.response?.count;
    throw reshapeConflictError(err);
  }
};

// ── Capacity (approved-enrollment) accounting ─────────────────────────────────
// Students cannot count other students' registrations (security rules restrict
// them to their own), so each class keeps a denormalized `enrollmentCount` of
// APPROVED registrations. It powers the student "full" indicator and the
// verification hard-gate.
//
// The counter is DISPLAY/GATING state, not analytics state. It is maintained by
// increments spread across several write paths and drifts the moment a record is
// removed outside them. The owner's alert engine therefore counts the approved
// archives live instead (backend/services/liveStateService.js) — do not point
// analytics at this field.

/**
 * Adjust a class's approved-enrollment counter (best-effort; never throws).
 *
 * @deprecated Blind ±1 drifts on races and double-clicks. Removal paths now go
 * through the backend, which RE-COUNTS from the archive and appends the matching
 * ledger reversal. Do not reintroduce a client-side decrement.
 */
export const adjustClassEnrollment = async (branchId, classId, delta) => {
  if (!branchId || !classId || !delta) return;
  try {
    await updateDoc(getBranchDoc(branchId, CLASSES_COLLECTION, classId), {
      enrollmentCount: increment(delta),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('adjustClassEnrollment failed:', e);
  }
};


// ── Schedule-conflict guards (service layer) ──────────────────────────────────
// The shared engine (src/utils/scheduleConflicts.js) does the interval math; the
// backend mirror enforces the same rules on its own write paths. These helpers
// load the comparison set from Firestore and throw a structured
// `schedule-conflict` error (err.conflict / err.conflicts) when a clash exists.


/**
 * Collect every schedule a student currently occupies across the three
 * registration stores (active / seat-occupying records only).
 * @returns {Promise<Array<{classId, groupName, subjectName, schedules}>>}
 */
export const getStudentEnrollments = async (branchId, userId, { now = new Date() } = {}) => {
  if (!branchId || !userId) return [];
  const out = [];
  const push = (docs) => docs.forEach((d) => {
    const x = d.data() || {};
    if (!Array.isArray(x.schedules) || x.schedules.length === 0) return;
    out.push({
      classId: x.classId || x.lessonId || null,
      groupName: x.groupName || x.subjectName || x.languageName || x.trainingName || '—',
      subjectName: x.subjectName || x.languageName || x.trainingName || '',
      schedules: x.schedules,
    });
  });

  try {
    const [langSnap, trainSnap] = await Promise.all([
      getDocs(query(getBranchCollection(branchId, 'languagesRegistered'), where('userId', '==', userId))),
      getDocs(query(getBranchCollection(branchId, 'trainingsRegistered'), where('userId', '==', userId))),
    ]);
    push(langSnap.docs);
    push(trainSnap.docs);
  } catch (e) {
    console.warn('getStudentEnrollments: lang/train read failed', e);
  }

  // Support is a global collection filtered to active verified subscriptions.
  try {
    const supSnap = await getDocs(query(
      collection(db, 'supportLessonRegistrations'),
      where('userId', '==', userId),
    ));
    supSnap.docs.forEach((d) => {
      const x = d.data() || {};
      if (x.branchId !== branchId) return;
      if (String(x.status || '').toLowerCase() !== 'verified') return;
      const end = x.endDate?.toDate ? x.endDate.toDate() : (x.endDate ? new Date(x.endDate) : null);
      if (end && end <= now) return; // expired frees the slot
      if (!Array.isArray(x.schedules) || x.schedules.length === 0) return;
      out.push({
        classId: x.classId || x.lessonId || null,
        groupName: x.groupName || x.subjectName || x.lessonName || '—',
        subjectName: x.subjectName || x.lessonName || '',
        schedules: x.schedules,
      });
    });
  } catch (e) {
    console.warn('getStudentEnrollments: support read failed', e);
  }

  return out;
};


// ==================== Teachers (branch-scoped) ====================
// Dedicated catalog of teacher names so classes pick from a managed list
// instead of free-typing. Classes still store a teacherName snapshot (+teacherId)
// so existing registrations stay readable if a teacher is renamed/removed.

const TEACHERS_COLLECTION = 'teachers';

export const getTeachers = async (branchId) => {
  if (!branchId) return [];
  const snap = await getDocs(getBranchCollection(branchId, TEACHERS_COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortByArabic('name'));
};

export const streamTeachers = (branchId, callback) => {
  if (!branchId) { callback?.([]); return () => {}; }
  return onSnapshot(
    getBranchCollection(branchId, TEACHERS_COLLECTION),
    (snap) => callback?.(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortByArabic('name'))),
    (err) => { console.error('streamTeachers error:', err); callback?.([]); }
  );
};

/** Keep only valid, de-duplicated lesson categories (class serviceType values). */
const cleanServiceTypes = (arr) =>
  Array.from(new Set((Array.isArray(arr) ? arr : []).filter((s) => SERVICE_TYPES.includes(s))));

/**
 * Create a teacher; enforces name-uniqueness within the branch.
 *
 * `options.serviceTypes` optionally scopes the teacher to one or more lesson
 * categories (language | training | support). When the teacher already exists,
 * any requested categories are MERGED into their record (union, never removed) —
 * so e.g. inline-adding an existing language teacher while building a support
 * class simply also marks them as a support teacher.
 */
export const createTeacher = async (branchId, name, adminInfo = {}, options = {}) => {
  if (!branchId) throw new Error('branchId is required');
  const n = String(name || '').trim();
  if (!n) throw new Error('teacher name is required');
  const actor = { uid: adminInfo.uid || '', name: adminInfo.name || '', email: adminInfo.email || '' };
  const requested = cleanServiceTypes(options.serviceTypes);
  const existing = await getTeachers(branchId);
  const dup = existing.find((t) => String(t.name || '').trim().toLowerCase() === n.toLowerCase());
  if (dup) {
    // Idempotent — but fold any newly-requested categories into the existing record.
    if (requested.length) {
      const current = Array.isArray(dup.serviceTypes) ? dup.serviceTypes : [];
      const merged = Array.from(new Set([...current, ...requested]));
      if (merged.length !== current.length) {
        await updateDoc(getBranchDoc(branchId, TEACHERS_COLLECTION, dup.id), {
          serviceTypes: merged, updatedAt: serverTimestamp(), updatedBy: actor,
        });
        await logAdminAction({ action: 'teacher.update', branchId, targetType: 'teacher', targetId: dup.id, before: { serviceTypes: current }, after: { serviceTypes: merged } });
        return { ...dup, serviceTypes: merged };
      }
    }
    return dup;
  }
  const payload = {
    name: n,
    branchId,
    createdAt: serverTimestamp(),
    // Canonical actor shape {uid,name,email} — standardized across all writes.
    createdBy: actor,
    ...(requested.length ? { serviceTypes: requested } : {}),
  };
  const ref = await addDoc(getBranchCollection(branchId, TEACHERS_COLLECTION), payload);
  await logAdminAction({ action: 'teacher.create', branchId, targetType: 'teacher', targetId: ref.id, after: { name: n, ...(requested.length ? { serviceTypes: requested } : {}) } });
  return { id: ref.id, ...payload };
};

/**
 * Update a teacher's editable fields (currently: category assignment
 * `serviceTypes`, and optionally `name`). Used by the teacher manager to assign
 * a teacher to lesson categories without having to first create a class.
 */
export const updateTeacher = async (branchId, teacherId, updates = {}, adminInfo = {}) => {
  if (!branchId || !teacherId) throw new Error('branchId and teacherId are required');
  const ref = getBranchDoc(branchId, TEACHERS_COLLECTION, teacherId);
  const beforeSnap = await getDoc(ref);
  const before = beforeSnap.exists() ? beforeSnap.data() : {};
  const patch = {
    updatedAt: serverTimestamp(),
    updatedBy: { uid: adminInfo.uid || '', name: adminInfo.name || '', email: adminInfo.email || '' },
  };
  if ('serviceTypes' in updates) patch.serviceTypes = cleanServiceTypes(updates.serviceTypes);
  if (typeof updates.name === 'string' && updates.name.trim()) patch.name = updates.name.trim();
  await updateDoc(ref, patch);
  await logAdminAction({
    action: 'teacher.update', branchId, targetType: 'teacher', targetId: teacherId,
    before: { serviceTypes: before.serviceTypes || [], name: before.name || '' },
    after: { serviceTypes: patch.serviceTypes ?? (before.serviceTypes || []), name: patch.name ?? (before.name || '') },
  });
  return { id: teacherId, ...before, ...patch };
};


export const deleteTeacher = async (branchId, teacherId) => {
  if (!branchId || !teacherId) throw new Error('branchId and teacherId are required');
  const ref = getBranchDoc(branchId, TEACHERS_COLLECTION, teacherId);
  const beforeSnap = await getDoc(ref);
  const beforeName = beforeSnap.exists() ? (beforeSnap.data().name || '') : '';
  await deleteDoc(ref);
  await logAdminAction({ action: 'teacher.delete', branchId, targetType: 'teacher', targetId: teacherId, before: { name: beforeName } });
};

// ==================== User Management ====================


/**
 * Get user document
 * @param {string} branchId
 * @param {string} userId
 * @returns {Promise<DocumentSnapshot>}
 */
export const getUser = async (branchId, userId) => {
  const userRef = getBranchDoc(branchId, 'users', userId);
  return await getDoc(userRef);
};

/**
 * Update editable profile fields for a user (name, phone, birth info, school).
 * Safe to call after enrollment form submission to keep the profile in sync.
 * @param {string} branchId
 * @param {string} userId
 * @param {object} fields - Partial profile fields to merge
 */
export const updateUserProfile = async (branchId, userId, fields = {}) => {
  if (!branchId || !userId) return;
  const userRef = getBranchDoc(branchId, 'users', userId);
  const patch = {};
  if (fields.name)          { patch.name = fields.name; patch.fullName = fields.name; }
  if (fields.birthDate)       patch.birthDate = fields.birthDate;
  if (fields.birthPlace)      patch.birthPlace = fields.birthPlace;
  if (fields.guardianPhone)   { patch.guardianPhone = fields.guardianPhone; patch.phoneNumber = fields.guardianPhone; }
  if (fields.studentPhone)    patch.studentPhone = fields.studentPhone;
  if (fields.phone)           { patch.phone = fields.phone; patch.phoneNumber = fields.phone; }
  // School is REQUIRED — only ever written with a non-empty value, so a blank
  // submission can never clear an existing person's educational institution.
  if (fields.school != null && String(fields.school).trim()) patch.school = String(fields.school).trim();
  if (fields.stream)          patch.stream = fields.stream;
  if (Object.keys(patch).length === 0) return;
  patch.updatedAt = serverTimestamp();
  await updateDoc(userRef, patch);
};

// NOTE: account verification is NOT done here. The canonical path is
// UsersPage.executeDecision → userService.updateUser, which records verifiedBy
// and logs document.approve/reject. A previous updateUserVerification helper here
// was dead code (zero callers) and has been removed to avoid a divergent path.


// ==================== Languages ====================


const TRAINING_FORM_CONTAINERS_COLLECTION = 'trainingsForms';
const TRAINING_FORM_ENTRIES_SUBCOLLECTION = 'trainingFormEntries';

const normalizeLanguageName = (language) => {
  if (!language) return '';
  return language.languageName || language.name || '';
};


/**
 * Get all languages for a branch
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export const getLanguages = async (branchId) => {
  const languagesRef = getBranchCollection(branchId, 'languages');
  const snapshot = await getDocs(languagesRef);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    languageName: normalizeLanguageName(doc.data())
  }));
};


// ==================== Support Lessons ====================


// ==================== Annual Payments ====================


/**
 * Read the current owner-configured annual fee amount (DZD) from config/finance.
 * Falls back to the historical default when the config doc is absent/unreadable.
 * Single source of truth for the amount shown in the admin record form + the
 * student-facing support form. The authoritative snapshot is taken server-side
 * when a payment is actually recorded.
 */
export const getAnnualFeeAmount = async () => {
  try {
    const snap = await getDoc(doc(db, 'config', 'finance'));
    if (snap.exists()) {
      const amt = Number(snap.data()?.annualFeeAmount);
      if (Number.isFinite(amt) && amt >= 0) return amt;
    }
  } catch (e) {
    console.warn('getAnnualFeeAmount failed; using default:', e);
  }
  return ANNUAL_FEE_DZD;
};

/**
 * Admin: record a STANDALONE annual fee payment for ANY existing student —
 * self-registered or admin-created. Routes through the backend so the amount
 * (owner config snapshot), ledger entry, audit log, and user flags are all
 * written consistently. The backend rejects duplicate payments for the same
 * student + academic year (HTTP 409, err.code === 'already-paid').
 *
 * @param {string} branchId
 * @param {string} userId
 * @param {{ studyYear?: string, notes?: string, paidAt?: string|null }} opts
 * @returns {Promise<{ paymentId, amount, academicYear, studyYear }>}
 */
export const recordAnnualFeePayment = async (branchId, userId, opts = {}) => {
  if (!branchId || !userId) throw new Error('branchId and userId are required');
  const { studyYear = null, notes = null, paidAt = null } = opts;
  return apiCall('/api/admin/record-annual-fee', {
    method: 'POST',
    body: JSON.stringify({ branchId, userId, studyYear, notes, paidAt }),
  });
};


export const getAnnualFeeAccessStatus = async (branchId, userId) => {
  if (!branchId || !userId) {
    return { status: 'unpaid', paymentId: null };
  }

  const paymentsRef = getBranchCollection(branchId, 'annualPayments');
  const q = query(
    paymentsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return { status: 'unpaid', paymentId: null };
  }

  const docSnap = snapshot.docs[0];
  const payment = docSnap.data() || {};
  const status = String(payment.status || 'pending').toLowerCase();
  return { status, paymentId: docSnap.id };
};

/**
 * Academic-year-aware annual-fee status for a student.
 * The annual fee is paid once per academic year and is bundled into the FIRST
 * support registration of that year (there is no standalone annual-fee payment).
 *
 * @returns {Promise<{status:'verified'|'pending'|'unpaid', paymentId:string|null, academicYear:string}>}
 *   verified — a verified annualPayments doc falls in the current academic year
 *              (also grandfathers legacy records via verifiedAt window)
 *   pending  — the student has a pending support reg that bundles the annual fee
 *   unpaid   — neither
 */
export const getAnnualFeeStatusForYear = async (branchId, userId) => {
  const { label, startMs } = getCurrentAcademicYear();
  if (!branchId || !userId) return { status: 'unpaid', paymentId: null, academicYear: label };

  // 1. Verified annual payment within the current academic year.
  const paymentsRef = getBranchCollection(branchId, 'annualPayments');
  const paySnap = await getDocs(query(paymentsRef, where('userId', '==', userId)));
  const verified = paySnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((p) => isAnnualPaymentForCurrentYear(p));
  if (verified) return { status: 'verified', paymentId: verified.id, academicYear: label };

  // 2. A pending support registration that bundles the annual fee (first reg under review).
  //    Students may read their own supportLessonRegistrations (rules: userId == auth.uid).
  try {
    const regSnap = await getDocs(query(
      collection(db, 'supportLessonRegistrations'),
      where('userId', '==', userId)
    ));
    const hasPendingBundle = regSnap.docs.map((d) => d.data() || {}).some((r) => {
      if (r.branchId !== branchId) return false;
      if (!r.includesAnnualFee) return false;
      if (String(r.status || '').toLowerCase() !== 'pending') return false;
      const created = toDateValue(r.createdAt);
      return !created || created.getTime() >= startMs;
    });
    if (hasPendingBundle) return { status: 'pending', paymentId: null, academicYear: label };
  } catch (e) {
    console.warn('getAnnualFeeStatusForYear: pending-bundle check failed', e);
  }

  return { status: 'unpaid', paymentId: null, academicYear: label };
};


const SUPPORT_LESSON_REGISTRATIONS_COLLECTION = 'supportLessonRegistrations';


const supportRegistrationCollection = () =>
  collection(db, SUPPORT_LESSON_REGISTRATIONS_COLLECTION);


// ── Payment correction workflow (needs_correction status) ─────────────────────
// Both routes go through the Express backend (Admin SDK): Firestore rules block
// student writes to every payment doc, and admin annual/support writes must use
// the Admin SDK. See backend/controllers/correctionController.js.


// ==================== Trainings ====================


/**
 * Get all trainings for a branch
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export const getTrainings = async (branchId) => {
  const trainingsRef = getBranchCollection(branchId, 'trainings');
  const snapshot = await getDocs(trainingsRef);
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter((training) => training?.active !== false);
};


/**
 * Get pending training requests
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export const getPendingTrainingRequests = async (branchId) => {
  const registrationsRef = getBranchCollection(branchId, 'registrations');
  const q = query(
    registrationsRef,
    where('type', '==', 'training_request'),
    where('status', '==', 'pending')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};


/**
 * Stream approved language registrations for a branch.
 * @param {string} branchId
 * @param {function} callback
 * @param {{ academicYear?: string }} [options] — when `academicYear` is set, the
 *   query filters server-side to that academic year (scalable for large archives;
 *   needs the languagesRegistered [academicYear ASC, registeredAt DESC] index).
 */
export const streamRegisteredLanguages = (branchId, callback, options = {}) => {
  if (!branchId) return () => {};

  const registeredRef = getBranchCollection(branchId, 'languagesRegistered');
  const clauses = options.academicYear ? [where('academicYear', '==', options.academicYear)] : [];
  const q = query(registeredRef, ...clauses, orderBy('registeredAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))),
    (err) => { console.error('streamRegisteredLanguages error:', err); callback([]); }
  );
};

/**
 * Batch fetch user profiles by IDs, returning a Map<userId, userData>
 * @param {string} branchId
 * @param {string[]} userIds
 * @returns {Promise<Map<string, object>>}
 */
export const getUsersByIds = async (branchId, userIds = []) => {
  if (!branchId || !Array.isArray(userIds) || userIds.length === 0) {
    return new Map();
  }

  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const usersRef = getBranchCollection(branchId, 'users');
  const chunkSize = 10; // Firestore limit for 'in' queries
  const result = new Map();

  const chunks = [];
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    chunks.push(uniqueIds.slice(i, i + chunkSize));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const q = query(usersRef, where(documentId(), 'in', chunk));
      const snapshot = await getDocs(q);
      snapshot.forEach((docSnap) => {
        result.set(docSnap.id, docSnap.data());
      });
    })
  );

  return result;
};

/**
 * Stream approved training registrations for a branch.
 * @param {{ academicYear?: string }} [options] — server-side academic-year filter
 *   (needs the trainingsRegistered [academicYear ASC, registeredAt DESC] index).
 */
export const streamRegisteredTrainings = (branchId, callback, options = {}) => {
  if (!branchId) return () => {};

  const registeredRef = getBranchCollection(branchId, 'trainingsRegistered');
  const clauses = options.academicYear ? [where('academicYear', '==', options.academicYear)] : [];
  const q = query(registeredRef, ...clauses, orderBy('registeredAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))),
    (err) => { console.error('streamRegisteredTrainings error:', err); callback([]); }
  );
};

// Real-time stream of unverified (pending + rejected) training form entries for a branch.
// Approved entries have verified:true and therefore never appear here.
export const streamTrainingFormEntries = (branchId, callback) => {
  if (!branchId) return () => {};
  const q = query(
    collectionGroup(db, TRAINING_FORM_ENTRIES_SUBCOLLECTION),
    where('branchId', '==', branchId),
    where('verified', '==', false)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const entries = snapshot.docs.map((docSnap) => {
        const parentUserId = docSnap.ref.parent?.parent?.id || null;
        return {
          id: docSnap.id,
          formId: docSnap.id,
          studentId: docSnap.data().userId || parentUserId,
          parentUserId,
          ...docSnap.data(),
        };
      });
      callback(entries);
    },
    (err) => {
      console.error('streamTrainingFormEntries error:', err);
      callback([]);
    }
  );
};

// ---------------------------------------------------------------------------
// Admin CRUD — trainingsRegistered
// ---------------------------------------------------------------------------

/**
 * Remove an approved training registration. SERVER-AUTHORITATIVE: the delete,
 * the enrollmentCount recount, the ledger REVERSAL and the audit entry run in
 * one backend call.
 *
 * This was a client `deleteDoc`. Clients cannot write /ledger (rules deny it),
 * so the revenue stayed on the books after every deletion and the owner's
 * state-based alerts never moved. Do not move it back.
 */
export const adminRemoveTrainingRegistration = async (branchId, docId, reason = null) => {
  if (!branchId || !docId) throw new Error('branchId and docId are required');
  return apiCall(`/api/academic/registrations/training/${docId}`, {
    method: 'DELETE',
    body: JSON.stringify({ branchId, reason }),
  });
};


/**
 * Admin direct-add a (class-based) training registration. SERVER-AUTHORITATIVE:
 * duplicate guard + capacity + student schedule-conflict + write +
 * enrollmentCount run in one backend transaction.
 */
export const adminAddTrainingRegistration = async (branchId, data) => {
  if (!branchId) throw new Error('branchId is required');
  if (!data.userId) throw new Error('userId is required for training registration');
  try {
    return await apiCall('/api/academic/registrations/training/admin-add', {
      method: 'POST',
      body: JSON.stringify({ branchId, data }),
    });
  } catch (err) {
    throw reshapeConflictError(err);
  }
};

// ---------------------------------------------------------------------------
// Admin CRUD — languagesRegistered
// ---------------------------------------------------------------------------

/**
 * Remove an approved language registration. SERVER-AUTHORITATIVE — see
 * adminRemoveTrainingRegistration for why this cannot be a client deleteDoc.
 */
export const adminRemoveLanguageRegistration = async (branchId, docId, reason = null) => {
  if (!branchId || !docId) throw new Error('branchId and docId are required');
  return apiCall(`/api/academic/registrations/language/${docId}`, {
    method: 'DELETE',
    body: JSON.stringify({ branchId, reason }),
  });
};


/**
 * Admin direct-add a (class-based) language registration. SERVER-AUTHORITATIVE
 * (see adminAddTrainingRegistration).
 */
export const adminAddLanguageRegistration = async (branchId, data) => {
  if (!branchId) throw new Error('branchId is required');
  if (!data.userId) throw new Error('userId is required for language registration');
  try {
    return await apiCall('/api/academic/registrations/language/admin-add', {
      method: 'POST',
      body: JSON.stringify({ branchId, data }),
    });
  } catch (err) {
    throw reshapeConflictError(err);
  }
};

/**
 * Stream support-lesson registrations for a branch (global collection).
 * @param {{ academicYear?: string }} [options] — server-side academic-year filter
 *   (needs the supportLessonRegistrations
 *   [branchId ASC, academicYear ASC, createdAt DESC] index).
 */
export const streamSupportLessonRegistrations = (branchId, callback, options = {}) => {
  if (!branchId) return () => {};

  const clauses = [where('branchId', '==', branchId)];
  if (options.academicYear) clauses.push(where('academicYear', '==', options.academicYear));
  const q = query(supportRegistrationCollection(), ...clauses, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))),
    (err) => { console.error('streamSupportLessonRegistrations error:', err); callback([]); }
  );
};

// ==================== Meta Information ====================


// ==================== Annual Fee Status ====================


// ==================== Utility Functions ====================


// ==================== Contact Messages ====================

/**
 * Create a contact message
 * @param {string} branchId
 * @param {object} messageData - { name, email, phone, message }
 */
export const createContactMessage = async (branchId, messageData) => {
  const messagesRef = getBranchCollection(branchId, 'contactMessages');
  return await addDoc(messagesRef, {
    ...messageData,
    read: false,
    createdAt: serverTimestamp(),
  });
};


// ==================== Rules ====================


/**
 * Check if user has access to support lessons
 * @param {string} branchId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const canAccessSupportLessons = async (branchId, userId) => {
  const { status } = await getAnnualFeeAccessStatus(branchId, userId);
  return status === 'verified';
};

/**
 * Check if user is verified
 * @param {string} branchId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const isUserVerified = async (branchId, userId) => {
  const userSnap = await getUser(branchId, userId);
  if (!userSnap.exists()) return false;

  const userData = userSnap.data();
  return userData.verified === true;
};

// ==================== Support Lesson Expiration & Renewal ====================


/**
 * Admin: manually renew a support lesson registration for one additional month.
 * Sets startDate = now, endDate = now + 1 month, status = 'verified'.
 */
export const adminRenewSupportLessonRegistration = async (registrationId, adminInfo = {}) => {
  if (!registrationId) throw new Error('registrationId is required');
  // Direct client write to supportLessonRegistrations is blocked by Firestore rules.
  // Route through backend (Admin SDK).
  await apiCall(`/api/support-lesson-registrations/${registrationId}/renew`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
};

/**
 * Admin: permanently delete a support lesson registration.
 * Does NOT soft-delete — the document is removed from Firestore.
 */
export const adminRemoveSupportLessonRegistration = async (registrationId) => {
  if (!registrationId) throw new Error('registrationId is required');
  // Direct client delete to supportLessonRegistrations is blocked by Firestore rules.
  // Route through backend (Admin SDK).
  await apiCall(`/api/support-lesson-registrations/${registrationId}`, {
    method: 'DELETE',
  });
};

/**
 * Admin: edit mutable fields on a support lesson registration.
 * Restricted to non-destructive fields; branchId, userId, lessonId cannot change.
 *
 * Firestore rule blocks all client writes to supportLessonRegistrations.
 * This function routes through the backend (Admin SDK) via apiCall.
 *
 * @param {string} registrationId
 * @param {object} updates - Partial fields to merge (e.g. status, endDate, subjectName)
 */
export const adminEditSupportLessonRegistration = async (registrationId, updates = {}) => {
  if (!registrationId) throw new Error('registrationId is required');

  // Strip identity fields client-side as a first-line guard.
  // The backend enforces its own allowlist independently.
  const { branchId: _b, userId: _u, lessonId: _l, createdAt: _c, ...safeUpdates } = updates;

  // Dates must be serialized to ISO strings for JSON transport.
  // The backend converts them to Firestore Timestamps via Admin SDK.
  const payload = {};
  for (const [key, value] of Object.entries(safeUpdates)) {
    if (value instanceof Date) {
      payload[key] = value.toISOString();
    } else if (value && typeof value.toDate === 'function') {
      // Firestore Timestamp passed defensively — convert to ISO string
      payload[key] = value.toDate().toISOString();
    } else {
      payload[key] = value;
    }
  }

  await apiCall(`/api/support-lesson-registrations/${registrationId}/edit`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
};


/**
 * Real-time listener for all approved language registrations for a specific student.
 */
export const streamRegisteredLanguagesForStudent = (branchId, userId, callback) => {
  if (!branchId || !userId) return () => {};
  const registeredRef = getBranchCollection(branchId, 'languagesRegistered');
  // Filter on userId (not studentId): the Firestore rule checks resource.data.userId
  // so the query filter must match the same field to be provable by the rule evaluator.
  // Both studentId and userId are always set to the same value in these documents.
  const q = query(
    registeredRef,
    where('userId', '==', userId),
    orderBy('registeredAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('streamRegisteredLanguagesForStudent error:', err);
    callback([]);
  });
};

/**
 * Real-time listener for all approved training registrations for a specific student.
 */
export const streamRegisteredTrainingsForStudent = (branchId, userId, callback) => {
  if (!branchId || !userId) return () => {};
  const registeredRef = getBranchCollection(branchId, 'trainingsRegistered');
  const q = query(
    registeredRef,
    where('userId', '==', userId),
    orderBy('registeredAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => callback([]));
};

// ---------------------------------------------------------------------------
// One-shot helpers: load existing registrations for a student (used by admin
// registration modals to filter out already-registered options).
// All queries are scoped to the current branchId — no cross-branch leakage.
// ---------------------------------------------------------------------------

/** Returns all languagesRegistered docs for a student in this branch. */
export const getStudentLanguageRegistrations = async (branchId, userId) => {
  if (!branchId || !userId) return [];
  const q = query(
    getBranchCollection(branchId, 'languagesRegistered'),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/** Returns all trainingsRegistered docs for a student in this branch. */
export const getStudentTrainingRegistrations = async (branchId, userId) => {
  if (!branchId || !userId) return [];
  const q = query(
    getBranchCollection(branchId, 'trainingsRegistered'),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/** Returns all supportLessonRegistrations docs for a student in this branch. */
export const getStudentSupportLessonRegistrations = async (branchId, userId) => {
  if (!branchId || !userId) return [];
  const q = query(
    supportRegistrationCollection(),
    where('userId',   '==', userId),
    where('branchId', '==', branchId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};


