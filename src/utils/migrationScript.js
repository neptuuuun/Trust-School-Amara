/**
 * Migration Script
 * Migrates users from branches/{branchId}/users to root users collection
 * Run this script once to migrate existing data
 */

import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

/**
 * Migrate all users from branches/{branchId}/users to root users collection
 * @param {boolean} dryRun - If true, only log what would be migrated without making changes
 * @returns {Promise<object>} Migration report
 */
export const migrateUsersToRoot = async (dryRun = true) => {
  console.log('🚀 Starting user migration...', dryRun ? '(DRY RUN)' : '');
  
  const report = {
    totalBranches: 0,
    totalUsers: 0,
    migrated: 0,
    skipped: 0,
    errors: [],
    details: []
  };

  try {
    // Get all branches
    const branchesRef = collection(db, 'branches');
    const branchesSnapshot = await getDocs(branchesRef);
    const branches = branchesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    report.totalBranches = branches.length;
    console.log(`Found ${branches.length} branches`);

    // Loop through each branch
    for (const branch of branches) {
      console.log(`\n📁 Processing branch: ${branch.name || branch.id}`);
      
      try {
        // Get all users in this branch
        const usersRef = collection(db, 'branches', branch.id, 'users');
        const usersSnapshot = await getDocs(usersRef);
        const users = usersSnapshot.docs;

        console.log(`  Found ${users.length} users in this branch`);

        // Migrate each user
        for (const userDoc of users) {
          const userId = userDoc.id;
          const userData = userDoc.data();

          try {
            // Check if user already exists in root collection
            const rootUserRef = doc(db, 'users', userId);
            const rootUserSnap = await getDoc(rootUserRef);

            if (rootUserSnap.exists()) {
              console.log(`  ⏭️  Skipping ${userId} - already exists in root`);
              report.skipped++;
              report.details.push({
                userId,
                branchId: branch.id,
                action: 'skipped',
                reason: 'Already exists in root'
              });
              continue;
            }

            // Prepare user data for migration
            const migratedData = {
              ...userData,
              uid: userId,
              branchId: branch.id,
              branchName: branch.name || branch.id,
              // Ensure verification fields exist
              verified: userData.verified || false,
              accountVerified: userData.verified || false,
              paymentVerified: userData.yearlyFeePaid || false,
              yearlyFeePaid: userData.yearlyFeePaid || false,
              // Ensure role exists
              role: userData.role || 'student'
            };

            if (!dryRun) {
              // Write to root collection
              await setDoc(rootUserRef, migratedData);
              console.log(`  ✅ Migrated ${userId} (${userData.name || userData.fullName || 'No name'})`);
            } else {
              console.log(`  ✅ Would migrate ${userId} (${userData.name || userData.fullName || 'No name'})`);
            }

            report.migrated++;
            report.details.push({
              userId,
              branchId: branch.id,
              userName: userData.name || userData.fullName,
              action: dryRun ? 'would_migrate' : 'migrated'
            });

          } catch (error) {
            console.error(`  ❌ Error migrating ${userId}:`, error);
            report.errors.push({
              userId,
              branchId: branch.id,
              error: error.message
            });
          }
        }

        report.totalUsers += users.length;
      } catch (error) {
        console.error(`❌ Error processing branch ${branch.id}:`, error);
        report.errors.push({
          branchId: branch.id,
          error: error.message
        });
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`  Total branches: ${report.totalBranches}`);
    console.log(`  Total users: ${report.totalUsers}`);
    console.log(`  Migrated: ${report.migrated}`);
    console.log(`  Skipped: ${report.skipped}`);
    console.log(`  Errors: ${report.errors.length}`);

    if (dryRun) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('To perform the actual migration, call migrateUsersToRoot(false)');
    } else {
      console.log('\n✅ Migration complete!');
    }

  } catch (error) {
    console.error('Fatal error during migration:', error);
    report.errors.push({
      fatal: true,
      error: error.message
    });
  }

  return report;
};

/**
 * Verify migration by checking users in root collection
 * @returns {Promise<object>} Verification report
 */
