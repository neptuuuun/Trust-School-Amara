# Trust School Amara – Authentication and Routing

This project now supports Firebase Authentication with role-based access for students and admins.

## Auth Overview

- Uses Firebase Auth (email/password)
- User profile and role are stored in Firestore at `users/{uid}` with a `role` field (`admin` | `student`).
- `src/contexts/AuthContext.js` provides the current `user`, `role`, and `login`, `signup`, `logout` methods.
- `src/components/ProtectedRoute.js` protects routes and supports `adminOnly`.

## Key Files

- `src/firebase.js`: Initializes Firebase and exports `auth`, `db`, `storage`, `functions`.
- `src/contexts/AuthContext.js`: Subscribes to `onAuthStateChanged`, loads role from `users/{uid}`.
- `src/components/ProtectedRoute.js`: Redirects to `/login` when not authenticated; blocks admin-only routes for non-admins.
- `src/pages/LoginPage.js`: Simple email/password login, redirects by role.
- `src/pages/RegisterPage.js`: Student registration (name, email, password, branch). Creates `users/{uid}` with `role: 'student'`.
- `src/App.js`: Wraps app with `AuthProvider`, adds `/login` and `/register`, protects `/student-dashboard` and `/admin/*`.
- `src/components/Header.js`: Auth-aware header shows Login/Register or Dashboard/Logout.

## Routes

- `/login` – Login form; on success:
  - Admins → `/admin`
  - Students → `/student-dashboard`
- `/register` – Student registration; on success → `/student-dashboard`
- `/student-dashboard` – Protected student area
- `/admin/*` – Protected admin area (admin only)
- Legacy: `/admin/login` → redirected to `/login`

## Seeding Admin Users

To grant admin access, create a Firestore document for the user:

- Collection: `users`
- Document ID: `{uid}` (Firebase Auth user ID)
- Fields (minimum):
  - `role`: `admin`
  - Optionally: `name`, `email`, `branchId`, `branchName`, `createdAt`

Without this document, the user will not be treated as admin and will be blocked from `/admin`.

## Student Registration Payload

`RegisterPage` saves student user documents in Firestore with:

```
{
  uid: string,
  email: string,
  role: 'student',
  name: string,
  branchId?: string,
  branchName?: string,
  createdAt: serverTimestamp(),
}
```

## Unified Collections (Planned / In Progress)

In upcoming iterations, we will unify registration and course data across modules:

- `languages`: existing (name, levels[])
- `supportCourses`: rename from `support_lessons`
- `trainings`: existing with active/inactive
- `signups`: unified for all registrations with shape: `{ name, email, phone, courseType: 'language'|'support'|'training', courseId, courseName, createdAt }`
- `trainingRequests`: captures requests when no active trainings exist

Admin pages will allow:

- Manage active/inactive trainings
- View all signups in a single page
- View training requests

Frontend behavior:

- If active trainings exist: show registration for available courses
- If none: show a message and a training request form

## Development

- Start: `npm start`
- Build: `npm run build`

Ensure `.env` (or environment) provides Firebase keys; see `src/firebase.js`. The file also logs whether keys are present when running locally.