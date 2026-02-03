# User Lifecycle Management System

This document describes the comprehensive user lifecycle management system implemented for Trust School Amara to automatically manage user accounts based on activity levels.

## Overview

The system automatically manages user accounts through different lifecycle stages based on their activity levels, ensuring the database remains clean and performant while preserving important data.

## User Status Types

### Active (نشط)
- **Definition**: Currently registered and using courses or lessons
- **Duration**: Users with activity within the last 6 months
- **Behavior**: Full access to all platform features
- **Visibility**: Visible in all admin lists by default

### Inactive (غير نشط)
- **Definition**: No activity for 6-12 months
- **Duration**: 6-12 months of inactivity
- **Behavior**: Can still log in and reactivate automatically
- **Visibility**: Visible in admin lists but marked as inactive

### Archived (مؤرشف)
- **Definition**: No activity for 1-2 years
- **Duration**: 12-24 months of inactivity
- **Behavior**: Login restricted, requires admin reactivation
- **Visibility**: Hidden from default admin lists, visible with filter

### Deleted (محذوف)
- **Definition**: No activity for 3-5 years
- **Duration**: 36+ months of inactivity
- **Behavior**: Personal data removed, only statistics kept
- **Visibility**: Completely removed from active collections

## Activity Tracking

The system tracks various user activities:
- **login**: User logs into the platform
- **account_creation**: New user registration
- **profile_update**: User updates their profile
- **verification_*: Verification status changes
- **course_registration**: User registers for courses
- **payment_*: Payment-related activities
- **manual_reactivation**: Admin reactivates an account

## Automatic Transitions

### Monthly Processing
The system processes automatic transitions on the first day of each month at 2 AM (Africa/Algiers timezone).

### Transition Rules
1. **Active → Inactive**: 6 months without activity
2. **Inactive → Archived**: 12 months without activity  
3. **Archived → Deleted**: 36 months without activity

### Manual Override
Administrators can manually:
- Change user status at any time
- Reactivate inactive/archived users
- Process cleanup on demand

## Data Management

### Active & Inactive Users
- Stored in regular `branches/{branchId}/users` collection
- Full data retained and searchable
- Normal database operations

### Archived Users
- Marked with `lifecycleStatus: 'archived'`
- Hidden from default admin queries
- Can be reactivated by administrators
- Data preserved for compliance

### Deleted Users
- Personal data anonymized/removed
- Statistical data archived to `userArchive` collection
- Media files cleaned up from storage
- Document marked as `anonymized: true`

## Media Cleanup

When users are archived or deleted:
- **User photos**: Removed from Supabase storage
- **ID cards**: Removed from Supabase storage
- **Payment receipts**: Removed from Supabase storage
- **Certificates**: Kept if required for compliance

## Notification System

### Deletion Warnings
Users archived for 2+ years receive:
- Email notification about pending deletion
- 1-year warning before permanent deletion
- Instructions to reactivate account

### Notification Content
- Arabic language support
- Clear timeline for deletion
- Reactivation instructions
- Contact information

## Admin Interface

### User Lifecycle Page (`/admin/user-lifecycle`)
- **Status Overview**: Real-time counts by status
- **Filtering**: Filter by status, search users
- **Bulk Actions**: Process automatic cleanup
- **Individual Actions**: Change status, reactivate users
- **Activity Timeline**: View user activity history

### Features
- **Dry Run Mode**: Preview changes before applying
- **Manual Processing**: On-demand cleanup processing
- **Status Management**: Change user lifecycle status
- **Activity Tracking**: View detailed activity history

## Implementation Details

### Database Schema

```javascript
// User document fields
{
  // Existing fields...
  lifecycleStatus: 'active' | 'inactive' | 'archived' | 'deleted',
  lifecycleStatusUpdatedAt: Timestamp,
  lastActivityAt: Timestamp,
  lastActivityType: string,
  
  // Status-specific timestamps
  inactivatedAt: Timestamp,
  archivedAt: Timestamp,
  deletedAt: Timestamp,
  
  // Notification tracking
  deletionNotificationSent: boolean,
  deletionNotificationSentAt: Timestamp
}
```

### Service Functions

#### Core Functions
- `recordUserActivity()`: Track user interactions
- `calculateUserStatus()`: Determine status based on activity
- `updateUserLifecycleStatus()`: Change user status
- `processAutomaticStatusTransitions()`: Run automatic cleanup

#### Query Functions
- `getUsersByLifecycleStatus()`: Filter users by status
- `getUsersForDeletionNotification()`: Find users needing warnings

#### Cleanup Functions
- `handleUserDeletion()`: Complete deletion process
- `cleanupUserMedia()`: Remove files from storage
- `anonymizeUserDocument()`: Remove personal data
- `archiveUserDataForStats()`: Preserve statistics

### Firebase Cloud Functions

#### Scheduled Functions
- `processUserLifecycle`: Monthly automatic processing
- `processDeletionNotifications`: Send warning emails

#### Manual Functions
- `manualLifecycleProcessing`: On-demand cleanup
- `reactivateUser`: Manual user reactivation

## Configuration

### Activity Thresholds (in months)
```javascript
const ACTIVITY_THRESHOLDS = {
  INACTIVE_AFTER: 6,      // 6 months → inactive
  ARCHIVED_AFTER: 12,     // 12 months → archived  
  DELETED_AFTER: 36       // 36 months → deleted
};
```

### Scheduled Processing
- **Frequency**: Monthly (first day at 2 AM)
- **Timezone**: Africa/Algiers
- **Manual Trigger**: Available via admin interface

## Security & Compliance

### Data Protection
- GDPR-compliant data handling
- Automatic data retention policies
- Secure data anonymization

### Audit Trail
- All status changes logged
- Manual override tracking
- Activity history preserved

### Backup & Recovery
- Archived data preserved
- Statistics maintained
- Recovery options available

## Usage Instructions

### For Administrators

1. **Access**: Navigate to `/admin/user-lifecycle`
2. **Monitor**: Review status overview cards
3. **Filter**: Use status filters to focus on specific groups
4. **Process**: Run manual cleanup when needed
5. **Reactivate**: Manually reactivate users when appropriate

### For Developers

1. **Activity Tracking**: Call `recordUserActivity()` for user interactions
2. **Status Queries**: Use `getUsersByLifecycleStatus()` for filtered results
3. **Manual Processing**: Use `processAutomaticStatusTransitions()` for cleanup

## Maintenance

### Regular Tasks
- Monitor cleanup processing results
- Review notification templates
- Update threshold configurations
- Check storage cleanup logs

### Troubleshooting
- Review error logs in Firebase Functions
- Check Supabase storage for failed cleanups
- Monitor user complaints about missing data
- Verify notification delivery

## Future Enhancements

### Planned Features
- **Custom Thresholds**: Per-branch configuration
- **Advanced Notifications**: SMS, push notifications
- **Data Analytics**: Detailed lifecycle reports
- **Bulk Operations**: Mass reactivation tools

### Integration Opportunities
- **Email Service**: Automated notification delivery
- **Analytics Platform**: User behavior tracking
- **Backup Systems**: Enhanced data preservation

## Support

For questions or issues with the user lifecycle management system:
1. Check the admin interface for error messages
2. Review Firebase Functions logs
3. Consult this documentation
4. Contact the development team

---

**Note**: This system is designed to run automatically with minimal manual intervention while providing administrators with full control and visibility over the process.
