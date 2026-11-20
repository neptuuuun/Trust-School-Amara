import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
import { buildXlsx, readXlsx, columnLetter, serialToIsoDate, XLSX_STYLE } from './xlsx';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Assemble an .xlsx by hand, shaped like what Excel / LibreOffice write. */
function handmadeXlsx({ sheetXml, sharedStrings, styles, workbookPr = '', sheetName = 'Sheet1' }) {
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0"?><workbook xmlns="${MAIN}" xmlns:r="${REL}">${workbookPr}<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId7"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="${REL}/worksheet" Target="worksheets/data.xml"/></Relationships>`),
    'xl/worksheets/data.xml': strToU8(`<?xml version="1.0"?><worksheet xmlns="${MAIN}"><sheetData>${sheetXml}</sheetData></worksheet>`),
  };
  if (sharedStrings) files['xl/sharedStrings.xml'] = strToU8(`<?xml version="1.0"?><sst xmlns="${MAIN}">${sharedStrings}</sst>`);
  if (styles) files['xl/styles.xml'] = strToU8(`<?xml version="1.0"?><styleSheet xmlns="${MAIN}">${styles}</styleSheet>`);
  return zipSync(files);
}

describe('columnLetter', () => {
  it('maps indices to spreadsheet column letters', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(51)).toBe('AZ');
    expect(columnLetter(702)).toBe('AAA');
  });
});

describe('buildXlsx → readXlsx round trip', () => {
  const bytes = buildXlsx({
    sheets: [
      {
        name: 'الطلاب',
        rtl: true,
        freezeHeader: true,
        columns: [{ width: 20 }, { width: 30, style: XLSX_STYLE.TEXT }],
        rows: [
          [{ v: 'الاسم الكامل (إلزامي)', s: XLSX_STYLE.HEADER_REQUIRED }, 'البريد'],
          ['أمين بن علي', 'amine@example.com'],
          [],
          ['=HYPERLINK("x")', '<script>&"'],
        ],
        validations: [{ column: 0, list: ['مدفوع', 'غير مدفوع'] }],
      },
      { name: 'التعليمات', rows: [['must not be read as data']] },
    ],
  });

  it('produces a valid zip with the expected parts', () => {
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml',
      'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
    ]));
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<dataValidation type="list"');
  });

  it('reads only the first sheet, skips empty rows, keeps line numbers', () => {
    const out = readXlsx(bytes);
    expect(out.sheetName).toBe('الطلاب');
    expect(out.headers).toEqual(['الاسم الكامل (إلزامي)', 'البريد']);
    expect(out.rows).toEqual([
      { __row: 2, 'الاسم الكامل (إلزامي)': 'أمين بن علي', البريد: 'amine@example.com' },
      { __row: 4, 'الاسم الكامل (إلزامي)': '=HYPERLINK("x")', البريد: '<script>&"' },
    ]);
  });

  it('writes strings as inline strings — never as formulas', () => {
    const sheet = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain('&lt;script&gt;&amp;&quot;');
  });
});

describe('readXlsx on Excel-shaped files', () => {
  it('resolves shared strings, rich text runs, and ignores phonetic runs', () => {
    const bytes = handmadeXlsx({
      sharedStrings: '<si><t>الاسم</t></si><si><t>الهاتف</t></si><si><r><t>سارة </t></r><r><rPr><b/></rPr><t>بلقاسم</t></r><rPh><t>IGNORED</t></rPh></si>',
      sheetXml: '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
        + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>550123456</v></c></row>',
    });
    const out = readXlsx(bytes);
    expect(out.headers).toEqual(['الاسم', 'الهاتف']);
    expect(out.rows[0]).toEqual({ __row: 2, الاسم: 'سارة بلقاسم', الهاتف: '550123456' });
  });

  it('converts date-formatted numbers (builtin and custom formats) to ISO dates', () => {
    const bytes = handmadeXlsx({
      styles: '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>'
        + '<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs>',
      sheetXml: '<row r="1"><c r="A1" t="inlineStr"><is><t>birth</t></is></c><c r="B1" t="inlineStr"><is><t>paid</t></is></c><c r="C1" t="inlineStr"><is><t>avg</t></is></c></row>'
        + '<row r="2"><c r="A2" s="1"><v>39582</v></c><c r="B2" s="2"><v>46270</v></c><c r="C2"><v>12.499999999999998</v></c></row>',
    });
    expect(readXlsx(bytes).rows[0]).toEqual({ __row: 2, birth: '2008-05-14', paid: '2026-09-05', avg: '12.5' });
  });

  it('handles the 1904 date system', () => {
    const bytes = handmadeXlsx({
      workbookPr: '<workbookPr date1904="1"/>',
      styles: '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs>',
      sheetXml: '<row r="1"><c r="A1" t="inlineStr"><is><t>d</t></is></c></row><row r="2"><c r="A2" s="1"><v>38120</v></c></row>',
    });
    expect(readXlsx(bytes).rows[0].d).toBe('2008-05-14');
  });

  it('copes with cells and rows that have no r attribute, booleans and formula strings', () => {
    const bytes = handmadeXlsx({
      sheetXml: '<row><c t="inlineStr"><is><t>a</t></is></c><c t="inlineStr"><is><t>b</t></is></c><c t="inlineStr"><is><t>c</t></is></c></row>'
        + '<row><c t="b"><v>1</v></c><c t="str"><f>A1</f><v>computed</v></c><c t="e"><v>#N/A</v></c></row>',
    });
    expect(readXlsx(bytes).rows[0]).toEqual({ __row: 2, a: 'TRUE', b: 'computed', c: '' });
  });

  it('uses the first non-empty row as the header', () => {
    const bytes = handmadeXlsx({
      sheetXml: '<row r="3"><c r="B3" t="inlineStr"><is><t>name</t></is></c></row><row r="4"><c r="B4" t="inlineStr"><is><t>x</t></is></c></row>',
    });
    const out = readXlsx(bytes);
    expect(out.headers).toEqual(['name']);
    expect(out.rows).toEqual([expect.objectContaining({ __row: 4, name: 'x' })]);
  });

  it('rejects files that are not xlsx with a clear Arabic message', () => {
    expect(() => readXlsx(strToU8('name,email\nx,y'))).toThrow(/Excel/);
  });
});

describe('serialToIsoDate', () => {
  it('converts Excel serials', () => {
    expect(serialToIsoDate(39582)).toBe('2008-05-14');
    expect(serialToIsoDate(39582.75)).toBe('2008-05-14');
    expect(serialToIsoDate(0)).toBeNull();
  });
});
