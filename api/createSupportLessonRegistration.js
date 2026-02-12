import admin from 'firebase-admin';

// Initialize Firebase Admin SDK once per cold start
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

const db = admin.firestore();

// Helper functions (ported from existing Express/Cloud Function implementations)
function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSupportStudyYear(lessonData = {}) {
  return String(lessonData.studyYear || lessonData.year || lessonData.grade || '').trim() || null;
}

function normalizeUserStudyYear(profile = {}) {
  return String(profile.studyYear || '').trim() || null;
}

function parseDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function addMonthsKeepingDay(date, months) {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

function isSummerMonth(monthIndex) {
  return [5, 6, 7].includes(monthIndex);
}

function getAcademicYearEndBoundary(date) {
  const year = date.getFullYear();
  const boundaryYear = date.getMonth() >= 8 ? year + 1 : year;
  return new Date(boundaryYear, 4, 31, 23, 59, 59, 999);
}

async function hasActiveSupportRegistration({ branchId, userId, lessonId }) {
  const snap = await db
    .collection('supportLessonRegistrations')
    .where('branchId', '==', branchId)
    .where('userId', '==', userId)
    .where('lessonId', '==', lessonId)
    .get();

  if (snap.empty) return false;
  const now = new Date();

  return snap.docs.some((docSnap) => {
    const data = docSnap.data() || {};
    const status = normalizeString(data.status || 'pending');
    if (status === 'pending') return true;
    if (status !== 'verified') return false;
    const end = data.endDate?.toDate ? data.endDate.toDate() : data.endDate ? new Date(data.endDate) : null;
    return Boolean(end && end >= now);
  });
}

// Helper function to verify Firebase ID token from Authorization header
async function verifyAuthToken(req) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error('Missing Authorization Bearer token');
  }

  const token = match[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded;
  } catch (error) {
    throw new Error('Invalid authentication token');
  }
}

