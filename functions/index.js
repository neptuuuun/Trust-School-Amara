const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type'] });
const nodemailer = require('nodemailer');

try {
  admin.initializeApp();
} catch (e) {}

const db = admin.firestore();

// Email configuration - Update these with your email service credentials
// For Gmail, you can use App Password: https://support.google.com/accounts/answer/185833
const EMAIL_CONFIG = {
  service: 'gmail', // or 'smtp', 'outlook', etc.
  auth: {
    user: functions.config().email?.user || process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: functions.config().email?.password || process.env.EMAIL_PASSWORD || 'your-app-password'
  }
};

// Initialize email transporter
const transporter = nodemailer.createTransport(EMAIL_CONFIG);

// Email templates
const emailTemplates = {
  // Admin notification: New user registration
  newUserRegistration: (studentName, studentEmail) => ({
    subject: 'طلب تسجيل جديد - طالب جديد ينتظر التحقق',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">طلب تسجيل جديد</h2>
        <p>تم استلام طلب تسجيل جديد من طالب:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>اسم الطالب:</strong> ${studentName}</p>
          <p><strong>البريد الإلكتروني:</strong> ${studentEmail}</p>
        </div>
        <p style="color: #dc2626; font-weight: bold;">طالب جديد ينتظر التحقق</p>
        <p>يرجى مراجعة الطلب والموافقة عليه من لوحة التحكم.</p>
      </div>
    `
  }),

  // Student notification: Account approved
  accountApproved: (studentName) => ({
    subject: 'تم التحقق من حسابك - Trust School',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">تهانينا! تم التحقق من حسابك</h2>
        <p>عزيزي/عزيزتي ${studentName},</p>
        <p>نود إعلامك بأن حسابك قد تم التحقق منه بنجاح.</p>
        <p style="font-weight: bold; color: #16a34a;">يمكنك الآن تسجيل الدخول والتسجيل في الدورات.</p>
        <div style="background-color: #dcfce7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p>بعد التحقق، يمكنك:</p>
          <ul>
            <li>تسجيل الدخول إلى حسابك</li>
            <li>التسجيل في دورات اللغات</li>
            <li>التسجيل في الدورات التكوينية</li>
            <li>دفع الرسوم السنوية للوصول إلى دروس الدعم</li>
          </ul>
        </div>
        <p>شكراً لانضمامك إلى Trust School!</p>
      </div>
    `
  }),

  // Admin notification: New course registration
  newCourseRegistration: (studentName, courseName, courseType) => ({
    subject: `طلب تسجيل جديد في دورة - ${courseName}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">طلب تسجيل جديد في دورة</h2>
        <p>تم استلام طلب تسجيل جديد في دورة:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>اسم الطالب:</strong> ${studentName}</p>
          <p><strong>اسم الدورة:</strong> ${courseName}</p>
          <p><strong>نوع الدورة:</strong> ${courseType}</p>
        </div>
        <p style="color: #dc2626; font-weight: bold;">تسجيل دورة جديد ينتظر الموافقة</p>
        <p>يرجى مراجعة الطلب والموافقة عليه من لوحة التحكم.</p>
      </div>
    `
  }),

  // Student notification: Course registration approved
  courseApproved: (studentName, courseName) => ({
    subject: 'تمت الموافقة على تسجيلك في الدورة - Trust School',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">تمت الموافقة على تسجيلك</h2>
        <p>عزيزي/عزيزتي ${studentName},</p>
        <p>نود إعلامك بأن تسجيلك في الدورة التالية قد تمت الموافقة عليه:</p>
        <div style="background-color: #dcfce7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="font-size: 18px; font-weight: bold; color: #16a34a;">${courseName}</p>
        </div>
        <p style="font-weight: bold; color: #16a34a;">لديك الآن إمكانية الوصول إلى الدورة.</p>
        <p>يمكنك تسجيل الدخول إلى حسابك لعرض تفاصيل الدورة.</p>
        <p>شكراً لانضمامك إلى Trust School!</p>
      </div>
    `
  })
};

// Helper function to send email
async function sendEmail(to, subject, html) {
  try {
    const mailOptions = {
      from: EMAIL_CONFIG.auth.user,
      to: to,
      subject: subject,
      html: html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}

// Idempotency helper to prevent duplicate emails on retries.
// Firestore triggers can be retried; we "claim" the eventId once.
async function claimEmailEvent(eventId, kind = 'unknown') {
  if (!eventId) return true;
  const ref = db.collection('_emailEvents').doc(String(eventId));
  try {
    await ref.create({
      kind,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  } catch (e) {
    const code = e?.code || e?.errorInfo?.code;
    if (
      code === 6 || // ALREADY_EXISTS
      code === 'already-exists' ||
      String(e?.message || '').toLowerCase().includes('already exists')
    ) {
      return false;
    }
    throw e;
  }
}

// Helper function to get admin emails for a branch
async function getAdminEmails(branchId) {
  const adminEmails = [...STATIC_ADMIN_EMAILS];
  
  try {
    // Get branch-specific admin emails
    const metaSnap = await db.collection('branches').doc(branchId).collection('meta').doc('info').get();
    if (metaSnap.exists) {
      const branchAdmins = metaSnap.data()?.adminEmails || [];
      adminEmails.push(...branchAdmins);
    }

    // Get admin users from the branch
    const adminUsersSnap = await db.collection('branches').doc(branchId).collection('users')
      .where('role', '==', 'admin').get();
    
    adminUsersSnap.docs.forEach(doc => {
      const userData = doc.data();
      if (userData.email) {
        adminEmails.push(userData.email);
      }
    });
  } catch (error) {
    console.error('Error fetching admin emails:', error);
  }

  // Remove duplicates and return
  return [...new Set(adminEmails.filter(Boolean))];
}

const STATIC_ADMIN_EMAILS = [
  'admin@example.com',
  'admin@trust-school.com',
  'marouabenzaoui48@gmail.com',
  'trustschoolamara@gmail.com'
];

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function formatCsvDate(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function safeCsvValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((v) => safeCsvValue(v)).join(' | ');
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      return formatCsvDate(value);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
  }
  return String(value);
}

function escapeCsvField(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  const mustQuote = /[",\n\r]/.test(raw);
  const escaped = raw.replace(/"/g, '""');
  return mustQuote ? `"${escaped}"` : escaped;
}

function toCsv(headers, rows) {
  const lines = [];
  lines.push(headers.map(escapeCsvField).join(','));
  rows.forEach((row) => {
    lines.push(headers.map((h) => escapeCsvField(row[h])).join(','));
  });
  return `\uFEFF${lines.join('\n')}`;
}

async function loadBranchUsersMap(branchId, userIds = []) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  const result = new Map();
  const chunkSize = 100;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const refs = chunk.map((id) => db.collection('branches').doc(branchId).collection('users').doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s) => {
      if (s.exists) result.set(s.id, s.data());
    });
  }

  return result;
}

function formatDateOnly(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function isAdminForBranch(branchId, uid, email) {
  const normalizedEmail = normalizeString(email);
  if (STATIC_ADMIN_EMAILS.map(normalizeString).includes(normalizedEmail)) {
    return true;
  }

  if (!branchId) {
    return false;
  }

  try {
    const metaSnap = await db.collection('branches').doc(branchId).collection('meta').doc('info').get();
    if (metaSnap.exists) {
      const adminEmails = (metaSnap.data()?.adminEmails || []).map(normalizeString);
      if (adminEmails.includes(normalizedEmail)) return true;
    }
  } catch (e) {}

  if (!uid) return false;

  try {
    const userSnap = await db.collection('branches').doc(branchId).collection('users').doc(uid).get();
    if (userSnap.exists) {
      const role = normalizeString(userSnap.data()?.role);
      if (role === 'admin') return true;
    }
  } catch (e) {}

  return false;
}

// Utility: send notification doc (kept as global notifications collection)
async function createNotification(target, title, body, extra = {}) {
  return db.collection('notifications').add({
    target,
    title,
    body,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sent: false,
    ...extra,
  });
}

// Utility: fetch admins' userIds for a specific branch
async function getBranchAdminUserIds(branchId) {
  const snap = await db.collection('branches').doc(branchId).collection('users').where('role', '==', 'admin').get();
  return snap.docs.map(d => d.id);
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

function normalizeSupportStudyYear(lessonData = {}) {
  return String(lessonData.studyYear || lessonData.year || lessonData.grade || '').trim() || null;
}

// CRITICAL: ONLY use studyYear as the source of truth. Do NOT fallback to schoolLevel.
// schoolLevel is the level (middle/high), not the year (mid1/sec2).
function normalizeUserStudyYear(profile = {}) {
  return String(profile.studyYear || '').trim() || null;
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

exports.createSupportLessonRegistration = functions.https.onCall(async (data, context) => {
  if (!context?.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const uid = context.auth.uid;
  const branchId = String(data?.branchId || '').trim();
  const lessonId = String(data?.lessonId || '').trim();
  const durationInMonthsRaw = Number(data?.durationInMonths);
  const durationInMonths = Number.isFinite(durationInMonthsRaw) ? durationInMonthsRaw : 1;
  const source = String(data?.source || 'manual');
  const paymentProofUrl = String(data?.paymentProofUrl || '');
  const monthlyPrice = data?.monthlyPrice ?? null;
  const totalPrice = data?.totalPrice ?? null;

  if (!branchId) {
    throw new functions.https.HttpsError('invalid-argument', 'branchId is required.', { code: 'missing-branch' });
  }
  if (!lessonId) {
    throw new functions.https.HttpsError('invalid-argument', 'lessonId is required.', { code: 'missing-lesson' });
  }
  if (!Number.isInteger(durationInMonths) || durationInMonths < 1 || durationInMonths > 3) {
    throw new functions.https.HttpsError('invalid-argument', 'durationInMonths must be between 1 and 3.', { code: 'invalid-duration' });
  }

  const userRef = db.collection('branches').doc(branchId).collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'User profile not found.', { code: 'user-not-found' });
  }
  const userProfile = userSnap.data() || {};

  // Block course access until account verification is completed
  const verificationStatus = normalizeString(userProfile.verificationStatus || '');
  const isAccountVerified =
    userProfile.verified === true ||
    userProfile.accountVerified === true ||
    verificationStatus === 'verified';
  if (!isAccountVerified) {
    throw new functions.https.HttpsError('permission-denied', 'Account must be verified before registering.', {
      code: 'account-not-verified',
    });
  }

  const yearlyFeePaid = Boolean(userProfile.yearlyFeePaid === true || userProfile.paymentVerified === true);
  if (!yearlyFeePaid) {
    throw new functions.https.HttpsError('permission-denied', 'Yearly fee is required.', { code: 'yearly-fee-required' });
  }

  const userStudyYear = normalizeUserStudyYear(userProfile);
  if (!userStudyYear) {
    throw new functions.https.HttpsError('failed-precondition', 'User studyYear is missing.', { code: 'missing-user-study-year' });
  }

  const lessonRef = db.collection('branches').doc(branchId).collection('supportLessons').doc(lessonId);
  const lessonSnap = await lessonRef.get();
  if (!lessonSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Support lesson not found.', { code: 'lesson-not-found' });
  }
  const lessonData = lessonSnap.data() || {};

  const lessonStudyYear = normalizeSupportStudyYear(lessonData);
  if (!lessonStudyYear) {
    throw new functions.https.HttpsError('failed-precondition', 'Lesson studyYear is missing.', { code: 'missing-lesson-study-year' });
  }

  if (lessonStudyYear !== userStudyYear) {
    throw new functions.https.HttpsError('permission-denied', 'Study year mismatch.', {
      code: 'study-year-mismatch',
      userStudyYear,
      lessonStudyYear
    });
  }

  const startDateObj = parseDateInput(data?.startDate) || new Date();
  if (isSummerMonth(startDateObj.getMonth())) {
    throw new functions.https.HttpsError('failed-precondition', 'Summer registrations are forbidden.', { code: 'summer-registration-forbidden' });
  }

  const endDateObj = parseDateInput(data?.endDate) || addMonthsKeepingDay(startDateObj, durationInMonths);
  const academicBoundary = getAcademicYearEndBoundary(startDateObj);
  if (endDateObj > academicBoundary) {
    throw new functions.https.HttpsError('failed-precondition', 'Duration exceeds academic year boundary.', { code: 'duration-exceeds-academic-year' });
  }

  const academicYear = String(data?.academicYear || '').trim() || null;

  const alreadyActive = await hasActiveSupportRegistration({ branchId, userId: uid, lessonId });
  if (alreadyActive) {
    throw new functions.https.HttpsError('already-exists', 'User already has an active registration.', {
      code: 'user-already-registered-support-lesson'
    });
  }

  const payload = {
    branchId,
    userId: uid,
    studentId: uid,
    userName: String(userProfile.fullName || userProfile.name || '').trim(),
    userEmail: String(userProfile.email || context.auth.token?.email || '').trim(),
    lessonId,
    lessonName: String(lessonData.name || lessonData.subject || '').trim(),
    subjectName: String(lessonData.subject || (Array.isArray(lessonData.subjects) ? lessonData.subjects[0] : '') || lessonData.name || '').trim(),
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

  const ref = await db.collection('supportLessonRegistrations').add(payload);
  return { id: ref.id };
});

// On branch-scoped payment created -> notify branch admins
exports.onPaymentCreated = functions.firestore
  .document('branches/{branchId}/payments/{paymentId}')
  .onCreate(async (snap, context) => {
    const payment = snap.data();
    const branchId = context.params.branchId;
    try {
      const adminIds = await getBranchAdminUserIds(branchId);
      const title = 'دفعة جديدة قيد المراجعة';
      const body = `${payment.serviceName || payment.type} - ${payment.amount || ''} دج`;
      const tasks = adminIds.map((uid) => createNotification(uid, title, body, { paymentId: context.params.paymentId, branchId }));
      await Promise.all(tasks);
      return null;
    } catch (err) {
      console.error('onPaymentCreated error', err);
      return null;
    }
  });

// On branch payment approval -> notify student
exports.onPaymentUpdated = functions.firestore
  .document('branches/{branchId}/payments/{paymentId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before.status !== 'approved' && after.status === 'approved') {
      // Notify student about approval
      try {
        const title = 'تم قبول دفعتك';
        const body = `تمت الموافقة على دفعتك: ${after.serviceName || after.type}`;
        await createNotification(after.studentId, title, body, { paymentId: context.params.paymentId, branchId: context.params.branchId });
      } catch (err) {
        console.error('onPaymentUpdated notify error', err);
      }
    }

    return null;
  });

exports.ensureUserStudyYear = functions.firestore
  .document('branches/{branchId}/users/{userId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;

    const after = change.after.data() || {};
    const studyYear = String(after.studyYear || '').trim();
    if (studyYear) return null;

    const schoolLevel = String(after.schoolLevel || '').trim();
    if (!schoolLevel) return null;

    await change.after.ref.set(
      {
        studyYear: schoolLevel,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return null;
  });

// Scheduled job: daily check for expiring subjects
exports.dailyExpiryCheck = functions.pubsub.schedule('every day 06:00').timeZone('Africa/Algiers').onRun(async (context) => {
  const now = admin.firestore.Timestamp.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const soon = admin.firestore.Timestamp.fromMillis(now.toMillis() + sevenDays);

  try {
    // Iterate branches and check branch-scoped studentSubjects
    const branchesSnap = await db.collection('branches').get();
    const notifications = [];
    for (const b of branchesSnap.docs) {
      const branchId = b.id;
      const subjectsSnap = await db.collection('branches').doc(branchId).collection('studentSubjects')
        .where('expiresAt', '>=', now)
        .where('expiresAt', '<=', soon)
        .get();
      subjectsSnap.forEach((docSnap) => {
        const s = docSnap.data();
        const title = 'تذكير: اشتراكك ينتهي قريباً';
        const body = `${s.subjectName || 'المادة'} (${s.month}) سينتهي خلال 7 أيام.`;
        notifications.push(createNotification(s.studentId, title, body, { subjectId: docSnap.id, branchId }));
      });
    }

    await Promise.all(notifications);
    return null;
  } catch (err) {
    console.error('dailyExpiryCheck error', err);
    return null;
  }
});

exports.exportRegistrationsCsv = functions.https.onCall(async (data, context) => {
  if (!context?.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const list = normalizeString(data?.list);
  const branchId = String(data?.branchId || '').trim();
  const search = String(data?.search || '').trim();
  const levelFilter = String(data?.levelFilter || 'all');
  const trainingFilter = String(data?.trainingFilter || 'all');
  const statusFilter = String(data?.statusFilter || 'all');

  const uid = context.auth.uid;
  const email = context.auth.token?.email || '';

  if (!(await isAdminForBranch(branchId, uid, email))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }

  if (!['languages', 'support', 'trainings'].includes(list)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid list type.');
  }

  if (!branchId) {
    throw new functions.https.HttpsError('invalid-argument', 'branchId is required.');
  }

  const term = normalizeString(search);
  const now = new Date();
  const datePart = formatDateOnly(now);
  const filename = `${list}-registrations-${datePart}.csv`;

  if (list === 'languages') {
    const snap = await db
      .collection('branches')
      .doc(branchId)
      .collection('languagesRegistered')
      .orderBy('registeredAt', 'desc')
      .get();

    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const filtered = entries.filter((entry) => {
      const matchesSearch = term
        ? normalizeString(`${entry.studentName || ''} ${entry.languageName || ''} ${entry.levelLabel || ''}`).includes(term)
        : true;
      const matchesLevel = levelFilter === 'all' || entry.levelLabel === levelFilter;
      return matchesSearch && matchesLevel;
    });

    const headers = [
      'name',
      'email',
      'course',
      'level',
      'status',
      'registeredAt',
      'verifiedAt',
      'paymentMethod',
      'studentPhone',
      'guardianPhone',
      'teacherName',
      'price',
      'receiptUrl',
      'branchId'
    ];

    const rows = filtered.map((entry) => ({
      name: entry.studentName || '',
      email: entry.studentEmail || '',
      course: entry.languageName || '',
      level: entry.levelLabel || '',
      status: entry.status || (entry.verifiedAt ? 'verified' : 'approved'),
      registeredAt: formatCsvDate(entry.registeredAt),
      verifiedAt: formatCsvDate(entry.verifiedAt),
      paymentMethod: entry.paymentMethod || '',
      studentPhone: entry.studentPhone || '',
      guardianPhone: entry.guardianPhone || '',
      teacherName: entry.teacherName || '',
      price: entry.languagePrice || '',
      receiptUrl: entry.receiptUrl || '',
      branchId: entry.branchId || branchId
    }));

    return { csv: toCsv(headers, rows), filename };
  }

  if (list === 'trainings') {
    const snap = await db
      .collection('branches')
      .doc(branchId)
      .collection('trainingsRegistered')
      .orderBy('registeredAt', 'desc')
      .get();

    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const filtered = entries.filter((entry) => {
      const matchesSearch = term
        ? normalizeString(`${entry.studentName || ''} ${entry.trainingTitle || ''}`).includes(term)
        : true;
      const matchesTraining = trainingFilter === 'all' || entry.trainingTitle === trainingFilter;
      return matchesSearch && matchesTraining;
    });

    const headers = [
      'name',
      'email',
      'course',
      'status',
      'registeredAt',
      'verifiedAt',
      'paymentMethod',
      'price',
      'studentPhone',
      'trainingId',
      'registrationId',
      'paymentProof',
      'description',
      'branchId'
    ];

    const rows = filtered.map((entry) => ({
      name: entry.studentName || '',
      email: entry.studentEmail || entry.userEmail || '',
      course: entry.trainingTitle || '',
      status: entry.status || (entry.verifiedAt ? 'verified' : 'approved'),
      registeredAt: formatCsvDate(entry.registeredAt),
      verifiedAt: formatCsvDate(entry.verifiedAt),
      paymentMethod: entry.paymentMethod || '',
      price: entry.trainingPrice || '',
      studentPhone: entry.studentPhone || '',
      trainingId: entry.trainingId || '',
      registrationId: entry.registrationId || entry.id || '',
      paymentProof: entry.paymentProof || '',
      description: entry.trainingDescription || '',
      branchId: entry.branchId || branchId
    }));

    return { csv: toCsv(headers, rows), filename };
  }

  const regsSnap = await db
    .collection('supportLessonRegistrations')
    .where('branchId', '==', branchId)
    .orderBy('createdAt', 'desc')
    .get();

  const entries = regsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const userIds = Array.from(
    new Set(entries.map((e) => e.studentId || e.userId).filter(Boolean))
  );
  const profiles = new Map();
  const chunkSize = 100;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const refs = chunk.map((id) => db.collection('branches').doc(branchId).collection('users').doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s) => {
      if (s.exists) profiles.set(s.id, s.data());
    });
  }

  const resolveUserName = (entry) => {
    const userId = entry.studentId || entry.userId;
    const profile = userId ? profiles.get(userId) : null;
    const name = profile?.fullName || profile?.name || '';
    return String(name || '').trim();
  };

  const filtered = entries.filter((entry) => {
    const normalizedStatus = normalizeString(entry.status || 'pending');
    const matchesStatus = statusFilter === 'all' || normalizedStatus === normalizeString(statusFilter);
    const resolvedName = resolveUserName(entry);
    const matchesSearch = term
      ? normalizeString(
          `${resolvedName || ''} ${entry.subjectName || ''} ${entry.courseName || ''} ${entry.userEmail || entry.studentEmail || ''}`
        ).includes(term)
      : true;
    return matchesSearch && matchesStatus;
  });

  const headers = [
    'name',
    'email',
    'course',
    'status',
    'createdAt',
    'selectedMonths',
    'studentId',
    'registrationId',
    'branchId'
  ];

  const rows = filtered.map((entry) => ({
    name: resolveUserName(entry) || entry.studentName || '',
    email: entry.userEmail || entry.studentEmail || '',
    course: entry.subjectName || entry.courseName || '',
    status: normalizeString(entry.status || (entry.verified ? 'verified' : 'pending')),
    createdAt: formatCsvDate(entry.createdAt || entry.submittedAt),
    selectedMonths: Array.isArray(entry.selectedMonths) ? entry.selectedMonths.join(' | ') : '',
    studentId: entry.studentId || entry.userId || '',
    registrationId: entry.id || '',
    branchId: entry.branchId || branchId
  }));

  return { csv: toCsv(headers, rows), filename };
});

// Dedicated function for languages CSV export with proper CORS
exports.exportLanguagesCsv = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
      const startedAt = Date.now();

      try {
        // Verify authentication
        const authHeader = req.get('Authorization') || '';
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!match) {
          return res.status(401).json({ error: 'unauthenticated', message: 'Missing Authorization Bearer token.' });
        }

        const decoded = await admin.auth().verifyIdToken(match[1]);
        const uid = decoded?.uid || '';
        const email = decoded?.email || '';

        // Get request payload
        const payload = req.method === 'GET' ? (req.query || {}) : (req.body || {});
        const branchId = String(payload.branchId || '').trim();
        const search = String(payload.search || '').trim();
        const levelFilter = String(payload.levelFilter || 'all');

        // Validate inputs
        if (!branchId) {
          return res.status(400).json({ error: 'invalid-argument', message: 'branchId is required.' });
        }

        // Check admin permissions
        const isAdmin = await isAdminForBranch(branchId, uid, email);
        if (!isAdmin) {
          return res.status(403).json({ error: 'permission-denied', message: 'Admin access required.' });
        }

        // Prepare CSV export
        const term = normalizeString(search);
        const datePart = formatDateOnly(new Date());
        const filename = `languages-registrations-${datePart}.csv`;

        // Set response headers for CSV download
        res.status(200);
        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.set('Cache-Control', 'no-store');

        // Fetch language registrations
        const snap = await db
          .collection('branches')
          .doc(branchId)
          .collection('languagesRegistered')
          .orderBy('registeredAt', 'desc')
          .get();

        const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Filter entries
        const filtered = entries.filter((entry) => {
          const matchesSearch = term
            ? normalizeString(`${entry.studentName || ''} ${entry.languageName || ''} ${entry.levelLabel || ''}`).includes(term)
            : true;
          const matchesLevel = levelFilter === 'all' || entry.levelLabel === levelFilter;
          return matchesSearch && matchesLevel;
        });

        // Get user profiles for additional data
        const userIds = Array.from(new Set(filtered.map((e) => e.studentId || e.userId).filter(Boolean)));
        const profilesMap = userIds.length ? await loadBranchUsersMap(branchId, userIds) : new Map();

        // Define CSV headers
        const headers = [
          'name',
          'email',
          'course',
          'level',
          'status',
          'registeredAt',
          'verifiedAt',
          'paymentMethod',
          'studentPhone',
          'guardianPhone',
          'teacherName',
          'price',
          'receiptUrl',
          'branchId',
          'studentId'
        ];

        // Write BOM for UTF-8 Excel compatibility
        res.write('\uFEFF');
        res.write(headers.map(escapeCsvField).join(',') + '\n');

        // Write data rows
        for (const entry of filtered) {
          const profile = profilesMap.get(entry.studentId || entry.userId) || null;
          const row = {
            name: safeCsvValue(entry.studentName || profile?.fullName || profile?.name),
            email: safeCsvValue(entry.studentEmail || profile?.email || entry.userEmail),
            course: safeCsvValue(entry.languageName),
            level: safeCsvValue(entry.levelLabel),
            status: safeCsvValue(entry.status || (entry.verifiedAt ? 'verified' : 'approved')),
            registeredAt: safeCsvValue(formatCsvDate(entry.registeredAt || entry.verifiedAt || entry.submittedAt)),
            verifiedAt: safeCsvValue(formatCsvDate(entry.verifiedAt)),
            paymentMethod: safeCsvValue(entry.paymentMethod),
            studentPhone: safeCsvValue(entry.studentPhone || profile?.phoneNumber || profile?.phone),
            guardianPhone: safeCsvValue(entry.guardianPhone),
            teacherName: safeCsvValue(entry.teacherName),
            price: safeCsvValue(entry.languagePrice),
            receiptUrl: safeCsvValue(entry.receiptUrl),
            branchId: safeCsvValue(entry.branchId || branchId),
            studentId: safeCsvValue(entry.studentId || entry.userId)
          };
          res.write(headers.map((h) => escapeCsvField(row[h])).join(',') + '\n');
        }

        res.end();

        console.log('exportLanguagesCsv success', {
          branchId,
          uid,
          email,
          totalWritten: filtered.length,
          ms: Date.now() - startedAt
        });

        return null;
      } catch (err) {
        console.error('exportLanguagesCsv error', {
          message: err?.message,
          stack: err?.stack,
          code: err?.code,
          details: err,
          ms: Date.now() - startedAt
        });

        if (!res.headersSent) {
          return res.status(500).json({ error: 'internal', message: err?.message || 'Internal error' });
        }

        try {
          res.end();
        } catch (e) {}
        return null;
      }
    });
  });

exports.exportRegistrationsCsvHttp = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    return cors(req, res, async () => {

    const startedAt = Date.now();

    try {
      const authHeader = req.get('Authorization') || '';
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        return res.status(401).json({ error: 'unauthenticated', message: 'Missing Authorization Bearer token.' });
      }

      const decoded = await admin.auth().verifyIdToken(match[1]);
      const uid = decoded?.uid || '';
      const email = decoded?.email || '';

      const payload = req.method === 'GET' ? (req.query || {}) : (req.body || {});
      const list = normalizeString(payload.list);
      const branchId = String(payload.branchId || '').trim();
      const search = String(payload.search || '').trim();
      const levelFilter = String(payload.levelFilter || 'all');
      const trainingFilter = String(payload.trainingFilter || 'all');
      const statusFilter = String(payload.statusFilter || 'all');

      const pageSizeRaw = Number(payload.pageSize);
      const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(pageSizeRaw, 1000) : 500;
      const maxRecordsRaw = Number(payload.maxRecords);
      const maxRecords = Number.isFinite(maxRecordsRaw) && maxRecordsRaw > 0 ? Math.min(maxRecordsRaw, 50000) : 50000;

      if (!branchId) {
        return res.status(400).json({ error: 'invalid-argument', message: 'branchId is required.' });
      }
      if (!['languages', 'support', 'trainings'].includes(list)) {
        return res.status(400).json({ error: 'invalid-argument', message: 'Invalid list type.' });
      }

      const isAdmin = await isAdminForBranch(branchId, uid, email);
      if (!isAdmin) {
        return res.status(403).json({ error: 'permission-denied', message: 'Admin access required.' });
      }

      const term = normalizeString(search);
      const datePart = formatDateOnly(new Date());
      const filename = `${list}-registrations-${datePart}.csv`;

      res.status(200);
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="${filename}"`);
      res.set('Cache-Control', 'no-store');

      const writeLine = (line) => {
        res.write(`${line}\n`);
      };

      const resolveLanguageRow = (entry, profile) => ({
        name: safeCsvValue(entry.studentName || profile?.fullName || profile?.name),
        email: safeCsvValue(entry.studentEmail || profile?.email || entry.userEmail),
        course: safeCsvValue(entry.languageName),
        level: safeCsvValue(entry.levelLabel),
        status: safeCsvValue(entry.status || (entry.verifiedAt ? 'verified' : 'approved')),
        registeredAt: safeCsvValue(formatCsvDate(entry.registeredAt || entry.verifiedAt || entry.submittedAt)),
        verifiedAt: safeCsvValue(formatCsvDate(entry.verifiedAt)),
        paymentMethod: safeCsvValue(entry.paymentMethod),
        studentPhone: safeCsvValue(entry.studentPhone || profile?.phoneNumber || profile?.phone),
        guardianPhone: safeCsvValue(entry.guardianPhone),
        teacherName: safeCsvValue(entry.teacherName),
        price: safeCsvValue(entry.languagePrice),
        receiptUrl: safeCsvValue(entry.receiptUrl),
        branchId: safeCsvValue(entry.branchId || branchId),
        studentId: safeCsvValue(entry.studentId || entry.userId)
      });

      const resolveTrainingRow = (entry, profile) => ({
        name: safeCsvValue(entry.studentName || profile?.fullName || profile?.name),
        email: safeCsvValue(entry.studentEmail || entry.userEmail || profile?.email),
        course: safeCsvValue(entry.trainingTitle || entry.trainingName),
        status: safeCsvValue(entry.status || (entry.verifiedAt ? 'verified' : 'approved')),
        registeredAt: safeCsvValue(formatCsvDate(entry.registeredAt || entry.verifiedAt || entry.submittedAt || entry.createdAt)),
        verifiedAt: safeCsvValue(formatCsvDate(entry.verifiedAt)),
        paymentMethod: safeCsvValue(entry.paymentMethod),
        price: safeCsvValue(entry.trainingPrice),
        studentPhone: safeCsvValue(entry.studentPhone || profile?.phoneNumber || profile?.phone),
        trainingId: safeCsvValue(entry.trainingId || entry.selectedTrainingId),
        registrationId: safeCsvValue(entry.registrationId || entry.formId || entry.id),
        paymentProof: safeCsvValue(entry.paymentProof || entry.receiptUrl),
        description: safeCsvValue(entry.trainingDescription),
        birthDate: safeCsvValue(entry.birthDate),
        birthPlace: safeCsvValue(entry.birthPlace),
        branchId: safeCsvValue(entry.branchId || branchId),
        userId: safeCsvValue(entry.userId || entry.studentId)
      });

      const resolveSupportRow = (entry, profile) => {
        const normalizedStatus = normalizeString(entry.status || (entry.verified ? 'verified' : 'pending'));
        return {
          name: safeCsvValue(profile?.fullName || profile?.name || entry.studentName),
          email: safeCsvValue(entry.userEmail || entry.studentEmail || profile?.email),
          course: safeCsvValue(entry.subjectName || entry.courseName),
          status: safeCsvValue(normalizedStatus),
          createdAt: safeCsvValue(formatCsvDate(entry.createdAt || entry.submittedAt || entry.timestamp)),
          selectedMonths: safeCsvValue(Array.isArray(entry.selectedMonths) ? entry.selectedMonths : []),
          studentId: safeCsvValue(entry.studentId || entry.userId),
          registrationId: safeCsvValue(entry.id),
          branchId: safeCsvValue(entry.branchId || branchId)
        };
      };

      let headers = [];
      if (list === 'languages') {
        headers = [
          'name',
          'email',
          'course',
          'level',
          'status',
          'registeredAt',
          'verifiedAt',
          'paymentMethod',
          'studentPhone',
          'guardianPhone',
          'teacherName',
          'price',
          'receiptUrl',
          'branchId',
          'studentId'
        ];
      } else if (list === 'trainings') {
        headers = [
          'name',
          'email',
          'course',
          'status',
          'registeredAt',
          'verifiedAt',
          'paymentMethod',
          'price',
          'studentPhone',
          'trainingId',
          'registrationId',
          'paymentProof',
          'description',
          'birthDate',
          'birthPlace',
          'branchId',
          'userId'
        ];
      } else {
        headers = [
          'name',
          'email',
          'course',
          'status',
          'createdAt',
          'selectedMonths',
          'studentId',
          'registrationId',
          'branchId'
        ];
      }

      res.write('\uFEFF');
      writeLine(headers.map(escapeCsvField).join(','));

      let totalWritten = 0;
      let lastDoc = null;

      const collectionRef =
        list === 'languages'
          ? db.collection('branches').doc(branchId).collection('languagesRegistered')
          : list === 'trainings'
          ? db.collection('branches').doc(branchId).collection('trainingsRegistered')
          : db.collection('supportLessonRegistrations');

      const orderField = list === 'support' ? 'createdAt' : 'registeredAt';
      const baseQuery =
        list === 'support'
          ? collectionRef.where('branchId', '==', branchId).orderBy(orderField, 'desc')
          : collectionRef.orderBy(orderField, 'desc');

      while (true) {
        let q = baseQuery.limit(pageSize);
        if (lastDoc) q = q.startAfter(lastDoc);

        const snap = await q.get();
        if (snap.empty) break;

        const docs = snap.docs;
        lastDoc = docs[docs.length - 1];

        const entries = docs.map((d) => ({ id: d.id, ...d.data() }));

        let userIds = [];
        if (list === 'languages') {
          userIds = entries.map((e) => e.studentId || e.userId).filter(Boolean);
        } else if (list === 'trainings') {
          userIds = entries.map((e) => e.userId || e.studentId).filter(Boolean);
        } else {
          userIds = entries.map((e) => e.studentId || e.userId).filter(Boolean);
        }

        const profilesMap = userIds.length ? await loadBranchUsersMap(branchId, userIds) : new Map();

        for (const entry of entries) {
          if (totalWritten >= maxRecords) break;

          if (list === 'languages') {
            const matchesLevel = levelFilter === 'all' || String(entry.levelLabel || '') === String(levelFilter);
            const matchesSearch = term
              ? normalizeString(`${entry.studentName || ''} ${entry.languageName || ''} ${entry.levelLabel || ''}`).includes(term)
              : true;
            if (!matchesLevel || !matchesSearch) continue;

            const profile = profilesMap.get(entry.studentId || entry.userId) || null;
            const row = resolveLanguageRow(entry, profile);
            writeLine(headers.map((h) => escapeCsvField(row[h])).join(','));
            totalWritten += 1;
            continue;
          }

          if (list === 'trainings') {
            const matchesTraining = trainingFilter === 'all' || String(entry.trainingTitle || '') === String(trainingFilter);
            const matchesSearch = term
              ? normalizeString(`${entry.studentName || ''} ${entry.trainingTitle || ''}`).includes(term)
              : true;
            if (!matchesTraining || !matchesSearch) continue;

            const profile = profilesMap.get(entry.userId || entry.studentId) || null;
            const row = resolveTrainingRow(entry, profile);
            writeLine(headers.map((h) => escapeCsvField(row[h])).join(','));
            totalWritten += 1;
            continue;
          }

          const normalizedStatus = normalizeString(entry.status || (entry.verified ? 'verified' : 'pending'));
          const matchesStatus = statusFilter === 'all' || normalizedStatus === normalizeString(statusFilter);
          const profile = profilesMap.get(entry.studentId || entry.userId) || null;
          const nameForSearch = String(profile?.fullName || profile?.name || '').trim();
          const emailForSearch = String(entry.userEmail || entry.studentEmail || profile?.email || '');
          const matchesSearch = term
            ? normalizeString(
                `${nameForSearch || ''} ${entry.subjectName || ''} ${entry.courseName || ''} ${emailForSearch || ''}`
              ).includes(term)
            : true;
          if (!matchesStatus || !matchesSearch) continue;

          const row = resolveSupportRow(entry, profile);
          writeLine(headers.map((h) => escapeCsvField(row[h])).join(','));
          totalWritten += 1;
        }

        if (totalWritten >= maxRecords) break;
      }

      res.end();

      console.log('exportRegistrationsCsvHttp success', {
        list,
        branchId,
        uid,
        email,
        totalWritten,
        pageSize,
        maxRecords,
        ms: Date.now() - startedAt
      });

      return null;
    } catch (err) {
      console.error('exportRegistrationsCsvHttp error', {
        message: err?.message,
        stack: err?.stack,
        code: err?.code,
        details: err,
        ms: Date.now() - startedAt
      });

      if (!res.headersSent) {
        return res.status(500).json({ error: 'internal', message: err?.message || 'Internal error' });
      }

      try {
        res.end();
      } catch (e) {}
      return null;
    }
    });
  });

