const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const service  = process.env.EMAIL_SERVICE  || 'gmail';
  const user     = process.env.EMAIL_USER;
  const pass     = process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    console.warn('[email] EMAIL_USER / EMAIL_PASSWORD not set — emails disabled');
    return null;
  }

  _transporter = nodemailer.createTransport({ service, auth: { user, pass } });
  return _transporter;
}

async function sendEmail(to, subject, html) {
  const transporter = getTransporter();
  if (!transporter) return { success: false, error: 'Email not configured' };

  try {
    const from = process.env.EMAIL_USER;
    const info = await transporter.sendMail({ from, to, subject, html });
    console.log('[email] sent', info.messageId, '->', to);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[email] send error', err.message);
    return { success: false, error: err.message };
  }
}

// ── Templates ──────────────────────────────────────────────────────────────────

const WEBSITE_URL = () => process.env.WEBSITE_URL || 'https://trust-school.web.app';

// Escape every user-supplied value before embedding it in an HTML email body.
// Student names / course names originate from user input, so raw interpolation
// would allow HTML/link injection into admin- and student-facing emails.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const templates = {
  accountApproved: (studentName) => {
    const name = escapeHtml(studentName);
    return {
      subject: 'تم التحقق من حسابك - Trust School',
      html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#16a34a;">تهانينا! تم التحقق من حسابك</h2>
        <p>عزيزي/عزيزتي ${name},</p>
        <p>نود إعلامك بأن حسابك قد تم التحقق منه بنجاح.</p>
        <p style="font-weight:bold;color:#16a34a;">يمكنك الآن تسجيل الدخول والتسجيل في الدورات.</p>
        <div style="background-color:#dcfce7;padding:15px;border-radius:8px;margin:20px 0;">
          <p>بعد التحقق، يمكنك:</p>
          <ul>
            <li>تسجيل الدخول إلى حسابك</li>
            <li>التسجيل في دورات اللغات</li>
            <li>التسجيل في الدورات التكوينية</li>
            <li>دفع الرسوم السنوية للوصول إلى دروس الدعم</li>
          </ul>
        </div>
        <p><a href="${WEBSITE_URL()}" style="color:#2563eb;">الدخول إلى الموقع</a></p>
        <p>شكراً لانضمامك إلى Trust School!</p>
      </div>`,
    };
  },

  accountRejected: (studentName) => {
    const name = escapeHtml(studentName);
    return {
      subject: 'تحديث حول طلب تسجيلك - Trust School',
      html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#dc2626;">تحديث حول طلب تسجيلك</h2>
        <p>عزيزي/عزيزتي ${name},</p>
        <p>نأسف لإعلامك بأن طلب تسجيلك لم يتم قبوله في هذا الوقت.</p>
        <p>يرجى التواصل معنا للاستفسار عن الأسباب أو تقديم المعلومات الناقصة.</p>
        <p><a href="${WEBSITE_URL()}" style="color:#2563eb;">الدخول إلى الموقع</a></p>
      </div>`,
    };
  },

  courseApproved: (studentName, courseName) => {
    const name = escapeHtml(studentName);
    const course = escapeHtml(courseName);
    return {
      subject: 'تمت الموافقة على تسجيلك في الدورة - Trust School',
      html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#16a34a;">تمت الموافقة على تسجيلك</h2>
        <p>عزيزي/عزيزتي ${name},</p>
        <p>نود إعلامك بأن تسجيلك في الدورة التالية قد تمت الموافقة عليه:</p>
        <div style="background-color:#dcfce7;padding:15px;border-radius:8px;margin:20px 0;">
          <p style="font-size:18px;font-weight:bold;color:#16a34a;">${course}</p>
        </div>
        <p style="font-weight:bold;color:#16a34a;">لديك الآن إمكانية الوصول إلى الدورة.</p>
        <p><a href="${WEBSITE_URL()}" style="color:#2563eb;">الدخول إلى حسابك</a></p>
        <p>شكراً لانضمامك إلى Trust School!</p>
      </div>`,
    };
  },

  courseRejected: (studentName, courseName) => {
    const name = escapeHtml(studentName);
    const course = escapeHtml(courseName);
    return {
      subject: 'تحديث حول طلب تسجيلك في الدورة - Trust School',
      html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#dc2626;">تحديث حول طلب التسجيل في الدورة</h2>
        <p>عزيزي/عزيزتي ${name},</p>
        <p>نأسف لإعلامك بأن طلب تسجيلك في دورة <strong>${course}</strong> لم يتم قبوله.</p>
        <p>يرجى التواصل معنا لمزيد من المعلومات.</p>
        <p><a href="${WEBSITE_URL()}" style="color:#2563eb;">الدخول إلى الموقع</a></p>
      </div>`,
    };
  },

  newUserRegistration: (studentName, studentEmail, branchLabel) => {
    const name = escapeHtml(studentName);
    const email = escapeHtml(studentEmail);
    const branch = escapeHtml(branchLabel);
    return {
      subject: 'طلب تسجيل جديد - طالب جديد ينتظر التحقق',
      html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#2563eb;">طلب تسجيل جديد</h2>
        <p>تم استلام طلب تسجيل جديد من طالب:</p>
        <div style="background-color:#f3f4f6;padding:15px;border-radius:8px;margin:20px 0;">
          <p><strong>اسم الطالب:</strong> ${name}</p>
          <p><strong>البريد الإلكتروني:</strong> ${email}</p>
          ${branchLabel ? `<p><strong>الفرع:</strong> ${branch}</p>` : ''}
        </div>
        <p style="color:#dc2626;font-weight:bold;">طالب جديد ينتظر التحقق</p>
        <p>يرجى مراجعة الطلب والموافقة عليه من لوحة التحكم.</p>
      </div>`,
    };
  },

  newCourseRegistration: (studentName, courseName, courseType) => {
    const name = escapeHtml(studentName);
    const course = escapeHtml(courseName);
    const type = escapeHtml(courseType);
    return {
      subject: `طلب تسجيل جديد في دورة - ${course}`,
      html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#2563eb;">طلب تسجيل جديد في دورة</h2>
        <p>تم استلام طلب تسجيل جديد في دورة:</p>
        <div style="background-color:#f3f4f6;padding:15px;border-radius:8px;margin:20px 0;">
          <p><strong>اسم الطالب:</strong> ${name}</p>
          <p><strong>اسم الدورة:</strong> ${course}</p>
          <p><strong>نوع الدورة:</strong> ${type}</p>
        </div>
        <p style="color:#dc2626;font-weight:bold;">تسجيل دورة جديد ينتظر الموافقة</p>
        <p>يرجى مراجعة الطلب والموافقة عليه من لوحة التحكم.</p>
      </div>`,
    };
  },

  deletionWarning: (studentName, daysLeft) => {
    const name = escapeHtml(studentName);
    const days = escapeHtml(daysLeft);
    return {
      subject: 'تحذير: حسابك سيتم حذفه - Trust School',
      html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#dc2626;">تحذير: حسابك سيتم حذفه</h2>
        <p>عزيزي/عزيزتي ${name},</p>
        <p>نود إعلامك بأن حسابك غير نشط منذ فترة طويلة وسيتم حذفه خلال <strong>${days} يوم</strong>.</p>
        <p>إذا كنت تريد الاحتفاظ بحسابك، يرجى تسجيل الدخول في أقرب وقت.</p>
        <p><a href="${WEBSITE_URL()}" style="color:#2563eb;">تسجيل الدخول الآن</a></p>
      </div>`,
    };
  },
};

module.exports = { sendEmail, templates, escapeHtml };
