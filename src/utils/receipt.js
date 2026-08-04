/**
 * receipt.js
 * ----------
 * Professional, downloadable PDF payment receipts — Arabic-first (RTL).
 *
 * WHY A CANVAS (not raw jsPDF text):
 * jsPDF's built-in fonts have no Arabic glyphs and jsPDF performs no bidi
 * reshaping, so `doc.text('محمد')` renders as disconnected, reversed boxes.
 * Instead we paint the whole receipt onto a high-DPI <canvas> — the browser's
 * text engine shapes and orders Arabic correctly — then embed that canvas as a
 * single image inside an A4 jsPDF page and save it. Result: a real, downloadable
 * .pdf with correct Arabic, the school logo, and no extra dependency (jspdf is
 * already installed).
 *
 * Public API:
 *   await downloadReceipt(data)  → triggers a browser download, resolves true/false
 *   getReceiptNumber(data)       → the stable receipt number for a payment
 *   PAYMENT_TYPE_LABELS          → { annual_fee, support, language, training }
 *
 * The design language intentionally mirrors src/utils/printRecord.js (same brand,
 * palette, section-card layout) so printed and downloaded documents look alike.
 */

import { jsPDF } from 'jspdf';
import logoUrl from '../assets/images/logo.png';
import { formatDate } from './dateUtils';

const BRAND = 'Trust School Amara';
const BRAND_AR = 'مدرسة الثقة عمارة';
const TAGLINE = 'الثقة في التعليم هو شغفنا';

// School contact block — mirrors config/websiteDefaults.js contact defaults.
const SCHOOL = {
  phone: '0554 56 29 97',
  email: 'trustschoolamara@gmail.com',
  address: 'الجزائر، بومرداس / برج منايل',
};

const COLORS = {
  primary: '#2563eb',
  primarySoft: '#eff6ff',
  ink: '#111827',
  sub: '#6b7280',
  faint: '#9ca3af',
  line: '#e5e7eb',
  hairline: '#f3f4f6',
  white: '#ffffff',
};

// Status → Arabic label + tone (tones mirror printRecord's TONE_HEX).
const STATUS_MAP = {
  paid:      { label: 'مدفوع',        tone: 'green' },
  verified:  { label: 'مدفوع',        tone: 'green' },
  confirmed: { label: 'مدفوع',        tone: 'green' },
  approved:  { label: 'مدفوع',        tone: 'green' },
  active:    { label: 'مدفوع',        tone: 'green' },
  completed: { label: 'مدفوع',        tone: 'green' },
  reserved:  { label: 'محجوز',         tone: 'amber' },
  pending:   { label: 'قيد المعالجة',  tone: 'amber' },
  processing:{ label: 'قيد المعالجة',  tone: 'amber' },
  failed:    { label: 'فشل',           tone: 'red' },
  canceled:  { label: 'ملغى',          tone: 'red' },
  cancelled: { label: 'ملغى',          tone: 'red' },
  rejected:  { label: 'مرفوض',         tone: 'red' },
};

const TONES = {
  green: { bg: '#dcfce7', fg: '#15803d', bd: '#bbf7d0' },
  amber: { bg: '#fef3c7', fg: '#b45309', bd: '#fde68a' },
  red:   { bg: '#fee2e2', fg: '#b91c1c', bd: '#fecaca' },
  gray:  { bg: '#f1f5f9', fg: '#475569', bd: '#e2e8f0' },
};

export const PAYMENT_TYPE_LABELS = {
  annual_fee: 'الرسم السنوي',
  annualFee:  'الرسم السنوي',
  annual:     'الرسم السنوي',
  support:    'دروس الدعم',
  language:   'اللغات',
  languages:  'اللغات',
  training:   'الدورات التكوينية',
  trainings:  'الدورات التكوينية',
};

// ── Value normalizers ─────────────────────────────────────────────────────────

/** Firestore Timestamp | Date | ISO string | epoch ms → Date (or null). */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try { return value.toDate(); } catch { return null; }
  }
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

function formatAmount(amount) {
  const n = Number(amount);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('en-US');
}

function statusInfo(status) {
  const key = String(status || '').trim().toLowerCase();
  return STATUS_MAP[key] || { label: status ? String(status) : 'مدفوع', tone: 'gray' };
}

function paymentTypeLabel(type) {
  if (!type) return '—';
  return PAYMENT_TYPE_LABELS[type] || String(type);
}

/**
 * Stable receipt number for a payment. Prefers an explicit receiptNumber, then
 * derives a deterministic one from the transaction reference / order id so the
 * same payment always yields the same receipt number.
 */
