# 🚀 Quick Start Guide - Express Backend for Support Lesson Registration

## ✅ What's Been Set Up

1. **Express Server** (`server.js`) - Complete backend API
2. **Updated React Component** - Calls local API instead of Firebase Cloud Functions
3. **Dependencies Installed** - express, cors, firebase-admin, body-parser
4. **Service Account Key** - Already exists in your project

## 🏃‍♂️ Quick Start (3 Steps)

### Step 1: Start the Backend Server
```bash
# In your project root, run:
node server.js
```

**Expected Output:**
```
🚀 Server running on http://localhost:5000
📝 API endpoint: http://localhost:5000/api/createSupportLessonRegistration
🏥 Health check: http://localhost:5000/api/health
🔥 Firebase Admin initialized
```

### Step 2: Start the React App (in another terminal)
```bash
npm start
```

### Step 3: Test the Setup
Hit the health endpoint to confirm the server is up:
```bash
curl http://localhost:5000/api/health
```

## 🔄 Updated React Code

The `handleSubmit` function in `SupportLessonRegistrationForm.js` now calls:
```javascript
const response = await fetch('http://localhost:5000/api/createSupportLessonRegistration', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  },
  body: JSON.stringify({ /* form data */ })
});
```

## 🎯 What This Solves

✅ **No More CORS Issues** - Local Express server handles CORS properly  
✅ **No Firebase Cloud Functions** - Complete independence from Firebase Functions  
✅ **No Blaze Plan Required** - Everything runs locally  
✅ **Full Error Handling** - Proper JSON responses with error codes  
✅ **Firebase Admin SDK** - Secure Firestore operations  
✅ **Authentication** - Firebase ID token verification  

## 📋 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Test if server is running |
| `/api/createSupportLessonRegistration` | POST | Handle support lesson registrations |

## 🛠️ Development Commands

```bash
# Start backend only
node server.js

# Start backend with auto-restart (install nodemon first)
npm install -g nodemon
nodemon server.js

# Test backend health
curl http://localhost:5000/api/health

# Start both React and backend (install concurrently first)
npm install -g concurrently
concurrently "npm start" "node server.js"
```

## 🔍 Testing the Registration Form

1. **Start both servers** (React on :3000, Express on :5000)
2. **Login to your React app**
3. **Navigate to Support Lesson Registration**
4. **Fill out the form and submit**
5. **Check browser console** for success/error messages
6. **Check backend terminal** for request logs

## 🐛 Troubleshooting

### Backend won't start
- Check if port 5000 is already in use
- Verify `serviceAccountKey.json` exists and is valid
- Check Firebase project permissions

### CORS errors
- Make sure backend is running before testing React app
- Verify React app is on `localhost:3000`

### Authentication errors
- Ensure user is logged into Firebase
- Check that Firebase project ID matches service account

### Connection refused
- Start the backend server first: `node server.js`
- Verify both servers are running in separate terminals

---

**🎉 Your local Express backend is ready! The React form will now call your local API instead of Firebase Cloud Functions, eliminating all CORS issues while maintaining full functionality.**
