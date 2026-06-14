/* Temporary verification harness for emailService.js — deleted after running. */
process.env.MAIL_FROM_ADDRESS = 'noreply@trustschoolamara.com';
process.env.MAIL_FROM_NAME = 'Trust School Amara';
process.env.MAIL_REPLY_TO = 'contact@trustschoolamara.com';
process.env.MAIL_SUPPORT_EMAIL = 'contact@trustschoolamara.com';
process.env.WEBSITE_URL = 'https://trust-school.web.app';

const nodemailer = require('nodemailer');
const { templates, buildMessage, htmlToText } = require('./services/emailService');

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? '  ✓' : '  ✗ FAIL:'} ${label}`);
  if (!cond) failures++;
};

// 1) Template rendering checks
const cases = {
  accountApproved: templates.accountApproved('<b>أحمد</b> & "Test"'),
  accountRejected: templates.accountRejected('سارة'),
  courseApproved: templates.courseApproved('أحمد', 'اللغة الإنجليزية'),
  courseRejected: templates.courseRejected('أحمد', 'اللغة الفرنسية'),
  newUserRegistration: templates.newUserRegistration('أحمد', 'a@b.com', 'بومرداس'),
  newCourseRegistration: templates.newCourseRegistration('أحمد', 'دورة', 'لغة'),
  deletionWarning: templates.deletionWarning('أحمد', 7),
};

console.log('\n== Template structure ==');
for (const [name, t] of Object.entries(cases)) {
  ok(typeof t.subject === 'string' && t.subject.length > 0, `${name}: has subject`);
  ok(t.html.includes('<!DOCTYPE html>'), `${name}: full HTML doctype`);
  ok(t.html.includes('charset=utf-8') || t.html.includes('charset="utf-8"'), `${name}: UTF-8 meta`);
  ok(typeof t.text === 'string' && t.text.length > 0, `${name}: has plain-text part`);
  ok(t.text.includes('Trust School Amara'), `${name}: text has identity footer`);
  ok(!t.html.includes('${'), `${name}: no unrendered template literals`);
  ok(!t.html.includes('undefined'), `${name}: no 'undefined' leaked`);
}

// XSS escaping
console.log('\n== Escaping ==');
ok(cases.accountApproved.html.includes('&lt;b&gt;أحمد&lt;/b&gt;'), 'HTML escapes injected tags');
ok(!cases.accountApproved.html.includes('<b>أحمد</b>'), 'no raw injected tags in HTML');
ok(cases.accountApproved.text.includes('<b>أحمد</b>'), 'plain-text keeps raw (no HTML context)');

// 2) Full MIME assembly through a real nodemailer stream transport
console.log('\n== MIME assembly ==');
const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
const msg = buildMessage(
  'student@example.com',
  cases.accountApproved.subject,
  cases.accountApproved.html,
  cases.accountApproved.text,
  { refId: 'acct-approved:uid123' }
);

transport.sendMail(msg, (err, info) => {
  if (err) { console.log('  ✗ FAIL: sendMail error', err.message); failures++; return done(); }
  const raw = info.message.toString();
  ok(/Content-Type: multipart\/alternative/i.test(raw), 'multipart/alternative (text + html)');
  ok(/Content-Type: text\/plain/i.test(raw), 'has text/plain part');
  ok(/Content-Type: text\/html/i.test(raw), 'has text/html part');
  ok(/^From: .*Trust School Amara.*<noreply@trustschoolamara\.com>/im.test(raw), 'friendly From with display name');
  ok(/^Reply-To: .*contact@trustschoolamara\.com/im.test(raw), 'Reply-To set');
  ok(/^Message-ID: <.*@trustschoolamara\.com>/im.test(raw), 'Message-ID on sending domain');
  ok(/^List-Unsubscribe: <mailto:contact@trustschoolamara\.com/im.test(raw), 'List-Unsubscribe header');
  ok(/^Auto-Submitted: auto-generated/im.test(raw), 'Auto-Submitted header');
  ok(/^X-Entity-Ref-ID: acct-approved:uid123/im.test(raw), 'X-Entity-Ref-ID dedup header');
  ok(/charset=utf-8/i.test(raw), 'UTF-8 charset in MIME');
  ok(/^Date: /im.test(raw), 'Date header present');
  console.log('\n--- From/Reply-To/Message-ID/List-Unsubscribe lines ---');
  raw.split('\r\n').filter(l => /^(From|Reply-To|Message-ID|List-Unsubscribe|Auto-Submitted|Content-Type|Subject):/i.test(l)).slice(0, 9).forEach(l => console.log('   ' + l.slice(0, 95)));
  done();
});

function done() {
  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : '❌ ' + failures + ' CHECK(S) FAILED'}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