export function getReceiptNumber(data = {}) {
  if (data.receiptNumber) return String(data.receiptNumber);
  const d = toDate(data.date) || new Date();
  const year = d.getFullYear();
  const ref = String(data.reference || data.orderId || data.id || '').replace(/[^a-zA-Z0-9]/g, '');
  const tail = ref ? ref.toUpperCase().slice(-8).padStart(8, '0') : String(d.getTime()).slice(-8);
  return `RC-${year}-${tail}`;
}

// ── Canvas primitives ─────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

const FONT = '"Segoe UI", Tahoma, "Helvetica Neue", Arial, sans-serif';
const font = (size, weight = 400) => `${weight} ${size}px ${FONT}`;

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * @param {object} data
 * @param {string} [data.receiptNumber]
 * @param {string} [data.status]        e.g. 'paid' | 'reserved' | 'pending'
 * @param {string} [data.studentName]
 * @param {string} [data.studentEmail]
 * @param {string} [data.studentPhone]
 * @param {string} [data.branchLabel]   Arabic branch name
 * @param {string} [data.paymentType]   'annual_fee' | 'support' | 'language' | 'training'
 * @param {string} [data.serviceName]   course / class / subject
 * @param {number} [data.amount]
 * @param {string} [data.currency]      default 'دج'
 * @param {*}      [data.date]          Firestore Timestamp | Date | string | ms
 * @param {string} [data.reference]     transaction id / order id
 * @param {string} [data.academicYear]  optional label
 * @returns {Promise<boolean>} true when the download was triggered
 */
