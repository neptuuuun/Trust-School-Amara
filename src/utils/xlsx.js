/**
 * xlsx.js — minimal, dependency-light Excel (.xlsx) writer + reader.
 * ------------------------------------------------------------------
 * Built on `fflate` (zip) and the browser's DOMParser (XML). Covers exactly what
 * the student bulk import needs, without pulling a full spreadsheet library:
 *
 *   buildXlsx(workbook) → Uint8Array
 *     inline-string cells (never formulas), RTL sheets, frozen header, column
 *     widths/text format, coloured header cells, drop-down data validation.
 *
 *   readXlsx(bytes) → { sheetName, headers, rows }
 *     first worksheet; shared / inline / rich-text strings; booleans; numbers
 *     (float noise trimmed); date-formatted numbers → "YYYY-MM-DD" (1900 and 1904
 *     date systems); cells without `r` attributes; namespaced XML.
 *
 * Every cell value is returned as a string — validation happens server-side.
 */

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MAX_PART_BYTES = 40 * 1024 * 1024; // refuse zip bombs / absurd sheets

// ── Shared helpers ────────────────────────────────────────────────────────────

/** 0 → "A", 25 → "Z", 26 → "AA" … */
export const columnLetter = (index) => {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** "AB12" → { col: 27, row: 11 } (0-based). */
const parseRef = (ref) => {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref || '');
  if (!m) return null;
  const col = m[1].toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  return { col, row: Number(m[2]) - 1 };
};