// ==================== EMAIL NOTIFICATION TRIGGERS ====================

// FLOW 1: User Account Registration Approval
// Trigger 1: On user registration - send email to admin
exports.onUserCreated = functions.firestore
  .document('branches/{branchId}/users/{userId}')
  .onCreate(async (snap, context) => {
    const userData = snap.data();
    const branchId = context.params.branchId;
    const userId = context.params.userId;

    // Prevent duplicate emails on retries
    if (!(await claimEmailEvent(context.eventId, 'user-created-admin'))) {
      return null;
    }

    // Only send email if user is pending (new registration)
    const status = String(userData.status || '').toLowerCase();
    const verificationStatus = String(userData.verificationStatus || '').toLowerCase();
    const accountVerified = Boolean(userData.accountVerified);

    // Check if this is a new pending registration
    if (status === 'pending' || verificationStatus === 'pending' || !accountVerified) {
      try {
        const studentName = userData.fullName || userData.name || 'طالب';
        const studentEmail = userData.email || '';

        if (!studentEmail) {
          console.log('Skipping email: No student email found');
          return null;
        }

        // Get admin emails
        const adminEmails = await getAdminEmails(branchId);
        
        if (adminEmails.length === 0) {
          console.log('No admin emails found for branch:', branchId);
          return null;
        }

        // Send email to all admins
        const emailTemplate = emailTemplates.newUserRegistration(studentName, studentEmail);
        const emailPromises = adminEmails.map(email => 
          sendEmail(email, emailTemplate.subject, emailTemplate.html)
        );

        await Promise.all(emailPromises);
        console.log('New user registration emails sent to admins:', adminEmails);
      } catch (error) {
        console.error('Error sending new user registration email:', error);
      }
    }

    return null;
  });