export const verifyMigration = async () => {
  console.log('🔍 Verifying migration...');
  
  const report = {
    totalUsersInRoot: 0,
    usersByBranch: {},
    usersWithoutBranch: 0,
    samples: []
  };

  try {
    // Get all users from root collection
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    report.totalUsersInRoot = users.length;
    console.log(`Found ${users.length} users in root collection`);

    // Group by branch
    for (const user of users) {
      const branchId = user.branchId || 'unknown';
      
      if (!report.usersByBranch[branchId]) {
        report.usersByBranch[branchId] = 0;
      }
      
      report.usersByBranch[branchId]++;

      if (!user.branchId) {
        report.usersWithoutBranch++;
      }

      // Collect samples
      if (report.samples.length < 10) {
        report.samples.push({
          id: user.id,
          name: user.fullName || user.name,
          email: user.email,
          branchId: user.branchId,
          verified: user.verified || user.accountVerified
        });
      }
    }

    console.log('\n📊 Verification Summary:');
    console.log(`  Total users in root: ${report.totalUsersInRoot}`);
    console.log(`  Users without branch: ${report.usersWithoutBranch}`);
    console.log('\n  Users by branch:');
    for (const [branchId, count] of Object.entries(report.usersByBranch)) {
      console.log(`    ${branchId}: ${count}`);
    }

    console.log('\n  Sample users:');
    report.samples.forEach((user, index) => {
      console.log(`    ${index + 1}. ${user.name} (${user.email}) - Branch: ${user.branchId || 'None'}`);
    });

  } catch (error) {
    console.error('Error during verification:', error);
    report.error = error.message;
  }

  return report;
};

/**
 * Cleanup old user documents from branches (USE WITH CAUTION!)
 * Only run this after manual verification of migration
 * @param {boolean} dryRun - If true, only log what would be deleted
 * @returns {Promise<object>} Cleanup report
 */
export const cleanupOldLocations = async (dryRun = true) => {
  console.log('🧹 Starting cleanup of old user locations...', dryRun ? '(DRY RUN)' : '');
  
  const report = {
    totalDeleted: 0,
    errors: [],
    details: []
  };

  if (dryRun) {
    console.log('⚠️  WARNING: This will delete users from branches/{branchId}/users/');
    console.log('Only run this after verifying the migration is complete!');
    return report;
  }

  const confirm = window.prompt(
    'This will PERMANENTLY DELETE users from branches. Type "DELETE" to continue:'
  );

  if (confirm !== 'DELETE') {
    console.log('Cleanup cancelled');
    return report;
  }

  try {
    // Get all branches
    const branchesRef = collection(db, 'branches');
    const branchesSnapshot = await getDocs(branchesRef);
    const branches = branchesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    for (const branch of branches) {
      try {
        const usersRef = collection(db, 'branches', branch.id, 'users');
        const usersSnapshot = await getDocs(usersRef);

        for (const userDoc of usersSnapshot.docs) {
          try {
            if (!dryRun) {
              await deleteDoc(userDoc.ref);
            }
            report.totalDeleted++;
            console.log(`  🗑️  ${dryRun ? 'Would delete' : 'Deleted'} ${userDoc.id}`);
          } catch (error) {
            console.error(`  ❌ Error deleting ${userDoc.id}:`, error);
            report.errors.push({
              userId: userDoc.id,
              branchId: branch.id,
              error: error.message
            });
          }
        }
      } catch (error) {
        console.error(`❌ Error cleaning branch ${branch.id}:`, error);
      }
    }

    console.log(`\n📊 Cleanup Summary: ${report.totalDeleted} users deleted`);

  } catch (error) {
    console.error('Fatal error during cleanup:', error);
    report.errors.push({
      fatal: true,
      error: error.message
    });
  }

  return report;
};

// Export a convenience function to run all migration steps
export const runFullMigration = async () => {
  console.log('🚀 Running full migration process...\n');
  
  // Step 1: Dry run
  console.log('Step 1: Dry run migration');
  const dryRunReport = await migrateUsersToRoot(true);
  
  if (dryRunReport.errors.length > 0) {
    console.log('\n⚠️  Dry run completed with errors. Review before proceeding.');
    return { dryRunReport };
  }
  
  // Step 2: Actual migration
  console.log('\n\nStep 2: Actual migration');
  const migrationReport = await migrateUsersToRoot(false);
  
  // Step 3: Verify
  console.log('\n\nStep 3: Verification');
  const verificationReport = await verifyMigration();
  
  return {
    dryRunReport,
    migrationReport,
    verificationReport
  };
};

