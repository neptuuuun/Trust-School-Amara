/**
 * ForcePasswordChange — first-login screen for students whose account was
 * created by an admin with a TEMPORARY password (individual registration or bulk
 * import). Rendered by the RequireStudent guard while the profile carries
 * `mustChangePassword: true`.
 *
 * Flow: re-authenticate with the temporary password (proves possession and makes
 * the session "recent", so Firebase accepts the change) → updatePassword() →
 * clear the flag on the student's OWN profile. The flag is a plain profile field
 * that Firestore rules already let a student update on their own document
 * (isSafeUserSelfUpdate) — no rule change. The real secret stays in Firebase
 * Auth, which hashes it; nothing is stored or logged here.
 */

import React, { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { KeyRound, Eye, EyeOff, LogOut } from 'lucide-react';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input, Label } from './ui/input';
import { Alert } from './ui/feedback';

export const MIN_NEW_PASSWORD = 8;

/** @returns {string|null} Arabic error, or null when acceptable. */
export function validateNewPassword(current, next, confirm) {
  if (!current) return 'أدخل كلمة المرور المؤقتة التي تسلّمتها من الإدارة.';
  if (!next || next.length < MIN_NEW_PASSWORD) return `كلمة المرور الجديدة يجب أن تتكون من ${MIN_NEW_PASSWORD} أحرف على الأقل.`;
  if (!/[A-Za-z؀-ۿ]/.test(next) || !/\d/.test(next)) return 'كلمة المرور الجديدة يجب أن تحتوي على حروف وأرقام.';
  if (next === current) return 'اختر كلمة مرور مختلفة عن كلمة المرور المؤقتة.';
  if (next !== confirm) return 'تأكيد كلمة المرور غير مطابق.';
  return null;
}

const messageFor = (code) => {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'كلمة المرور المؤقتة غير صحيحة.';
    case 'auth/weak-password':
      return 'كلمة المرور الجديدة ضعيفة جداً. اختر كلمة أطول.';
    case 'auth/too-many-requests':
      return 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.';
    case 'auth/network-request-failed':
      return 'تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً.';
    case 'auth/requires-recent-login':
      return 'انتهت صلاحية الجلسة. سجّل الخروج ثم الدخول مجدداً بكلمة المرور المؤقتة.';
    default:
      return 'تعذّر تغيير كلمة المرور. حاول مرة أخرى.';
  }
};

export default function ForcePasswordChange() {
  const { user, profileDocPath, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const invalid = validateNewPassword(current, next, confirm);
    if (invalid) { setError(invalid); return; }
    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.email || !profileDocPath) { setError('تعذّر تحديد الحساب. سجّل الدخول مجدداً.'); return; }
    setBusy(true);
    try {
      await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, current));
      await updatePassword(firebaseUser, next);
      await updateDoc(doc(db, profileDocPath), {
        mustChangePassword: false,
        passwordChangedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // The profile listener sees the flag drop and the guard renders the dashboard.
    } catch (err) {
      setError(messageFor(err?.code));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (
    <button
      type="button"
      aria-label={show ? 'إخفاء كلمات المرور' : 'إظهار كلمات المرور'}
      onClick={() => setShow((v) => !v)}
      className="flex items-center text-gray-500 hover:text-gray-700 focus:outline-none"
    >
      {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 px-4 py-12" dir="rtl">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-md">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary">
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">اختر كلمة مرور جديدة</h1>
          <p className="mt-1 text-sm text-gray-600">
            حسابك أُنشئ من طرف الإدارة بكلمة مرور مؤقتة. لحماية حسابك، اختر كلمة مرور خاصة بك قبل المتابعة.
          </p>
          {user?.email && <p className="mt-2 text-xs text-gray-500" dir="ltr">{user.email}</p>}
        </div>

        {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          <div>
            <Label htmlFor="fpc-current">كلمة المرور المؤقتة</Label>
            <Input id="fpc-current" type={show ? 'text' : 'password'} autoComplete="current-password" dir="ltr"
              value={current} onChange={(e) => setCurrent(e.target.value)} endAdornment={toggle} />
          </div>
          <div>
            <Label htmlFor="fpc-new">كلمة المرور الجديدة</Label>
            <Input id="fpc-new" type={show ? 'text' : 'password'} autoComplete="new-password" dir="ltr"
              value={next} onChange={(e) => setNext(e.target.value)} />
            <p className="mt-1 text-xs text-gray-500">{MIN_NEW_PASSWORD} أحرف على الأقل، تحتوي على حروف وأرقام.</p>
          </div>
          <div>
            <Label htmlFor="fpc-confirm">تأكيد كلمة المرور الجديدة</Label>
            <Input id="fpc-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" dir="ltr"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <Button type="submit" fullWidth disabled={busy}>
            {busy ? 'جاري الحفظ...' : 'حفظ كلمة المرور والمتابعة'}
          </Button>
        </form>

        <button type="button" onClick={() => logout()} className="mx-auto mt-5 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <LogOut className="h-4 w-4" /> تسجيل الخروج
        </button>
      </div>
    </div>
  );
}
