import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';

const BranchContext = createContext();

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};

export const BranchProvider = ({ children }) => {
  // Always initialise from localStorage or null — NEVER a hardcoded branch name.
  const [selectedBranchId, setSelectedBranchId] = useState(
    () => localStorage.getItem('branchId') || null
  );
  const [branches, setBranches] = useState([]);
  const unsubscribeRef = useRef(null);
  const branchesRef = useRef([]);

  // Keep the branches list in sync from Firestore (read-only, for display purposes).
  useEffect(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const unsubscribe = onSnapshot(
      query(collection(db, 'branches')),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        branchesRef.current = data;
        setBranches(data);
      },
      (error) => {
        console.error('onSnapshot branches error:', error);
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
      }
    );

    unsubscribeRef.current = unsubscribe;
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  /**
   * selectBranch
   * ------------
   * Write path for pre-auth branch selection (BranchSelector UI, /branchA aliases).
   * Updates both React state and localStorage atomically so all consumers
   * (BranchGuard, components using selectedBranchId) stay in sync immediately.
   */
  const selectBranch = (id) => {
    if (!id) return;
    setSelectedBranchId(id);
    localStorage.setItem('branchId', id);
  };

  /**
   * setBranchFromAuth
   * -----------------
   * Write path for post-auth branch state, called by AuthContext after reading
   * the admin or user document from Firestore.
   */
  const setBranchFromAuth = (id) => {
    if (!id) return;
    setSelectedBranchId(id);
    localStorage.setItem('branchId', id);
  };

  /**
   * resetBranch
   * -----------
   * Clears branch state and localStorage.
   * Called by AuthContext.logout() — does NOT sign the user out.
   */
  const resetBranch = () => {
    setSelectedBranchId(null);
    localStorage.removeItem('branchId');
  };

  /**
   * getBranchPrice
   * --------------
   * Kept for backwards compatibility with components that read pricing data.
   */
  const getBranchPrice = (serviceType) => {
    const branch = branchesRef.current.find(b => b.id === selectedBranchId);
    if (!branch?.priceOverrides) return null;
    switch (serviceType) {
      case 'yearlyFee':      return branch.priceOverrides.yearlyFee || null;
      case 'supportLessons': return branch.priceOverrides.supportLessons?.monthly || null;
      default:               return null;
    }
  };

  const value = {
    selectedBranchId,
    branches,
    // Write paths
    selectBranch,       // pre-auth: UI branch picker, alias routes
    setBranchFromAuth,  // post-auth: set from Firestore user/admin doc
    resetBranch,        // logout: clears state + localStorage
    // Helpers
    getBranchPrice,
    isSelected: !!selectedBranchId,
  };

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
};