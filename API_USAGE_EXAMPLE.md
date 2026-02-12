# Vercel API Route Usage Example

## Frontend Usage Example

Here's how to call the new Vercel API route from your React frontend:

```javascript
// Example function to register for a support lesson
const registerForSupportLesson = async (lessonData, authToken) => {
  try {
    const response = await fetch('/api/createSupportLessonRegistration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}` // Firebase ID token
      },
      body: JSON.stringify(lessonData)
    });

    const result = await response.json();

    if (response.ok) {
      console.log('Registration successful:', result);
      return result;
    } else {
      console.error('Registration failed:', result);
      throw new Error(result.message || 'Registration failed');
    }
  } catch (error) {
    console.error('Error calling API:', error);
    throw error;
  }
};

// Usage example:
const handleRegistration = async () => {
  // Get the current user's Firebase ID token
  const user = firebase.auth().currentUser;
  if (!user) {
    alert('Please sign in first');
    return;
  }

  const authToken = await user.getIdToken();
  
  const lessonData = {
    branchId: 'your-branch-id',
    lessonId: 'lesson-123',
    durationInMonths: 1,
    source: 'manual',
    paymentProofUrl: 'https://example.com/receipt.jpg',
    monthlyPrice: 5000,
    totalPrice: 5000,
    startDate: new Date().toISOString(),
    academicYear: '2024-2025'
  };

  try {
    const result = await registerForSupportLesson(lessonData, authToken);
    alert('Registration successful! ID: ' + result.id);
  } catch (error) {
    alert('Registration failed: ' + error.message);
  }
};
```

## Required Environment Variables

Set these in your Vercel dashboard under Environment Variables:

```
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Key Features

- **CORS Handling**: Automatically handles CORS for cross-origin requests
- **Authentication**: Requires Firebase ID token in Authorization header
- **Error Handling**: Comprehensive error responses with proper HTTP status codes
- **Validation**: All input validation from the original function is preserved
- **Firestore Integration**: Uses Firebase Admin SDK for database operations
- **No Firebase Functions**: Completely independent of Firebase Cloud Functions

## API Response Format

**Success Response (200)**:
```json
{
  "id": "registration-document-id",
  "success": true
}
```

**Error Responses**:
- `401`: Authentication required/invalid
- `400`: Invalid input parameters
- `403`: Permission denied (not verified, yearly fee not paid, etc.)
- `404`: User or lesson not found
- `409`: Already registered
- `500`: Internal server error

## Deployment

1. Push your code to your Git repository
2. Deploy to Vercel (or it will auto-deploy if connected)
3. Set the environment variables in Vercel dashboard
4. The API will be available at `https://your-domain.vercel.app/api/createSupportLessonRegistration`

## Testing

You can test the API using curl:

```bash
curl -X POST https://your-domain.vercel.app/api/createSupportLessonRegistration \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -d '{
    "branchId": "test-branch",
    "lessonId": "test-lesson",
    "durationInMonths": 1
  }'
```
