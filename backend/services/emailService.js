const nodemailer = require('nodemailer');
const crypto = require('crypto');

// ════════════════════════════════════════════════════════════════════════════
//  Email service — deliverability-hardened transactional mail
// ════════════════════════════════════════════════════════════════════════════
//  Every choice in this file exists to keep mail OUT of the spam folder. The
//  short version of the rules mailbox providers (Gmail/Yahoo/Outlook) enforce:
//
//   1. Send from a DOMAIN YOU CONTROL and authenticate it (SPF + DKIM + DMARC).
//      Sending business mail from a free @gmail.com account through a datacenter
//      IP is the #1 reason mail is flagged — it can never align to your brand
//      domain. Configure SMTP_* / MAIL_* below to point at a real provider
//      (Brevo, Resend, SendGrid, Workspace…) on your own domain.
//   2. Every message must be multipart: a text/plain part AND a text/html part.
//      HTML-only mail is a classic spam signal.
//   3. Well-formed HTML: full <!DOCTYPE>, <html>, <head>, UTF-8 charset.
//   4. Friendly, branded From + a real Reply-To.
//   5. Stable Message-ID on the sending domain, List-Unsubscribe, and headers
//      that mark the mail as auto-generated/transactional.
//   6. Clear sender identity in the footer (name, address, contact) — CAN-SPAM
//      / RFC-compliant and a positive reputation signal.
//
//  See EMAIL_DELIVERABILITY_REPORT.md for the DNS records the domain owner must
//  add — those cannot be done in code.
// ════════════════════════════════════════════════════════════════════════════

let _transporter = null;

// ── Transport ────────────────────────────────────────────────────────────────
// Provider-agnostic SMTP. Prefer the generic SMTP_* variables so you can point
// at ANY reputable provider without code changes. The legacy gmail "service"
// path is kept only for backwards-compatibility and is strongly discouraged.
function buildTransport() {
  const host = process.env.SMTP_HOST;

  if (host) {
    const port = Number(process.env.SMTP_PORT || 587);
    // Port 465 = implicit TLS (secure:true). Port 587/25 = STARTTLS (secure:false).
    // Honour an explicit SMTP_SECURE override, otherwise infer from the port.
    const secureEnv = process.env.SMTP_SECURE;
    const secure = secureEnv != null
      ? String(secureEnv).toLowerCase() === 'true'
      : port === 465;

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      // A pooled, throttled connection sends mail in a steady trickle instead of
      // a burst. Bursty sending from one IP looks like spam to receiving servers.
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
    });
  }

  // ── Legacy fallback (DISCOURAGED) ──
  // Consumer Gmail/Outlook SMTP: free-provider From + shared limits = spam.
  const service = process.env.EMAIL_SERVICE || 'gmail';
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  if (!user || !pass) return null;

  console.warn(
    '[email] Using legacy "%s" consumer transport — mail will likely be ' +
    'filtered as spam. Configure SMTP_HOST + a custom sending domain instead.',
    service
  );
  return nodemailer.createTransport({ service, auth: { user, pass } });
}

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = buildTransport();
  if (!_transporter) {
    console.warn('[email] No SMTP config (set SMTP_HOST or EMAIL_USER/PASSWORD) — emails disabled');
  }
  return _transporter;
}

