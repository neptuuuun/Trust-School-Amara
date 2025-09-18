import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

const ProtectedRoute = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  // Admin email whitelist - MUST match the one in AdminLogin.js exactly
  const adminEmails = [
    'admin@example.com',
    'admin@trust-school.com',
    'marouabenzaoui48@gmail.com', 
    'trustschoolamara@gmail.com'
    // Add more admin emails here
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log('ProtectedRoute - Auth state changed:', currentUser?.email);
      console.log('ProtectedRoute - Admin emails:', adminEmails);
      console.log('ProtectedRoute - Is admin?', currentUser ? adminEmails.includes(currentUser.email) : false);
      
      setUser(currentUser);
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
  if (!adminEmails.includes(user.email)) {
    console.log('ProtectedRoute - User not in admin whitelist:', user.email);
    console.log('ProtectedRoute - Available admin emails:', adminEmails);
    auth.signOut();
    return <Navigate to="/admin/login" replace />;
  }

  console.log('ProtectedRoute - User is authenticated admin:', user.email);
  // User is authenticated and authorized
  return children;
};

export default ProtectedRoute;