// Vercel Serverless Function handler
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method-not-allowed', message: 'Only POST requests are allowed.' });
  }

  try {
    // Verify authentication
    const decoded = await verifyAuthToken(req);
    const uid = decoded.uid;

    // Extract and validate request data
    const data = req.body || {};
    const branchId = String(data?.branchId || '').trim();
    const lessonId = String(data?.lessonId || '').trim();
    const durationInMonthsRaw = Number(data?.durationInMonths);
    const durationInMonths = Number.isFinite(durationInMonthsRaw) ? durationInMonthsRaw : 1;
    const source = String(data?.source || 'manual');
    const paymentProofUrl = String(data?.paymentProofUrl || '');
    const monthlyPrice = data?.monthlyPrice ?? null;
    const totalPrice = data?.totalPrice ?? null;

    // Validate required fields
    if (!branchId) {
      return res.status(400).json({
        error: 'invalid-argument',
        message: 'branchId is required.',
        code: 'missing-branch'
      });
    }
    if (!lessonId) {
      return res.status(400).json({
        error: 'invalid-argument',
        message: 'lessonId is required.',
        code: 'missing-lesson'
      });
    }
    if (!Number.isInteger(durationInMonths) || durationInMonths < 1 || durationInMonths > 3) {
      return res.status(400).json({
        error: 'invalid-argument',
        message: 'durationInMonths must be between 1 and 3.',
        code: 'invalid-duration'
      });
    }

    // Get user profile
    const userRef = db.collection('branches').doc(branchId).collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({
        error: 'failed-precondition',
        message: 'User profile not found.',
        code: 'user-not-found'
      });
    }
    const userProfile = userSnap.data() || {};

    // Check account verification
    const verificationStatus = normalizeString(userProfile.verificationStatus || '');
    const isAccountVerified =
      userProfile.verified === true ||
      userProfile.accountVerified === true ||
      verificationStatus === 'verified';
    if (!isAccountVerified) {
      return res.status(403).json({
        error: 'permission-denied',
        message: 'Account must be verified before registering.',
        code: 'account-not-verified'
      });
    }

    // Check yearly fee payment
    const yearlyFeePaid = Boolean(userProfile.yearlyFeePaid === true || userProfile.paymentVerified === true);
    if (!yearlyFeePaid) {
      return res.status(403).json({
        error: 'permission-denied',
        message: 'Yearly fee is required.',
        code: 'yearly-fee-required'
      });
    }

    // Get and validate user study year
    const userStudyYear = normalizeUserStudyYear(userProfile);
    if (!userStudyYear) {
      return res.status(400).json({
        error: 'failed-precondition',
        message: 'User studyYear is missing.',
        code: 'missing-user-study-year'
      });
    }

    // Get lesson data
    const lessonRef = db.collection('branches').doc(branchId).collection('supportLessons').doc(lessonId);
    const lessonSnap = await lessonRef.get();
    if (!lessonSnap.exists) {
      return res.status(404).json({
        error: 'not-found',
        message: 'Support lesson not found.',
        code: 'lesson-not-found'
      });
    }
    const lessonData = lessonSnap.data() || {};

    // Validate lesson study year
    const lessonStudyYear = normalizeSupportStudyYear(lessonData);
    if (!lessonStudyYear) {
      return res.status(400).json({
        error: 'failed-precondition',
        message: 'Lesson studyYear is missing.',
        code: 'missing-lesson-study-year'
      });
    }

    // Check study year match
    if (lessonStudyYear !== userStudyYear) {
      return res.status(403).json({
        error: 'permission-denied',
        message: 'Study year mismatch.',
        code: 'study-year-mismatch',
        userStudyYear,
        lessonStudyYear
      });
    }

    // Validate dates
    const startDateObj = parseDateInput(data?.startDate) || new Date();
    if (isSummerMonth(startDateObj.getMonth())) {
      return res.status(400).json({
        error: 'failed-precondition',
        message: 'Summer registrations are forbidden.',
        code: 'summer-registration-forbidden'
      });
    }

    const endDateObj = parseDateInput(data?.endDate) || addMonthsKeepingDay(startDateObj, durationInMonths);
    const academicBoundary = getAcademicYearEndBoundary(startDateObj);
    if (endDateObj > academicBoundary) {
      return res.status(400).json({
        error: 'failed-precondition',
        message: 'Duration exceeds academic year boundary.',
        code: 'duration-exceeds-academic-year'
      });
    }

    const academicYear = String(data?.academicYear || '').trim() || null;

    // Check for existing active registration
    const alreadyActive = await hasActiveSupportRegistration({ branchId, userId: uid, lessonId });
    if (alreadyActive) {
      return res.status(409).json({
        error: 'already-exists',
        message: 'User already has an active registration.',
        code: 'user-already-registered-support-lesson'
      });
    }

    // Create registration payload
    const payload = {
      branchId,
      userId: uid,
      studentId: uid,
      userName: String(userProfile.fullName || userProfile.name || '').trim(),
      userEmail: String(userProfile.email || decoded.email || '').trim(),
      lessonId,
      lessonName: String(lessonData.name || lessonData.subject || '').trim(),
      subjectName: String(
        lessonData.subject ||
          (Array.isArray(lessonData.subjects) ? lessonData.subjects[0] : '') ||
          lessonData.name ||
          ''
      ).trim(),
      studyYear: userStudyYear,
      studyYearId: userStudyYear,
      studyYearLabel: String(lessonData.studyLevel || '').trim(),
      studyLevelId: String(lessonData.level || '').trim() || null,
      durationInMonths,
      source,
      status: 'pending',
      monthlyPrice,
      totalPrice,
      paymentProofUrl,
      startDate: admin.firestore.Timestamp.fromDate(startDateObj),
      endDate: admin.firestore.Timestamp.fromDate(endDateObj),
      academicYear,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      verifiedAt: null,
      verifiedBy: null
    };

    // Save to Firestore
    const ref = await db.collection('supportLessonRegistrations').add(payload);

    // Success response
    return res.status(200).json({ success: true, id: ref.id });
  } catch (error) {
    console.error('createSupportLessonRegistration error:', error);

    if (error.message.includes('Missing Authorization')) {
      return res.status(401).json({
        error: 'unauthenticated',
        message: 'Authentication required.'
      });
    }

    if (error.message.includes('Invalid authentication token')) {
      return res.status(401).json({
        error: 'unauthenticated',
        message: 'Invalid authentication token.'
      });
    }

    return res.status(500).json({
      error: 'internal',
      message: 'An internal error occurred.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

