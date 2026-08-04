// jspdf is only used at PDF-generation time; stub it so importing the module in
// jsdom never touches canvas. getReceiptNumber and the label maps are pure.
jest.mock('jspdf', () => ({ jsPDF: class {} }));

import { getReceiptNumber, PAYMENT_TYPE_LABELS } from './receipt';

describe('getReceiptNumber', () => {
  test('an explicit receiptNumber is returned verbatim', () => {
    expect(getReceiptNumber({ receiptNumber: 'RC-CUSTOM-1' })).toBe('RC-CUSTOM-1');
  });

  test('derives a stable RC-<year>-<ref> from a transaction reference', () => {
    const data = { reference: 'abc-123-xyz', date: new Date(2026, 0, 1) };
    const n1 = getReceiptNumber(data);
    const n2 = getReceiptNumber(data);
    expect(n1).toBe(n2); // deterministic
    expect(n1).toMatch(/^RC-2026-[A-Z0-9]{8}$/);
  });

  test('uses the date year in the prefix', () => {
    expect(getReceiptNumber({ reference: 'x', date: new Date(2027, 5, 5) })).toMatch(/^RC-2027-/);
  });
});

describe('PAYMENT_TYPE_LABELS', () => {
  test('maps every service type to an Arabic label', () => {
    expect(PAYMENT_TYPE_LABELS.annual_fee).toBe('الرسم السنوي');
    expect(PAYMENT_TYPE_LABELS.support).toBe('دروس الدعم');
    expect(PAYMENT_TYPE_LABELS.language).toBe('اللغات');
    expect(PAYMENT_TYPE_LABELS.training).toBe('الدورات التكوينية');
  });
});