export async function downloadReceipt(data = {}) {
  const receiptNumber = getReceiptNumber(data);
  const { label: statusLabel, tone } = statusInfo(data.status);
  const currency = data.currency || 'دج';
  const dateObj = toDate(data.date);
  const dateLabel = dateObj ? formatDate(dateObj) : '—';

  // Logical A4 canvas (portrait). 210:297 aspect kept exactly. SCALE lifts DPI.
  const W = 794;
  const H = 1123;
  const SCALE = 2.5;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * SCALE);
  canvas.height = Math.round(H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';
  try { ctx.direction = 'rtl'; } catch { /* older browsers */ }

  const M = 54;                 // page margin
  const RIGHT = W - M;          // RTL start edge
  const LEFT = M;               // LTR / value edge
  const contentW = W - 2 * M;

  // Background
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, W, H);

  // Top accent strip
  ctx.fillStyle = COLORS.primary;
  ctx.fillRect(0, 0, W, 8);

  // ── Header ──────────────────────────────────────────────────────────────────
  const logo = await loadImage(logoUrl);
  const logoSize = 74;
  const logoX = RIGHT - logoSize;
  const logoY = 40;
  if (logo) {
    // Preserve aspect ratio inside the logo box.
    const ratio = logo.width && logo.height ? logo.width / logo.height : 1;
    let dw = logoSize, dh = logoSize;
    if (ratio > 1) dh = logoSize / ratio; else dw = logoSize * ratio;
    ctx.drawImage(logo, logoX + (logoSize - dw) / 2, logoY + (logoSize - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = COLORS.primary;
    roundRect(ctx, logoX, logoY, logoSize, logoSize, 14);
    ctx.fill();
    ctx.fillStyle = COLORS.white;
    ctx.font = font(24, 800);
    ctx.textAlign = 'center';
    ctx.fillText('TSA', logoX + logoSize / 2, logoY + logoSize / 2 + 8);
  }

  // School name + tagline (right-aligned, to the left of the logo)
  const nameX = logoX - 18;
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.primary;
  ctx.font = font(25, 800);
  ctx.fillText(BRAND, nameX, logoY + 30);
  ctx.fillStyle = COLORS.sub;
  ctx.font = font(13, 600);
  ctx.fillText(BRAND_AR, nameX, logoY + 52);
  ctx.fillStyle = COLORS.faint;
  ctx.font = font(12, 400);
  ctx.fillText(TAGLINE, nameX, logoY + 71);

  // Contact block (left-aligned, far left)
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.sub;
  ctx.font = font(11.5, 400);
  ctx.fillText(SCHOOL.phone, LEFT, logoY + 16);
  ctx.fillText(SCHOOL.email, LEFT, logoY + 34);
  ctx.fillText(SCHOOL.address, LEFT, logoY + 52);

  // Header divider
  let y = logoY + logoSize + 26;
  ctx.strokeStyle = COLORS.primary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LEFT, y);
  ctx.lineTo(RIGHT, y);
  ctx.stroke();

  // ── Title row ───────────────────────────────────────────────────────────────
  y += 44;
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.ink;
  ctx.font = font(24, 800);
  ctx.fillText('إيصال دفع', RIGHT, y);
  ctx.fillStyle = COLORS.sub;
  ctx.font = font(13, 500);
  ctx.fillText(`رقم الإيصال:  ${receiptNumber}`, RIGHT, y + 26);

  // Status badge (left side of the title row)
  const t = TONES[tone] || TONES.gray;
  ctx.font = font(13, 700);
  const badgeText = statusLabel;
  const badgePadX = 16;
  const badgeW = ctx.measureText(badgeText).width + badgePadX * 2;
  const badgeH = 30;
  const badgeX = LEFT;
  const badgeY = y - 21;
  ctx.fillStyle = t.bg;
  ctx.strokeStyle = t.bd;
  ctx.lineWidth = 1;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = t.fg;
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 20);

  // ── Section cards ───────────────────────────────────────────────────────────
  y += 42;

  const drawCard = (heading, rows) => {
    const cleanRows = rows.filter(([, v]) => v != null && String(v).trim() !== '' && String(v) !== '—');
    const rowH = 38;
    const headH = 34;
    const padY = 12;
    const cardH = headH + cleanRows.length * rowH + padY;
    // Card frame
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    roundRect(ctx, LEFT, y, contentW, cardH, 14);
    ctx.fill();
    ctx.stroke();
    // Heading
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.faint;
    ctx.font = font(12, 700);
    ctx.fillText(heading, RIGHT - 18, y + 24);
    // Rows
    let ry = y + headH + 6;
    cleanRows.forEach(([label, value], i) => {
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.sub;
      ctx.font = font(13, 400);
      ctx.fillText(String(label), RIGHT - 18, ry + 16);
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.ink;
      ctx.font = font(13.5, 700);
      const value_str = String(value);
      // Truncate over-long values to keep them on one line.
      let shown = value_str;
      const maxW = contentW - 220;
      if (ctx.measureText(shown).width > maxW) {
        while (shown.length > 3 && ctx.measureText(shown + '…').width > maxW) shown = shown.slice(0, -1);
        shown += '…';
      }
      ctx.fillText(shown, LEFT + 18, ry + 16);
      // Row divider
      if (i < cleanRows.length - 1) {
        ctx.strokeStyle = COLORS.hairline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(LEFT + 14, ry + rowH - 4);
        ctx.lineTo(RIGHT - 14, ry + rowH - 4);
        ctx.stroke();
      }
      ry += rowH;
    });
    y += cardH + 16;
  };

  drawCard('معلومات الطالب', [
    ['الاسم', data.studentName],
    ['البريد الإلكتروني', data.studentEmail],
    ['رقم الهاتف', data.studentPhone],
    ['الفرع', data.branchLabel],
  ]);

  drawCard('تفاصيل الدفع', [
    ['نوع الدفع', paymentTypeLabel(data.paymentType)],
    ['الخدمة / الدورة', data.serviceName],
    ['السنة الدراسية', data.academicYear],
    ['تاريخ الدفع', dateLabel],
    ['رقم المعاملة', data.reference || data.orderId],
  ]);

  // ── Amount box ──────────────────────────────────────────────────────────────
  const amtH = 62;
  ctx.fillStyle = COLORS.primarySoft;
  ctx.strokeStyle = '#bfdbfe';
  ctx.lineWidth = 1;
  roundRect(ctx, LEFT, y, contentW, amtH, 14);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.primary;
  ctx.font = font(14, 700);
  ctx.fillText('المبلغ المدفوع', RIGHT - 18, y + amtH / 2 + 5);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.font = font(26, 800);
  ctx.fillText(`${formatAmount(data.amount)} ${currency}`, LEFT + 18, y + amtH / 2 + 9);
  y += amtH + 26;

  // ── Footer ──────────────────────────────────────────────────────────────────
  ctx.strokeStyle = COLORS.line;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LEFT, y);
  ctx.lineTo(RIGHT, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 22;
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.faint;
  ctx.font = font(11.5, 400);
  ctx.fillText('هذا إيصال إلكتروني صادر آلياً من النظام — لا يتطلب توقيعاً أو ختماً.', RIGHT, y);
  ctx.textAlign = 'left';
  ctx.fillText(`${BRAND} — ${dateLabel}`, LEFT, y);

  // ── Canvas → A4 PDF → download ──────────────────────────────────────────────
  try {
    const imgData = canvas.toDataURL('image/png', 1.0);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
    pdf.save(`${receiptNumber}.pdf`);
    return true;
  } catch (err) {
    console.error('[receipt] Failed to generate PDF:', err);
    return false;
  }
}

export default downloadReceipt;
