# Frontend-Only CSV Export - Usage Guide

## Overview

This implementation provides a **100% frontend-only CSV export** solution that:
- ✅ Fetches data directly from Firestore using Firebase client SDK
- ✅ Generates CSV in the browser
- ✅ Downloads files without any backend/Cloud Functions
- ✅ Supports UTF-8 encoding with BOM for Excel/Arabic text compatibility
- ✅ Works on localhost and Vercel (no CORS issues)
- ✅ No server deployment needed

## Quick Start

### 1. Import the Utility

```javascript
import { exportToCsv, generateFilename } from '../../utils/csvExport';
```

### 2. Basic Usage

```javascript
const handleExportCsv = () => {
  // Your data array (from Firestore or state)
  const data = [
    { name: 'أحمد', email: 'ahmed@example.com', course: 'الإنجليزية', price: 5000 },
    { name: 'فاطمة', email: 'fatima@example.com', course: 'الفرنسية', price: 6000 }
  ];

  // Define columns with Arabic headers
  const columns = [
    { key: 'name', header: 'الاسم' },
    { key: 'email', header: 'البريد الإلكتروني' },
    { key: 'course', header: 'الدورة' },
    { key: 'price', header: 'السعر' }
  ];

  // Export
  const filename = generateFilename('my-export', 'csv');
  exportToCsv(data, columns, filename);
};
```

## Column Definitions

### Simple Column (String Key)

```javascript
const columns = [
  'name',        // Uses 'name' as both key and header
  'email',
  'phone'
];
```

### Column with Custom Header

```javascript
const columns = [
  { key: 'studentName', header: 'اسم الطالب' },
  { key: 'email', header: 'البريد الإلكتروني' }
];
```

### Column with Date Type

```javascript
const columns = [
  { key: 'createdAt', header: 'تاريخ الإنشاء', type: 'date' }
];
```

Dates are automatically formatted as ISO strings. Works with:
- Firestore Timestamps (`timestamp.toDate()`)
- JavaScript Date objects
- Date strings/numbers

### Column with Custom Transform

```javascript
const columns = [
  {
    key: 'status',
    header: 'الحالة',
    transform: (value, row) => {
      const statusMap = {
        'pending': 'قيد المراجعة',
        'approved': 'مقبول',
        'verified': 'مؤكد'
      };
      return statusMap[value] || value;
    }
  },
  {
    key: 'fullName',
    header: 'الاسم الكامل',
    transform: (value, row) => {
      return `${row.firstName} ${row.lastName}`;
    }
  }
];
```

## Real-World Examples

### Example 1: Languages Registrations

```javascript
import { exportToCsv, generateFilename } from '../../utils/csvExport';

const LanguageRegisteredPage = () => {
  const [entries, setEntries] = useState([]);
  const [exporting, setExporting] = useState(false);

  // Data is already loaded from Firestore via streamRegisteredLanguages
  // entries = [{ studentName, email, languageName, levelLabel, ... }]

  const handleExportCsv = () => {
    if (entries.length === 0) {
      alert('لا توجد بيانات للتصدير.');
      return;
    }

    setExporting(true);
    try {
      const columns = [
        { key: 'studentName', header: 'اسم الطالب' },
        { key: 'studentEmail', header: 'البريد الإلكتروني' },
        { key: 'languageName', header: 'اللغة' },
        { key: 'levelLabel', header: 'المستوى' },
        { 
          key: 'status', 
          header: 'الحالة',
          transform: (value, row) => value || (row.verifiedAt ? 'مؤكد' : 'موافق عليه')
        },
        { key: 'registeredAt', header: 'تاريخ التسجيل', type: 'date' },
        { key: 'verifiedAt', header: 'تاريخ التأكيد', type: 'date' },
        { key: 'paymentMethod', header: 'طريقة الدفع' },
        { key: 'studentPhone', header: 'هاتف الطالب' },
        { key: 'languagePrice', header: 'السعر' }
      ];

      const filename = generateFilename('languages-registrations', 'csv');
      exportToCsv(entries, columns, filename);
    } catch (e) {
      console.error('CSV export failed:', e);
      alert('فشل تصدير الملف.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <button onClick={handleExportCsv} disabled={exporting}>
      {exporting ? 'جاري التصدير...' : 'تصدير CSV'}
    </button>
  );
};
```

