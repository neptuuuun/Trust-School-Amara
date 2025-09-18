# Admin Dashboard - Trust School Amara

## 🚀 Overview

A comprehensive admin dashboard for managing the Trust School Amara website. Built with React, Firebase Firestore, and TailwindCSS with a focus on accessibility and ease of use for older administrators.

## 📋 Features

### 🔗 Firebase Integration
- **Firestore Database**: Real-time data synchronization
- **Live Updates**: All data updates in real-time using `onSnapshot`
- **CRUD Operations**: Full Create, Read, Update, Delete functionality

### 📊 Dashboard Pages

#### 1. Overview (`/admin`)
- **Quick Stats**: Real-time counters for signups, trainings, trainers, and languages
- **Recent Activity**: Latest system activities
- **Quick Actions**: Fast access to common tasks

#### 2. Support Lessons (`/admin/support-lessons`)
- **Middle School Management**: 4 levels with subjects
- **High School Management**: 3 levels with subjects
- **CRUD Operations**: Add/edit/delete levels and subjects
- **Real-time Updates**: Live synchronization with Firestore

#### 3. Languages (`/admin/languages`)
- **Language Management**: Arabic, French, English, etc.
- **Level System**: A1 → C2 European framework
- **Default Levels**: Automatic A1-C2 setup for new languages
- **Custom Levels**: Add custom levels as needed

#### 4. Trainings (`/admin/trainings`)
- **Training Courses**: الدورات التكوينية management
- **Trainer Assignment**: Link trainings to specific trainers
- **Schedule Management**: Time slots and duration tracking
- **Pricing**: Course pricing and student limits

#### 5. Trainers (`/admin/trainers`)
- **Trainer Profiles**: Name, specialty, contact information
- **Experience Tracking**: Years of experience and bio
- **Contact Management**: Email and phone integration

#### 6. Sign-ups (`/admin/signups`)
- **Registration Management**: All website signups
- **Filtering**: By type (support lessons, languages, trainings)
- **Payment Status**: Paid, pending, cancelled tracking
- **CSV Export**: Download signups data
- **Search Functionality**: Find specific registrations

## 🎨 UI/UX Features

### 👴 Senior-Friendly Design
- **Large Text**: 18px+ font sizes throughout
- **Clear Buttons**: High contrast, large clickable areas
- **Simple Navigation**: Intuitive sidebar with icons
- **Minimal Complexity**: Clean, uncluttered interface

### 🎨 Theme Integration
- **Color Scheme**: Matches main website (#255472, #6399c8, #fe837c, #dc584b, #f9b65f)
- **TailwindCSS**: Consistent styling with existing components
- **RTL Support**: Right-to-left Arabic layout
- **Responsive Design**: Works on desktop and mobile

### ♿ Accessibility
- **WCAG Compliance**: High contrast ratios
- **Keyboard Navigation**: Full keyboard support
- **Screen Reader**: Proper ARIA labels
- **Focus Management**: Clear focus indicators

## 🛠️ Technical Setup

### Prerequisites
```bash
npm install firebase
```

### Firebase Configuration
1. Update `src/firebase.js` with your Firebase config:
```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

2. Enable Firestore in Firebase Console
3. Set up Firestore security rules (see below)

### Firestore Collections Structure

#### `supportLessons`
```javascript
{
  name: "السنة الأولى متوسط",
  type: "middle", // or "high"
  subjects: ["الرياضيات", "الفيزياء", "العربية"],
  createdAt: timestamp
}
```

#### `languages`
```javascript
{
  name: "الإنجليزية",
  levels: ["A1", "A2", "B1", "B2", "C1", "C2"],
  createdAt: timestamp
}
```

#### `trainers`
```javascript
{
  name: "أحمد محمد",
  specialty: "تطوير المواقع",
  email: "trainer@example.com",
  phone: "0555123456",
  experience: "5 سنوات في تطوير المواقع",
  bio: "نبذة عن المدرب...",
  createdAt: timestamp
}
```

#### `trainings`
```javascript
{
  name: "دورة تطوير المواقع",
  description: "وصف الدورة...",
  trainerId: "trainer_document_id",
  schedule: "الأحد والثلاثاء 6-8 مساءً",
  duration: "8 أسابيع",
  maxStudents: 20,
  price: 15000,
  createdAt: timestamp
}
```

#### `signups`
```javascript
{
  name: "محمد أحمد",
  email: "student@example.com",
  phone: "0555987654",
  type: "support-lessons", // "languages", "trainings"
  subject: "الرياضيات", // for support lessons
  language: "الإنجليزية", // for languages
  training: "دورة تطوير المواقع", // for trainings
  level: "A1",
  trainer: "أحمد محمد",
  paymentStatus: "pending", // "paid", "cancelled"
  createdAt: timestamp
}
```

### Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to admin collections
    match /{collection}/{document} {
      allow read, write: if true; // Add authentication later
    }
  }
}
```

## 🚀 Usage

### Accessing the Admin Dashboard
Navigate to `/admin` in your browser to access the dashboard.

### Navigation
- **Sidebar**: Click on any menu item to navigate
- **Mobile**: Use hamburger menu on mobile devices
- **Back to Site**: Click "العودة للموقع الرئيسي" to return to main website

### Data Management
1. **Adding Data**: Use the "إضافة" (Add) buttons
2. **Editing**: Click the edit icon next to any item
3. **Deleting**: Click the trash icon (with confirmation)
4. **Searching**: Use search bars and filters
5. **Exporting**: Use CSV export for signups

## 📱 Responsive Design

### Desktop (1024px+)
- Full sidebar navigation
- Multi-column layouts
- Large data tables

### Tablet (768px - 1023px)
- Collapsible sidebar
- 2-column grids
- Scrollable tables

### Mobile (< 768px)
- Hidden sidebar with hamburger menu
- Single column layouts
- Card-based displays

## 🔄 Real-time Features

### Live Updates
- All data updates automatically across all admin sessions
- No need to refresh the page
- Instant feedback on changes

### Error Handling
- Console error logging
- User-friendly error messages
- Graceful fallbacks

## 🎯 Best Practices

### Data Entry
- Required fields are marked with *
- Validation on form submission
- Clear placeholder text

### User Experience
- Confirmation dialogs for destructive actions
- Loading states for async operations
- Success feedback for completed actions

## 🔧 Customization

### Adding New Pages
1. Create component in `src/admin/pages/`
2. Add route in `AdminDashboard.js`
3. Add navigation item in sidebar

### Styling Changes
- Modify TailwindCSS classes
- Update color scheme in `tailwind.config.js`
- Add custom CSS in component files

## 📞 Support

For technical support or feature requests, contact the development team.

## 🔐 Security Notes

- Add authentication before production
- Implement proper Firestore security rules
- Use environment variables for Firebase config
- Regular security audits recommended
