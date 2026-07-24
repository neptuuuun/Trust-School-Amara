import { doc, setDoc } from 'firebase/firestore';
import { db } from '../src/firebase';

/**
 * DEPRECATED — admins/{uid} is now `allow write: if false` in firestore.rules, so
 * this client-SDK script can no longer write admin documents. Provision admins via
 * the Admin SDK instead:
 *
 *   cd backend
 *   node scripts/provision-admin.js --email a@b.com --name "Full Name" --branch boumerdes --password "secret"
 *
 * This file is kept only as a reference for the canonical admin document shape.
 */

const BRANCH_NAMES = { boumerdes: 'بومرداس', bordj_menaiel: 'برج منايل' };

const adminAccounts = [
  {
    email: 'trustschoolamarabmrds@gmail.com',
    name: 'Boumerdes Admin',
    branchId: 'boumerdes',
    role: 'admin'
  },
  {
    email: 'trustschoolamara@gmail.com',
    name: 'Bordj Menaiel Admin',
    branchId: 'bordj_menaiel',
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
        uid,
        email: admin.email,
        name: admin.name,
        branchId: admin.branchId,
        branchName: BRANCH_NAMES[admin.branchId] || admin.branchId,
        role: admin.role,
        active: true,
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
