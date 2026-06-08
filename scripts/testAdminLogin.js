/**
 * Browser console helper — paste into DevTools console while logged in as admin.
 * Not imported by the app; kept here for ad-hoc debugging.
 */

import { auth } from '../src/firebase';
import { getAdminByUid } from '../src/services/adminService';

export const testAdminLogin = () => {
  console.log('🧪 Testing Admin Login Flow');

  const user = auth.currentUser;
  if (!user) {
    console.log('❌ No user logged in');
    return;
  }

  console.log('✅ User logged in:', user.email);

  getAdminByUid(user.uid)
    .then(adminDoc => {
      if (adminDoc) {
        console.log('✅ Admin document found:', adminDoc);
        console.log('🏢 Assigned branch:', adminDoc.branchId);

        const selectedBranchId = localStorage.getItem('branchId');
        console.log('📍 Selected branch:', selectedBranchId);

        if (adminDoc.branchId === selectedBranchId) {
          console.log('✅ Branches match — no logout should occur');
        } else {
          console.log('⚠️ Branch mismatch — this should be auto-corrected');
        }
      } else {
        console.log('❌ No admin document found');
      }
    })
    .catch(error => {
      console.error('❌ Error checking admin status:', error);
    });
};
