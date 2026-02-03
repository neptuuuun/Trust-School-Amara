/**
 * Manual User Lifecycle Cleanup Script
 * Can be run manually or scheduled for automatic execution
 */

const { processAutomaticStatusTransitions } = require('./src/services/userLifecycleService');

/**
 * Run manual cleanup
 * Usage: node scripts/cleanupUsers.js [--dry-run]
 */
async function runCleanup() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('🔄 Starting manual user lifecycle cleanup...');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
  
  try {
    const results = await processAutomaticStatusTransitions(isDryRun);
    
    console.log('\n📊 Cleanup Results:');
    console.log(`• Total users processed: ${results.processed}`);
    console.log(`• Users marked as inactive: ${results.transitions.inactive}`);
    console.log(`• Users archived: ${results.transitions.archived}`);
    console.log(`• Users deleted: ${results.transitions.deleted}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      results.errors.forEach(error => {
        console.log(`  • ${error.userId || error.branchId}: ${error.error}`);
      });
    }
    
    console.log('\n✅ Cleanup completed successfully!');
    
    if (isDryRun) {
      console.log('\n💡 To apply these changes, run without --dry-run flag');
    }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runCleanup();
}

module.exports = { runCleanup };
