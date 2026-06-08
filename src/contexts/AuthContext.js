import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { auth, db } from '../firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  signInWithPopup,
} from 'firebase/auth';
import { googleProvider } from '../firebase';
import { findUserAcrossBranches, createGoogleUserStub } from '../services/googleAuthService';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { useBranch } from './BranchContext';
import { recordUserActivity } from '../services/userLifecycleService';
import { getAdminByUid, onAdminSnapshot, validateBranchAccess } from '../services/adminService';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileBranch, setProfileBranch] = useState(null);
  const [verified, setVerified] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [profileDoc, setProfileDoc] = useState(null);
  const [profileDocPath, setProfileDocPath] = useState(null);
  const [authEmailVerified, setAuthEmailVerified] = useState(null);
  const [accountStatus, setAccountStatus] = useState(null);
  const [emailVerificationSyncing, setEmailVerificationSyncing] = useState(false);
  const [adminData, setAdminData] = useState(null);
  const [completedProfile, setCompletedProfile] = useState(null);

  // FIX: consume setBranchFromAuth (the single write path) instead of
  // selectedBranchId + window events + direct localStorage writes.
  const { selectedBranchId, setBranchFromAuth, resetBranch } = useBranch();

  const activeListenerRef = useRef(null);
  const adminListenerRef = useRef(null);
  // Ref so the profile-listener effect can check admin status without including
  // `role` in its dependency array (which would create an infinite loop when
  // the snapshot callback calls setRole()).
  const isAdminRef = useRef(false);
  // Tracks the UID seen by the last onAuthStateChanged call. Used to distinguish
  // a genuine sign-in (null → UID) from a no-op re-notification caused by
  // currentUser.reload() (same UID, different token). setLoading(true) must only
  // fire on genuine sign-in; firing it on every reload() causes extra renders
  // that cascade into StudentDashboard's render loop.
  const prevUserUidRef = useRef(undefined); // undefined = auth not yet checked

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  const checkIfAdmin = async (uid, email) => {
    if (!uid || !email) return null;
    try {
      const adminDoc = await getAdminByUid(uid);
      if (adminDoc && adminDoc.role === 'admin') {
        console.log('👑 User is admin for branch:', adminDoc.branchId);
        return adminDoc;
      }
      return null;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return null;
    }
  };

  // ---------------------------------------------------------------------------
  // User-profile listener (non-admin only)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (activeListenerRef.current) {
      console.log('🧹 Cleaning up existing listener');
      try { activeListenerRef.current(); } catch (e) { console.error('Error cleaning up listener:', e); }
      activeListenerRef.current = null;
    }

    if (!user) {
      console.log('⏭️ No user, skipping listener setup');
      setRole(null);
      setProfileBranch(null);
      setVerified(null);
      setVerificationStatus(null);
      setProfileDoc(null);
      setProfileDocPath(null);
      setAccountStatus(null);
      setCompletedProfile(null);
      setLoading(false);
      return;
    }

    if (isAdminRef.current) {
      console.log('⏭️ User is admin, skipping listener setup');
      setLoading(false);
      return;
    }

    if (!selectedBranchId ||
        typeof selectedBranchId !== 'string' ||
        selectedBranchId.trim() === '' ||
        !user?.uid) {
      // Branch is not yet available — normal during admin initialization or
      // while the auth observer is still running its async admin check.
      // Do NOT reset role/branch/accountStatus here: those resets corrupt the
      // in-progress state managed by the auth observer and cause route guards
      // to see role:null while loading:false → wrong redirect to /home.
      // The auth observer owns all state transitions; this block just waits.
      return;
    }

    console.log('✅ Creating listener for:', { branchId: selectedBranchId, userId: user.uid });

    try {
      const branchRef = doc(db, 'branches', selectedBranchId, 'users', user.uid);
      const userDocPath = `branches/${selectedBranchId}/users/${user.uid}`;
      setProfileDocPath(userDocPath);

      const unsubscribe = onSnapshot(
        branchRef,
        (snap) => {
          if (!snap.exists()) {
            console.warn('User document missing in branch collection:', selectedBranchId, user.uid);
            setRole(null);
            setProfileBranch(null);
            setVerified(false);
            setAccountStatus(null);
            setLoading(false);
            return;
          }
          const data = snap.data();
          const userRole = data?.role || 'student';
          const branchId = data?.branch || data?.branchId || selectedBranchId || null;
          const vs = String(data?.verificationStatus || '').toLowerCase();
          const isVerified = vs === 'verified';
          const status = data?.status || null;
          // completedProfile: false only for Google stub users who haven't finished registration.
          // Email/password users never have this field → treated as true (backward compat).
          const isProfileComplete = data?.completedProfile !== false;

          // Auto-migrate legacy verified users into the single source of truth.
          if (!vs && (data?.verified === true || data?.accountVerified === true)) {
            setDoc(branchRef, { verificationStatus: 'verified', updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
          }

          console.log('[AuthContext] Canonical user doc snapshot', {
            path: userDocPath,
            verificationStatus: data?.verificationStatus,
            status: data?.status,
            doc: { id: snap.id, ...data },
          });
          console.log('📥 User profile updated:', { userRole, branchId, isVerified });

          setRole(userRole);
          setProfileBranch(branchId);
          setVerified(isVerified);
          setVerificationStatus(vs || null);
          setProfileDoc({ id: snap.id, ...data });
          setAccountStatus(status);
          setCompletedProfile(isProfileComplete);
          setLoading(false);
        },
        (error) => {
          console.error('❌ User profile listener error:', error);
          setRole(null);
          setProfileBranch(null);
          setVerified(false);
          setVerificationStatus(null);
          setProfileDoc(null);
          setProfileDocPath(null);
          setAccountStatus(null);
          setCompletedProfile(null);
          setLoading(false);
        }
      );

      activeListenerRef.current = unsubscribe;
    } catch (error) {
      console.error('❌ Failed to create user profile listener:', error);
      setRole(null);
      setProfileBranch(null);
      setVerified(false);
      setAccountStatus(null);
      setLoading(false);
    }

    return () => {
      if (activeListenerRef.current) {
        console.log('🧹 Cleanup: unsubscribing listener');
        try { activeListenerRef.current(); } catch (e) { console.error('Error during cleanup:', e); }
        activeListenerRef.current = null;
      }
    };
  }, [user, selectedBranchId]); // ← role intentionally excluded: snapshot sets role, which would re-trigger this effect

  // ---------------------------------------------------------------------------
  // Auth-state observer
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('🔐 Auth state changed:', currentUser?.email || 'logged out');

      // Only re-enter the loading state on a genuine sign-in event — when the
      // UID changes from null/undefined to a real value, or switches to a different
      // user. Do NOT set loading:true when the UID is unchanged; that happens on
      // every currentUser.reload() call (email-sync interval, token refresh) and
      // causes unnecessary re-renders that cascade into render loops downstream.
      const prevUid = prevUserUidRef.current;
      prevUserUidRef.current = currentUser?.uid ?? null;
      if (currentUser && currentUser.uid !== prevUid) {
        setLoading(true);
      }

      setUser(currentUser);

      if (currentUser) {
        try { await currentUser.reload(); } catch (e) { /* silent */ }
        setAuthEmailVerified(currentUser.emailVerified === true);
      } else {
        setAuthEmailVerified(null);
      }

      if (!currentUser) {
        setRole(null);
        setProfileBranch(null);
        setVerified(null);
        setVerificationStatus(null);
        setAuthEmailVerified(null);
        setAccountStatus(null);
        setAdminData(null);
        setCompletedProfile(null);
        setLoading(false);
        isAdminRef.current = false;
        return;
      }

      try {
        const adminInfo = await checkIfAdmin(currentUser.uid, currentUser.email);
        if (adminInfo) {
          console.log('👑 User is admin for branch:', adminInfo.branchId);
          setRole('admin');
          setProfileBranch(adminInfo.branchId);
          setVerified(true);
          setAccountStatus('admin');
          setAdminData(adminInfo);
          setLoading(false);
          isAdminRef.current = true;

          // FIX: set branch through the single authoritative write path.
          // Replaces the window.dispatchEvent('adminBranchSet') pattern — no
          // custom events, no direct localStorage writes from here.
          setBranchFromAuth(adminInfo.branchId);

          if (adminListenerRef.current) adminListenerRef.current();
          adminListenerRef.current = onAdminSnapshot(currentUser.uid, (updatedAdmin) => {
            if (updatedAdmin) {
              setAdminData(updatedAdmin);
              setProfileBranch(updatedAdmin.branchId);
              // Keep context in sync if admin's assigned branch changes in Firestore
              setBranchFromAuth(updatedAdmin.branchId);
            } else {
              // Admin document deleted — sign out
              signOut(auth);
            }
          });
          return;
        }
      } catch (e) {
        console.error('Error checking admin status:', e);
      }

      // Not an admin — clean up any stale admin listener
      if (adminListenerRef.current) {
        adminListenerRef.current();
        adminListenerRef.current = null;
      }
      setAdminData(null);

      // For non-admin users, the separate useEffect above handles the listener.
      // DON'T set loading to false here — let the listener do it.
      console.log('👤 Regular user - profile listener will be set up by separate effect');

      if (currentUser && selectedBranchId) {
        try { await syncEmailVerificationIfNeeded(selectedBranchId); } catch (e) { /* silent */ }
      }
    });

    return () => {
      unsubscribe();
      if (adminListenerRef.current) adminListenerRef.current();
    };
  // IMPORTANT: selectedBranchId is intentionally NOT in this dependency array.
  // Adding it would cause the entire auth check to re-run on every branch switch,
  // triggering the admin verification → welcome alert loop.
  // Branch state is managed independently by BranchContext.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Email-verification helpers
  // ---------------------------------------------------------------------------

  const EMAIL_VERIFICATION_RATE_LIMIT_MS = 60 * 1000;
  const getVerificationRateLimitKey = (uid) => `emailVerificationLastSentAt:${uid}`;

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) throw new Error('No authenticated user.');
    const uid = auth.currentUser.uid;
    const lastSentRaw = localStorage.getItem(getVerificationRateLimitKey(uid));
    const lastSentAt = lastSentRaw ? Number(lastSentRaw) : 0;
    const now = Date.now();
    if (lastSentAt && now - lastSentAt < EMAIL_VERIFICATION_RATE_LIMIT_MS) {
      const secondsLeft = Math.ceil((EMAIL_VERIFICATION_RATE_LIMIT_MS - (now - lastSentAt)) / 1000);
      throw new Error(`Please wait ${secondsLeft}s before resending.`);
    }
    await sendEmailVerification(auth.currentUser);
    localStorage.setItem(getVerificationRateLimitKey(uid), String(now));
  };

  const syncEmailVerificationIfNeeded = async (branchId) => {
    if (!auth.currentUser) return;
    try { await auth.currentUser.reload(); } catch (e) { /* silent */ }
    const isVerifiedNow = auth.currentUser.emailVerified === true;
    setAuthEmailVerified(isVerifiedNow);
    if (!isVerifiedNow || !branchId) return;

    const userRef = doc(db, 'branches', branchId, 'users', auth.currentUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const data = snap.data() || {};

    if (data?.status === 'email_pending') {
      setEmailVerificationSyncing(true);
      try {
        await setDoc(
          userRef,
          { emailVerified: true, status: 'active', verificationStatus: 'pending', updatedAt: serverTimestamp() },
          { merge: true }
        );
        setAccountStatus('active');
      } finally {
        setEmailVerificationSyncing(false);
      }
      return;
    }

    if (data?.emailVerified !== true) {
      await setDoc(userRef, { emailVerified: true, updatedAt: serverTimestamp() }, { merge: true });
    }
  };

  useEffect(() => {
    if (!user?.uid || role === 'admin' || !selectedBranchId) return;
    let cancelled = false;
    const maybeSync = async () => {
      try { if (!cancelled) await syncEmailVerificationIfNeeded(selectedBranchId); } catch (e) { /* silent */ }
    };
    maybeSync();
    const interval = setInterval(maybeSync, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user?.uid, role, selectedBranchId]);

  // ---------------------------------------------------------------------------
  // login
  // ---------------------------------------------------------------------------

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    try { await cred.user.reload(); } catch (e) { /* silent */ }
    setAuthEmailVerified(cred.user.emailVerified === true);

    const adminInfo = await checkIfAdmin(cred.user.uid, email);
    if (adminInfo) {
      setRole('admin');
      setProfileBranch(adminInfo.branchId);
      setVerified(true);
      setAccountStatus('admin');
      setAdminData(adminInfo);
      // FIX: use the single write path — no window event, no direct localStorage
      setBranchFromAuth(adminInfo.branchId);
      return cred.user;
    }

    if (!selectedBranchId) {
      await signOut(auth);
      throw new Error('يرجى اختيار الفرع أولاً.');
    }

    try {
      const branchRef = doc(db, 'branches', selectedBranchId, 'users', cred.user.uid);
      const branchSnap = await getDoc(branchRef);
      if (!branchSnap.exists()) {
        await signOut(auth);
        throw new Error('هذا الحساب غير مسجل. يرجى التحقق من بيانات الدخول أو إنشاء حساب جديد.');
      }

      const data = branchSnap.data();
      const userRole = data?.role || 'student';
      const branchId = data?.branch || data?.branchId || selectedBranchId || null;
      const nvs = String(data?.verificationStatus || '').toLowerCase();
      const isVerified = nvs === 'verified';

      setRole(userRole);
      setProfileBranch(branchId);
      setVerified(isVerified);
      setVerificationStatus(nvs || null);
      setProfileDoc({ id: branchSnap.id, ...data });
      setProfileDocPath(`branches/${selectedBranchId}/users/${cred.user.uid}`);
      setAccountStatus(data?.status || null);

      try { await syncEmailVerificationIfNeeded(selectedBranchId); } catch (e) { /* silent */ }

      try {
        await recordUserActivity(cred.user.uid, selectedBranchId, 'login');
      } catch (activityError) {
        console.warn('Failed to record login activity:', activityError);
      }
    } catch (e) {
      console.error('Failed to refresh role after login:', e);
      throw e;
    }

    return cred.user;
  };

  // ---------------------------------------------------------------------------
  // loginWithGoogle
  // ---------------------------------------------------------------------------

  /**
   * Sign in using Google for EXISTING accounts only.
   *
   * Google authentication is a login convenience — it does NOT create new
   * student accounts. New students must register through the full form so
   * that all mandatory fields (birth date/place, address, phone, photos)
   * and document uploads are captured.
   *
   * Flow:
   *  1. Open Google popup.
   *  2. If the user is an admin → set admin state and return.
   *  3. Search all branches for an existing Firestore user doc.
   *     a. Found  → load branch/role/status from that doc.
   *     b. Missing → sign out and throw { code: 'google/no-account' }.
   *
   * Throws:
   *  - google/popup-closed   — user closed the popup
   *  - google/account-exists — email tied to a password account
   *  - google/no-account     — no Firestore profile exists; must register first
   *
   * Returns { user, isNewUser: false }
   */
  const loginWithGoogle = async () => {
    let cred;
    try {
      cred = await signInWithPopup(auth, googleProvider);
    } catch (err) {
      // Popup was closed by the user — treat as a soft cancellation.
      if (
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request'
      ) {
        const soft = new Error('تم إغلاق نافذة تسجيل الدخول.');
        soft.code = 'google/popup-closed';
        throw soft;
      }
      // Same email already registered with email+password provider.
      if (err.code === 'auth/account-exists-with-different-credential') {
        const msg = new Error(
          'هذا البريد الإلكتروني مرتبط بحساب آخر. استخدم تسجيل الدخول بكلمة المرور.'
        );
        msg.code = 'google/account-exists';
        throw msg;
      }
      throw err;
    }

    const googleUser = cred.user;

    // ── 1. Admin check ──────────────────────────────────────────────────────
    const adminInfo = await checkIfAdmin(googleUser.uid, googleUser.email);
    if (adminInfo) {
      setRole('admin');
      setProfileBranch(adminInfo.branchId);
      setVerified(true);
      setAccountStatus('admin');
      setAdminData(adminInfo);
      setAuthEmailVerified(true);
      setCompletedProfile(true);
      isAdminRef.current = true;
      setBranchFromAuth(adminInfo.branchId);
      return { user: googleUser, completedProfile: true };
    }

    // ── 2. Existing student ─────────────────────────────────────────────────
    const existing = await findUserAcrossBranches(googleUser.uid);
    if (existing) {
      const { branchId, data } = existing;
      const vs = String(data?.verificationStatus || '').toLowerCase();
      const isProfileComplete = data?.completedProfile !== false;

      setBranchFromAuth(branchId);
      setRole(data.role || 'student');
      setProfileBranch(branchId);
      setVerified(vs === 'verified');
      setVerificationStatus(vs || null);
      setProfileDoc({ id: googleUser.uid, ...data });
      setProfileDocPath(`branches/${branchId}/users/${googleUser.uid}`);
      setAccountStatus(data.status || null);
      setAuthEmailVerified(true);
      setCompletedProfile(isProfileComplete);
      return { user: googleUser, completedProfile: isProfileComplete };
    }

    // ── 3. No Firestore profile — login page does not create accounts ────────
    await signOut(auth);
    const noAccount = new Error('لا يوجد حساب مرتبط بهذا البريد. يرجى إنشاء حساب جديد.');
    noAccount.code = 'google/no-account';
    throw noAccount;
  };

  // ---------------------------------------------------------------------------
  // registerWithGoogle  (Register page — creates stub for new users)
  // ---------------------------------------------------------------------------

  /**
   * Sign in or sign up with Google from the Register page.
   *
   * New users → stub document (completedProfile: false) → caller navigates to
   *             /complete-registration to collect mandatory fields + photos.
   * Existing users → loaded exactly like loginWithGoogle.
   *
   * The branch for the stub comes from selectedBranchId, which RegisterPage
   * always ensures is set (redirects to /branch-selector otherwise).
   *
   * Throws:
   *  - google/popup-closed   — user closed the popup
   *  - google/account-exists — email tied to a password account
   *  - google/needs-branch   — no branch selected (guard in RegisterPage prevents this)
   *
   * Returns { user, isNewUser, completedProfile }
   */
  const registerWithGoogle = async () => {
    let cred;
    try {
      cred = await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request'
      ) {
        const soft = new Error('تم إغلاق نافذة تسجيل الدخول.');
        soft.code = 'google/popup-closed';
        throw soft;
      }
      if (err.code === 'auth/account-exists-with-different-credential') {
        const msg = new Error(
          'هذا البريد الإلكتروني مرتبط بحساب آخر. استخدم تسجيل الدخول بكلمة المرور.'
        );
        msg.code = 'google/account-exists';
        throw msg;
      }
      throw err;
    }

    const googleUser = cred.user;

    // ── Admin check ──────────────────────────────────────────────────────────
    const adminInfo = await checkIfAdmin(googleUser.uid, googleUser.email);
    if (adminInfo) {
      setRole('admin');
      setProfileBranch(adminInfo.branchId);
      setVerified(true);
      setAccountStatus('admin');
      setAdminData(adminInfo);
      setAuthEmailVerified(true);
      setCompletedProfile(true);
      isAdminRef.current = true;
      setBranchFromAuth(adminInfo.branchId);
      return { user: googleUser, isNewUser: false, completedProfile: true };
    }

    // ── Existing student ─────────────────────────────────────────────────────
    const existing = await findUserAcrossBranches(googleUser.uid);
    if (existing) {
      const { branchId, data } = existing;
      const vs = String(data?.verificationStatus || '').toLowerCase();
      const isProfileComplete = data?.completedProfile !== false;

      setBranchFromAuth(branchId);
      setRole(data.role || 'student');
      setProfileBranch(branchId);
      setVerified(vs === 'verified');
      setVerificationStatus(vs || null);
      setProfileDoc({ id: googleUser.uid, ...data });
      setProfileDocPath(`branches/${branchId}/users/${googleUser.uid}`);
      setAccountStatus(data.status || null);
      setAuthEmailVerified(true);
      setCompletedProfile(isProfileComplete);
      return { user: googleUser, isNewUser: false, completedProfile: isProfileComplete };
    }

    // ── New user — branch required ───────────────────────────────────────────
    const branchId = selectedBranchId;
    if (!branchId) {
      await signOut(auth);
      const err = new Error('يرجى اختيار الفرع أولاً.');
      err.code = 'google/needs-branch';
      throw err;
    }

    const payload = await createGoogleUserStub(branchId, googleUser);

    setBranchFromAuth(branchId);
    setRole('student');
    setProfileBranch(branchId);
    setVerified(false);
    setVerificationStatus('unverified');
    setProfileDoc({ id: googleUser.uid, ...payload });
    setProfileDocPath(`branches/${branchId}/users/${googleUser.uid}`);
    setAccountStatus('incomplete');
    setAuthEmailVerified(true);
    setCompletedProfile(false);

    return { user: googleUser, isNewUser: true, completedProfile: false };
  };

  // ---------------------------------------------------------------------------
  // signup
  // ---------------------------------------------------------------------------

  const signup = async (email, password, extraData = {}) => {
    // branchId MUST come from extraData (passed explicitly from the registration UI).
    // Falling back to selectedBranchId covers the case where a student has already
    // selected a branch on the public selection page before reaching this call.
    const branchId = extraData.branchId || selectedBranchId;

    console.log('🔵 signup called with:', {
      email,
      branchId,
      extraDataBranchId: extraData.branchId,
      selectedBranchId,
      extraData
    });

    if (!branchId) throw new Error('يرجى اختيار الفرع قبل إنشاء الحساب.');

    const validBranches = ['boumerdes', 'bordj_menaiel'];
    if (!validBranches.includes(branchId)) {
      throw new Error(`Invalid branchId: ${branchId}. Must be one of: ${validBranches.join(', ')}`);
    }

    console.log('🔵 Creating Firebase Auth user...');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log('✅ Firebase Auth user created:', cred.user.uid);

    const branchName = extraData.branchName ||
      (branchId === 'boumerdes' ? 'بومرداس' :
       branchId === 'bordj_menaiel' ? 'برج منايل' : branchId);

    const userPath = `branches/${branchId}/users/${cred.user.uid}`;
    const userRef = doc(db, 'branches', branchId, 'users', cred.user.uid);

    const payload = {
      uid: cred.user.uid,
      email,
      role: 'student',
      name: extraData.name || extraData.fullName || '',
      fullName: extraData.fullName || extraData.name || '',
      branchId: branchId,
      branchName: branchName,
      status: 'email_pending',
      emailVerified: false,
      verified: false,
      accountVerified: false,
      verificationStatus: 'unverified',
      paymentVerified: false,
      birthDate: extraData.birthDate || null,
      birthPlace: extraData.birthPlace || null,
      address: extraData.address || null,
      phoneNumber: extraData.phoneNumber || null,
      phone: extraData.phoneNumber || null,
      registrationNumber: extraData.registrationNumber || null,
      internalRulesAccepted: extraData.internalRulesAccepted || false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    console.log('🔵 Saving initial user document to Firestore:', {
      path: userPath,
      branchId: payload.branchId,
      branchName: payload.branchName
    });

    try {
      await setDoc(userRef, payload, { merge: true });
      console.log('✅ Initial user document saved to Firestore');

      try {
        await sendEmailVerification(cred.user);
        localStorage.setItem(getVerificationRateLimitKey(cred.user.uid), String(Date.now()));
      } catch (e) {
        console.warn('Failed to send verification email:', e);
      }

      const verifyDoc = await getDoc(userRef);
      if (!verifyDoc.exists()) throw new Error('User document was not created successfully in signup');
      console.log('✅ User document verified in Firestore');
    } catch (error) {
      console.error('❌ Error saving initial user document:', {
        path: userPath,
        error: error.message,
        code: error.code
      });
      // Rollback: delete the Firebase Auth account so the email address can be
      // reused and the student can retry without getting "email already in use".
      try {
        await cred.user.delete();
        console.warn('🔄 Auth user deleted (rollback) after Firestore write failure');
      } catch (deleteError) {
        console.error('❌ Failed to delete auth user during rollback:', deleteError);
      }
      throw error;
    }

    setRole('student');
    setProfileBranch(branchId);
    setAuthEmailVerified(false);
    setAccountStatus('email_pending');

    return cred.user;
  };

  // ---------------------------------------------------------------------------
  // logout
  // ---------------------------------------------------------------------------

  const logout = async () => {
    await signOut(auth);
    setRole(null);
    setUser(null);
    setProfileBranch(null);
    setVerified(null);
    setVerificationStatus(null);
    setProfileDoc(null);
    setProfileDocPath(null);
    setAuthEmailVerified(null);
    setAccountStatus(null);
    setEmailVerificationSyncing(false);
    setAdminData(null);
    setCompletedProfile(null);

    // FIX: resetBranch() clears context + localStorage without triggering a
    // second signOut (the old clearBranch() called signOut internally, causing
    // a double-signout race condition).
    resetBranch();

    if (adminListenerRef.current) {
      adminListenerRef.current();
      adminListenerRef.current = null;
    }
  };

  // ---------------------------------------------------------------------------
  // context value
  // ---------------------------------------------------------------------------

  const value = {
    user,
    role,
    branch: profileBranch,
    verified,
    verificationStatus,
    profileDoc,
    profileDocPath,
    authEmailVerified,
    accountStatus,
    emailVerificationSyncing,
    adminData,
    loading,
    login,
    loginWithGoogle,
    registerWithGoogle,
    signup,
    logout,
    resendVerificationEmail,
    completedProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};