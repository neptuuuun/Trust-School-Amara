import { doc, setDoc } from 'firebase/firestore';
import { db } from '../src/firebase';

/**
 * One-time script to set up admin accounts in Firestore.
 * Run manually after creating the Firebase Auth users.
 */

const adminAccounts = [
  {
    email: 'trustschoolamarabmrds@gmail.com',
    branchId: 'boumerdes',
    role: 'admin'
  },
  {
    email: 'trustschoolamara@gmail.com',
    branchId: 'bordj_mnaiel',
    role: 'admin'
  }
];

/**
 * Creates admin documents in Firestore after users are created in Firebase Auth.
 * Call with the UIDs from Firebase Console: createAdminDocuments([uid1, uid2])
 */
export const createAdminDocuments = async (adminUids) => {
  const results = [];

  for (let i = 0; i < adminAccounts.length; i++) {
    const admin = adminAccounts[i];
    const uid = adminUids[i];

    if (!uid) {
      console.error(`Missing UID for admin: ${admin.email}`);
      continue;
    }

    try {
      const adminRef = doc(db, 'admins', uid);
      await setDoc(adminRef, {
        email: admin.email,
        branchId: admin.branchId,
        role: admin.role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      console.log(`✅ Admin document created for ${admin.email} with branch ${admin.branchId}`);
      results.push({ success: true, email: admin.email, branchId: admin.branchId });
    } catch (error) {
      console.error(`❌ Failed to create admin document for ${admin.email}:`, error);
      results.push({ success: false, email: admin.email, error: error.message });
    }
  }

  return results;
};

/*
  SETUP INSTRUCTIONS
  ------------------
  1. Go to Firebase Console → Authentication → Users and create:
       - trustschoolamarabmrds@gmail.com  (branch: boumerdes)
       - trustschoolamara@gmail.com        (branch: bordj_mnaiel)

  2. Copy each user's UID from the Firebase Console.

  3. Run: createAdminDocuments([uid1, uid2])

  4. Verify in Firestore that /admins/{uid} documents exist with the correct branchId.
*/