const escapeXml = (s) => String(s)
  // Strip characters that are illegal in XML 1.0 (keep \t \n \r).
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const safeSheetName = (name, i) => {
  const cleaned = String(name || `Sheet${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return cleaned || `Sheet${i + 1}`;
};

// ── Writer ───────────────────────────────────────────────────────────────────

// cellXfs indices used below.
export const XLSX_STYLE = Object.freeze({
  DEFAULT: 0, HEADER_REQUIRED: 1, HEADER_CONDITIONAL: 2, HEADER_OPTIONAL: 3, TEXT: 4, WRAP: 5, HEADER_PLAIN: 6,
});

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS_MAIN}">
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE4572E"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2B134"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F3B73"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="49" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="49" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="49" fontId="2" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** A cell may be a primitive or { v, s } (value + style index). */
const cellXml = (cell, ref) => {
  const isObj = cell !== null && typeof cell === 'object';
  const v = isObj ? cell.v : cell;
  const s = isObj && cell.s != null ? ` s="${cell.s}"` : '';
  if (v === null || v === undefined || v === '') return s ? `<c r="${ref}"${s}/>` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  // Strings are always INLINE STRINGS — Excel never evaluates them as formulas.
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
};

function sheetXml(sheet) {
  const columns = sheet.columns || [];
  const rows = sheet.rows || [];
  const view = `<sheetViews><sheetView workbookViewId="0"${sheet.rtl ? ' rightToLeft="1"' : ''}>${
    sheet.freezeHeader ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ''
  }</sheetView></sheetViews>`;
  const cols = columns.length
    ? `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"${
      c.style != null ? ` style="${c.style}"` : ''}/>`).join('')}</cols>`
    : '';
  const body = rows.map((row, r) => {
    const cells = row.map((cell, c) => cellXml(cell, `${columnLetter(c)}${r + 1}`)).join('');
    const ht = r === 0 && sheet.headerHeight ? ` ht="${sheet.headerHeight}" customHeight="1"` : '';
    return `<row r="${r + 1}"${ht}>${cells}</row>`;
  }).join('');
  const validations = (sheet.validations || []).filter((v) => v.list && v.list.length);
  const dv = validations.length
    ? `<dataValidations count="${validations.length}">${validations.map((v) => {
      const col = columnLetter(v.column);
      const formula = `"${v.list.map((x) => String(x).replace(/"/g, '')).join(',')}"`.slice(0, 257);
      return `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0" sqref="${col}${v.fromRow || 2}:${col}${v.toRow || 1001}"${
        v.prompt ? ` promptTitle="${escapeXml(v.promptTitle || '')}" prompt="${escapeXml(v.prompt).slice(0, 255)}"` : ''
      }><formula1>${escapeXml(formula)}</formula1></dataValidation>`;
    }).join('')}</dataValidations>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${view}<sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${body}</sheetData>${dv}</worksheet>`;
}

/**
 * @param {{ sheets: Array<{ name: string, columns?: Array<{width?:number, style?:number}>,
 *           rows: Array<Array<any>>, rtl?: boolean, freezeHeader?: boolean, headerHeight?: number,
 *           validations?: Array<{column:number, list:string[], fromRow?:number, toRow?:number, prompt?:string, promptTitle?:string}> }> }} workbook
 * @returns {Uint8Array}
 */
export function buildXlsx({ sheets }) {
  const names = sheets.map((s, i) => safeSheetName(s.name, i));
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView/></bookViews><sheets>${
  names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${names.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': strToU8(STYLES_XML),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)); });
  return zipSync(files, { level: 6 });
}

// ── Reader ───────────────────────────────────────────────────────────────────

const parseXml = (text) => {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('xlsx: malformed XML');
  return doc;
};
const byTag = (node, local) => Array.from(node.getElementsByTagNameNS('*', local));
const childElements = (node, local) => Array.from(node.childNodes).filter((n) => n.nodeType === 1 && (!local || n.localName === local));
const attr = (el, name) => (el.getAttribute(name) ?? el.getAttributeNS(NS_REL, name.replace(/^r:/, '')) ?? null);

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateFormatCode = (code) => {
  if (!code) return false;
  const stripped = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(stripped) && !/^general$/i.test(stripped.trim());
};

/** Excel serial → "YYYY-MM-DD" (UTC, day precision). */
export const serialToIsoDate = (serial, date1904 = false) => {
  const n = Number(serial) + (date1904 ? 1462 : 0);
  if (!Number.isFinite(n) || n < 1) return null;
  const d = new Date(Math.round((Math.floor(n) - 25569) * 86400000));
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const cleanNumber = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toPrecision(15)));
};

/** Text of a <si> / <is> node: plain <t> and rich-text runs <r><t>, never phonetic <rPh>. */
const stringItemText = (node) => childElements(node).map((child) => {
  if (child.localName === 't') return child.textContent || '';
  if (child.localName === 'r') return childElements(child, 't').map((t) => t.textContent || '').join('');
  return '';
}).join('');

/**
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ sheetName: string, headers: string[], rows: Array<Record<string,string>> }}
 *          each row also carries `__row` = its 1-based spreadsheet line number.
 */
export function readXlsx(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let files;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.originalSize > MAX_PART_BYTES) throw new Error('xlsx: part too large');
        return f.name.startsWith('xl/');
      },
    });
  } catch (e) {
    const err = new Error(e.message === 'xlsx: part too large' ? 'الملف كبير جداً.' : 'الملف ليس ملف Excel صالحاً (.xlsx).');
    err.code = 'invalid-xlsx';
    throw err;
  }
  const text = (name) => (files[name] ? strFromU8(files[name]) : null);
  const workbookXml = text('xl/workbook.xml');
  if (!workbookXml) {
    const err = new Error('الملف ليس ملف Excel صالحاً (.xlsx).');
    err.code = 'invalid-xlsx';
    throw err;
  }

  const workbook = parseXml(workbookXml);
  const date1904 = byTag(workbook, 'workbookPr').some((el) => ['1', 'true'].includes(el.getAttribute('date1904')));
  const sheetEl = byTag(workbook, 'sheet').find((el) => (el.getAttribute('state') || 'visible') === 'visible') || byTag(workbook, 'sheet')[0];
  if (!sheetEl) return { sheetName: '', headers: [], rows: [] };
  const sheetName = sheetEl.getAttribute('name') || '';
  const relId = attr(sheetEl, 'r:id');

  // Resolve the sheet part through the workbook relationships.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const relsXml = text('xl/_rels/workbook.xml.rels');
  if (relsXml && relId) {
    const rel = byTag(parseXml(relsXml), 'Relationship').find((r) => r.getAttribute('Id') === relId);
    const target = rel && rel.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheetXmlText = text(sheetPath);
  if (!sheetXmlText) return { sheetName, headers: [], rows: [] };

  const shared = [];
  const sstXml = text('xl/sharedStrings.xml');
  if (sstXml) byTag(parseXml(sstXml), 'si').forEach((si) => shared.push(stringItemText(si)));

  const dateStyle = [];
  const stylesXml = text('xl/styles.xml');
  if (stylesXml) {
    const styles = parseXml(stylesXml);
    const custom = new Map(byTag(styles, 'numFmt').map((f) => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode')]));
    const cellXfs = byTag(styles, 'cellXfs')[0];
    if (cellXfs) {
      childElements(cellXfs, 'xf').forEach((xf) => {
        const id = Number(xf.getAttribute('numFmtId') || 0);
        dateStyle.push(BUILTIN_DATE_FORMATS.has(id) || isDateFormatCode(custom.get(id)));
      });
    }
  }

  const matrix = [];
  let nextRow = 0;
  byTag(parseXml(sheetXmlText), 'row').forEach((rowEl) => {
    const rAttr = Number(rowEl.getAttribute('r'));
    const rowIndex = Number.isFinite(rAttr) && rAttr > 0 ? rAttr - 1 : nextRow;
    nextRow = rowIndex + 1;
    const cells = [];
    let nextCol = 0;
    childElements(rowEl, 'c').forEach((c) => {
      const ref = parseRef(c.getAttribute('r'));
      const col = ref ? ref.col : nextCol;
      nextCol = col + 1;
      const t = c.getAttribute('t') || 'n';
      const vEl = childElements(c, 'v')[0];
      const raw = vEl ? vEl.textContent : '';
      let value = '';
      if (t === 's') value = shared[Number(raw)] ?? '';
      else if (t === 'inlineStr') value = childElements(c, 'is').map(stringItemText).join('');
      else if (t === 'str') value = raw;
      else if (t === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
      else if (t === 'e') value = '';
      else if (t === 'd') value = raw ? raw.slice(0, 10) : '';
      else if (raw !== '') {
        const s = Number(c.getAttribute('s') || 0);
        value = dateStyle[s] ? (serialToIsoDate(raw, date1904) || cleanNumber(raw)) : cleanNumber(raw);
      }
      cells[col] = value;
    });
    matrix[rowIndex] = cells;
  });

  // Header = first non-empty row; data = every later non-empty row.
  const isEmptyRow = (r) => !r || r.every((v) => v === undefined || String(v).trim() === '');
  const headerIndex = matrix.findIndex((r) => !isEmptyRow(r));
  if (headerIndex < 0) return { sheetName, headers: [], rows: [] };
  const rawHeaders = Array.from(matrix[headerIndex], (h) => String(h ?? '').trim());
  const seen = new Map();
  const headers = rawHeaders.map((h, i) => {
    const base = h || `عمود ${columnLetter(i)}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count > 1 ? `${base} (${count})` : base;
  });
  const rows = [];
  for (let r = headerIndex + 1; r < matrix.length; r += 1) {
    const cells = matrix[r];
    if (isEmptyRow(cells)) continue;
    const obj = { __row: r + 1 };
    headers.forEach((h, i) => { obj[h] = cells[i] === undefined ? '' : String(cells[i]).trim(); });
    rows.push(obj);
  }
  return { sheetName, headers: headers.filter((h, i) => rawHeaders[i] || rows.some((row) => row[h])), rows };
}
