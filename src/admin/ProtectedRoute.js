import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { getAdminByUid } from '../services/adminService';

const ProtectedRoute = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('ProtectedRoute - Auth state changed:', currentUser?.email);
      
      setUser(currentUser);
      
      if (currentUser) {
        // Check if user is admin by fetching from admins collection
        try {
          const adminInfo = await getAdminByUid(currentUser.uid);
          const isAdminUser = adminInfo && adminInfo.role === 'admin';
          setIsAdmin(isAdminUser);
          console.log('ProtectedRoute - Is admin?', isAdminUser);
        } catch (error) {
          console.error('ProtectedRoute - Error checking admin status:', error);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">جاري التحقق من صحة تسجيل الدخول...</p>
        </div>
      </div>
    );
  }

  // If no user is logged in, redirect to login
  if (!user) {
    console.log('ProtectedRoute - No user found, redirecting to login');
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  // If user is logged in but not an admin, sign them out and redirect to login
  if (!isAdmin) {
    console.log('ProtectedRoute - User not admin:', user?.email);
    auth.signOut();
    return <Navigate to="/admin/login" replace />;
  }

  console.log('ProtectedRoute - User is authenticated admin:', user.email);
  // User is authenticated and authorized
  return children;
};

export default ProtectedRoute;