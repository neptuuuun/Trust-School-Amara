import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { auth, db } from '../firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { useBranch } from './BranchContext';
import { recordUserActivity } from '../services/userLifecycleService';

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
  const { selectedBranchId } = useBranch();
  
  // Use ref to track the active listener
  const activeListenerRef = useRef(null);

  // Admin email allowlist
  const ADMIN_EMAILS = [
    'marouabenzaoui48@gmail.com',
    'trustschoolamara@gmail.com',
    'admin@trust-school.com',
  ];

  const isAdminEmailStatic = (email) => 
    !!email && ADMIN_EMAILS.map((e) => e.toLowerCase().trim()).includes(email.toLowerCase().trim());

  const isAdminForBranch = async (branchId, email) => {
    if (!email || !branchId) return false;
    try {
      const metaRef = doc(db, 'branches', branchId, 'meta', 'info');
      const snap = await getDoc(metaRef);
      if (!snap.exists()) return isAdminEmailStatic(email);
      const adminEmails = (snap.data()?.adminEmails || []).map((e) => (e || '').toLowerCase().trim());
      return adminEmails.includes(email.toLowerCase().trim()) || isAdminEmailStatic(email);
    } catch (e) {
      console.warn('Failed to check branch admin meta, falling back to static list', e);
      return isAdminEmailStatic(email);
    }
  };

  // Separate effect to manage user profile listener
  useEffect(() => {
    // Cleanup any existing listener immediately
    if (activeListenerRef.current) {
      console.log('🧹 Cleaning up existing listener');
      try {
        activeListenerRef.current();
      } catch (e) {
        console.error('Error cleaning up listener:', e);
      }
      activeListenerRef.current = null;
    }

    // Don't set up listener if no user
    if (!user) {
      console.log('⏭️ No user, skipping listener setup');
      setRole(null);
      setProfileBranch(null);
      setVerified(null);
      setVerificationStatus(null);
      setProfileDoc(null);
      setProfileDocPath(null);
      setAccountStatus(null);
      setLoading(false);
      return;
    }

    // Don't set up listener if user is admin
    if (role === 'admin') {
      console.log('⏭️ User is admin, skipping listener setup');
      setLoading(false);
      return;
    }

    // CRITICAL FIX: Don't set loading to false here - wait for listener to fire
    if (!selectedBranchId || 
        typeof selectedBranchId !== 'string' || 
        selectedBranchId.trim() === '' ||
        !user?.uid) {
      console.warn('⚠️ Cannot create listener - invalid conditions:', {
        selectedBranchId,
        selectedBranchIdType: typeof selectedBranchId,
        userId: user?.uid
      });
      setRole(null);
      setProfileBranch(null);
      setAccountStatus(null);
      // REMOVED: setLoading(false) - keep loading until we verify user exists
      return;
    }

    // All conditions met - safe to create listener
    console.log('✅ Creating listener for:', {
      branchId: selectedBranchId,
      userId: user.uid
    });

    try {
      // SINGLE SOURCE OF TRUTH:
      // branches/{branchId}/users/{uid}.verificationStatus
      const branchRef = doc(db, 'branches', selectedBranchId, 'users', user.uid);
      const userDocPath = `branches/${selectedBranchId}/users/${user.uid}`;
      setProfileDocPath(userDocPath);
      
      const unsubscribe = onSnapshot(
        branchRef,
        (snap) => {
          // CRITICAL: Only set loading to false AFTER we get a response
          if (!snap.exists()) {
            console.warn('User document missing in branch collection:', selectedBranchId, user.uid);
            setRole(null);
            setProfileBranch(null);
            setVerified(false);
            setAccountStatus(null);
            setLoading(false); // Now it's safe to set loading false
            return;
          }
          const data = snap.data();
          const userRole = data?.role || 'student';
          const branchId = data?.branch || data?.branchId || selectedBranchId || null;
          const verificationStatus = String(data?.verificationStatus || '').toLowerCase();
          const isVerified = verificationStatus === 'verified';
          const status = data?.status || null;

          // Auto-migrate legacy verified users into the single source of truth.
          if (!verificationStatus && (data?.verified === true || data?.accountVerified === true)) {
            setDoc(
              branchRef,
              { verificationStatus: 'verified', updatedAt: serverTimestamp() },
              { merge: true }
            ).catch(() => {});
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
          setVerificationStatus(verificationStatus || null);
          setProfileDoc({ id: snap.id, ...data });
          setAccountStatus(status);
          setLoading(false); // Now it's safe to set loading false
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
          setLoading(false); // Set loading false even on error
        }
      );
      
      activeListenerRef.current = unsubscribe;
      
    } catch (error) {
      console.error('❌ Failed to create user profile listener:', error);
      setRole(null);
      setProfileBranch(null);
      setVerified(false);
      setAccountStatus(null);
      setLoading(false); // Set loading false on setup error
    }

    return () => {
      if (activeListenerRef.current) {
        console.log('🧹 Cleanup: unsubscribing listener');
        try {
          activeListenerRef.current();
        } catch (e) {
          console.error('Error during cleanup:', e);
        }
        activeListenerRef.current = null;
      }
    };
  }, [user, selectedBranchId, role]); // role added to prevent setup when admin

  // Watch Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('🔐 Auth state changed:', currentUser?.email || 'logged out');
      setUser(currentUser);

      if (currentUser) {
        try {
          await currentUser.reload();
        } catch (e) {
        }
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
        setLoading(false);
        return;
      }

      // Check if admin
      const adminBranchToCheck = selectedBranchId || 'default';
      try {
        if (await isAdminForBranch(adminBranchToCheck, currentUser.email)) {
          console.log('👑 User is admin');
          setRole('admin');
          setProfileBranch(null);
          setVerified(true);
          setAccountStatus('admin');
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error('Error checking admin status:', e);
      }

      // For non-admin users, the separate useEffect will handle the listener
      // DON'T set loading to false here - let the listener do it
      console.log('👤 Regular user - profile listener will be set up by separate effect');

      if (currentUser && selectedBranchId) {
        try {
          await syncEmailVerificationIfNeeded(selectedBranchId);
        } catch (e) {
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedBranchId]);

  const EMAIL_VERIFICATION_RATE_LIMIT_MS = 60 * 1000;

  const getVerificationRateLimitKey = (uid) => `emailVerificationLastSentAt:${uid}`;

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user.');
    }

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

    try {
      await auth.currentUser.reload();
    } catch (e) {
    }

    const isVerifiedNow = auth.currentUser.emailVerified === true;
    setAuthEmailVerified(isVerifiedNow);

    if (!isVerifiedNow) return;
    if (!branchId) return;

    const userRef = doc(db, 'branches', branchId, 'users', auth.currentUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;

    const data = snap.data() || {};

    if (data?.status === 'email_pending') {
      setEmailVerificationSyncing(true);
      try {
        await setDoc(
          userRef,
          {
            emailVerified: true,
            status: 'active',
            verificationStatus: 'pending',
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
        setAccountStatus('active');
      } finally {
        setEmailVerificationSyncing(false);
      }
      return;
    }

    if (data?.emailVerified !== true) {
      await setDoc(
        userRef,
        {
          emailVerified: true,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    }
  };

  useEffect(() => {
    if (!user?.uid) return;
    if (role === 'admin') return;
    if (!selectedBranchId) return;

    let cancelled = false;

    const maybeSync = async () => {
      try {
        if (cancelled) return;
        await syncEmailVerificationIfNeeded(selectedBranchId);
      } catch (e) {
      }
    };

    maybeSync();
    const interval = setInterval(maybeSync, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.uid, role, selectedBranchId]);

  // If branch changes while user is logged in, force logout
  useEffect(() => {
    if (user && profileBranch && selectedBranchId && profileBranch !== selectedBranchId) {
      console.log('🔄 Branch switched while logged in; signing out to enforce branch-specific session.');
      signOut(auth).catch((e) => console.error('Error signing out on branch switch:', e));
      setRole(null);
      setProfileBranch(null);
      setUser(null);
    }
  }, [selectedBranchId, user, profileBranch]);

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    try {
      await cred.user.reload();
    } catch (e) {
    }
    setAuthEmailVerified(cred.user.emailVerified === true);

    // Check if admin
    const adminBranchToCheck = selectedBranchId || 'default';
    if (await isAdminForBranch(adminBranchToCheck, email)) {
      setRole('admin');
      setProfileBranch(null);
      setVerified(true);
      return cred.user;
    }

    // Non-admins must have a selected branch
    if (!selectedBranchId) {
      await signOut(auth);
      throw new Error('يرجى اختيار الفرع أولاً.');
    }

    // Fetch and set role after login
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
      const normalizedVerificationStatus = String(data?.verificationStatus || '').toLowerCase();
      const isVerified = normalizedVerificationStatus === 'verified';

      setRole(userRole);
      setProfileBranch(branchId);
      setVerified(isVerified);
      setVerificationStatus(normalizedVerificationStatus || null);
      setProfileDoc({ id: branchSnap.id, ...data });
      setProfileDocPath(`branches/${selectedBranchId}/users/${cred.user.uid}`);
      setAccountStatus(data?.status || null);

      try {
        await syncEmailVerificationIfNeeded(selectedBranchId);
      } catch (e) {
      }
      
      // Record login activity for lifecycle tracking
      try {
        await recordUserActivity(cred.user.uid, selectedBranchId, 'login');
      } catch (activityError) {
        console.warn('Failed to record login activity:', activityError);
        // Don't fail login if activity recording fails
      }
    } catch (e) {
      console.error('Failed to refresh role after login:', e);
      throw e;
    }

    return cred.user;
  };

  const signup = async (email, password, extraData = {}) => {
    const branchId = extraData.branchId || selectedBranchId;
    
    console.log('🔵 signup called with:', {
      email,
      branchId,
      extraDataBranchId: extraData.branchId,
      selectedBranchId,
      extraData
    });
    
    if (!branchId) {
      throw new Error('يرجى اختيار الفرع قبل إنشاء الحساب.');
    }

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
      if (!verifyDoc.exists()) {
        throw new Error('User document was not created successfully in signup');
      }
      console.log('✅ User document verified in Firestore');
      
    } catch (error) {
      console.error('❌ Error saving initial user document:', {
        path: userPath,
        error: error.message,
        code: error.code
      });
      throw error;
    }

    setRole('student');
    setProfileBranch(branchId);
    setAuthEmailVerified(false);
    setAccountStatus('email_pending');

    return cred.user;
  };

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
  };

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
    loading, 
    login, 
    signup, 
    logout,
    resendVerificationEmail
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};