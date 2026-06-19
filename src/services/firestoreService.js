/**
 * Firestore Service Helper
 * Centralized helper functions for branch-based Firestore operations
 */

import { db } from '../firebase';
import { getYearById } from '../data/studyLevels';
import apiCall from '../utils/apiClient';
import { getCurrentAcademicYear, isAnnualPaymentForCurrentYear, toDate as toDateValue } from '../utils/registrationUtils';
import { cleanupPaymentReceipt } from './storageCleanupService';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  arrayUnion,
  documentId,
  writeBatch,
  increment
} from 'firebase/firestore';

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

export const listenTrainingRegistrationStatus = (branchId, userId, trainingId, callback) => {
  if (!branchId || !userId || !trainingId) {
    return () => {};
  }

  const entriesRef = collection(
    db,
    `branches/${branchId}/${TRAINING_FORM_CONTAINERS_COLLECTION}/${userId}/${TRAINING_FORM_ENTRIES_SUBCOLLECTION}`
  );

  const statusQuery = query(
    entriesRef,
    where('trainingId', '==', trainingId),
    orderBy('submittedAt', 'desc'),
    limit(1)
  );

  return onSnapshot(statusQuery, (snapshot) => {
    const statusEntry = snapshot.docs.length ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null;
    callback(statusEntry);
  });
};

export const getUserTrainingSignIns = async (branchId, userId) => {
  if (!branchId || !userId) return [];

  const entriesRef = collection(
    db,
    `branches/${branchId}/${TRAINING_FORM_CONTAINERS_COLLECTION}/${userId}/${TRAINING_FORM_ENTRIES_SUBCOLLECTION}`
  );
  const snapshot = await getDocs(entriesRef);
  return snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .sort((a, b) => {
      const dateA = a.submittedAt?.toDate ? a.submittedAt.toDate() : 0;
      const dateB = b.submittedAt?.toDate ? b.submittedAt.toDate() : 0;
      return dateB - dateA;
    });
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

const sanitizeScheduleList = (schedules) =>
  (Array.isArray(schedules) ? schedules : [])
    .map((s) => ({
      day: s?.day ? String(s.day).trim() : '',
      start: s?.start ? String(s.start).trim() : '',
      end: s?.end ? String(s.end).trim() : '',
    }))
    .filter((s) => s.day && s.start && s.end);

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
    createdBy: { uid: adminInfo.uid || '', email: adminInfo.email || '' },
  };
  const docRef = await addDoc(getBranchCollection(branchId, SUBJECTS_COLLECTION), payload);
  return { id: docRef.id, ...payload };
};

/** Update a subject's editable fields (name, description, status). */
export const updateSubject = async (branchId, subjectId, updates = {}) => {
  if (!branchId || !subjectId) throw new Error('branchId and subjectId are required');
  const clean = { updatedAt: serverTimestamp() };
  if (updates.name != null) clean.name = String(updates.name).trim();
  if (updates.description != null) clean.description = String(updates.description).trim();
  if (updates.status != null) clean.status = updates.status;
  await updateDoc(getBranchDoc(branchId, SUBJECTS_COLLECTION, subjectId), clean);

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
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(getBranchDoc(branchId, SUBJECTS_COLLECTION, subjectId));
  await batch.commit();
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
  if (options.activeOnly) out = out.filter((r) => (r.status || 'active') === 'active');
  return out.sort(sortByArabic('groupName'));
};