// Optional health check — call once at boot to confirm credentials/DNS resolve.
async function verifyTransport() {
  const t = getTransporter();
  if (!t) return { ok: false, error: 'not-configured' };
  try {
    await t.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Sender identity ──────────────────────────────────────────────────────────
// IMPORTANT: the From address is decoupled from the SMTP login. With an ESP the
// SMTP user is an API key / relay login, NOT the address recipients see — they
// must be configured separately. MAIL_FROM_ADDRESS should be on the SAME domain
// you authenticate with SPF/DKIM/DMARC (e.g. noreply@trustschoolamara.com).
const ORG_NAME      = 'Trust School Amara';
const FROM_ADDRESS  = () => process.env.MAIL_FROM_ADDRESS || process.env.EMAIL_USER || '';
const FROM_NAME     = () => process.env.MAIL_FROM_NAME || ORG_NAME;
const REPLY_TO      = () => process.env.MAIL_REPLY_TO || process.env.EMAIL_REPLY_TO || FROM_ADDRESS();
const SUPPORT_EMAIL = () => process.env.MAIL_SUPPORT_EMAIL || REPLY_TO() || FROM_ADDRESS();
const WEBSITE_URL   = () => process.env.WEBSITE_URL || 'https://trust-school.web.app';
const ORG_ADDRESS   = () => process.env.MAIL_ORG_ADDRESS || 'بومرداس / برج منايل، الجزائر';
const ORG_PHONE     = () => process.env.MAIL_ORG_PHONE || '0554 56 29 97';

function fromDomain() {
  const addr = FROM_ADDRESS();
  const at = addr.lastIndexOf('@');
  return at >= 0 ? addr.slice(at + 1) : 'localhost';
}

// A Message-ID anchored to the sending domain (not the relay's) helps DKIM/DMARC
// alignment heuristics and threading. A missing or mismatched Message-ID is a
// spam signal.
function makeMessageId() {
  return `<${Date.now()}.${crypto.randomBytes(12).toString('hex')}@${fromDomain()}>`;
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

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

// Last-resort HTML→text fallback. Templates ship hand-written text parts (better
// quality), but if a caller passes only HTML we still guarantee a text/plain
// part so the message is never HTML-only.
function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<(?:br|\/p|\/div|\/h\d|\/li|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Shared, well-formed HTML document wrapper. Table-based + inline styles for
// maximum client compatibility; full <head> with UTF-8 so Arabic renders
// everywhere; branded header and an identity-complete footer.
function layout({ heading, accent = '#2563eb', preheader = '', contentHtml, cta }) {
  const year = new Date().getFullYear();
  const site = WEBSITE_URL();
  const phone = ORG_PHONE();
  const support = SUPPORT_EMAIL();

  const ctaHtml = cta
    ? `
            <tr><td style="padding:20px 0 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="${accent}" style="border-radius:8px;">
                  <a href="${cta.url}" target="_blank" rel="noopener"
                     style="display:inline-block;padding:12px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(cta.text)}</a>
                </td></tr>
              </table>
            </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Preheader: controls the inbox preview snippet, hidden in the body. -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:#f4f4f7;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f7;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:${accent};padding:20px 28px;font-family:Arial,Helvetica,sans-serif;">
          <span style="font-size:20px;font-weight:bold;color:#ffffff;">${escapeHtml(ORG_NAME)}</span>
        </td></tr>
        <tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#1f2937;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="font-size:20px;font-weight:bold;color:${accent};padding-bottom:14px;">${escapeHtml(heading)}</td></tr>
            <tr><td>${contentHtml}</td></tr>${ctaHtml}
          </table>
        </td></tr>
        <tr><td style="padding:20px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#6b7280;">
          <div style="font-weight:bold;color:#374151;">${escapeHtml(ORG_NAME)}</div>
          <div>${escapeHtml(ORG_ADDRESS())}</div>
          <div>
            <a href="tel:${phone.replace(/\s+/g, '')}" style="color:#6b7280;text-decoration:none;">${escapeHtml(phone)}</a>
            &nbsp;•&nbsp;
            <a href="mailto:${escapeHtml(support)}" style="color:#6b7280;text-decoration:none;">${escapeHtml(support)}</a>
          </div>
          <div style="margin-top:6px;"><a href="${site}" style="color:#2563eb;text-decoration:none;">${escapeHtml(site)}</a></div>
          <div style="margin-top:12px;color:#9ca3af;font-size:11px;">
            تلقيت هذا البريد لأنك مسجّل في منصة ${escapeHtml(ORG_NAME)}. إذا لم تكن صاحب الطلب، يمكنك تجاهل هذه الرسالة أو <a href="mailto:${escapeHtml(support)}?subject=unsubscribe" style="color:#9ca3af;">إلغاء الاشتراك</a>.
            <br>&copy; ${year} ${escapeHtml(ORG_NAME)}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Build the text/plain counterpart with the same sender identity footer the
// HTML version carries, so both MIME parts are consistent.
function textBody(lines) {
  const footer = [
    '',
    '—',
    ORG_NAME,
    ORG_ADDRESS(),
    `${ORG_PHONE()} • ${SUPPORT_EMAIL()}`,
    WEBSITE_URL(),
  ];
  return [...lines, ...footer].join('\n');
}

// ── Templates ────────────────────────────────────────────────────────────────
// Each returns { subject, html, text } — always both MIME parts.

const templates = {
  accountApproved: (studentName) => {
    const name = escapeHtml(studentName);
    const heading = 'تهانينا! تم التحقق من حسابك';
    return {
      subject: 'تم التحقق من حسابك - Trust School Amara',
      html: layout({
        heading,
        accent: '#16a34a',
        preheader: 'تم تفعيل حسابك ويمكنك الآن تسجيل الدخول والتسجيل في الدورات.',
        contentHtml: `
            <p style="margin:0 0 12px;">عزيزي/عزيزتي ${name}،</p>
            <p style="margin:0 0 12px;">نود إعلامك بأن حسابك قد تم التحقق منه بنجاح. يمكنك الآن تسجيل الدخول والتسجيل في الدورات.</p>
            <p style="margin:0 0 6px;font-weight:bold;">بعد التحقق يمكنك:</p>
            <ul style="margin:0 0 4px;padding-inline-start:20px;">
              <li>تسجيل الدخول إلى حسابك</li>
              <li>التسجيل في دورات اللغات</li>
              <li>التسجيل في الدورات التكوينية</li>
              <li>دفع الرسوم السنوية للوصول إلى دروس الدعم</li>
            </ul>`,
        cta: { text: 'الدخول إلى حسابك', url: WEBSITE_URL() },
      }),
      text: textBody([
        `عزيزي/عزيزتي ${studentName}،`,
        '',
        'تم التحقق من حسابك بنجاح. يمكنك الآن تسجيل الدخول والتسجيل في الدورات.',
        '',
        'بعد التحقق يمكنك:',
        '- تسجيل الدخول إلى حسابك',
        '- التسجيل في دورات اللغات',
        '- التسجيل في الدورات التكوينية',
        '- دفع الرسوم السنوية للوصول إلى دروس الدعم',
        '',
        `الدخول إلى حسابك: ${WEBSITE_URL()}`,
      ]),
    };
  },

  accountRejected: (studentName) => {
    const name = escapeHtml(studentName);
    const heading = 'تحديث حول طلب تسجيلك';
    return {
      subject: 'تحديث حول طلب تسجيلك - Trust School Amara',
      html: layout({
        heading,
        accent: '#dc2626',
        preheader: 'لدينا تحديث بخصوص طلب تسجيلك.',
        contentHtml: `
            <p style="margin:0 0 12px;">عزيزي/عزيزتي ${name}،</p>
            <p style="margin:0 0 12px;">نأسف لإعلامك بأن طلب تسجيلك لم يتم قبوله في هذا الوقت.</p>
            <p style="margin:0 0 12px;">يرجى التواصل معنا للاستفسار عن الأسباب أو لتقديم المعلومات الناقصة، وسنكون سعداء بمساعدتك.</p>`,
        cta: { text: 'التواصل معنا', url: WEBSITE_URL() },
      }),
      text: textBody([
        `عزيزي/عزيزتي ${studentName}،`,
        '',
        'نأسف لإعلامك بأن طلب تسجيلك لم يتم قبوله في هذا الوقت.',
        'يرجى التواصل معنا للاستفسار عن الأسباب أو لتقديم المعلومات الناقصة.',
        '',
        `الموقع: ${WEBSITE_URL()}`,
      ]),
    };
  },

  courseApproved: (studentName, courseName) => {
    const name = escapeHtml(studentName);
    const course = escapeHtml(courseName);
    const heading = 'تمت الموافقة على تسجيلك';
    return {
      subject: 'تمت الموافقة على تسجيلك في الدورة - Trust School Amara',
      html: layout({
        heading,
        accent: '#16a34a',
        preheader: `تمت الموافقة على تسجيلك في ${courseName}.`,
        contentHtml: `
            <p style="margin:0 0 12px;">عزيزي/عزيزتي ${name}،</p>
            <p style="margin:0 0 12px;">نود إعلامك بأن تسجيلك في الدورة التالية قد تمت الموافقة عليه:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px;">
              <tr><td style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;font-size:17px;font-weight:bold;color:#15803d;">${course}</td></tr>
            </table>
            <p style="margin:0;">لديك الآن إمكانية الوصول إلى الدورة من خلال حسابك.</p>`,
        cta: { text: 'الدخول إلى حسابك', url: WEBSITE_URL() },
      }),
      text: textBody([
        `عزيزي/عزيزتي ${studentName}،`,
        '',
        `تمت الموافقة على تسجيلك في الدورة: ${courseName}`,
        'لديك الآن إمكانية الوصول إلى الدورة من خلال حسابك.',
        '',
        `الدخول إلى حسابك: ${WEBSITE_URL()}`,
      ]),
    };
  },

  courseRejected: (studentName, courseName) => {
    const name = escapeHtml(studentName);
    const course = escapeHtml(courseName);
    const heading = 'تحديث حول طلب التسجيل في الدورة';
    return {
      subject: 'تحديث حول طلب تسجيلك في الدورة - Trust School Amara',
      html: layout({
        heading,
        accent: '#dc2626',
        preheader: `تحديث بخصوص طلب تسجيلك في ${courseName}.`,
        contentHtml: `
            <p style="margin:0 0 12px;">عزيزي/عزيزتي ${name}،</p>
            <p style="margin:0 0 12px;">نأسف لإعلامك بأن طلب تسجيلك في دورة <strong>${course}</strong> لم يتم قبوله.</p>
            <p style="margin:0;">يرجى التواصل معنا لمزيد من المعلومات.</p>`,
        cta: { text: 'التواصل معنا', url: WEBSITE_URL() },
      }),
      text: textBody([
        `عزيزي/عزيزتي ${studentName}،`,
        '',
        `نأسف لإعلامك بأن طلب تسجيلك في دورة "${courseName}" لم يتم قبوله.`,
        'يرجى التواصل معنا لمزيد من المعلومات.',
        '',
        `الموقع: ${WEBSITE_URL()}`,
      ]),
    };
  },

  newUserRegistration: (studentName, studentEmail, branchLabel) => {
    const name = escapeHtml(studentName);
    const email = escapeHtml(studentEmail);
    const branch = escapeHtml(branchLabel);
    const heading = 'طلب تسجيل جديد';
    return {
      subject: 'طلب تسجيل جديد - طالب جديد ينتظر التحقق',
      html: layout({
        heading,
        accent: '#2563eb',
        preheader: `طالب جديد (${studentName}) ينتظر التحقق.`,
        contentHtml: `
            <p style="margin:0 0 12px;">تم استلام طلب تسجيل جديد من طالب:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px;">
              <tr><td style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;">
                <p style="margin:0 0 6px;"><strong>اسم الطالب:</strong> ${name}</p>
                <p style="margin:0 0 6px;"><strong>البريد الإلكتروني:</strong> ${email}</p>
                ${branchLabel ? `<p style="margin:0;"><strong>الفرع:</strong> ${branch}</p>` : ''}
              </td></tr>
            </table>
            <p style="margin:0;color:#b91c1c;font-weight:bold;">طالب جديد ينتظر التحقق — يرجى مراجعة الطلب من لوحة التحكم.</p>`,
        cta: { text: 'فتح لوحة التحكم', url: `${WEBSITE_URL()}/admin` },
      }),
      text: textBody([
        'تم استلام طلب تسجيل جديد من طالب:',
        `- اسم الطالب: ${studentName}`,
        `- البريد الإلكتروني: ${studentEmail}`,
        ...(branchLabel ? [`- الفرع: ${branchLabel}`] : []),
        '',
        'طالب جديد ينتظر التحقق — يرجى مراجعة الطلب من لوحة التحكم.',
        `${WEBSITE_URL()}/admin`,
      ]),
    };
  },

  newCourseRegistration: (studentName, courseName, courseType) => {
    const name = escapeHtml(studentName);
    const course = escapeHtml(courseName);
    const type = escapeHtml(courseType);
    const heading = 'طلب تسجيل جديد في دورة';
    return {
      subject: `طلب تسجيل جديد في دورة - ${courseName}`,
      html: layout({
        heading,
        accent: '#2563eb',
        preheader: `تسجيل جديد في ${courseName} ينتظر الموافقة.`,
        contentHtml: `
            <p style="margin:0 0 12px;">تم استلام طلب تسجيل جديد في دورة:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px;">
              <tr><td style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;">
                <p style="margin:0 0 6px;"><strong>اسم الطالب:</strong> ${name}</p>
                <p style="margin:0 0 6px;"><strong>اسم الدورة:</strong> ${course}</p>
                <p style="margin:0;"><strong>نوع الدورة:</strong> ${type}</p>
              </td></tr>
            </table>
            <p style="margin:0;color:#b91c1c;font-weight:bold;">تسجيل دورة جديد ينتظر الموافقة — يرجى مراجعة الطلب من لوحة التحكم.</p>`,
        cta: { text: 'فتح لوحة التحكم', url: `${WEBSITE_URL()}/admin` },
      }),
      text: textBody([
        'تم استلام طلب تسجيل جديد في دورة:',
        `- اسم الطالب: ${studentName}`,
        `- اسم الدورة: ${courseName}`,
        `- نوع الدورة: ${courseType}`,
        '',
        'تسجيل دورة جديد ينتظر الموافقة — يرجى مراجعة الطلب من لوحة التحكم.',
        `${WEBSITE_URL()}/admin`,
      ]),
    };
  },

  deletionWarning: (studentName, daysLeft) => {
    const name = escapeHtml(studentName);
    const days = escapeHtml(daysLeft);
    const heading = 'تحذير: حسابك سيتم حذفه';
    return {
      subject: 'تنبيه بخصوص حسابك - Trust School Amara',
      html: layout({
        heading,
        accent: '#dc2626',
        preheader: `حسابك غير نشط وسيُحذف خلال ${daysLeft} يوم. سجّل الدخول للاحتفاظ به.`,
        contentHtml: `
            <p style="margin:0 0 12px;">عزيزي/عزيزتي ${name}،</p>
            <p style="margin:0 0 12px;">نود إعلامك بأن حسابك غير نشط منذ فترة طويلة وسيتم حذفه خلال <strong>${days} يوم</strong>.</p>
            <p style="margin:0;">إذا كنت ترغب في الاحتفاظ بحسابك، يرجى تسجيل الدخول في أقرب وقت.</p>`,
        cta: { text: 'تسجيل الدخول الآن', url: WEBSITE_URL() },
      }),
      text: textBody([
        `عزيزي/عزيزتي ${studentName}،`,
        '',
        `حسابك غير نشط منذ فترة طويلة وسيتم حذفه خلال ${daysLeft} يوم.`,
        'إذا كنت ترغب في الاحتفاظ بحسابك، يرجى تسجيل الدخول في أقرب وقت.',
        '',
        `تسجيل الدخول: ${WEBSITE_URL()}`,
      ]),
    };
  },
};

// ── Send ─────────────────────────────────────────────────────────────────────

// Assemble the full nodemailer message (all deliverability headers + both MIME
// parts). Separated from sendEmail so it can be unit-tested without a transport.
function buildMessage(to, subject, html, text, options = {}) {
  const fromAddress = FROM_ADDRESS();

  const message = {
    // Friendly From ("Trust School Amara <noreply@domain>") instead of a bare
    // address — recipients recognise the brand and engagement filters reward it.
    from: { name: FROM_NAME(), address: fromAddress },
    to,
    // A real, monitored Reply-To so replies reach a human (and so the mail isn't
    // a dead-end, which filters penalise).
    replyTo: REPLY_TO(),
    subject,
    // Always multipart/alternative: text + HTML. HTML-only is a spam signal.
    text: text || htmlToText(html),
    html,
    // Stable Message-ID on the sending domain (helps DKIM alignment + threading).
    messageId: makeMessageId(),
    // Force UTF-8 so Arabic subjects/bodies are encoded correctly. Mojibake reads
    // as spam to filters and breaks rendering.
    textEncoding: 'quoted-printable',
    headers: {
      // One-click unsubscribe target. Required by Gmail/Yahoo bulk-sender rules
      // and a strong trust signal even for transactional mail. mailto-only is
      // safe without a server endpoint (no List-Unsubscribe-Post here).
      'List-Unsubscribe': `<mailto:${SUPPORT_EMAIL()}?subject=unsubscribe>`,
      // Marks the message as system-generated so auto-responders don't reply and
      // filters classify it as transactional, not unsolicited bulk.
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'OOF, AutoReply',
      ...(options.refId ? { 'X-Entity-Ref-ID': String(options.refId) } : {}),
      ...(options.headers || {}),
    },
  };

  // Return-Path / envelope alignment. When you send through your OWN domain's
  // SMTP, set MAIL_RETURN_PATH to a bounce address on the same domain so SPF
  // authenticates the domain recipients actually see (DMARC alignment). With a
  // managed ESP, leave it UNSET — the ESP owns the Return-Path it has authorised.
  const returnPath = process.env.MAIL_RETURN_PATH;
  if (returnPath) message.envelope = { from: returnPath, to };

  return message;
}

// `text` is optional but should always be supplied by templates. When omitted we
// derive it from the HTML so a message is NEVER sent HTML-only.
async function sendEmail(to, subject, html, text, options = {}) {
  const transporter = getTransporter();
  if (!transporter) return { success: false, error: 'Email not configured' };

  if (!FROM_ADDRESS()) {
    console.warn('[email] MAIL_FROM_ADDRESS / EMAIL_USER not set — cannot send');
    return { success: false, error: 'Sender address not configured' };
  }

  const message = buildMessage(to, subject, html, text, options);

  try {
    const info = await transporter.sendMail(message);
    console.log('[email] sent', info.messageId, '->', to);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[email] send error', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail, buildMessage, templates, escapeHtml, htmlToText, verifyTransport };
