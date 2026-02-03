/**
 * Firebase Cloud Function for User Lifecycle Management
 * Runs automatically to process user status transitions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

const { db } = require('../firebase');
const { 
  processAutomaticStatusTransitions, 
  getUsersForDeletionNotification,
  markDeletionNotificationSent,
  USER_STATUS 
} = require('../services/userLifecycleService');

/**
 * Scheduled function to process user lifecycle transitions
 * Runs monthly (can be configured to run yearly)
 */
exports.processUserLifecycle = functions.pubsec
  .schedule('0 2 1 * *') // First day of every month at 2 AM
  .timeZone('Africa/Algiers')
  .onRun(async (context) => {
    console.log('🔄 Starting scheduled user lifecycle processing');
    
    try {
      // Process automatic status transitions
      const results = await processAutomaticStatusTransitions(false);
      
      // Process deletion notifications
      const notificationResults = await processDeletionNotifications();
      
      console.log('✅ Lifecycle processing complete:', {
        transitions: results,
        notifications: notificationResults
      });
      
      return {
        success: true,
        transitions: results,
        notifications: notificationResults
      };
    } catch (error) {
      console.error('❌ Error in lifecycle processing:', error);
      throw error;
    }
  });

/**
 * Process deletion notifications for users about to be deleted
 */
async function processDeletionNotifications() {
  const results = {
    processed: 0,
    errors: []
  };

  try {
    const users = await getUsersForDeletionNotification();
    
    for (const user of users) {
      try {
        // Send notification email (implement email service)
        await sendDeletionNotification(user);
        
        // Mark notification as sent
        await markDeletionNotificationSent(user.id, user.branchId);
        
        results.processed++;
        console.log(`📧 Sent deletion notification to user: ${user.id}`);
      } catch (error) {
        results.errors.push({
          userId: user.id,
          error: error.message
        });
      }
    }
  } catch (error) {
    console.error('Error processing deletion notifications:', error);
    results.errors.push({ error: error.message });
  }

  return results;
}

/**
 * Send deletion notification email to user
 * (Implement with your preferred email service - SendGrid, Firebase Extensions, etc.)
 */
async function sendDeletionNotification(user) {
  // TODO: Implement email sending logic
  // This could use:
  // - Firebase Extensions: Email Trigger
  // - SendGrid
  // - AWS SES
  // - Custom SMTP
  
  const emailContent = {
    to: user.email,
    subject: 'معلومات هامة بخصوص حسابك في مدرسةTrust School Amara',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">تنبيه بشأن حذف الحساب</h2>
        <p>عزيزي/عزيزتي ${user.fullName},</p>
        <p>نود إعلامك بأن حسابك في مدرسة Trust School Amara كان غير نشط لمدة تزيد عن سنتين.</p>
        <p>سيتم حذف حسابك وجميع بياناتك الشخصية خلال سنة واحدة إذا لم يتم إعادة تفعيله.</p>
        <p>للحفاظ على حسابك، يرجى تسجيل الدخول إلى المنصة أو التواصل معنا.</p>
        <div style="margin: 20px 0;">
          <a href="${process.env.WEBSITE_URL}/login" 
             style="background-color: #dc2626; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; display: inline-block;">
            تسجيل الدخول الآن
          </a>
        </div>
        <p>إذا كانت لديك أي استفسارات، يرجى التواصل معنا عبر البريد الإلكتروني.</p>
        <p>مع تحيات،<br>فريق Trust School Amara</p>
      </div>
    `
  };

  // Example with Firebase Extensions Email Trigger:
  // await admin.firestore().collection('mail').add(emailContent);
  
  console.log(`📧 Would send deletion notification to: ${user.email}`);
  return true;
}

/**
 * Manual trigger function for testing and immediate processing
 */
exports.manualLifecycleProcessing = functions.https.onCall(async (data, context) => {
  // Check if caller is admin
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can trigger manual lifecycle processing'
    );
  }

  const { dryRun = false } = data;
  
  try {
    const results = await processAutomaticStatusTransitions(dryRun);
    
    return {
      success: true,
      results,
      message: dryRun ? 'Dry run completed' : 'Live processing completed'
    };
  } catch (error) {
    console.error('Manual lifecycle processing error:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to process lifecycle transitions',
      error.message
    );
  }
});

/**
 * Reactivate a user account (manual override)
 */
exports.reactivateUser = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can reactivate users'
    );
  }

  const { userId, branchId } = data;
  
  if (!userId || !branchId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'userId and branchId are required'
    );
  }

  try {
    const { updateUserLifecycleStatus, recordUserActivity } = require('../services/userLifecycleService');
    
    // Update status to active
    await updateUserLifecycleStatus(userId, branchId, USER_STATUS.ACTIVE, {
      manualReactivation: true,
      reactivatedBy: context.auth.uid
    });
    
    // Record activity
    await recordUserActivity(userId, branchId, 'manual_reactivation');
    
    console.log(`✅ Manually reactivated user: ${userId}`);
    
    return {
      success: true,
      message: 'User reactivated successfully'
    };
  } catch (error) {
    console.error('Error reactivating user:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to reactivate user',
      error.message
    );
  }
});
