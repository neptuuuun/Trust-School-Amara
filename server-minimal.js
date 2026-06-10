const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');

// Initialize Express
const app = express();
const PORT = 5000;

// CORS configuration - allow multiple dev origins (scalable for local dev)
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002'
];
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. Postman, same-origin) in development
    if (!origin && process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware - CORS first so preflight OPTIONS gets correct headers, then body parsers
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize Firebase Admin
try {
  const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.error('❌ Firebase Admin error:', error.message);
  process.exit(1);
}

const db = admin.firestore();

// Helper functions
function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function parseDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Main API endpoint
app.post('/api/createSupportLessonRegistration', async (req, res) => {
  console.log('📥 POST /api/createSupportLessonRegistration received');
  
  try {
    // Verify Firebase ID token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'unauthenticated', message: 'Missing Authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = await admin.auth().verifyIdToken(token);
    console.log('🔐 User authenticated:', decoded.uid);

    // Extract data
    const { branchId, lessonId, durationInMonths = 1, paymentProofUrl } = req.body;
    
    if (!branchId || !lessonId) {
      return res.status(400).json({ 
        error: 'invalid-argument', 
        message: 'branchId and lessonId are required' 
      });
    }

    // Get user data
    const userRef = db.collection('branches').doc(branchId).collection('users').doc(decoded.uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return res.status(404).json({ error: 'user-not-found', message: 'User profile not found' });
    }

    const userData = userSnap.data();
    
    // Check verification status
    const isVerified = userData.verified || userData.accountVerified || userData.verificationStatus === 'verified';
    if (!isVerified) {
      return res.status(403).json({ error: 'account-not-verified', message: 'Account must be verified' });
    }

    // Fetch lesson to store subjectName, yearName, teacherName (self-contained registration)
    let subjectName = '';
    let yearName = null;
    let teacherName = null;
    try {
      const lessonSnap = await db.collection('branches').doc(branchId).collection('supportLessons').doc(lessonId).get();
      if (lessonSnap.exists) {
        const lessonData = lessonSnap.data() || {};
        subjectName = String(lessonData.name || lessonData.subject || (Array.isArray(lessonData.subjects) ? lessonData.subjects[0] : '') || '').trim();
        yearName = String(lessonData.studyLevel || lessonData.year || lessonData.grade || '').trim() || null;
        teacherName = String(lessonData.teacherName || lessonData.teacher || '').trim() || null;
      }
    } catch (e) {
      console.warn('Could not fetch lesson for denormalized fields:', e.message);
    }

    // Create registration (self-contained)
    const registration = {
      branchId,
      userId: decoded.uid,
      lessonId,
      subjectName,
      yearName,
      teacherName,
      durationInMonths,
      paymentProofUrl,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      userName: userData.fullName || userData.name || '',
      userEmail: userData.email || decoded.email || ''
    };

    const docRef = await db.collection('supportLessonRegistrations').add(registration);
    
    console.log('✅ Registration created:', docRef.id);
    
    res.status(200).json({ 
      success: true, 
      id: docRef.id,
      message: 'Registration created successfully'
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('Firebase ID token')) {
      return res.status(401).json({ error: 'unauthenticated', message: 'Invalid authentication token' });
    }
    
    res.status(500).json({ 
      error: 'internal', 
      message: 'Internal server error',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('📥 GET /api/health received');
  res.json({ 
    success: true, 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 Express server started successfully!');
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`🌐 CORS enabled for: localhost:3000, 3001, 3002 (and 127.0.0.1)`);
  console.log(`📝 Registration API: POST http://localhost:${PORT}/api/createSupportLessonRegistration`);
  console.log(`🏥 Health check: GET http://localhost:${PORT}/api/health`);
  console.log('⏳ Waiting for requests...');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});
