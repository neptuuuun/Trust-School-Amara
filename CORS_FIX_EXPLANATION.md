# CORS Fix for CSV Export Functions

## Why the CORS Error Happened

The CORS (Cross-Origin Resource Sharing) error occurred because:

1. **Browser Security Policy**: When your frontend at `http://localhost:3000` makes a request to a different origin (the Firebase Cloud Function at `https://us-central1-<project>.cloudfunctions.net`), the browser enforces the Same-Origin Policy.

2. **Missing CORS Headers**: The Cloud Function wasn't sending the required CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, etc.) that tell the browser it's safe to allow the cross-origin request.

3. **Manual Header Setting Issues**: The previous implementation tried to set CORS headers manually, but this approach can be unreliable and doesn't properly handle OPTIONS preflight requests that browsers send before POST requests.

## The Fix

### 1. Added `cors` Package
- Added `cors` package to `functions/package.json`
- This is the standard, reliable way to handle CORS in Node.js/Express applications

### 2. Proper CORS Configuration
```javascript
const cors = require('cors')({ 
  origin: true,  // Allows all origins (can be restricted in production)
  methods: ['GET', 'POST', 'OPTIONS'], 
  allowedHeaders: ['Authorization', 'Content-Type'] 
});
```

### 3. Created `exportLanguagesCsv` Function
- New dedicated function specifically for languages CSV export
- Properly wrapped with `cors` middleware
- Handles authentication, authorization, and CSV generation
- Supports POST requests and CSV file download

### 4. Fixed `exportRegistrationsCsvHttp` Function
- Updated to use the `cors` package instead of manual header setting
- Now properly handles OPTIONS preflight requests
- Works correctly with async/await

## How It Works

1. **Preflight Request (OPTIONS)**: When the browser makes a POST request, it first sends an OPTIONS request to check if CORS is allowed. The `cors` middleware automatically handles this.

2. **CORS Headers**: The middleware sets the required headers:
   - `Access-Control-Allow-Origin`: Allows the requesting origin
   - `Access-Control-Allow-Methods`: Specifies allowed HTTP methods
   - `Access-Control-Allow-Headers`: Specifies allowed request headers

3. **Actual Request**: After the preflight succeeds, the browser sends the actual POST request with the Authorization token and payload.

## Usage

### Frontend Code (Already Working)
```javascript
const response = await fetch(exportUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    list: 'languages',
    branchId: selectedBranchId,
    search,
    levelFilter,
  }),
});
```

### Cloud Function Endpoint
- **New function**: `exportLanguagesCsv`
- **Existing function**: `exportRegistrationsCsvHttp` (now fixed)

Both functions now properly handle CORS and will work from:
- Development: `http://localhost:3000`
- Production: Your deployed frontend URL

## Next Steps

1. **Install Dependencies**:
   ```bash
   cd functions
   npm install
   ```

2. **Deploy the Function**:
   ```bash
   firebase deploy --only functions:exportLanguagesCsv
   # Or deploy all functions:
   firebase deploy --only functions
   ```

3. **Update Frontend** (if using the new function):
   Change the URL from `exportRegistrationsCsvHttp` to `exportLanguagesCsv` if you want to use the dedicated function.

## Security Note

The current configuration uses `origin: true` which allows all origins. For production, you may want to restrict this to specific domains:

```javascript
const cors = require('cors')({ 
  origin: ['https://yourdomain.com', 'https://www.yourdomain.com'],
  methods: ['GET', 'POST', 'OPTIONS'], 
  allowedHeaders: ['Authorization', 'Content-Type'] 
});
```