const toNonNegativeNumber = (value, fallback = 0) => {
  if (value === '' || value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * Create a class under a subject. priceType defaults to 'monthly' for support,
 * 'oneTime' for language/training.
 */
export const createClass = async (branchId, serviceType, data = {}, adminInfo = {}) => {
  if (!branchId) throw new Error('branchId is required');
  if (!serviceType) throw new Error('serviceType is required');
  if (!data.subjectId) throw new Error('subjectId is required');

  const payload = {
    subjectId: data.subjectId,
    subjectName: String(data.subjectName || '').trim(),
    serviceType,
    teacherName: String(data.teacherName || '').trim(),
    groupName: String(data.groupName || '').trim(),
    schedules: sanitizeScheduleList(data.schedules),
    capacity: toNonNegativeNumber(data.capacity, 0),
    price: toNonNegativeNumber(data.price, 0),
    priceType: data.priceType || (serviceType === 'support' ? 'monthly' : 'oneTime'),
    status: data.status || 'active',
    branchId,
    ...(data.level ? { level: String(data.level).trim() } : {}),
    ...(data.studyYear ? { studyYear: data.studyYear } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: { uid: adminInfo.uid || '', email: adminInfo.email || '' },
  };
  const docRef = await addDoc(getBranchCollection(branchId, CLASSES_COLLECTION), payload);
  return { id: docRef.id, ...payload };
};

/** Update a class's editable fields. */
export const updateClass = async (branchId, classId, updates = {}) => {
  if (!branchId || !classId) throw new Error('branchId and classId are required');
  const clean = { updatedAt: serverTimestamp() };
  ['teacherName', 'groupName', 'level', 'subjectName'].forEach((k) => {
    if (updates[k] != null) clean[k] = String(updates[k]).trim();
  });
  if (updates.schedules != null) clean.schedules = sanitizeScheduleList(updates.schedules);
  if (updates.capacity != null) clean.capacity = toNonNegativeNumber(updates.capacity, 0);
  if (updates.price != null) clean.price = toNonNegativeNumber(updates.price, 0);
  if (updates.status != null) clean.status = updates.status;
  await updateDoc(getBranchDoc(branchId, CLASSES_COLLECTION, classId), clean);
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
  if (!force) {
    const cls = await getClassById(branchId, classId);
    const enrolled = Number(cls?.enrollmentCount) || 0;
    if (enrolled > 0) {
      const e = new Error('class-has-registrations');
      e.code = 'class-has-registrations';
      e.count = enrolled;
      throw e;
    }
  }
  await deleteDoc(getBranchDoc(branchId, CLASSES_COLLECTION, classId));
};

// ── Capacity (approved-enrollment) accounting ─────────────────────────────────
// Students cannot count other students' registrations (security rules restrict
// them to their own), so each class keeps a denormalized `enrollmentCount` of
// APPROVED registrations. It is maintained on approve (+1) / admin-remove (-1)
// and read both by the student "full" indicator and the verification hard-gate.

/** Adjust a class's approved-enrollment counter (best-effort; never throws). */
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

/**
 * Throw { code:'class-full' } when the class is at capacity (approved-only).
 * No-op when the class is missing (deleted) or capacity is 0 (unlimited).
 */
export const assertClassNotFull = async (branchId, classId) => {
  if (!branchId || !classId) return;
  const cls = await getClassById(branchId, classId);
  if (!cls) return;
  const capacity = Number(cls.capacity) || 0;
  const enrolled = Number(cls.enrollmentCount) || 0;
  if (capacity > 0 && enrolled >= capacity) {
    const e = new Error('class-full');
    e.code = 'class-full';
    throw e;
  }
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

/** Create a teacher; enforces name-uniqueness within the branch. */
export const createTeacher = async (branchId, name, adminInfo = {}) => {
  if (!branchId) throw new Error('branchId is required');
  const n = String(name || '').trim();
  if (!n) throw new Error('teacher name is required');
  const existing = await getTeachers(branchId);
  const dup = existing.find((t) => String(t.name || '').trim().toLowerCase() === n.toLowerCase());
  if (dup) return dup; // idempotent — return the existing teacher instead of erroring
  const payload = {
    name: n,
    branchId,
    createdAt: serverTimestamp(),
    createdBy: { uid: adminInfo.uid || '', email: adminInfo.email || '' },
  };
  const ref = await addDoc(getBranchCollection(branchId, TEACHERS_COLLECTION), payload);
  return { id: ref.id, ...payload };
};

export const updateTeacher = async (branchId, teacherId, name) => {
  if (!branchId || !teacherId) throw new Error('branchId and teacherId are required');
  await updateDoc(getBranchDoc(branchId, TEACHERS_COLLECTION, teacherId), {
    name: String(name || '').trim(),
    updatedAt: serverTimestamp(),
  });
};

export const deleteTeacher = async (branchId, teacherId) => {
  if (!branchId || !teacherId) throw new Error('branchId and teacherId are required');
  await deleteDoc(getBranchDoc(branchId, TEACHERS_COLLECTION, teacherId));
};

// ==================== User Management ====================

/**
 * Create or update a user document
 * @param {string} branchId
 * @param {string} userId
 * @param {object} userData
 */
export const createUser = async (branchId, userId, userData) => {
  const userRef = getBranchDoc(branchId, 'users', userId);
  const existingSnap = await getDoc(userRef);

  const baseData = {
    ...userData,
    verified: false,
    accountVerified: false,
    yearlyFeePaid: false,
    enrolledLessons: [],
    uploadedDocs: [],
    verificationStatus: userData?.verificationStatus || 'pending',
    status: userData?.status || 'pending',
    verificationRequest: userData?.verificationRequest || null,
    role: 'student',
    createdAt: serverTimestamp(),
  };

  if (!existingSnap.exists()) {
    baseData.registrations = {
      language: false,
      trainings: [],
      annualFee: null,
    };
  }

  await setDoc(userRef, baseData, { merge: true });
};

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
  if (fields.school)          patch.school = fields.school;
  if (fields.stream)          patch.stream = fields.stream;
  if (Object.keys(patch).length === 0) return;
  patch.updatedAt = serverTimestamp();
  await updateDoc(userRef, patch);
};

/**
 * Update user verification status
 * @param {string} branchId
 * @param {string} userId
 * @param {boolean} verified
 */
export const updateUserVerification = async (branchId, userId, approved, adminInfo = {}) => {
  const userRef = getBranchDoc(branchId, 'users', userId);
  const isVerified = Boolean(approved);

  const baseUpdate = {
    verified: isVerified,
    accountVerified: isVerified,
    verifiedAt: isVerified ? serverTimestamp() : null,
    verifiedBy: adminInfo.uid || null,
    verificationReviewerEmail: adminInfo.email || null,
    verificationStatus: isVerified ? 'verified' : 'rejected',
    status: 'active',
    verificationRequest: null,
    updatedAt: serverTimestamp()
  };

  if (!isVerified) {
    baseUpdate.uploadedDocs = [];
    baseUpdate.photoUrl = null;
    baseUpdate.idCardUrl = null;
  }

  await updateDoc(userRef, baseUpdate);
};

/**
 * Update user yearly fee status
 * @param {string} branchId
 * @param {string} userId
 * @param {boolean} paid
 */
export const updateYearlyFeeStatus = async (branchId, userId, paid) => {
  const userRef = getBranchDoc(branchId, 'users', userId);
  await updateDoc(userRef, { yearlyFeePaid: paid });
};

/**
 * Get all unverified users
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export const getUnverifiedUsers = async (branchId) => {
  const usersRef = getBranchCollection(branchId, 'users');
  const qRef = query(usersRef, where('verificationStatus', '==', 'pending'));
  const snapshot = await getDocs(qRef);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

// ==================== Languages ====================

const LANGUAGE_FORM_ENTRIES_SUBCOLLECTION = 'languageFormEntries';
const TRAINING_FORM_CONTAINERS_COLLECTION = 'trainingsForms';
const TRAINING_FORM_ENTRIES_SUBCOLLECTION = 'trainingFormEntries';

const normalizeLanguageName = (language) => {
  if (!language) return '';
  return language.languageName || language.name || '';
};

/**
 * Create a new language course
 * @param {string} branchId
 * @param {object} languageData - { name, description, price }
 */
export const createLanguage = async (branchId, languageData) => {
  const languagesRef = getBranchCollection(branchId, 'languages');
  return await addDoc(languagesRef, {
    ...languageData,
    createdAt: serverTimestamp(),
  });
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

/**
 * Create or update a student's language registration in the languagesForms structure
 * @param {string} branchId
 * @param {object} registrationData
 */
export const createLanguageRegistration = async (branchId, registrationData) => {
  const {
    userId,
    levelId,
    levelLabel,
    languageId,
    languageName,
    languagePrice,
    teacherName,
    studentName,
    userEmail,
    birthDate,
    birthPlace,
    guardianPhone,
    studentPhone,
    paymentMethod,
    receiptUrl,
    receiptPath,
    // New Subject → Class snapshot fields
    subjectId: subjectIdRaw,
    subjectName: subjectNameRaw,
    classId: classIdRaw,
    groupName,
    schedules,
  } = registrationData;

  if (!userId) throw new Error('userId is required for language registration');

  const classId = classIdRaw || '';
  const subjectId = subjectIdRaw || languageId || '';
  const subjectName = subjectNameRaw || languageName || '';
  // Accept the new class-based flow OR the legacy language+level flow.
  if (!classId && !languageId) {
    throw new Error('classId or languageId is required for language registration');
  }

  // Document id is derived from the most specific identifier available.
  const idSource = classId || levelId || languageId || 'lang';
  const sanitizedId = String(idSource).replace(/\./g, '_');
  const formContainerRef = getBranchDoc(branchId, 'languagesForms', userId);
  const existingSnapshot = await getDoc(formContainerRef);

  const timestampFields = existingSnapshot.exists()
    ? { updatedAt: serverTimestamp() }
    : { createdAt: serverTimestamp(), updatedAt: serverTimestamp() };

  await setDoc(formContainerRef, {
    userId,
    branchId,
    studentEmail: userEmail || '',
    studentName: studentName || '',
    lastSubmittedAt: serverTimestamp(),
    ...timestampFields
  }, { merge: true });

  const formId = `${sanitizedId}-${Date.now()}`;
  const entriesRef = collection(formContainerRef, LANGUAGE_FORM_ENTRIES_SUBCOLLECTION);
  const formRef = doc(entriesRef, formId);

  const formData = {
    formId,
    userId:    userId,   // canonical ownership field (Phase D — studentId removed)
    branchId,
    studentEmail: userEmail || '',
    studentName: studentName || '',
    birthDate: birthDate || null,
    birthPlace: birthPlace || '',
    guardianPhone: guardianPhone || '',
    studentPhone: studentPhone || '',
    paymentMethod: paymentMethod || '',
    receiptUrl: receiptUrl || '',
    receiptPath: receiptPath || '',
    // Legacy fields — preserved for the existing admin list + verification flow
    languageId: languageId || subjectId || '',
    languageName: languageName || subjectName || '',
    languagePrice: languagePrice ?? null,
    teacherName: teacherName || '',
    levelId: levelId ? String(levelId).replace(/\./g, '_') : '',
    levelLabel: levelLabel || levelId || '',
    // New Subject → Class snapshot fields (readable even if the class changes later)
    subjectId,
    subjectName,
    classId,
    groupName: groupName || '',
    schedules: Array.isArray(schedules) ? schedules : [],
    status: 'pending',
    verified: false,
    visibility: 'pending',
    submittedAt: serverTimestamp(),
    verifiedAt: null,
    verifiedBy: null,
    updatedAt: serverTimestamp(),
  };

  await setDoc(formRef, formData);
  return formData;
};

/**
 * Get flattened list of language registrations filtered by verification status
 * @param {string} branchId
 * @param {boolean} verifiedState
 * @returns {Promise<Array>}
 */
export const getLanguageRegistrationsByStatus = async (branchId, verifiedState) => {
  if (!branchId) return [];

  let q = query(
    collectionGroup(db, LANGUAGE_FORM_ENTRIES_SUBCOLLECTION),
    where('branchId', '==', branchId),
    orderBy('submittedAt', 'desc')
  );

  if (typeof verifiedState === 'string' && verifiedState) {
    q = query(
      collectionGroup(db, LANGUAGE_FORM_ENTRIES_SUBCOLLECTION),
      where('branchId', '==', branchId),
      where('status', '==', verifiedState),
      orderBy('submittedAt', 'desc')
    );
  } else if (typeof verifiedState === 'boolean') {
    q = query(
      collectionGroup(db, LANGUAGE_FORM_ENTRIES_SUBCOLLECTION),
      where('branchId', '==', branchId),
      where('status', '==', verifiedState ? 'approved' : 'pending'),
      orderBy('submittedAt', 'desc')
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
};

/**
 * Get unverified language registrations (backwards-compatible API)
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export const getUnverifiedLanguageRegistrations = async (branchId) => {
  const entries = await getLanguageRegistrationsByStatus(branchId, 'pending');

  return entries.sort((a, b) => {
    const dateA = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(0);
    const dateB = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(0);
    return dateB - dateA;
  });
};

/**
 * Stream all language registrations for a branch
 * @param {string} branchId
 * @param {(entries: Array) => void} callback
 * @returns {() => void} unsubscribe function
 */
export const streamBranchLanguageRegistrations = (branchId, callback) => {
  if (!branchId) {
    return () => {};
  }

  const q = query(
    collectionGroup(db, LANGUAGE_FORM_ENTRIES_SUBCOLLECTION),
    where('branchId', '==', branchId),
    orderBy('submittedAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    callback(entries);
  });
};

/**
 * Verify language registration by student and level
 * @param {string} branchId
 * @param {string} studentId
 * @param {string} levelId
 * @param {object} adminInfo
 */
export const verifyLanguageRegistration = async (branchId, studentId, formId, adminInfo = {}) => {
  if (!studentId || !formId) throw new Error('studentId and formId are required to verify language form');

  const registrationRef = doc(
    db,
    `branches/${branchId}/languagesForms/${studentId}/${LANGUAGE_FORM_ENTRIES_SUBCOLLECTION}/${formId}`
  );

  const registrationSnap = await getDoc(registrationRef);
  if (!registrationSnap.exists()) {
    throw new Error('Language registration not found');
  }

  const registrationData = registrationSnap.data();
  const verifiedBy = {
    uid: adminInfo.uid || '',
    email: adminInfo.email || '',
    name: adminInfo.name || ''
  };

  // Capacity hard-gate (approved-only). New class-based registrations carry classId.
  if (registrationData.classId) {
    await assertClassNotFull(branchId, registrationData.classId);
  }

  const registeredRef = doc(db, `branches/${branchId}/languagesRegistered/${formId}`);
  const userRef = getBranchDoc(branchId, 'users', studentId);
  const languageSummary = {
    formId,
    languageName: registrationData.languageName || '',
    levelLabel: registrationData.levelLabel || '',
    registeredAt: Date.now(),
    verifiedBy: adminInfo?.name || adminInfo?.email || null
  };

  const batch = writeBatch(db);

  batch.update(registrationRef, {
    status: 'approved',
    verified: true,
    visibility: 'approved',
    verifiedAt: serverTimestamp(),
    verifiedBy,
    // Receipt is no longer needed after approval — drop the references (file
    // is removed from Storage below). Audit info above is preserved.
    receiptUrl: '',
    receiptPath: '',
    updatedAt: serverTimestamp()
  });

  batch.set(registeredRef, {
    ...registrationData,
    formId,
    userId: studentId,  // canonical ownership field (Phase D — studentId param is the Firebase UID)
    branchId,
    status: 'registered',
    receiptUrl: '',
    receiptPath: '',
    registeredAt: serverTimestamp(),
    verifiedAt: serverTimestamp(),
    verifiedBy
  });

  batch.update(userRef, {
    'registrations.language': true,
    'registrations.languages': arrayUnion(languageSummary),
    updatedAt: serverTimestamp()
  });

  // Increment the class enrollment counter atomically with the registration
  // write so the Firestore rule capacity check stays consistent.
  if (registrationData.classId) {
    batch.update(getBranchDoc(branchId, CLASSES_COLLECTION, registrationData.classId), {
      enrollmentCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  // Best-effort receipt cleanup (never throws). Approved payments keep zero
  // long-term storage — spec §5.
  await cleanupPaymentReceipt(registrationData.receiptUrl, registrationData.receiptPath);
};

/**
 * Reject language registration by student and formId
 * @param {string} branchId
 * @param {string} studentId
 * @param {string} formId
 * @param {object} adminInfo
 */
export const rejectLanguageRegistration = async (branchId, studentId, formId, adminInfo = {}) => {
  if (!studentId || !formId) throw new Error('studentId and formId are required to reject language form');

  const registrationRef = doc(
    db,
    `branches/${branchId}/languagesForms/${studentId}/${LANGUAGE_FORM_ENTRIES_SUBCOLLECTION}/${formId}`
  );

  // Capture the receipt reference before we clear it, so we can delete the file.
  let receiptRefs = [];
  try {
    const snap = await getDoc(registrationRef);
    if (snap.exists()) {
      const d = snap.data() || {};
      receiptRefs = [d.receiptUrl, d.receiptPath];
    }
  } catch { /* non-fatal — proceed with rejection regardless */ }

  await updateDoc(registrationRef, {
    status: 'rejected',
    verified: false,
    visibility: 'rejected',
    verifiedAt: null,
    verifiedBy: null,
    rejectionReason: adminInfo?.reason || null,
    // Remove file references from the DB (file deleted from Storage below).
    receiptUrl: '',
    receiptPath: '',
    rejectedAt: serverTimestamp(),
    rejectedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    },
    updatedAt: serverTimestamp()
  });

  // Rejected requests must consume zero long-term storage — spec §4.
  await cleanupPaymentReceipt(...receiptRefs);
};

// ==================== Support Lessons ====================

/**
 * Create a support lesson
 * @param {string} branchId
 * @param {object} lessonData - { name, grade, teacher, timings, subjects, createdBy, studyYear }
 * @param {object} createdBy - { uid, email }
 * 
 * Note: Saves times array to support multiple time slots per lesson.
 * Format: times: [{ day: string, start: string, end: string }]
 */
export const createSupportLesson = async (branchId, lessonData, createdBy) => {
  const lessonsRef = getBranchCollection(branchId, 'supportLessons');
  
  // Normalize timings to times array format
  const times = lessonData.timings || lessonData.times || [];
  const normalizedYear = lessonData.year || lessonData.grade || null;
  const yearMeta = normalizedYear ? getYearById(normalizedYear) : null;
  
  // Derive level from year/grade
  const level = lessonData.level
    || yearMeta?.level?.id
    || (normalizedYear?.startsWith('mid') ? 'middle'
        : normalizedYear?.startsWith('sec') ? 'high'
        : null);
  
  const studyLevelLabel = lessonData.studyLevel || yearMeta?.nameShort || '';
  
  return await addDoc(lessonsRef, {
    name: lessonData.name,
    grade: normalizedYear, // legacy compatibility
    year: normalizedYear,
    studyYear: normalizedYear,
    studyLevel: studyLevelLabel,
    level: level, // 'middle' or 'high' - derived from grade
    teacher: lessonData.teacher,
    times: times, // New format: [{ day: string, start: string, end: string }]
    timings: times, // Keep for backward compatibility
    subjects: lessonData.subjects || [], // e.g. ["Math", "Physics"]
    createdAt: serverTimestamp(),
    createdBy: createdBy || { uid: '', email: '' },
    branchId: branchId
  });
};

/**
 * Update a support lesson
 * @param {string} branchId
 * @param {string} lessonId
 * @param {object} lessonData
 */
export const updateSupportLesson = async (branchId, lessonId, lessonData) => {
  const lessonRef = getBranchDoc(branchId, 'supportLessons', lessonId);
  const normalizedStudyYear = lessonData?.studyYear || lessonData?.year || lessonData?.grade || null;
  await updateDoc(lessonRef, {
    ...lessonData,
    ...(normalizedStudyYear
      ? {
          studyYear: normalizedStudyYear,
          year: lessonData?.year || normalizedStudyYear,
          grade: lessonData?.grade || normalizedStudyYear,
        }
      : {}),
    updatedAt: serverTimestamp()
  });
};

/**
 * Delete a support lesson
 * @param {string} branchId
 * @param {string} lessonId
 */
export const deleteSupportLesson = async (branchId, lessonId) => {
  const lessonRef = getBranchDoc(branchId, 'supportLessons', lessonId);
  await deleteDoc(lessonRef);
};

/**
 * Get all support lessons for a branch
 * @param {string} branchId
 * @param {string} level - Optional: 'high' | 'middle' to filter
 * @param {string} grade - Optional: grade to filter (e.g. "mid1", "sec2")
 * @param {string} subject - Optional: subject to filter
 * @returns {Promise<Array>}
 */
export const getSupportLessons = async (branchId, level = null, grade = null, subject = null) => {
  const lessonsRef = getBranchCollection(branchId, 'supportLessons');
  let q = query(lessonsRef, orderBy('createdAt', 'desc'));
  
  // Apply filters if provided
  if (level) {
    q = query(lessonsRef, where('level', '==', level), orderBy('createdAt', 'desc'));
  }
  if (grade) {
    q = query(lessonsRef, where('grade', '==', grade), orderBy('createdAt', 'desc'));
  }
  
  const snapshot = await getDocs(q);
  let lessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Filter by subject if provided (subjects is an array)
  if (subject) {
    lessons = lessons.filter(lesson => 
      lesson.subjects && lesson.subjects.includes(subject)
    );
  }
  
  return lessons;
};

/**
 * Create a yearly verification request for support lessons
 * @param {string} branchId
 * @param {object} verificationData - { userId, paymentProof }
 */
export const createYearlyVerification = async (branchId, verificationData) => {
  const registrationsRef = getBranchCollection(branchId, 'registrations');
  return await addDoc(registrationsRef, {
    ...verificationData,
    type: 'yearly_fee',
    verified: false,
    createdAt: serverTimestamp(),
  });
};

/**
 * Get unverified yearly verifications
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export const getUnverifiedYearlyVerifications = async (branchId) => {
  const registrationsRef = getBranchCollection(branchId, 'registrations');
  const q = query(
    registrationsRef,
    where('type', '==', 'yearly_fee'),
    where('verified', '==', false)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Verify yearly fee payment
 * @param {string} branchId
 * @param {string} registrationId
 * @param {string} userId
 */
export const verifyYearlyFee = async (branchId, registrationId, userId, adminInfo = {}) => {
  const registrationRef = getBranchDoc(branchId, 'registrations', registrationId);
  const registrationSnap = await getDoc(registrationRef);

  if (!registrationSnap.exists()) {
    throw new Error('Yearly fee registration not found');
  }

  const registrationData = registrationSnap.data();
  const verificationTimestamp = serverTimestamp();

  await updateDoc(registrationRef, {
    verified: true,
    verifiedAt: verificationTimestamp,
    verifiedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    }
  });

  await saveAnnualFeeRegisteredEntry({
    branchId,
    userId,
    entryId: registrationId,
    data: registrationData,
    verificationTimestamp,
    adminInfo
  });
  
  // Update user's yearlyFeePaid status
  await updateYearlyFeeStatus(branchId, userId, true);
  if (userId) {
    try {
      const userRef = getBranchDoc(branchId, 'users', userId);
      await updateDoc(userRef, {
        'registrations.annualFee': registrationData?.year || registrationData?.level || new Date().getFullYear(),
        'registrations.annualFeeHistory': arrayUnion({
          registrationId,
          year: registrationData?.year || registrationData?.level || null,
          registeredAt: Date.now()
        })
      });
    } catch (error) {
      console.error('Failed to update user annual fee registration:', error);
    }
  }
};

// ==================== Annual Payments ====================

/**
 * Create an annual payment document
 * @param {string} branchId
 * @param {object} paymentData - Complete payment document structure
 * @returns {Promise<DocumentReference>}
 */
export const createAnnualPayment = async (branchId, paymentData) => {
  // Save to branch-scoped annualPayments (single source of truth).
  // The root-level annualFees collection has no security rule and is not used.
  const paymentsRef = getBranchCollection(branchId, 'annualPayments');
  const docRef = await addDoc(paymentsRef, {
    ...paymentData,
    status: 'pending',
    createdAt: serverTimestamp(),
    verifiedAt: null,
    verifiedBy: null,
    nextPaymentDate: null,
  });
  return docRef;
};

/**
 * Get all annual payments for a branch
 * @param {string} branchId
 * @param {string} status - Optional: 'pending' | 'verified' | 'rejected'
 * @returns {Promise<Array>}
 */
export const getAnnualPayments = async (branchId, status = null) => {
  const paymentsRef = getBranchCollection(branchId, 'annualPayments');
  let q = query(paymentsRef, orderBy('createdAt', 'desc'));
  
  if (status) {
    q = query(paymentsRef, where('status', '==', status), orderBy('createdAt', 'desc'));
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Get annual payment by ID
 * @param {string} branchId
 * @param {string} paymentId
 * @returns {Promise<DocumentSnapshot>}
 */
export const getAnnualPayment = async (branchId, paymentId) => {
  const paymentRef = getBranchDoc(branchId, 'annualPayments', paymentId);
  return await getDoc(paymentRef);
};

/**
 * Verify an annual payment
 * @param {string} branchId
 * @param {string} paymentId
 * @param {object} adminInfo - { uid: string, email: string }
 * @returns {Promise<void>}
 */
const saveAnnualFeeRegisteredEntry = async ({ branchId, userId, entryId, data, verificationTimestamp, adminInfo = {} }) => {
  if (!branchId || !entryId) return;

  const registeredRef = doc(db, `branches/${branchId}/annualFeeRegistered/${entryId}`);
  await setDoc(registeredRef, {
    ...data,
    branchId,
    userId,
    registrationId: entryId,
    status: 'registered',
    registeredAt: verificationTimestamp,
    verifiedAt: verificationTimestamp,
    verifiedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    }
  });
};

const buildAnnualFeeSupportEnrollmentId = (branchId, studentId, subjectId, yearId) =>
  ['annualFee', branchId || 'noBranch', studentId || 'noStudent', subjectId || 'noSubject', yearId || 'unknown'].join('_');

export const verifyAnnualPayment = async (branchId, paymentId, adminInfo) => {
  // All writes for annual payment verification — including the Admin-SDK-only
  // supportLessonRegistrations collection — are handled atomically by the backend.
  await apiCall('/api/admin/verify-annual-payment', {
    method: 'POST',
    body: JSON.stringify({ branchId, paymentId }),
  });
};

/**
 * Reject an annual payment
 * @param {string} branchId
 * @param {string} paymentId
 * @param {string} notes - Optional rejection notes
 * @returns {Promise<void>}
 */
export const rejectAnnualPayment = async (branchId, paymentId, notes = null) => {
  // Atomic rejection via backend (Admin SDK required for supportLessonRegistrations writes).
  await apiCall('/api/admin/reject-annual-payment', {
    method: 'POST',
    body: JSON.stringify({ branchId, paymentId, notes: notes || null }),
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

export const listenSupportLessonSubjectRegistration = (branchId, studentId, subjectId, yearId, callback) => {
  if (!branchId || !studentId || !subjectId || !yearId || typeof callback !== 'function') {
    return () => {};
  }

  const summaryRef = getSupportLessonSummaryRef(branchId, studentId, subjectId, yearId);
  return onSnapshot(summaryRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    callback({ id: snapshot.id, ...snapshot.data() });
  });
};

const SUPPORT_LESSON_REGISTRATIONS_COLLECTION = 'supportLessonRegistrations';
const SUPPORT_LESSON_ENROLLMENTS_COLLECTION = 'supportLessonEnrollments';
const BRANCH_REGISTRATIONS_COLLECTION = 'registrations';

const getSupportRegistrationDoc = (registrationId) =>
  doc(db, `${SUPPORT_LESSON_REGISTRATIONS_COLLECTION}/${registrationId}`);

const supportRegistrationCollection = () =>
  collection(db, SUPPORT_LESSON_REGISTRATIONS_COLLECTION);

const supportLessonRegistrationSummaryDoc = (branchId, registrationId) =>
  getBranchDoc(branchId, BRANCH_REGISTRATIONS_COLLECTION, registrationId);

const supportLessonRegistrationsSummaryCollection = (branchId) =>
  getBranchCollection(branchId, BRANCH_REGISTRATIONS_COLLECTION);

const SUPPORT_REGISTRATION_TYPE = 'supportLesson';

const buildSupportLessonRegistrationId = (studentId, subjectId, yearId = 'unknown') =>
  [studentId, subjectId, yearId || 'unknown'].join('_');

const normalizeRegistrationStatus = (status) => String(status || '').toLowerCase();
const isBlockingSupportRegistrationStatus = (status) => {
  const normalized = normalizeRegistrationStatus(status);
  return normalized === 'pending' || normalized === 'verified';
};

const getSupportLessonSummaryRef = (branchId, studentId, subjectId, yearId = 'unknown') => {
  const summaryId = buildSupportLessonRegistrationId(studentId, subjectId, yearId);
  return supportLessonRegistrationSummaryDoc(branchId, summaryId);
};

export const ensureSupportLessonRegistrationRecord = async ({
  branchId,
  studentId,
  subjectId,
  subjectName,
  yearId,
  yearLabel = null,
  metadata = {}
}) => {
  if (!branchId) throw new Error('branchId is required to create support lesson registration');
  if (!studentId) throw new Error('studentId is required to create support lesson registration');
  if (!subjectId) throw new Error('subjectId is required to create support lesson registration');

  const normalizedYearId = yearId || metadata.year || 'unknown';
  const summaryRef = getSupportLessonSummaryRef(branchId, studentId, subjectId, normalizedYearId);
  const existingSnap = await getDoc(summaryRef);

  if (existingSnap.exists()) {
    const existingData = existingSnap.data() || {};
    if (isBlockingSupportRegistrationStatus(existingData.status)) {
      const error = new Error('support-lesson-registration-exists');
      error.code = 'support-lesson-registration-exists';
      error.data = existingData;
      throw error;
    }
    // Non-blocking existing doc: return as-is; students cannot update registrations
    return { id: summaryRef.id, ...existingData };
  }

  const timestamp = serverTimestamp();
  const payload = {
    branchId,
    userId: studentId,  // canonical ownership field (Phase D — studentId param is the Firebase UID)
    type: SUPPORT_REGISTRATION_TYPE,
    subjectId,
    subjectName: subjectName || metadata.subjectName || '',
    year: normalizedYearId,
    yearLabel: yearLabel || metadata.yearLabel || null,
    status: 'pending',
    feeCovered: metadata.feeCovered ?? false,
    feeRequired: metadata.feeRequired ?? true,
    feePaid: metadata.feePaid ?? false,
    source: metadata.source || 'annualFee',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...metadata.extraFields
  };

  await setDoc(summaryRef, payload, { merge: false });
  return { id: summaryRef.id, ...payload };
};

export const listenStudentSupportLessonRegistrations = (branchId, studentId, callback) => {
  if (!branchId || !studentId || typeof callback !== 'function') {
    return () => {};
  }

  const regsRef = supportLessonRegistrationsSummaryCollection(branchId);
  const q = query(
    regsRef,
    where('type', '==', SUPPORT_REGISTRATION_TYPE),
    where('userId', '==', studentId)   // Phase C: canonical field; backfill confirmed 0 missing
  );

  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    callback(entries);
  });
};

export async function markStudentSupportLessonsFeeStatus(branchId, studentId, feePaid = true) {
  if (!branchId || !studentId) return;

  const regsRef = supportLessonRegistrationsSummaryCollection(branchId);
  const q = query(
    regsRef,
    where('type', '==', SUPPORT_REGISTRATION_TYPE),
    where('userId', '==', studentId)   // Phase C: canonical field; backfill confirmed 0 missing
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, {
      feePaid,
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
}

/**
 * Get unverified support lesson registrations
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export const getUnverifiedSupportLessonRegistrations = async (branchId) => {
  if (!branchId) return [];
  const q = query(
    supportRegistrationCollection(),
    where('branchId', '==', branchId),
    where('status', '==', 'pending')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getPendingAnnualFeeSupportLessonRegistrations = async (branchId) => {
  if (!branchId) return [];

  const registrationsRef = getBranchCollection(branchId, 'registrations');
  const q = query(
    registrationsRef,
    where('type', '==', 'supportLesson'),
    where('source', '==', 'annualFee'),
    where('status', '==', 'pending')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Get monthly support-lesson registrations by status (pending | needs_correction
 * | verified | rejected). Reuses the existing (branchId, status) index.
 */
export const getSupportLessonRegistrationsByStatus = async (branchId, status) => {
  if (!branchId || !status) return [];
  const q = query(
    supportRegistrationCollection(),
    where('branchId', '==', branchId),
    where('status', '==', status)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Get annual-fee support-lesson registration summaries by status.
 * Reuses the existing (type, source, status) index.
 */
export const getAnnualFeeSupportRegistrationsByStatus = async (branchId, status) => {
  if (!branchId || !status) return [];
  const registrationsRef = getBranchCollection(branchId, 'registrations');
  const q = query(
    registrationsRef,
    where('type', '==', 'supportLesson'),
    where('source', '==', 'annualFee'),
    where('status', '==', status)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Get training registrations by their `verified` boolean.
 * Reuses the existing collectionGroup (branchId, verified) index so no new index
 * is required. Callers segment further by `status` client-side.
 */
export const getTrainingRegistrationsByVerified = async (branchId, verifiedState) => {
  if (!branchId) return [];
  const q = query(
    collectionGroup(db, TRAINING_FORM_ENTRIES_SUBCOLLECTION),
    where('branchId', '==', branchId),
    where('verified', '==', verifiedState)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const parentUserId = docSnap.ref.parent?.parent?.id || null;
    return {
      id: docSnap.id,
      formId: docSnap.id,
      studentId: docSnap.data().userId || parentUserId,
      parentUserId,
      ...docSnap.data(),
    };
  });
};

// ── Payment correction workflow (needs_correction status) ─────────────────────
// Both routes go through the Express backend (Admin SDK): Firestore rules block
// student writes to every payment doc, and admin annual/support writes must use
// the Admin SDK. See backend/controllers/correctionController.js.

/**
 * Admin: ask a student to correct their payment proof.
 * Sets status='needs_correction' + correction metadata WITHOUT rejecting/deleting.
 */
export const requestPaymentCorrection = async ({
  branchId, type, source = null, studentId = null, formId = null,
  entryId = null, registrationId = null, paymentId = null, reason,
}) => {
  return apiCall('/api/corrections/request', {
    method: 'POST',
    body: JSON.stringify({
      branchId, type, source, studentId, formId, entryId, registrationId, paymentId, reason,
    }),
  });
};

/**
 * Student (owner): resubmit a corrected proof. Returns the payment to 'pending'
 * and archives the previous proof URL. correctionCount is preserved server-side.
 */
export const resubmitPaymentProof = async ({
  branchId, type, source = null, studentId = null, formId = null,
  entryId = null, registrationId = null, paymentId = null, newProofUrl,
}) => {
  return apiCall('/api/corrections/resubmit', {
    method: 'POST',
    body: JSON.stringify({
      branchId, type, source, studentId, formId, entryId, registrationId, paymentId, newProofUrl,
    }),
  });
};

/**
 * Verify support lesson registration
 * @param {string} branchId
 * @param {string} registrationId
 */
export const verifySupportLessonRegistration = async (registrationId, adminInfo = {}) => {
  if (!registrationId) return;
  // Firestore rule blocks all client writes to supportLessonRegistrations.
  // Route through the backend (Admin SDK) so the update succeeds.
  await apiCall(`/api/support-lesson-registrations/${registrationId}/verify`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
};

export const rejectSupportLessonRegistration = async (registrationId, notes = null) => {
  if (!registrationId) return;
  // Firestore rule blocks all client writes to supportLessonRegistrations.
  // Route through the backend (Admin SDK).
  await apiCall(`/api/support-lesson-registrations/${registrationId}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ notes: notes || null }),
  });
};

// ==================== Trainings ====================

/**
 * Create a new training course
 * @param {string} branchId
 * @param {object} trainingData - { title, description, price, ... }
 * @param {object} adminInfo - optional metadata about the admin creating the course
 */
export const createTraining = async (branchId, trainingData, adminInfo = {}) => {
  const trainingsRef = getBranchCollection(branchId, 'trainings');
  const normalizedActive = typeof trainingData?.active === 'boolean' ? trainingData.active : true;
  return await addDoc(trainingsRef, {
    ...trainingData,
    active: normalizedActive,
    branchId,
    createdBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/**
 * Set a training as active (visible on the website)
 * @param {string} branchId
 * @param {string} trainingId
 * @param {object} adminInfo
 */
export const approvePendingTraining = async (branchId, trainingId, adminInfo = {}) => {
  const trainingRef = doc(db, `branches/${branchId}/trainings/${trainingId}`);
  await updateDoc(trainingRef, {
    active: true,
    updatedAt: serverTimestamp(),
    updatedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    }
  });
};

/**
 * Delete a training
 * @param {string} branchId
 * @param {string} trainingId
 */
export const deletePendingTraining = async (branchId, trainingId) => {
  const trainingRef = doc(db, `branches/${branchId}/trainings/${trainingId}`);
  await deleteDoc(trainingRef);
};

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
 * Create a training request (when no course is available)
 * @param {string} branchId
 * @param {object} requestData - { userId, trainingId, message }
 */
export const createTrainingRequest = async (branchId, requestData) => {
  const registrationsRef = getBranchCollection(branchId, 'registrations');
  return await addDoc(registrationsRef, {
    ...requestData,
    type: 'training_request',
    status: 'pending',
    createdAt: serverTimestamp(),
  });
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
 * Get all training requests (regardless of status)
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export const getAllTrainingRequests = async (branchId) => {
  const registrationsRef = getBranchCollection(branchId, 'registrations');
  const q = query(
    registrationsRef,
    where('type', '==', 'training_request'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Update training request status
 * @param {string} branchId
 * @param {string} requestId
 * @param {string} status - 'pending' | 'reviewed' | 'completed' | 'accepted' | 'rejected'
 */
export const updateTrainingRequestStatus = async (branchId, requestId, status) => {
  const requestRef = getBranchDoc(branchId, 'registrations', requestId);
  await updateDoc(requestRef, { 
    status,
    updatedAt: serverTimestamp()
  });
};

/**
 * Create a training registration
 * @param {string} branchId
 * @param {object} registrationData - { userId, trainingId, paymentProof }
 */
export const createTrainingRegistration = async (branchId, registrationData) => {
  const {
    userId,
    userEmail = '',
    studentName = '',
    studentPhone = '',
    trainingId,
    trainingTitle,
    trainingName,
    trainingPrice = null,
    paymentMethod = '',
    paymentProof = '',
    paymentProofPath = '',
    trainingDescription = '',
    paymentConfirmed = false,
    status = 'pending',
    // New Subject → Class snapshot fields
    subjectId = '',
    subjectName = '',
    classId = '',
    groupName = '',
    schedules,
  } = registrationData;

  if (!branchId) throw new Error('branchId is required for training registration');
  if (!userId) throw new Error('userId is required for training registration');
  if (!trainingId) throw new Error('trainingId is required for training registration');

  const formContainerRef = getBranchDoc(branchId, TRAINING_FORM_CONTAINERS_COLLECTION, userId);
  const containerSnap = await getDoc(formContainerRef);
  const timestampFields = containerSnap.exists()
    ? { updatedAt: serverTimestamp() }
    : { createdAt: serverTimestamp(), updatedAt: serverTimestamp() };

  await setDoc(formContainerRef, {
    userId,
    branchId,
    studentEmail: userEmail || '',
    studentName: studentName || '',
    lastSubmittedAt: serverTimestamp(),
    ...timestampFields
  }, { merge: true });

  const entriesRef = collection(formContainerRef, TRAINING_FORM_ENTRIES_SUBCOLLECTION);

  const existingEntriesSnap = await getDocs(
    query(entriesRef, where('trainingId', '==', trainingId))
  );

  const hasDuplicate = existingEntriesSnap.docs.some((docSnap) => {
    const data = docSnap.data() || {};
    const normalizedStatus = String(data.status || '').toLowerCase();
    const lockedStatuses = ['pending', 'verified', 'approved', 'registered'];
    return data.verified === true || lockedStatuses.includes(normalizedStatus);
  });

  if (hasDuplicate) {
    throw new Error('user-already-registered-training');
  }

  const formId = `${trainingId}-${Date.now()}`;
  const entryRef = doc(entriesRef, formId);
  const entryId = entryRef.id;

  const entryPayload = {
    entryId,
    formId,
    branchId,
    userId,
    studentName,
    studentPhone,
    userEmail,
    trainingId,
    selectedTrainingId: trainingId,
    trainingTitle: trainingTitle || trainingName || subjectName || '',
    trainingName: trainingName || trainingTitle || subjectName || '',
    trainingPrice,
    trainingDescription,
    // New Subject → Class snapshot fields (readable even if the class changes later)
    subjectId: subjectId || trainingId || '',
    subjectName: subjectName || trainingTitle || trainingName || '',
    classId: classId || trainingId || '',
    groupName: groupName || '',
    schedules: Array.isArray(schedules) ? schedules : [],
    paymentMethod,
    paymentProof,
    paymentProofPath,
    paymentConfirmed,
    receiptUrl: paymentProof,
    status: status || 'pending',
    verified: false,
    submittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    timestamp: serverTimestamp(),
    verifiedAt: null,
    verifiedBy: null,
    birthDate: registrationData.birthDate || null,
    birthPlace: registrationData.birthPlace || '',
  };

  await setDoc(entryRef, entryPayload);

  return entryPayload;
};

/**
 * Get unverified training registrations
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export const getUnverifiedTrainingRegistrations = async (branchId) => {
  if (!branchId) return [];

  const q = query(
    collectionGroup(db, TRAINING_FORM_ENTRIES_SUBCOLLECTION),
    where('branchId', '==', branchId),
    where('verified', '==', false)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((docSnap) => {
      const parentUserId = docSnap.ref.parent?.parent?.id || null;
      return {
        id: docSnap.id,
        formId: docSnap.id,
        studentId: docSnap.data().userId || parentUserId,
        parentUserId,
        ...docSnap.data(),
      };
    })
    .filter((entry) => {
      const normalizedStatus = String(entry.status || '').toLowerCase();
      return normalizedStatus !== 'rejected';
    })
    .sort((a, b) => {
      const dateA = a.submittedAt?.toDate ? a.submittedAt.toDate() : 0;
      const dateB = b.submittedAt?.toDate ? b.submittedAt.toDate() : 0;
      return dateB - dateA;
    });
};

/**
 * Verify training registration
 * @param {string} branchId
 * @param {string} registrationId
 */
export const verifyTrainingRegistration = async (branchId, studentId, entryId, adminInfo = {}) => {
  if (!branchId || !studentId || !entryId) {
    throw new Error('branchId, studentId and entryId are required to verify training registration');
  }

  const registrationRef = doc(
    db,
    `branches/${branchId}/${TRAINING_FORM_CONTAINERS_COLLECTION}/${studentId}/${TRAINING_FORM_ENTRIES_SUBCOLLECTION}/${entryId}`
  );
  const registrationSnap = await getDoc(registrationRef);

  if (!registrationSnap.exists()) {
    throw new Error('Training registration not found');
  }

  const registrationData = registrationSnap.data();

  let trainingMeta = null;
  if (registrationData.trainingId) {
    try {
      const trainingSnap = await getDoc(getBranchDoc(branchId, 'trainings', registrationData.trainingId));
      if (trainingSnap.exists()) {
        trainingMeta = trainingSnap.data();
      }
    } catch (error) {
      console.warn('Unable to load training meta for registration copy:', error);
    }
  }

  let userProfile = null;
  if (registrationData.userId) {
    try {
      const userSnap = await getUser(branchId, registrationData.userId);
      if (userSnap.exists()) {
        userProfile = userSnap.data();
      }
    } catch (error) {
      console.warn('Unable to load user profile for training registration:', error);
    }
  }

  const trainingTitle = registrationData.trainingTitle || trainingMeta?.title || '';
  const trainingPrice = registrationData.trainingPrice || trainingMeta?.price || null;
  const summaryRegisteredAt = Date.now();
  const verifiedBy = {
    uid: adminInfo.uid || '',
    email: adminInfo.email || '',
    name: adminInfo.name || ''
  };

  // Capacity hard-gate (approved-only). New class-based registrations carry classId.
  if (registrationData.classId) {
    await assertClassNotFull(branchId, registrationData.classId);
  }

  const registeredRef = doc(db, `branches/${branchId}/trainingsRegistered/${entryId}`);
  const batch = writeBatch(db);

  batch.update(registrationRef, {
    verified: true,
    status: 'approved',
    // Receipt no longer needed after approval — clear refs (file removed below).
    paymentProof: '',
    paymentProofPath: '',
    receiptUrl: '',
    verifiedAt: serverTimestamp(),
    verifiedBy
  });

  batch.set(registeredRef, {
    ...registrationData,
    registrationId: entryId,
    formId: entryId,
    branchId,
    trainingTitle,
    name: trainingTitle,
    trainingPrice,
    studentName: registrationData.studentName || userProfile?.name || userProfile?.fullName || '',
    studentPhone: registrationData.studentPhone || userProfile?.phoneNumber || '',
    status: 'approved',
    paymentProof: '',
    paymentProofPath: '',
    receiptUrl: '',
    registeredAt: serverTimestamp(),
    verifiedAt: serverTimestamp(),
    verifiedBy
  });

  if (registrationData.userId) {
    const userRef = getBranchDoc(branchId, 'users', registrationData.userId);
    batch.update(userRef, {
      'registrations.trainings': arrayUnion({
        registrationId: entryId,
        formId: entryId,
        trainingId: registrationData.trainingId || entryId,
        name: trainingTitle,
        title: trainingTitle,
        price: trainingMeta?.price || registrationData.trainingPrice || null,
        status: 'approved',
        registeredAt: summaryRegisteredAt,
        verifiedAt: summaryRegisteredAt
      }),
      updatedAt: serverTimestamp()
    });
  }

  // Increment the class enrollment counter atomically with the registration
  // write so the Firestore rule capacity check stays consistent.
  if (registrationData.classId) {
    batch.update(getBranchDoc(branchId, CLASSES_COLLECTION, registrationData.classId), {
      enrollmentCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  // Approved payments keep zero long-term storage — spec §5.
  await cleanupPaymentReceipt(
    registrationData.paymentProof,
    registrationData.paymentProofPath,
    registrationData.receiptUrl
  );
};

export const rejectTrainingRegistration = async (branchId, studentId, entryId, adminInfo = {}) => {
  if (!branchId || !studentId || !entryId) {
    throw new Error('branchId, studentId and entryId are required to reject training registration');
  }

  const registrationRef = doc(
    db,
    `branches/${branchId}/${TRAINING_FORM_CONTAINERS_COLLECTION}/${studentId}/${TRAINING_FORM_ENTRIES_SUBCOLLECTION}/${entryId}`
  );

  // Capture the receipt reference before clearing it, so we can delete the file.
  let receiptRefs = [];
  try {
    const snap = await getDoc(registrationRef);
    if (snap.exists()) {
      const d = snap.data() || {};
      receiptRefs = [d.paymentProof, d.paymentProofPath, d.receiptUrl];
    }
  } catch { /* non-fatal — proceed with rejection regardless */ }

  await updateDoc(registrationRef, {
    status: 'rejected',
    verified: false,
    verifiedAt: null,
    rejectionReason: adminInfo.reason || '',
    // Remove file references from the DB (file deleted from Storage below).
    paymentProof: '',
    paymentProofPath: '',
    receiptUrl: '',
    updatedAt: serverTimestamp(),
    reviewedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    }
  });

  // Rejected training requests must consume zero long-term storage — spec §4.
  await cleanupPaymentReceipt(...receiptRefs);
};

export const streamRegisteredLanguages = (branchId, callback) => {
  if (!branchId) return () => {};

  const registeredRef = getBranchCollection(branchId, 'languagesRegistered');
  const q = query(registeredRef, orderBy('registeredAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    callback(entries);
  });
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

export const streamRegisteredTrainings = (branchId, callback) => {
  if (!branchId) return () => {};

  const registeredRef = getBranchCollection(branchId, 'trainingsRegistered');
  const q = query(registeredRef, orderBy('registeredAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    callback(entries);
  });
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

export const adminRemoveTrainingRegistration = async (branchId, docId) => {
  if (!branchId || !docId) throw new Error('branchId and docId are required');
  const ref = doc(getBranchCollection(branchId, 'trainingsRegistered'), docId);
  let classId = null;
  try { const s = await getDoc(ref); if (s.exists()) classId = s.data()?.classId || null; } catch { /* ignore */ }
  await deleteDoc(ref);
  if (classId) await adjustClassEnrollment(branchId, classId, -1); // free the seat
};

export const adminEditTrainingRegistration = async (branchId, docId, updates) => {
  if (!branchId || !docId) throw new Error('branchId and docId are required');
  const safe = { ...updates };
  delete safe.branchId;
  delete safe.registrationId;
  safe.updatedAt = serverTimestamp();
  await updateDoc(doc(getBranchCollection(branchId, 'trainingsRegistered'), docId), safe);
};

export const adminAddTrainingRegistration = async (branchId, data) => {
  if (!branchId) throw new Error('branchId is required');
  if (!data.userId) throw new Error('userId is required for training registration');

  // Duplicate guard: same student + training in same branch
  if (data.trainingId) {
    const dupQ = query(
      getBranchCollection(branchId, 'trainingsRegistered'),
      where('userId',     '==', data.userId),
      where('trainingId', '==', data.trainingId)
    );
    const dupSnap = await getDocs(dupQ);
    if (!dupSnap.empty) {
      throw new Error('الطالب مسجل مسبقاً في هذه الدورة التكوينية.');
    }
  }

  // Capacity hard-gate — admin-add writes an approved (seat-occupying) registration.
  if (data.classId) await assertClassNotFull(branchId, data.classId);

  const ref = await addDoc(getBranchCollection(branchId, 'trainingsRegistered'), {
    ...data,
    userId: data.userId,  // canonical ownership field (Phase D — studentId removed)
    branchId,
    registeredAt: serverTimestamp(),
    verifiedAt:   serverTimestamp(),
    source:       'admin',
  });
  if (data.classId) await adjustClassEnrollment(branchId, data.classId, 1);
  return { id: ref.id };
};

// ---------------------------------------------------------------------------
// Admin CRUD — languagesRegistered
// ---------------------------------------------------------------------------

export const adminRemoveLanguageRegistration = async (branchId, docId) => {
  if (!branchId || !docId) throw new Error('branchId and docId are required');
  const ref = doc(getBranchCollection(branchId, 'languagesRegistered'), docId);
  let classId = null;
  try { const s = await getDoc(ref); if (s.exists()) classId = s.data()?.classId || null; } catch { /* ignore */ }
  await deleteDoc(ref);
  if (classId) await adjustClassEnrollment(branchId, classId, -1); // free the seat
};

export const adminEditLanguageRegistration = async (branchId, docId, updates) => {
  if (!branchId || !docId) throw new Error('branchId and docId are required');
  const safe = { ...updates };
  delete safe.branchId;
  safe.updatedAt = serverTimestamp();
  await updateDoc(doc(getBranchCollection(branchId, 'languagesRegistered'), docId), safe);
};

export const adminAddLanguageRegistration = async (branchId, data) => {
  if (!branchId) throw new Error('branchId is required');
  if (!data.userId) throw new Error('userId is required for language registration');

  // Duplicate guard: same student + language + level in same branch
  if (data.languageId && data.levelId) {
    const dupQ = query(
      getBranchCollection(branchId, 'languagesRegistered'),
      where('userId',     '==', data.userId),
      where('languageId', '==', data.languageId),
      where('levelId',    '==', data.levelId)
    );
    const dupSnap = await getDocs(dupQ);
    if (!dupSnap.empty) {
      throw new Error('الطالب مسجل مسبقاً في هذا المستوى من هذه اللغة.');
    }
  }

  // Capacity hard-gate — admin-add writes an approved (seat-occupying) registration.
  if (data.classId) await assertClassNotFull(branchId, data.classId);

  const ref = await addDoc(getBranchCollection(branchId, 'languagesRegistered'), {
    ...data,
    userId: data.userId,  // canonical ownership field (Phase D — studentId removed)
    branchId,
    registeredAt: serverTimestamp(),
    verifiedAt:   serverTimestamp(),
    source:       'admin',
  });
  if (data.classId) await adjustClassEnrollment(branchId, data.classId, 1);
  return { id: ref.id };
};

export const streamSupportLessonRegistrations = (branchId, callback) => {
  if (!branchId) return () => {};

  const q = query(
    supportRegistrationCollection(),
    where('branchId', '==', branchId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    callback(entries);
  });
};

// ==================== Meta Information ====================

/**
 * Get branch meta information
 * @param {string} branchId
 * @returns {Promise<object>}
 */
export const getBranchMeta = async (branchId) => {
  const metaRef = getBranchDoc(branchId, 'meta', 'info');
  const snapshot = await getDoc(metaRef);
  return snapshot.exists() ? snapshot.data() : null;
};

/**
 * Check if email is admin for a branch
 * @param {string} branchId
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export const isAdminForBranch = async (branchId, email) => {
  const meta = await getBranchMeta(branchId);
  if (!meta || !meta.adminEmails) return false;
  return meta.adminEmails.map(e => e.toLowerCase()).includes(email.toLowerCase());
};

/**
 * Create or update branch meta
 * @param {string} branchId
 * @param {object} metaData - { branchName, adminEmails }
 */
export const setBranchMeta = async (branchId, metaData) => {
  const metaRef = getBranchDoc(branchId, 'meta', 'info');
  await setDoc(metaRef, metaData, { merge: true });
};

// ==================== Annual Fee Status ====================

/**
 * Get annual fee status for a user
 * @param {string} userId - The user ID to check
 * @returns {Promise<{paid: boolean, date: Date}>} - Object with payment status and date
 */
export const getAnnualFeeStatus = async (userId) => {
  try {
    const feeDoc = await getDoc(doc(db, 'annualFees', userId));
    if (feeDoc.exists()) {
      const data = feeDoc.data();
      return {
        paid: data.paid === true,
        date: data.paidAt?.toDate?.() || null,
        status: data.paid === true ? 'verified' : 'pending'
      };
    }
    return { paid: false, date: null, status: 'unpaid' };
  } catch (error) {
    console.error('Error getting annual fee status:', error);
    return { paid: false, date: null, status: 'error' };
  }
};

// ==================== Utility Functions ====================

/**
 * Get all pending verifications across all types
 * @param {string} branchId
 * @returns {Promise<object>} - Object with arrays for each type
 */
export const getAllPendingVerifications = async (branchId) => {
  const [
    users,
    languageRegs,
    yearlyVerifications,
    supportLessonRegs,
    trainingReqs,
    trainingRegs
  ] = await Promise.all([
    getUnverifiedUsers(branchId),
    getUnverifiedLanguageRegistrations(branchId),
    getUnverifiedYearlyVerifications(branchId),
    getUnverifiedSupportLessonRegistrations(branchId),
    getPendingTrainingRequests(branchId),
    getUnverifiedTrainingRegistrations(branchId)
  ]);

  return {
    users,
    languageRegistrations: languageRegs,
    yearlyVerifications,
    supportLessonRegistrations: supportLessonRegs,
    trainingRequests: trainingReqs,
    trainingRegistrations: trainingRegs
  };
};

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

/**
 * Get all contact messages for a branch
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export const getContactMessages = async (branchId) => {
  const messagesRef = getBranchCollection(branchId, 'contactMessages');
  const q = query(messagesRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Mark contact message as read
 * @param {string} branchId
 * @param {string} messageId
 */
export const markContactMessageRead = async (branchId, messageId) => {
  const messageRef = getBranchDoc(branchId, 'contactMessages', messageId);
  await updateDoc(messageRef, { read: true });
};

// ==================== Rules ====================

/**
 * Create or update a rule
 * @param {string} branchId
 * @param {string} ruleId
 * @param {object} ruleData - { title, content }
 */
export const setRule = async (branchId, ruleId, ruleData) => {
  const ruleRef = getBranchDoc(branchId, 'rules', ruleId);
  await setDoc(ruleRef, {
    ...ruleData,
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

/**
 * Get a rule
 * @param {string} branchId
 * @param {string} ruleId
 * @returns {Promise<DocumentSnapshot>}
 */
export const getRule = async (branchId, ruleId) => {
  const ruleRef = getBranchDoc(branchId, 'rules', ruleId);
  return await getDoc(ruleRef);
};

/**
 * Get all rules for a branch
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export const getRules = async (branchId) => {
  const rulesRef = getBranchCollection(branchId, 'rules');
  const snapshot = await getDocs(rulesRef);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Delete a rule
 * @param {string} branchId
 * @param {string} ruleId
 */
export const deleteRule = async (branchId, ruleId) => {
  const ruleRef = getBranchDoc(branchId, 'rules', ruleId);
  await deleteDoc(ruleRef);
};

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
 * Admin: manually approve annual fee for a student who paid physically at school.
 * Creates a verified annualPayments document and updates the user profile.
 */
export const adminApproveAnnualFeeManually = async (branchId, userId, adminInfo = {}, studentMeta = {}) => {
  if (!branchId || !userId) throw new Error('branchId and userId are required');

  const academicYear = studentMeta.academicYear || null;
  const studyYear = academicYear || null;
  const schoolLevel = studyYear
    ? (studyYear.startsWith('mid') ? 'middle' : studyYear.startsWith('sec') ? 'high' : null)
    : null;

  const verificationTimestamp = serverTimestamp();

  const paymentsRef = getBranchCollection(branchId, 'annualPayments');
  const paymentRef = await addDoc(paymentsRef, {
    userId,
    studentName:  studentMeta.name  || '',
    studentPhone: studentMeta.phone || '',
    academicYear: academicYear || null,
    status:        'verified',
    paymentMethod: 'physical',
    source:        'admin',
    notes:         adminInfo.notes || 'تم الدفع يدوياً في المدرسة',
    createdAt:     verificationTimestamp,
    verifiedAt:    verificationTimestamp,
    verifiedBy: {
      uid:   adminInfo.uid   || '',
      email: adminInfo.email || '',
      name:  adminInfo.name  || '',
    },
  });

  const userRef = getBranchDoc(branchId, 'users', userId);
  await updateDoc(userRef, {
    yearlyFeePaid:    true,
    paymentVerified:  true,
    updatedAt:        serverTimestamp(),
    ...(studyYear   ? { studyYear }   : {}),
    ...(schoolLevel ? { schoolLevel } : {}),
    'registrations.annualFee': new Date().getFullYear(),
    'registrations.annualFeeHistory': arrayUnion({
      registrationId: paymentRef.id,
      year: new Date().getFullYear(),
      registeredAt: Date.now(),
      source: 'admin',
      academicYear: academicYear || null,
    }),
  });

  return paymentRef.id;
};

/**
 * Admin: manually add a training registration (physical payment, verified immediately).
 */
export const adminAddTrainingRegistrationManually = async (branchId, data, adminInfo = {}) => {
  if (!branchId) throw new Error('branchId is required');
  if (!data.userId) throw new Error('userId is required');
  if (!data.trainingId) throw new Error('trainingId is required');

  const ref = await addDoc(getBranchCollection(branchId, 'trainingsRegistered'), {
    branchId,
    userId:         data.userId,
    studentName:    data.studentName    || '',
    studentPhone:   data.studentPhone   || '',
    userEmail:      data.userEmail      || '',
    trainingId:     data.trainingId,
    trainingTitle:  data.trainingTitle  || data.trainingName || '',
    trainingName:   data.trainingTitle  || data.trainingName || '',
    trainingPrice:  data.trainingPrice  ?? null,
    paymentMethod:  'physical',
    source:         'admin',
    status:         'approved',
    verified:       true,
    registeredAt:   serverTimestamp(),
    verifiedAt:     serverTimestamp(),
    verifiedBy: {
      uid:   adminInfo.uid   || '',
      email: adminInfo.email || '',
      name:  adminInfo.name  || '',
    },
  });
  return { id: ref.id };
};

/**
 * Admin: manually add a language registration (physical payment, verified immediately).
 */
export const adminAddLanguageRegistrationManually = async (branchId, data, adminInfo = {}) => {
  if (!branchId) throw new Error('branchId is required');
  if (!data.userId) throw new Error('userId is required');
  if (!data.languageId) throw new Error('languageId is required');

  const ref = await addDoc(getBranchCollection(branchId, 'languagesRegistered'), {
    branchId,
    userId:        data.userId,   // canonical ownership field (Phase D — studentId removed)
    studentName:   data.studentName   || '',
    studentPhone:  data.studentPhone  || '',
    studentEmail:  data.userEmail     || '',
    languageId:    data.languageId,
    languageName:  data.languageName  || '',
    levelId:       data.levelId       || '',
    levelLabel:    data.levelLabel    || '',
    teacherName:   data.teacherName   || '',
    languagePrice: data.languagePrice ?? null,
    paymentMethod: 'physical',
    source:        'admin',
    status:        'registered',
    verified:      true,
    registeredAt:  serverTimestamp(),
    verifiedAt:    serverTimestamp(),
    verifiedBy: {
      uid:   adminInfo.uid   || '',
      email: adminInfo.email || '',
      name:  adminInfo.name  || '',
    },
  });
  return { id: ref.id };
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







