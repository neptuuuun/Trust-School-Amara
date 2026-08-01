/**
 * authErrors — turn a Firebase Authentication error into a clear, friendly
 * Arabic message that is SAFE to show a user.
 *
 * Two rules drive this file:
 *   1. The user must NEVER see a raw Firebase error code (e.g. `auth/...`).
 *   2. The message must tell them exactly what went wrong and what to do next.
 *
 * The tricky case is `auth/invalid-credential`. Firebase (v9+) now returns it
 * for BOTH a wrong password AND a non-existent account, so it cannot be blindly
 * treated as "wrong password". We disambiguate by looking the email up with
 * `fetchSignInMethodsForEmail`:
 *   • methods found  → the account exists → the password was wrong.
 *   • no methods     → no account for that email → "account not found".
 *
 * ⚠️ Caveat: if "Email Enumeration Protection" is enabled in the Firebase
 * console (Authentication → Settings → User actions), `fetchSignInMethodsForEmail`
 * ALWAYS resolves to an empty array — Firebase deliberately hides whether an
 * account exists. With that setting on, the wrong-password vs not-found
 * distinction is impossible client-side and every `invalid-credential` will be
 * reported as "account not found". Turn the setting off for the distinction to work.
 *
 * The real Firebase error should always be `console.error`-logged by the caller
 * (or here, for the lookup) so debugging stays possible.
 */

import { fetchSignInMethodsForEmail } from 'firebase/auth';
import { auth } from '../firebase';

// User-facing messages. Never expose Firebase codes here.
export const LOGIN_ERROR_MESSAGES = {
  wrongPassword: 'كلمة المرور غير صحيحة. يرجى المحاولة مرة أخرى.',

  // Student login: they can self-register, and the account is branch-scoped,
  // so hint at both possibilities.
  userNotFound:
    'لا يوجد حساب مرتبط بهذا البريد الإلكتروني. يرجى التأكد من البريد الإلكتروني أو إنشاء حساب جديد. وإذا كان لديك حساب، فتأكد أنك تستخدم الفرع الصحيح.',

  // Admin / owner login: staff cannot self-register and do not pick a branch,
  // so keep the not-found message simple.
  userNotFoundStaff:
    'لا يوجد حساب مرتبط بهذا البريد الإلكتروني. يرجى التأكد من البريد الإلكتروني.',

  invalidEmail: 'صيغة البريد الإلكتروني غير صحيحة.',

  tooManyRequests:
    'تم إجراء عدد كبير من محاولات تسجيل الدخول. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',

  networkError:
    'تعذر الاتصال بالإنترنت. يرجى التحقق من اتصالك ثم المحاولة مرة أخرى.',

  unexpected:
    'حدث خطأ غير متوقع أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى لاحقًا.',
};

/**
 * Map a caught login error to a friendly Arabic message.
 *
 * @param {any} error  The caught error. Its real code/message is NEVER shown to
 *                     the user (the caller should log it for debugging).
 * @param {object} [opts]
 * @param {string} [opts.email]           Email typed in the form — needed to
 *                                         disambiguate `auth/invalid-credential`.
 * @param {string} [opts.notFoundMessage] Overrides the "no account" message
 *                                         (defaults to the student variant).
 * @returns {Promise<string>} A user-facing Arabic message.
 */
export async function getFriendlyLoginError(error, { email = '', notFoundMessage } = {}) {
  const M = LOGIN_ERROR_MESSAGES;
  const notFound = notFoundMessage || M.userNotFound;
  const code = error?.code;

  switch (code) {
    case 'auth/wrong-password':
      return M.wrongPassword;

    case 'auth/user-not-found':
      return notFound;

    case 'auth/invalid-email':
      return M.invalidEmail;

    case 'auth/too-many-requests':
      return M.tooManyRequests;

    case 'auth/network-request-failed':
      return M.networkError;

    // Ambiguous: modern Firebase returns this for a wrong password OR an unknown
    // account. Ask Firebase which one it is before deciding the message.
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials': // legacy alias emitted by some SDK builds
      if (email) {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, email);
          // Account exists → the password was wrong.
          if (Array.isArray(methods) && methods.length > 0) return M.wrongPassword;
          // No sign-in methods → no account for this email.
          return notFound;
        } catch (lookupErr) {
          // Lookup itself failed (e.g. offline). Fall back to the most common
          // cause rather than mislabeling it as a missing account.
          console.error('[login] sign-in methods lookup failed:', lookupErr?.code, lookupErr?.message, lookupErr);
          return M.wrongPassword;
        }
      }
      return M.wrongPassword;

    default:
      // App-level errors thrown by AuthContext.login() (e.g. "choose a branch
      // first", "this account is not registered") carry a friendly Arabic
      // message but NO Firebase `auth/` code — surface those as-is. Anything
      // with a code we don't recognise stays generic so no code ever leaks.
      if (!code && typeof error?.message === 'string' && error.message.trim()) {
        return error.message.trim();
      }
      return M.unexpected;
  }
}
