import { validateNewPassword, MIN_NEW_PASSWORD } from './ForcePasswordChange';
import { credentialActionFor } from '../admin/components/StudentCredentialsModal';

jest.mock('../firebase', () => ({ auth: {}, db: {} }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({}) }));

describe('validateNewPassword (first-login change)', () => {
  it('requires the temporary password', () =>
    expect(validateNewPassword('', 'abcd1234', 'abcd1234')).toMatch(/المؤقتة/));
  it(`requires at least ${MIN_NEW_PASSWORD} characters`, () =>
    expect(validateNewPassword('Tmp#1234abcd', 'ab12', 'ab12')).toMatch(/أحرف على الأقل/));
  it('requires letters and digits', () => {
    expect(validateNewPassword('Tmp#1234abcd', 'abcdefgh', 'abcdefgh')).toMatch(/حروف وأرقام/);
    expect(validateNewPassword('Tmp#1234abcd', '12345678', '12345678')).toMatch(/حروف وأرقام/);
  });
  it('refuses to keep the temporary password', () =>
    expect(validateNewPassword('Tmp#1234abcd', 'Tmp#1234abcd', 'Tmp#1234abcd')).toMatch(/مختلفة/));
  it('requires a matching confirmation', () =>
    expect(validateNewPassword('Tmp#1234abcd', 'mine2026x', 'mine2026y')).toMatch(/غير مطابق/));
  it('accepts a good new password (Arabic letters count as letters)', () => {
    expect(validateNewPassword('Tmp#1234abcd', 'mine2026x', 'mine2026x')).toBeNull();
    expect(validateNewPassword('Tmp#1234abcd', 'كلمتي2026', 'كلمتي2026')).toBeNull();
  });
});

describe('credentialActionFor (Students page recovery button)', () => {
  it('offers to create the account for students imported without email', () =>
    expect(credentialActionFor({ authAccountStatus: 'none' }).kind).toBe('create'));
  it('offers a retry when account creation failed', () =>
    expect(credentialActionFor({ authAccountStatus: 'failed' }).kind).toBe('create'));
  it('offers a new temporary password only while the admin-issued one is unchanged', () => {
    expect(credentialActionFor({ authAccountStatus: 'active', createdByAdmin: true, mustChangePassword: true }).kind).toBe('reset');
    expect(credentialActionFor({ authAccountStatus: 'active', createdByAdmin: true, mustChangePassword: false })).toBeNull();
  });
  it('never offers anything for self-registered or legacy students', () => {
    expect(credentialActionFor({ verificationStatus: 'verified' })).toBeNull();
    expect(credentialActionFor({ createdByAdmin: true })).toBeNull();
  });
});
