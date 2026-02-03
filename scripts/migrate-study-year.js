/**
 * Migration Script: Backfill studyYear for existing users
 * 
 * This script migrates existing users who have paid annual fees but don't have studyYear set.
 * It reads from registrations.annualFee or registrations.annualFeeHistory to populate studyYear.
 * 
 * Usage:
 *   node scripts/migrate-study-year.js [--dry-run] [--branch-id=<branchId>]
 * 
 * Options:
 *   --dry-run: Show what would be updated without making changes
 *   --branch-id=<id>: Only migrate users from a specific branch
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin
try {
  admin.initializeApp();
} catch (e) {
  // Already initialized
}

const db = admin.firestore();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const branchIdArg = args.find(arg => arg.startsWith('--branch-id='));
const targetBranchId = branchIdArg ? branchIdArg.split('=')[1] : null;

// Helper to derive level from year ID
function deriveLevelFromYearId(yearId) {
  if (!yearId) return null;
  const normalized = String(yearId).trim();
  if (normalized.startsWith('mid')) return 'middle';
  if (normalized.startsWith('sec')) return 'high';
  return null;
}

// Helper to normalize year from various sources
function normalizeYearFromPaymentData(userData) {
  // Try registrations.annualFee first (most recent)
  const annualFee = userData.registrations?.annualFee;
  if (annualFee) {
    // Check if it's already a year ID (mid1, sec2, etc.)
    if (typeof annualFee === 'string' && (annualFee.startsWith('mid') || annualFee.startsWith('sec'))) {
      return annualFee;
    }
    // If it's a label like "أولى", we need to map it - but we don't have that mapping here
    // So we'll skip it and try other sources
  }

  // Try registrations.annualFeeHistory
  const history = userData.registrations?.annualFeeHistory;
  if (Array.isArray(history) && history.length > 0) {
    // Get the most recent entry
    const latest = history[history.length - 1];
    if (latest?.year) {
      const yearValue = latest.year;
      if (typeof yearValue === 'string' && (yearValue.startsWith('mid') || yearValue.startsWith('sec'))) {
        return yearValue;
      }
    }
  }

  // Try to find from annualPayments collection
  // This would require querying, so we'll skip for now and rely on the above

  return null;
}

async function migrateUser(branchId, userId, userData) {
  const existingStudyYear = String(userData.studyYear || '').trim();
  
  // Skip if already has studyYear
  if (existingStudyYear) {
    return { skipped: true, reason: 'already-has-studyYear' };
  }

  // Try to get year from payment data
  const yearId = normalizeYearFromPaymentData(userData);
  
  if (!yearId) {
    return { skipped: true, reason: 'no-year-found-in-payment-data' };
  }

  const level = deriveLevelFromYearId(yearId);
  const updates = {
    studyYear: yearId,
  };

  // Only update schoolLevel if it's missing
  const existingSchoolLevel = String(userData.schoolLevel || '').trim();
  if (!existingSchoolLevel && level) {
    updates.schoolLevel = level;
  }

  if (isDryRun) {
    return { 
      wouldUpdate: true, 
      updates,
      userId,
      branchId 
    };
  }

  // Perform the update
  try {
    const userRef = db.collection('branches').doc(branchId).collection('users').doc(userId);
    await userRef.update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      _migratedStudyYear: true,
      _migratedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { updated: true, updates, userId, branchId };
  } catch (error) {
    return { error: true, message: error.message, userId, branchId };
  }
}

async function migrateBranch(branchId) {
  console.log(`\n📦 Migrating branch: ${branchId}`);
  
  const usersRef = db.collection('branches').doc(branchId).collection('users');
  const snapshot = await usersRef.get();
  
  if (snapshot.empty) {
    console.log(`  ⚠️  No users found in branch ${branchId}`);
    return { total: 0, updated: 0, skipped: 0, errors: 0 };
  }

  console.log(`  Found ${snapshot.size} users`);
  
  const results = {
    total: snapshot.size,
    updated: 0,
    skipped: 0,
    errors: 0,
    details: []
  };

  for (const docSnap of snapshot.docs) {
    const userData = docSnap.data();
    const result = await migrateUser(branchId, docSnap.id, userData);
    
    if (result.updated) {
      results.updated++;
      console.log(`  ✅ Updated user ${docSnap.id}: studyYear=${result.updates.studyYear}`);
    } else if (result.wouldUpdate) {
      results.updated++;
      console.log(`  🔍 Would update user ${docSnap.id}: studyYear=${result.updates.studyYear}`);
    } else if (result.skipped) {
      results.skipped++;
      if (result.reason === 'already-has-studyYear') {
        // Silent skip for users who already have studyYear
      } else {
        console.log(`  ⏭️  Skipped user ${docSnap.id}: ${result.reason}`);
      }
    } else if (result.error) {
      results.errors++;
      console.error(`  ❌ Error updating user ${docSnap.id}: ${result.message}`);
    }
    
    results.details.push(result);
  }

  return results;
}

async function getAllBranches() {
  const branchesRef = db.collection('branches');
  const snapshot = await branchesRef.get();
  return snapshot.docs.map(doc => doc.id);
}

async function main() {
  console.log('🚀 Starting studyYear migration...');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be saved)'}`);
  
  if (targetBranchId) {
    console.log(`Target branch: ${targetBranchId}`);
  } else {
    console.log('Target: All branches');
  }

  if (!isDryRun) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question('\n⚠️  This will modify user documents. Continue? (yes/no): ', resolve);
    });

    rl.close();

    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Migration cancelled.');
      process.exit(0);
    }
  }

  let branches = [];
  if (targetBranchId) {
    branches = [targetBranchId];
  } else {
    branches = await getAllBranches();
    console.log(`\nFound ${branches.length} branch(es)`);
  }

  const allResults = {
    total: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  };

  for (const branchId of branches) {
    const branchResults = await migrateBranch(branchId);
    allResults.total += branchResults.total;
    allResults.updated += branchResults.updated;
    allResults.skipped += branchResults.skipped;
    allResults.errors += branchResults.errors;
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Summary:');
  console.log(`  Total users processed: ${allResults.total}`);
  console.log(`  ${isDryRun ? 'Would update' : 'Updated'}: ${allResults.updated}`);
  console.log(`  Skipped: ${allResults.skipped}`);
  console.log(`  Errors: ${allResults.errors}`);
  console.log('='.repeat(50));

  if (isDryRun) {
    console.log('\n💡 This was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Migration completed!');
  }
}

main().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
