/**
 * Firestore Service Helper
 * Centralized helper functions for branch-based Firestore operations
 */

import { db, functions } from '../firebase';
import { getYearById } from '../data/studyLevels';
import { httpsCallable } from 'firebase/functions';
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
  Timestamp,
  writeBatch
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
    yearlyFeePaid: false,
    enrolledLessons: [],
    uploadedDocs: [],
    verificationStatus: userData?.verificationStatus || 'unverified',
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
    receiptPath
  } = registrationData;

  if (!userId) throw new Error('userId is required for language registration');
  if (!levelId) throw new Error('levelId is required for language registration');
  if (!languageId) throw new Error('languageId is required for language registration');

  const sanitizedLevelId = levelId.replace(/\./g, '_');
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

  const formId = `${sanitizedLevelId}-${Date.now()}`;
  const entriesRef = collection(formContainerRef, LANGUAGE_FORM_ENTRIES_SUBCOLLECTION);
  const formRef = doc(entriesRef, formId);

  const formData = {
    formId,
    studentId: userId,
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
    languageId,
    languageName,
    languagePrice: languagePrice ?? null,
    teacherName: teacherName || '',
    levelId: sanitizedLevelId,
    levelLabel: levelLabel || levelId,
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
  const verificationTimestamp = serverTimestamp();

  await updateDoc(registrationRef, {
    status: 'approved',
    verified: true,
    visibility: 'approved',
    verifiedAt: verificationTimestamp,
    verifiedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    },
    updatedAt: serverTimestamp()
  });

  const registeredRef = doc(db, `branches/${branchId}/languagesRegistered/${formId}`);
  await setDoc(registeredRef, {
    ...registrationData,
    formId,
    studentId,
    branchId,
    status: 'registered',
    registeredAt: verificationTimestamp,
    verifiedAt: verificationTimestamp,
    verifiedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    }
  });

  try {
    const userRef = getBranchDoc(branchId, 'users', studentId);
    const languageSummary = {
      formId,
      languageName: registrationData.languageName || '',
      levelLabel: registrationData.levelLabel || '',
      registeredAt: Date.now(),
      verifiedBy: adminInfo?.name || adminInfo?.email || null
    };
    await updateDoc(userRef, {
      'registrations.language': true,
      'registrations.languages': arrayUnion(languageSummary),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to update user language registration status:', error);
  }
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

  await updateDoc(registrationRef, {
    status: 'rejected',
    verified: false,
    visibility: 'rejected',
    verifiedAt: null,
    verifiedBy: null,
    rejectionReason: adminInfo?.reason || null,
    rejectedAt: serverTimestamp(),
    rejectedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    },
    updatedAt: serverTimestamp()
  });
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
export const verifyYearlyFee = async (branchId, registrationId, userId) => {
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
      uid: '',
      email: '',
      name: ''
    }
  });

  await saveAnnualFeeRegisteredEntry({
    branchId,
    userId,
    entryId: registrationId,
    data: registrationData,
    verificationTimestamp,
    adminInfo: {}
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
  // Save to annualPayments collection for admin view
  const paymentsRef = getBranchCollection(branchId, 'annualPayments');
  await addDoc(paymentsRef, {
    ...paymentData,
    status: 'pending',
    createdAt: serverTimestamp(),
    verifiedAt: null,
    verifiedBy: null,
    nextPaymentDate: null
  });

  // Also save to the user's annualFees document
  if (paymentData.userId) {
    const userAnnualFeeRef = doc(db, 'annualFees', paymentData.userId);
    await setDoc(userAnnualFeeRef, {
      year: paymentData.year || '',
      paid: false,
      paidAt: null
    }, { merge: true });

    return userAnnualFeeRef;
  }

  return null;
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
  const paymentRef = getBranchDoc(branchId, 'annualPayments', paymentId);
  const paymentSnap = await getDoc(paymentRef);
  
  if (!paymentSnap.exists()) {
    throw new Error('annual-payment-not-found');
  }
  
  const paymentData = paymentSnap.data();
  const verificationTimestamp = serverTimestamp();

  // Update payment status
  const nextPaymentDate = new Date();
  nextPaymentDate.setFullYear(nextPaymentDate.getFullYear() + 1);
  
  await updateDoc(paymentRef, {
    status: 'verified',
    verifiedAt: verificationTimestamp,
    verifiedBy: adminInfo,
    nextPaymentDate: nextPaymentDate
  });

  {
    const regsRef = supportLessonRegistrationsSummaryCollection(branchId);
    const regsQuery = query(regsRef, where('paymentId', '==', paymentId));
    const regsSnap = await getDocs(regsQuery);
    if (!regsSnap.empty) {
      const batch = writeBatch(db);
      const now = new Date();
      const boundaryYear = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
      const endDateBoundary = new Date(boundaryYear, 4, 31, 23, 59, 59, 999);
      regsSnap.docs.forEach((docSnap) => {
        const regData = docSnap.data() || {};
        const studentId = regData.studentId || regData.userId || '';
        const subjectId = regData.subjectId || '';
        const yearId = regData.year || regData.yearId || regData.yearLabel || regData.metadata?.year || 'unknown';
        const subjectName = regData.subjectName || regData.courseName || '';

        batch.update(docSnap.ref, {
          status: 'verified',
          paymentStatus: 'verified',
          updatedAt: serverTimestamp(),
        });

        if (studentId && subjectId) {
          const enrollmentId = buildAnnualFeeSupportEnrollmentId(branchId, studentId, subjectId, yearId);
          const enrollmentRef = doc(db, SUPPORT_LESSON_REGISTRATIONS_COLLECTION, enrollmentId);
          batch.set(
            enrollmentRef,
            {
              branchId,
              userId: studentId,
              lessonId: subjectId,
              subjectName,
              lessonName: subjectName || 'درس دعم',
              source: 'annualFee',
              status: 'verified',
              paymentId,
              yearId,
              academicYear: yearId,
              startDate: Timestamp.fromDate(now),
              endDate: Timestamp.fromDate(endDateBoundary),
              createdAt: regData.createdAt || serverTimestamp(),
              verifiedAt: serverTimestamp(),
              verifiedBy: adminInfo || null,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      });
      await batch.commit();
    }
  }

  if (paymentData.userId) {
    await saveAnnualFeeRegisteredEntry({
      branchId,
      userId: paymentData.userId,
      entryId: paymentId,
      data: paymentData,
      verificationTimestamp,
      adminInfo
    });
  }
  
  if (paymentData.userId) {
    const userAnnualFeeRef = doc(db, 'annualFees', paymentData.userId);
    await setDoc(userAnnualFeeRef, {
      year: paymentData.year || '',
      paid: true,
      paidAt: verificationTimestamp
    }, { merge: true });
  }
  
  // Update user document
  // CRITICAL: studyYear is the canonical source of truth for access control
  if (paymentData.userId) {
    const userRef = getBranchDoc(branchId, 'users', paymentData.userId);

    let userStudyYearPatch = {};
    try {
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? (userSnap.data() || {}) : {};
      const existingSchoolLevel = String(userData.schoolLevel || '').trim();
      
      // paymentData.academicYear contains the year ID (e.g., "mid1", "sec2")
      const paymentYearId = String(paymentData.academicYear || '').trim();
      
      // Derive the level from the year ID (e.g., "mid1" -> "middle", "sec2" -> "high")
      const paymentLevel = paymentYearId ? (paymentYearId.startsWith('mid') ? 'middle' : paymentYearId.startsWith('sec') ? 'high' : null) : null;

      // ALWAYS update studyYear if payment has it (even if user already has one, payment is authoritative)
      if (paymentYearId) {
        userStudyYearPatch.studyYear = paymentYearId;
      }

      // Update schoolLevel only if missing and we can derive it from the year
      if (!existingSchoolLevel && paymentLevel) {
        userStudyYearPatch.schoolLevel = paymentLevel;
      }
    } catch (e) {
      console.error('Error preparing user studyYear patch:', e);
    }

    await updateDoc(userRef, {
      isVerified: true,
      yearlyFeePaid: true,
      paymentVerified: true,
      nextPaymentDate: nextPaymentDate,
      updatedAt: serverTimestamp(),
      ...userStudyYearPatch,
      'registrations.annualFee': paymentData.year || paymentData.level || new Date().getFullYear(),
      'registrations.annualFeeHistory': arrayUnion({
        registrationId: paymentId,
        year: paymentData.year || paymentData.level || null,
        registeredAt: Date.now()
      })
    });
    
    if (userStudyYearPatch.studyYear) {
      console.log(`✅ Updated user ${paymentData.userId} studyYear=${userStudyYearPatch.studyYear}, schoolLevel=${userStudyYearPatch.schoolLevel || 'unchanged'}`);
    }
  }
};

/**
 * Reject an annual payment
 * @param {string} branchId
 * @param {string} paymentId
 * @param {string} notes - Optional rejection notes
 * @returns {Promise<void>}
 */
export const rejectAnnualPayment = async (branchId, paymentId, notes = null) => {
  const paymentRef = getBranchDoc(branchId, 'annualPayments', paymentId);
  const paymentSnap = await getDoc(paymentRef);
  if (!paymentSnap.exists()) {
    throw new Error('annual-payment-not-found');
  }

  await updateDoc(paymentRef, {
    status: 'rejected',
    notes: notes || null,
    updatedAt: serverTimestamp()
  });

  {
    const regsRef = supportLessonRegistrationsSummaryCollection(branchId);
    const regsQuery = query(regsRef, where('paymentId', '==', paymentId));
    const regsSnap = await getDocs(regsQuery);
    if (!regsSnap.empty) {
      const batch = writeBatch(db);
      regsSnap.docs.forEach((docSnap) => {
        const regData = docSnap.data() || {};
        const studentId = regData.studentId || regData.userId || '';
        const subjectId = regData.subjectId || '';
        const yearId = regData.year || regData.yearId || regData.yearLabel || regData.metadata?.year || 'unknown';

        batch.update(docSnap.ref, {
          status: 'rejected',
          feePaid: false,
          paymentStatus: 'rejected',
          updatedAt: serverTimestamp(),
        });

        if (studentId && subjectId) {
          const enrollmentId = buildAnnualFeeSupportEnrollmentId(branchId, studentId, subjectId, yearId);
          const enrollmentRef = doc(db, SUPPORT_LESSON_REGISTRATIONS_COLLECTION, enrollmentId);
          batch.set(
            enrollmentRef,
            {
              branchId,
              userId: studentId,
              lessonId: subjectId,
              source: 'annualFee',
              status: 'rejected',
              paymentId,
              notes: notes || null,
              updatedAt: serverTimestamp(),
              verifiedAt: null,
              verifiedBy: null,
            },
            { merge: true }
          );
        }
      });
      await batch.commit();
    }
  }
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

const toDateInstance = (value, fallback = new Date()) => {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const toTimestamp = (value) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  const date = toDateInstance(value);
  return Timestamp.fromDate(date);
};

const addMonthsKeepingDay = (date, months) => {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
};

const isSummerMonth = (monthIndex) => [5, 6, 7].includes(monthIndex);

const getAcademicYearEndBoundary = (date) => {
  const year = date.getFullYear();
  const boundaryYear = date.getMonth() >= 8 ? year + 1 : year;
  return new Date(boundaryYear, 4, 31, 23, 59, 59, 999);
};

const getAcademicYearLabel = (date) => {
  const year = date.getFullYear();
  return date.getMonth() >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

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
  }

  const timestamp = serverTimestamp();
  const payload = {
    branchId,
    studentId,
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
    where('studentId', '==', studentId)
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
    where('studentId', '==', studentId)
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

const hasActiveSupportRegistration = (docs) => {
  const now = new Date();
  return docs.some((docSnap) => {
    const data = docSnap.data() || {};
    const status = String(data.status || 'pending').toLowerCase();
    const endDate = data.endDate?.toDate
      ? data.endDate.toDate()
      : data.endDate
      ? new Date(data.endDate)
      : null;
    const isPendingOrVerified = status === 'pending' || status === 'verified';
    return Boolean(isPendingOrVerified && endDate && endDate > now);
  });
};

/**
 * Create a monthly support lesson registration entry in the global collection
 */
export const createSupportLessonRegistration = async (registrationData = {}) => {
  const {
    branchId,
    userId,
    userName = '',
    userEmail = '',
    lessonId,
    lessonName = '',
    subjectName = '',
    studyYearId = null,
    studyYear = null,
    studyYearLabel = '',
    studyLevelId = null,
    source = 'manual',
    durationInMonths = 1,
    monthlyPrice = null,
    totalPrice = null,
    startDate = new Date(),
    endDate = null,
    academicYear = null,
    status = 'pending',
    paymentProofUrl = '',
    verifiedBy = null,
    verifiedAt = null,
    createdAt: createdAtOverride = null,
  } = registrationData;

  if (!branchId) throw new Error('branchId is required for support lesson registration');
  if (!userId) throw new Error('userId is required for support lesson registration');
  if (!lessonId) throw new Error('lessonId is required for support lesson registration');
  const resolvedStudyYear = studyYear || studyYearId || null;
  if (!resolvedStudyYear) {
    const err = new Error('missing-study-year');
    err.code = 'missing-study-year';
    throw err;
  }
  if (!Number.isInteger(durationInMonths) || durationInMonths < 1 || durationInMonths > 3) {
    throw new Error('durationInMonths must be between 1 and 3');
  }

  const startDateObj = toDateInstance(startDate);
  if (isSummerMonth(startDateObj.getMonth())) {
    const err = new Error('summer-registration-forbidden');
    err.code = 'summer-registration-forbidden';
    throw err;
  }

  const endDateObj = endDate
    ? toDateInstance(endDate)
    : addMonthsKeepingDay(startDateObj, durationInMonths);
  const academicBoundary = getAcademicYearEndBoundary(startDateObj);

  if (endDateObj > academicBoundary) {
    const err = new Error('duration-exceeds-academic-year');
    err.code = 'duration-exceeds-academic-year';
    throw err;
  }

  const registrationAcademicYear = academicYear || getAcademicYearLabel(startDateObj);

  const existingQuery = query(
    supportRegistrationCollection(),
    where('userId', '==', userId),
    where('lessonId', '==', lessonId)
  );
  const existingSnap = await getDocs(existingQuery);
  if (hasActiveSupportRegistration(existingSnap.docs)) {
    const error = new Error('user-already-registered-support-lesson');
    error.code = 'user-already-registered-support-lesson';
    throw error;
  }

  const payload = {
    branchId,
    userId,
    userName,
    userEmail,
    lessonId,
    lessonName,
    subjectName,
    studyYear: resolvedStudyYear,
    studyYearId: resolvedStudyYear,
    studyYearLabel,
    studyLevelId,
    durationInMonths,
    source,
    status,
    monthlyPrice,
    totalPrice,
    paymentProofUrl: paymentProofUrl || '',
    startDate: Timestamp.fromDate(startDateObj),
    endDate: Timestamp.fromDate(endDateObj),
    academicYear: registrationAcademicYear,
    createdAt: createdAtOverride ? toTimestamp(createdAtOverride) : serverTimestamp(),
    verifiedAt: status === 'verified' ? (verifiedAt ? toTimestamp(verifiedAt) : serverTimestamp()) : null,
    verifiedBy: status === 'verified' ? (verifiedBy || null) : null
  };

  try {
    const callable = httpsCallable(functions, 'createSupportLessonRegistration');
    const result = await callable({
      branchId,
      lessonId,
      durationInMonths,
      startDate: startDateObj.getTime(),
      endDate: endDateObj.getTime(),
      academicYear: registrationAcademicYear,
      paymentProofUrl: payload.paymentProofUrl,
      monthlyPrice,
      totalPrice,
      source
    });

    return result?.data || null;
  } catch (err) {
    const detailsCode = err?.details?.code;
    if (detailsCode) {
      const mapped = new Error(err?.message || detailsCode);
      mapped.code = detailsCode;
      throw mapped;
    }

    const rawCode = typeof err?.code === 'string' ? err.code : '';
    const normalizedCode = rawCode.startsWith('functions/') ? rawCode.replace('functions/', '') : rawCode;
    if (normalizedCode) {
      const mapped = new Error(err?.message || normalizedCode);
      mapped.code = normalizedCode;
      throw mapped;
    }

    throw err;
  }
};

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
 * Verify support lesson registration
 * @param {string} branchId
 * @param {string} registrationId
 */
export const verifySupportLessonRegistration = async (registrationId, adminInfo = {}) => {
  if (!registrationId) return;
  const registrationRef = getSupportRegistrationDoc(registrationId);
  await updateDoc(registrationRef, {
    status: 'verified',
    verifiedAt: serverTimestamp(),
    verifiedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    }
  });
};

export const rejectSupportLessonRegistration = async (registrationId, notes = null) => {
  if (!registrationId) return;
  const registrationRef = getSupportRegistrationDoc(registrationId);
  await updateDoc(registrationRef, {
    status: 'rejected',
    notes: notes || null,
    updatedAt: serverTimestamp(),
    verifiedAt: null,
    verifiedBy: null
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
    trainingTitle: trainingTitle || trainingName || '',
    trainingName: trainingName || trainingTitle || '',
    trainingPrice,
    trainingDescription,
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
  const verificationTimestamp = serverTimestamp();

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

  await updateDoc(registrationRef, {
    verified: true,
    status: 'approved',
    verifiedAt: verificationTimestamp,
    verifiedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    }
  });

  const trainingTitle = registrationData.trainingTitle || trainingMeta?.title || '';
  const trainingPrice = registrationData.trainingPrice || trainingMeta?.price || null;

  const registeredRef = doc(db, `branches/${branchId}/trainingsRegistered/${entryId}`);
  const summaryRegisteredAt = Date.now();
  await setDoc(registeredRef, {
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
    registeredAt: verificationTimestamp,
    verifiedAt: verificationTimestamp,
    verifiedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    }
  });

  if (registrationData.userId) {
    try {
      const userRef = getBranchDoc(branchId, 'users', registrationData.userId);
      await updateDoc(userRef, {
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
    } catch (error) {
      console.error('Failed to update user trainings registrations:', error);
    }
  }
};

export const rejectTrainingRegistration = async (branchId, studentId, entryId, adminInfo = {}) => {
  if (!branchId || !studentId || !entryId) {
    throw new Error('branchId, studentId and entryId are required to reject training registration');
  }

  const registrationRef = doc(
    db,
    `branches/${branchId}/${TRAINING_FORM_CONTAINERS_COLLECTION}/${studentId}/${TRAINING_FORM_ENTRIES_SUBCOLLECTION}/${entryId}`
  );

  await updateDoc(registrationRef, {
    status: 'rejected',
    verified: false,
    verifiedAt: null,
    rejectionReason: adminInfo.reason || '',
    updatedAt: serverTimestamp(),
    reviewedBy: {
      uid: adminInfo.uid || '',
      email: adminInfo.email || '',
      name: adminInfo.name || ''
    }
  });
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
  return status === 'pending' || status === 'verified';
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







