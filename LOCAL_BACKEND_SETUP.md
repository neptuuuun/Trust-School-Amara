# Local Express Backend Setup Guide

## 🚀 Quick Setup

### 1. Backend Setup

#### Install Dependencies
```bash
# In your project root directory
npm install express cors firebase-admin body-parser
```

#### Service Account Setup
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Download the JSON file and save it as `serviceAccountKey.json` in your project root
4. **Important**: Add `serviceAccountKey.json` to your `.gitignore` file!

#### Start the Backend Server
```bash
# Option 1: Simple start
node server.js

# Option 2: With auto-restart (recommended for development)
npm install -g nodemon
nodemon server.js
```

The server will start on `http://localhost:5000`

### 2. Frontend Setup

The React component is already updated to call `http://localhost:5000/api/createSupportLessonRegistration`.

### 3. Running Both Servers

#### Method 1: Separate Terminals
```bash
# Terminal 1 - Start React app
npm start

# Terminal 2 - Start Express backend
node server.js
```

#### Method 2: Concurrently (Recommended)
```bash
# Install concurrently
npm install -g concurrently

# Add to your main package.json scripts:
"scripts": {
  "dev": "concurrently \"npm start\" \"node server.js\"",
  "backend": "node server.js"
}

# Run both servers
npm run dev
```

## 📋 Server Endpoints

### Main Registration Endpoint
- **URL**: `http://localhost:5000/api/createSupportLessonRegistration`
- **Method**: `POST`
- **Headers**: 
  - `Content-Type: application/json`
  - `Authorization: Bearer <firebase-id-token>`

### Health Check
- **URL**: `http://localhost:5000/api/health`
- **Method**: `GET`
- **Response**: `{ success: true, message: "Server is running" }`

## 🔧 Configuration

### CORS Settings
The server is configured to accept requests from:
- `http://localhost:3000`
- `http://127.0.0.1:3000`

### Port Configuration
Default port is `5000`. You can change it by:
- Setting environment variable: `PORT=3001 node server.js`
- Or modifying the `PORT` constant in `server.js`

## 🛠️ Development Workflow

### 1. Start Development
```bash
# Start both servers
npm run dev
```

### 2. Test the Setup
1. Open React app: `http://localhost:3000`
2. Test health check: `http://localhost:5000/api/health`
3. Try submitting a registration form

### 3. Debugging
- Backend logs appear in the terminal running `server.js`
- Frontend logs appear in browser console
- Check Network tab in browser for API requests

## 📝 Example Request

```javascript
// Example API call for testing
fetch('http://localhost:5000/api/createSupportLessonRegistration', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_FIREBASE_ID_TOKEN'
  },
  body: JSON.stringify({
    branchId: 'your-branch-id',
    lessonId: 'lesson-123',
    durationInMonths: 1,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
    academicYear: '2024-2025',
    paymentProofUrl: 'https://example.com/receipt.jpg',
    monthlyPrice: 5000,
    totalPrice: 5000,
    source: 'manual'
  })
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
```

## 🔒 Security Notes

### ⚠️ Important Security Reminders
1. **Never commit `serviceAccountKey.json` to Git**
2. **Only use this setup for local development**
3. **For production, use environment variables or secure key management**
4. **The backend should only be accessible from your local network**

### Environment Variables (Optional)
For better security, you can use environment variables:

```bash
# Create .env file in project root
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
PORT=5000
```

Then modify `server.js` to use `process.env` variables.

## 🐛 Common Issues & Solutions

### CORS Issues
- Make sure the React app is running on `localhost:3000`
- Check that the backend server is running before testing

### Firebase Authentication Issues
- Ensure user is logged in to Firebase
- Check that the ID token is not expired
- Verify service account has proper permissions

### Firestore Connection Issues
- Check that `serviceAccountKey.json` is in the correct location
- Verify the Firebase project ID matches
- Ensure Firestore rules allow the operations

### Port Already in Use
```bash
# Find process using port 5000
netstat -ano | findstr :5000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or use a different port
PORT=3001 node server.js
```

## 📦 Production Deployment

For production deployment, consider:
1. **Environment Variables**: Don't expose service account keys
2. **HTTPS**: Use SSL certificates
3. **Rate Limiting**: Add rate limiting middleware
4. **Logging**: Implement proper logging
5. **Error Monitoring**: Add error tracking services

## 🎯 Testing

### Test Health Endpoint
```bash
curl http://localhost:5000/api/health
```

### Test Registration (with real token)
```bash
curl -X POST http://localhost:5000/api/createSupportLessonRegistration \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -d '{"branchId":"test","lessonId":"test","durationInMonths":1}'
```

---

**🎉 Your local Express backend is now ready! The React form will call your local API instead of Firebase Cloud Functions, eliminating CORS issues.**