// Trigger 2: On user approval - send email to student
exports.onUserUpdated = functions.firestore
  .document('branches/{branchId}/users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const branchId = context.params.branchId;

    // Check if user was just approved
    const beforeVerified = Boolean(before.accountVerified) || String(before.verificationStatus || '').toLowerCase() === 'verified';
    const afterVerified = Boolean(after.accountVerified) || String(after.verificationStatus || '').toLowerCase() === 'verified';

    // Only send email on transition from NOT verified -> verified
    if (!beforeVerified && afterVerified) {
      try {
        // Check if email was already sent (prevent duplicates)
        const emailSentFlag = after.accountApprovalEmailSent;
        if (emailSentFlag) {
          console.log('Account approval email already sent for user:', context.params.userId);
          return null;
        }

        // Only notify students (avoid emailing admins)
        const role = String(after.role || '').toLowerCase();
        if (role && role !== 'student') {
          return null;
        }

        const studentName = after.fullName || after.name || 'طالب';
        const studentEmail = after.email || '';

        if (!studentEmail) {
          console.log('Skipping email: No student email found');
          return null;
        }

        // Send email to student
        const emailTemplate = emailTemplates.accountApproved(studentName);
        await sendEmail(studentEmail, emailTemplate.subject, emailTemplate.html);

        // Mark email as sent to prevent duplicates
        await change.after.ref.update({
          accountApprovalEmailSent: true,
          accountApprovalEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log('Account approval email sent to student:', studentEmail);
      } catch (error) {
        console.error('Error sending account approval email:', error);
      }
    }

    return null;
  });

// FLOW 2b: Course Registration (legacy/branch registrations collection)
// Some parts of the app use: branches/{branchId}/registrations/{registrationId}
// We send emails only for language/training registrations, not for training_request/yearly_fee/etc.
exports.onBranchRegistrationCreated = functions.firestore
  .document('branches/{branchId}/registrations/{registrationId}')
  .onCreate(async (snap, context) => {
    const reg = snap.data() || {};
    const branchId = context.params.branchId;

    if (!(await claimEmailEvent(context.eventId, 'branch-registration-created-admin'))) {
      return null;
    }

    const type = normalizeString(reg.type || reg.courseType || '');
    const status = normalizeString(reg.status || 'pending');

    if (!['language', 'languages', 'training', 'trainings'].includes(type)) return null;
    if (status !== 'pending') return null;
    if (reg.adminNotificationEmailSent) return null;

    try {
      const studentName = String(reg.name || reg.studentName || '').trim() || 'طالب';
      const courseName = String(reg.courseName || reg.course || '').trim() || 'دورة';
      const courseTypeLabel = type.startsWith('lang') ? 'دورة لغة' : 'دورة تكوينية';

      const adminEmails = await getAdminEmails(branchId);
      if (adminEmails.length === 0) return null;

      const emailTemplate = emailTemplates.newCourseRegistration(studentName, courseName, courseTypeLabel);
      await Promise.all(adminEmails.map((email) => sendEmail(email, emailTemplate.subject, emailTemplate.html)));

      await snap.ref.update({
        adminNotificationEmailSent: true,
        adminNotificationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error('Error sending branch registration admin email:', error);
    }

    return null;
  });

exports.onBranchRegistrationUpdated = functions.firestore
  .document('branches/{branchId}/registrations/{registrationId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const branchId = context.params.branchId;

    const type = normalizeString(after.type || after.courseType || '');
    if (!['language', 'languages', 'training', 'trainings'].includes(type)) return null;

    const beforeStatus = normalizeString(before.status || '');
    const afterStatus = normalizeString(after.status || '');

    if (!(beforeStatus === 'pending' && afterStatus === 'approved')) return null;
    if (after.studentApprovalEmailSent) return null;

    try {
      const studentEmail = String(after.email || after.studentEmail || after.userEmail || '').trim();
      if (!studentEmail) return null;

      const studentName = String(after.name || after.studentName || '').trim() || 'طالب';
      const courseName = String(after.courseName || after.course || '').trim() || 'دورة';

      const emailTemplate = emailTemplates.courseApproved(studentName, courseName);
      await sendEmail(studentEmail, emailTemplate.subject, emailTemplate.html);

      await change.after.ref.update({
        studentApprovalEmailSent: true,
        studentApprovalEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error('Error sending branch registration student approval email:', error);
    }

    return null;
  });

// FLOW 2: Course Registration Approval
// Trigger 3: On language course registration - send email to admin
exports.onLanguageRegistrationCreated = functions.firestore
  .document('branches/{branchId}/languagesForms/{userId}/languageFormEntries/{entryId}')
  .onCreate(async (snap, context) => {
    const entryData = snap.data();
    const branchId = context.params.branchId;
    const userId = context.params.userId;

    if (!(await claimEmailEvent(context.eventId, 'language-created-admin'))) {
      return null;
    }

    // Only send email if status is pending
    const status = String(entryData.status || '').toLowerCase();
    if (status === 'pending') {
      try {
        // Get user data
        const userRef = db.collection('branches').doc(branchId).collection('users').doc(userId);
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() : {};

        const studentName = entryData.studentName || userData.fullName || userData.name || 'طالب';
        const courseName = entryData.languageName || 'دورة لغة';

        // Get admin emails
        const adminEmails = await getAdminEmails(branchId);
        
        if (adminEmails.length === 0) {
          console.log('No admin emails found for branch:', branchId);
          return null;
        }

        // Send email to all admins
        const emailTemplate = emailTemplates.newCourseRegistration(studentName, courseName, 'دورة لغة');
        const emailPromises = adminEmails.map(email => 
          sendEmail(email, emailTemplate.subject, emailTemplate.html)
        );

        await Promise.all(emailPromises);
        console.log('New language course registration emails sent to admins:', adminEmails);
      } catch (error) {
        console.error('Error sending language course registration email:', error);
      }
    }

    return null;
  });

// Trigger 4: On language course approval - send email to student
exports.onLanguageRegistrationUpdated = functions.firestore
  .document('branches/{branchId}/languagesForms/{userId}/languageFormEntries/{entryId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const branchId = context.params.branchId;
    const userId = context.params.userId;

    // Check if status changed from pending to approved
    const beforeStatus = String(before.status || '').toLowerCase();
    const afterStatus = String(after.status || '').toLowerCase();
    const beforeVerified = Boolean(before.verified);
    const afterVerified = Boolean(after.verified);

    if ((beforeStatus === 'pending' && afterStatus === 'approved') || 
        (!beforeVerified && afterVerified && afterStatus === 'approved')) {
      try {
        // Get user data
        const userRef = db.collection('branches').doc(branchId).collection('users').doc(userId);
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() : {};

        const studentName = after.studentName || userData.fullName || userData.name || 'طالب';
        const studentEmail = after.studentEmail || userData.email || after.userEmail || '';

        if (!studentEmail) {
          console.log('Skipping email: No student email found');
          return null;
        }

        // Check if email was already sent (prevent duplicates)
        const emailSentFlag = after.courseApprovalEmailSent;
        if (emailSentFlag) {
          console.log('Course approval email already sent for entry:', context.params.entryId);
          return null;
        }

        const courseName = after.languageName || 'دورة لغة';

        // Send email to student
        const emailTemplate = emailTemplates.courseApproved(studentName, courseName);
        await sendEmail(studentEmail, emailTemplate.subject, emailTemplate.html);

        // Mark email as sent to prevent duplicates
        await change.after.ref.update({
          courseApprovalEmailSent: true,
          courseApprovalEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log('Language course approval email sent to student:', studentEmail);
      } catch (error) {
        console.error('Error sending language course approval email:', error);
      }
    }

    return null;
  });

// Trigger 5: On training course registration - send email to admin
exports.onTrainingRegistrationCreated = functions.firestore
  .document('branches/{branchId}/trainingsForms/{userId}/trainingFormEntries/{entryId}')
  .onCreate(async (snap, context) => {
    const entryData = snap.data();
    const branchId = context.params.branchId;
    const userId = context.params.userId;

    if (!(await claimEmailEvent(context.eventId, 'training-created-admin'))) {
      return null;
    }

    // Only send email if status is pending
    const status = String(entryData.status || '').toLowerCase();
    if (status === 'pending') {
      try {
        // Get user data
        const userRef = db.collection('branches').doc(branchId).collection('users').doc(userId);
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() : {};

        const studentName = entryData.studentName || userData.fullName || userData.name || 'طالب';
        const courseName = entryData.trainingTitle || entryData.trainingName || 'دورة تكوينية';

        // Get admin emails
        const adminEmails = await getAdminEmails(branchId);
        
        if (adminEmails.length === 0) {
          console.log('No admin emails found for branch:', branchId);
          return null;
        }

        // Send email to all admins
        const emailTemplate = emailTemplates.newCourseRegistration(studentName, courseName, 'دورة تكوينية');
        const emailPromises = adminEmails.map(email => 
          sendEmail(email, emailTemplate.subject, emailTemplate.html)
        );

        await Promise.all(emailPromises);
        console.log('New training course registration emails sent to admins:', adminEmails);
      } catch (error) {
        console.error('Error sending training course registration email:', error);
      }
    }

    return null;
  });

// Trigger 6: On training course approval - send email to student
exports.onTrainingRegistrationUpdated = functions.firestore
  .document('branches/{branchId}/trainingsForms/{userId}/trainingFormEntries/{entryId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const branchId = context.params.branchId;
    const userId = context.params.userId;

    // Check if status changed from pending to approved
    const beforeStatus = String(before.status || '').toLowerCase();
    const afterStatus = String(after.status || '').toLowerCase();
    const beforeVerified = Boolean(before.verified);
    const afterVerified = Boolean(after.verified);

    if ((beforeStatus === 'pending' && afterStatus === 'approved') || 
        (!beforeVerified && afterVerified && afterStatus === 'approved')) {
      try {
        // Get user data
        const userRef = db.collection('branches').doc(branchId).collection('users').doc(userId);
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() : {};

        const studentName = after.studentName || userData.fullName || userData.name || 'طالب';
        const studentEmail = after.userEmail || after.studentEmail || userData.email || '';

        if (!studentEmail) {
          console.log('Skipping email: No student email found');
          return null;
        }

        // Check if email was already sent (prevent duplicates)
        const emailSentFlag = after.courseApprovalEmailSent;
        if (emailSentFlag) {
          console.log('Course approval email already sent for entry:', context.params.entryId);
          return null;
        }

        const courseName = after.trainingTitle || after.trainingName || 'دورة تكوينية';

        // Send email to student
        const emailTemplate = emailTemplates.courseApproved(studentName, courseName);
        await sendEmail(studentEmail, emailTemplate.subject, emailTemplate.html);

        // Mark email as sent to prevent duplicates
        await change.after.ref.update({
          courseApprovalEmailSent: true,
          courseApprovalEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log('Training course approval email sent to student:', studentEmail);
      } catch (error) {
        console.error('Error sending training course approval email:', error);
      }
    }

    return null;
  });
