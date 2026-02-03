/**
 * Migration Script: Move users from /users to branches/{branchId}/users/{userId}
 * 
 * This script migrates existing users from the flat /users collection
 * to the branch-scoped structure: branches/{branchId}/users/{userId}
 * 
 * Usage:
 * 1. Make sure you have Firebase Admin SDK configured
 * 2. Run: node scripts/migrateUsersToBranches.js
 * 
 * WARNING: This script will copy users to branch paths. It does NOT delete
 * the original /users collection. Review the results before deleting old data.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../path/to/your/serviceAccountKey.json'); // Update this path

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

/**
 * Migrate users from /users to branches/{branchId}/users/{userId}
 */
async function migrateUsers() {
  console.log('🚀 Starting user migration...\n');

  try {
    // Get all users from the old /users collection
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('✅ No users found in /users collection. Migration not needed.');
      return;
    }

    console.log(`📊 Found ${usersSnapshot.size} users to migrate\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // Process each user
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      try {
        // Check if user has branchId
        const branchId = userData.branchId;
        
        if (!branchId) {
          console.warn(`⚠️  Skipping user ${userId}: No branchId found`);
          skippedCount++;
          continue;
        }

        // Validate branchId is one of the expected values
        const validBranches = ['boumerdes', 'bordj_menaiel'];
        if (!validBranches.includes(branchId)) {
          console.warn(`⚠️  Skipping user ${userId}: Invalid branchId "${branchId}"`);
          skippedCount++;
          continue;
        }

        // Check if user already exists in branch path
        const branchUserRef = db.collection('branches').doc(branchId).collection('users').doc(userId);
        const branchUserSnap = await branchUserRef.get();

        if (branchUserSnap.exists()) {
          console.log(`ℹ️  User ${userId} already exists in branches/${branchId}/users. Skipping.`);
          skippedCount++;
          continue;
        }

        // Prepare user data with all fields
        const migratedUserData = {
          ...userData,
          uid: userId, // Ensure uid is set
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          // Ensure createdAt is preserved or set
          createdAt: userData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        };

        // Copy user to branch path
        await branchUserRef.set(migratedUserData);

        console.log(`✅ Migrated user ${userId} (${userData.fullName || userData.email || 'N/A'}) to branches/${branchId}/users`);
        successCount++;

      } catch (error) {
        console.error(`❌ Error migrating user ${userId}:`, error.message);
        errorCount++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📈 Migration Summary:');
    console.log(`   ✅ Successfully migrated: ${successCount}`);
    console.log(`   ⚠️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total processed: ${usersSnapshot.size}`);
    console.log('='.repeat(50));

    if (successCount > 0) {
      console.log('\n✨ Migration completed successfully!');
      console.log('⚠️  IMPORTANT: Review the migrated users before deleting the old /users collection.');
      console.log('   You can verify by checking branches/{branchId}/users in Firestore Console.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Verify migration by comparing counts
 */
async function verifyMigration() {
  console.log('\n🔍 Verifying migration...\n');

  try {
    const branches = ['boumerdes', 'bordj_menaiel'];
    let totalBranchUsers = 0;

    for (const branchId of branches) {
      const branchUsersSnapshot = await db
        .collection('branches')
        .doc(branchId)
        .collection('users')
        .get();
      
      const count = branchUsersSnapshot.size;
      totalBranchUsers += count;
      console.log(`   branches/${branchId}/users: ${count} users`);
    }

    const oldUsersSnapshot = await db.collection('users').get();
    const oldCount = oldUsersSnapshot.size;

    console.log(`\n   Old /users collection: ${oldCount} users`);
    console.log(`   Total in branch paths: ${totalBranchUsers} users`);

    if (totalBranchUsers >= oldCount) {
      console.log('\n✅ Verification passed: All users appear to be migrated.');
    } else {
      console.log('\n⚠️  Warning: Branch users count is less than old collection.');
      console.log('   Some users may not have branchId or were skipped.');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Run migration
async function main() {
  try {
    await migrateUsers();
    await verifyMigration();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { migrateUsers, verifyMigration };








