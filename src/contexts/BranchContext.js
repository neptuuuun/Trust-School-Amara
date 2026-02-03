import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

const BranchContext = createContext();

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};

export const BranchProvider = ({ children }) => {
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [branches, setBranches] = useState([]);
  // Track active listener to prevent duplicates
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    // FIXED: Ensure only one listener is active at a time
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // FIXED: Guard against invalid collection reference
    const branchesQuery = query(collection(db, 'branches'));
    
    // FIXED: Properly wrap onSnapshot in useEffect with cleanup
    const unsubscribe = onSnapshot(
      branchesQuery,
      (snapshot) => {
        const branchesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setBranches(branchesData);
      },
      (error) => {
        console.error('onSnapshot branches error:', error);
        // Prevent internal assertion errors by ensuring cleanup on error
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
      }
    );

    unsubscribeRef.current = unsubscribe;

    // FIXED: Proper cleanup function that ensures listener is removed
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  // Load branchId from localStorage on mount (new behavior)
  useEffect(() => {
    const savedBranchId = localStorage.getItem('branchId');
    if (savedBranchId) {
      setSelectedBranchId(savedBranchId);
    } else {
      // Backward compatibility: try old selectedBranch object
      const savedBranch = localStorage.getItem('selectedBranch');
      if (savedBranch) {
        try {
          const branch = JSON.parse(savedBranch);
          if (branch?.id) {
            setSelectedBranchId(branch.id);
            setSelectedBranch(branch);
            // Normalize storage to new key
            localStorage.setItem('branchId', branch.id);
          }
        } catch (error) {
          console.error('Error parsing saved branch:', error);
          localStorage.removeItem('selectedBranch');
        }
      }
    }
  }, []);

  const selectBranch = async (branchId) => {
    // If a user is currently authenticated and is switching to a different branch,
    // force logout so that each branch has its own isolated session.
    try {
      const currentUser = auth.currentUser;
      if (currentUser && branchId && branchId !== selectedBranchId) {
        await signOut(auth);
      }
    } catch (error) {
      console.error('Error signing out on branch change:', error);
    }

    // Always set the branchId immediately
    setSelectedBranchId(branchId);
    localStorage.setItem('branchId', branchId);

    // If we have branches loaded, also set full object for legacy consumers
    const branch = branches.find(b => b.id === branchId);
    if (branch) {
      setSelectedBranch(branch);
      localStorage.setItem('selectedBranch', JSON.stringify(branch));
    }
  };

  const clearBranch = async () => {
    // Clearing the branch should also clear any active session
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (error) {
      console.error('Error signing out on branch clear:', error);
    }

    setSelectedBranch(null);
    setSelectedBranchId(null);
    localStorage.removeItem('selectedBranch');
    localStorage.removeItem('branchId');
  };

  const getBranchPrice = (serviceType, priceType = 'base') => {
    if (!selectedBranch || !selectedBranch.priceOverrides) {
      return null;
    }

    const overrides = selectedBranch.priceOverrides;
    
    switch (serviceType) {
      case 'yearlyFee':
        return overrides.yearlyFee || 1000;
      case 'supportLessons':
        return overrides.supportLessons?.monthly || 2000;
      default:
        return null;
    }
  };

  const value = {
    // New preferred state
    selectedBranchId,
    // Legacy/optional
    selectedBranch,
    branches,
    // APIs
    selectBranch,
    clearBranch,
    getBranchPrice,
    isSelected: !!selectedBranchId
  };

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
};