### Example 2: Fetching Data from Firestore First

```javascript
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { exportToCsv, generateFilename } from '../../utils/csvExport';

const MyAdminPage = () => {
  const [exporting, setExporting] = useState(false);
  const { selectedBranchId } = useBranch();

  const handleExportCsv = async () => {
    if (!selectedBranchId) return;

    setExporting(true);
    try {
      // Fetch data directly from Firestore
      const registrationsRef = collection(db, 'branches', selectedBranchId, 'languagesRegistered');
      const snapshot = await getDocs(registrationsRef);
      
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Define columns
      const columns = [
        { key: 'studentName', header: 'اسم الطالب' },
        { key: 'languageName', header: 'اللغة' },
        { key: 'registeredAt', header: 'تاريخ التسجيل', type: 'date' }
      ];

      // Export
      const filename = generateFilename('export', 'csv');
      exportToCsv(data, columns, filename);
    } catch (e) {
      console.error('Export failed:', e);
      alert('فشل التصدير');
    } finally {
      setExporting(false);
    }
  };

  return <button onClick={handleExportCsv}>Export CSV</button>;
};
```

### Example 3: With Filtering

```javascript
const handleExportCsv = () => {
  // Use filtered data (respects search/filters)
  const filteredData = entries.filter(entry => {
    // Your filtering logic
    return entry.status === 'verified';
  });

  const columns = [
    { key: 'name', header: 'الاسم' },
    { key: 'email', header: 'البريد' }
  ];

  exportToCsv(filteredData, columns, 'filtered-export.csv');
};
```

## Features

### ✅ UTF-8 BOM Support
CSV files include UTF-8 BOM (`\uFEFF`) for proper Excel/Arabic text display.

### ✅ Proper CSV Escaping
- Commas, quotes, and newlines are properly escaped
- Fields containing special characters are wrapped in quotes
- Double quotes are escaped as `""`

### ✅ Date Handling
- Automatically handles Firestore Timestamps
- Converts to ISO format for consistent parsing
- Works with Date objects, strings, and numbers

### ✅ Array Handling
Arrays are converted to pipe-separated values: `["item1", "item2"]` → `"item1 | item2"`

### ✅ Error Handling
All errors are caught and logged. User-friendly error messages in Arabic.

## API Reference

### `exportToCsv(data, columns, filename, options)`

Main export function.

**Parameters:**
- `data` (Array): Array of objects to export
- `columns` (Array): Column definitions (see above)
- `filename` (string): Filename for download
- `options` (Object, optional): 
  - `includeBOM` (boolean): Include UTF-8 BOM (default: `true`)

**Returns:** `true` on success, throws error on failure

### `generateFilename(prefix, extension)`

Generates filename with current date.

**Parameters:**
- `prefix` (string): Filename prefix
- `extension` (string): File extension (default: `'csv'`)

**Returns:** `string` - e.g., `"languages-export-2024-01-15.csv"`

### `convertToCsv(data, columns, options)`

Converts data to CSV string without downloading.

**Returns:** `string` - CSV content

### `downloadCsv(csvContent, filename)`

Downloads CSV content as file.

**Parameters:**
- `csvContent` (string): CSV content
- `filename` (string): Filename

## Migration from Cloud Functions

### Before (Cloud Functions)
```javascript
const response = await fetch(exportUrl, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ list: 'languages', branchId })
});
const blob = await response.blob();
// ... download logic
```

### After (Frontend-Only)
```javascript
import { exportToCsv, generateFilename } from '../../utils/csvExport';

const columns = [/* ... */];
const filename = generateFilename('languages-registrations', 'csv');
exportToCsv(entries, columns, filename);
```

## Benefits

1. **No Backend Required**: Everything runs in the browser
2. **No CORS Issues**: No cross-origin requests
3. **Faster**: No network round-trip to Cloud Functions
4. **Simpler**: Less code, easier to maintain
5. **Works Everywhere**: localhost, Vercel, any hosting
6. **Cost Effective**: No Cloud Functions execution costs
7. **Real-time**: Uses data already in your component state

## Notes

- Data must be fetched using Firebase client SDK (already in your app)
- Large datasets (>10,000 rows) may take a few seconds to generate
- Browser download limits apply (usually no issue for admin exports)
- Works with all modern browsers (Chrome, Firefox, Safari, Edge)
