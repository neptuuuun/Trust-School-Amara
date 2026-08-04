import {
  getComputedStatus,
  isReservation,
  isRegistrationExpired,
  isRegistrationBlocking,
  isRenewalCandidate,
  isAnnualPaymentForCurrentYear,
  toDate,
} from './registrationUtils';

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

describe('toDate', () => {
  test('coerces Date, Firestore Timestamp, ms, and rejects garbage', () => {
    const d = new Date(2026, 0, 1);
    expect(toDate(d)).toBe(d);
    expect(toDate({ toDate: () => d })).toBe(d);
    expect(toDate(d.getTime()).getTime()).toBe(d.getTime());
    expect(toDate(null)).toBeNull();
    expect(toDate('not-a-date')).toBeNull();
  });
});

describe('getComputedStatus — support subscription lifecycle', () => {
  test('no registration → none', () => {
    expect(getComputedStatus(null)).toBe('none');
    expect(getComputedStatus({})).toBe('none');
  });

  test('rejected and pending map straight through', () => {
    expect(getComputedStatus({ status: 'rejected' })).toBe('rejected');
    expect(getComputedStatus({ status: 'pending' })).toBe('pending');
  });

  test('verified + future start → reserved (seat held, not begun)', () => {
    expect(getComputedStatus({ status: 'verified', startDate: daysFromNow(10) })).toBe('reserved');
  });

  test('verified + started + not expired → active', () => {
    expect(getComputedStatus({ status: 'verified', startDate: daysFromNow(-10), endDate: daysFromNow(20) })).toBe('active');
  });

  test('verified + past end → expired (renewal allowed)', () => {
    expect(getComputedStatus({ status: 'verified', startDate: daysFromNow(-40), endDate: daysFromNow(-1) })).toBe('expired');
  });

  test('approved / registered / active are treated like verified', () => {
    expect(getComputedStatus({ status: 'approved', startDate: daysFromNow(-1), endDate: daysFromNow(10) })).toBe('active');
    expect(getComputedStatus({ status: 'registered', startDate: daysFromNow(5) })).toBe('reserved');
  });
});

describe('isReservation', () => {
  test('future startDate → reservation', () => {
    expect(isReservation({ startDate: daysFromNow(3) })).toBe(true);
  });
  test('past startDate → not a reservation', () => {
    expect(isReservation({ startDate: daysFromNow(-3) })).toBe(false);
  });
  test('legacy reserved flag with no startDate', () => {
    expect(isReservation({ reserved: true })).toBe(true);
    expect(isReservation({ reserved: false })).toBe(false);
  });
});

describe('isRegistrationExpired', () => {
  test('past endDate expired; future not; legacy expiresAt honored', () => {
    expect(isRegistrationExpired({ endDate: daysFromNow(-1) })).toBe(true);
    expect(isRegistrationExpired({ endDate: daysFromNow(1) })).toBe(false);
    expect(isRegistrationExpired({ expiresAt: daysFromNow(-1) })).toBe(true);
    expect(isRegistrationExpired({})).toBe(false);
  });
});

describe('duplicate-prevention gate (blocking vs renewal)', () => {
  test('pending/active/reserved block a new registration', () => {
    expect(isRegistrationBlocking({ status: 'pending' })).toBe(true);
    expect(isRegistrationBlocking({ status: 'verified', startDate: daysFromNow(-1), endDate: daysFromNow(9) })).toBe(true);
    expect(isRegistrationBlocking({ status: 'verified', startDate: daysFromNow(9) })).toBe(true);
  });
  test('expired/rejected/none do NOT block (renewal / re-apply allowed)', () => {
    expect(isRegistrationBlocking({ status: 'verified', startDate: daysFromNow(-40), endDate: daysFromNow(-1) })).toBe(false);
    expect(isRegistrationBlocking({ status: 'rejected' })).toBe(false);
    expect(isRegistrationBlocking(null)).toBe(false);
  });
  test('only expired is a renewal candidate', () => {
    expect(isRenewalCandidate({ status: 'verified', startDate: daysFromNow(-40), endDate: daysFromNow(-1) })).toBe(true);
    expect(isRenewalCandidate({ status: 'verified', startDate: daysFromNow(-1), endDate: daysFromNow(9) })).toBe(false);
  });
});

describe('annual fee — current academic year detection', () => {
  const now = new Date(2026, 0, 15); // 15 Jan 2026 → AY 2025-2026 (starts 1 Jul 2025)

  test('verified payment tagged with the current academic year counts', () => {
    expect(isAnnualPaymentForCurrentYear({ status: 'verified', academicYear: '2025-2026' }, now)).toBe(true);
  });
  test('verified payment whose verifiedAt falls in the current year counts', () => {
    expect(isAnnualPaymentForCurrentYear({ status: 'verified', verifiedAt: new Date(2025, 8, 1) }, now)).toBe(true);
  });
  test('a payment from the previous academic year does NOT count', () => {
    expect(isAnnualPaymentForCurrentYear({ status: 'verified', verifiedAt: new Date(2025, 3, 1) }, now)).toBe(false);
  });
  test('unverified payments never count', () => {
    expect(isAnnualPaymentForCurrentYear({ status: 'pending', academicYear: '2025-2026' }, now)).toBe(false);
    expect(isAnnualPaymentForCurrentYear(null, now)).toBe(false);
  });
});
