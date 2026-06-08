/**
 * printRecord.js
 * --------------
 * Lightweight, dependency-free printing of a single registered-student record
 * (a registration confirmation / payment slip) for the admin archive pages.
 *
 * It opens a clean, RTL, print-optimized window and triggers the browser print
 * dialog. No third-party libraries — just a self-contained HTML document so it
 * works identically across the four archive pages and stays consistent.
 *
 * Usage:
 *   printRecord({
 *     title: 'تأكيد تسجيل — اللغات',
 *     student: 'محمد أمين',
 *     badge: { label: 'مسجَّل', tone: 'green' },
 *     sections: [
 *       { heading: 'معلومات الطالب', rows: [['الاسم', 'محمد أمين'], ['الهاتف', '0550...']] },
 *       ...
 *     ],
 *   });
 *
 * Returns `true` if the print window opened, `false` if blocked by a popup
 * blocker (so the caller can surface a toast).
 */

import { formatDate } from './dateUtils';

const BRAND = 'Trust School Amara';

const TONE_HEX = {
  green:  { bg: '#dcfce7', fg: '#15803d', bd: '#bbf7d0' },
  amber:  { bg: '#fef3c7', fg: '#b45309', bd: '#fde68a' },
  red:    { bg: '#fee2e2', fg: '#b91c1c', bd: '#fecaca' },
  blue:   { bg: '#dbeafe', fg: '#1d4ed8', bd: '#bfdbfe' },
  gray:   { bg: '#f1f5f9', fg: '#475569', bd: '#e2e8f0' },
};

// Minimal HTML escaping so values can never break the document or inject markup.
const esc = (value) => {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const todayLabel = () => formatDate(new Date());

const renderBadge = (badge) => {
  if (!badge?.label) return '';
  const t = TONE_HEX[badge.tone] || TONE_HEX.gray;
  return `<span class="badge" style="background:${t.bg};color:${t.fg};border-color:${t.bd}">${esc(badge.label)}</span>`;
};

const renderSection = ({ heading, rows }) => {
  const cleanRows = (rows || []).filter(([, v]) => v != null && String(v).trim() !== '' && String(v) !== '—');
  if (cleanRows.length === 0) return '';
  const body = cleanRows
    .map(
      ([label, value]) => `
        <div class="row">
          <span class="label">${esc(label)}</span>
          <span class="value">${esc(value)}</span>
        </div>`
    )
    .join('');
  return `<section class="section"><h2>${esc(heading)}</h2>${body}</section>`;
};

/**
 * @param {object}   options
 * @param {string}   options.title     Document title (e.g. "تأكيد تسجيل — اللغات")
 * @param {string}  [options.student]  Student name shown prominently in the header
 * @param {object}  [options.badge]    { label, tone } status chip
 * @param {Array}    options.sections  [{ heading, rows: [[label, value], ...] }]
 * @returns {boolean} true if the print window opened
 */
export const printRecord = ({ title, student, badge, sections = [] }) => {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) return false; // popup blocked

  const sectionsHtml = sections.map(renderSection).join('');

  win.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${esc(title || BRAND)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Tahoma, "Helvetica Neue", Arial, sans-serif;
      color: #1f2937; margin: 0; padding: 32px; background: #fff;
    }
    .sheet { max-width: 720px; margin: 0 auto; }
    .header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 16px; border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 8px;
    }
    .brand { font-size: 22px; font-weight: 800; color: #2563eb; }
    .brand small { display: block; font-size: 12px; font-weight: 600; color: #6b7280; margin-top: 2px; }
    .doc-meta { text-align: left; font-size: 12px; color: #6b7280; }
    .title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 18px 0 6px; }
    .doc-title { font-size: 18px; font-weight: 700; color: #111827; }
    .student { font-size: 15px; color: #374151; margin-bottom: 18px; }
    .student b { color: #111827; font-weight: 700; }
    .badge {
      display: inline-block; padding: 4px 12px; border-radius: 999px;
      font-size: 12px; font-weight: 700; border: 1px solid;
    }
    .section { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }
    .section h2 {
      font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
      color: #9ca3af; margin: 0 0 8px;
    }
    .row {
      display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
      padding: 7px 0; border-bottom: 1px solid #f3f4f6;
    }
    .row:last-child { border-bottom: 0; }
    .label { color: #6b7280; font-size: 13px; flex-shrink: 0; }
    .value { color: #111827; font-size: 14px; font-weight: 600; text-align: left; }
    .footer { margin-top: 22px; padding-top: 14px; border-top: 1px dashed #d1d5db;
      display: flex; justify-content: space-between; font-size: 12px; color: #9ca3af; }
    .sign { margin-top: 40px; text-align: left; }
    .sign-line { display: inline-block; width: 200px; border-top: 1px solid #9ca3af; padding-top: 6px;
      font-size: 12px; color: #6b7280; }
    @media print {
      body { padding: 0; }
      @page { margin: 16mm; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="brand">${esc(BRAND)}<small>إدارة الفرع</small></div>
      <div class="doc-meta">تاريخ الطباعة: ${esc(todayLabel())}</div>
    </div>

    <div class="title-row">
      <div class="doc-title">${esc(title || '')}</div>
      ${renderBadge(badge)}
    </div>
    ${student ? `<div class="student">الطالب: <b>${esc(student)}</b></div>` : ''}

    ${sectionsHtml}

    <div class="sign">
      <div class="sign-line">توقيع وختم الإدارة</div>
    </div>

    <div class="footer">
      <span>${esc(BRAND)}</span>
      <span>وثيقة صادرة من لوحة تحكم الإدارة</span>
    </div>
  </div>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
      setTimeout(function () { window.close(); }, 300);
    };
  </script>
</body>
</html>`);

  win.document.close();
  return true;
};

export default printRecord;
