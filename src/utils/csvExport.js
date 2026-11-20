/**
 * Frontend-only CSV Export Utility
 * Generates and downloads CSV files directly in the browser
 * Supports UTF-8 encoding with BOM for Excel/Arabic text compatibility
 */

/**
 * Escapes a CSV field value
 * Handles commas, quotes, and newlines properly
 */
const escapeCsvField = (value) => {
  if (value === null || value === undefined) return '';
  
  const str = String(value);
  
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
};

/**
 * Formats a date/timestamp value for CSV
 * Handles Firestore Timestamps and regular Date objects
 */
const formatCsvDate = (value) => {
  if (!value) return '';
  
  let date;
  if (value && typeof value.toDate === 'function') {
    // Firestore Timestamp
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  } else {
    return '';
  }
  
  if (isNaN(date.getTime())) return '';
  
  // ISO format for consistent parsing
  return date.toISOString();
};

/**
 * Safely converts any value to a CSV-safe string
 */
const safeCsvValue = (value) => {
  if (value === null || value === undefined) return '';
  
  if (Array.isArray(value)) {
    return value.map(v => safeCsvValue(v)).join(' | ');
  }
  
  if (typeof value === 'object') {
    // Check if it's a Firestore Timestamp
    if (typeof value.toDate === 'function') {
      return formatCsvDate(value);
    }
    // Check if it's a Date
    if (value instanceof Date) {
      return formatCsvDate(value);
    }
    // For other objects, stringify
    return JSON.stringify(value);
  }
  
  return String(value);
};

/**
 * Converts an array of objects to CSV format
 * @param {Array} data - Array of objects to convert
 * @param {Array} columns - Array of column definitions
 * @param {Object} options - Optional configuration
 * @returns {string} CSV content with UTF-8 BOM
 */
export const convertToCsv = (data, columns, options = {}) => {
  const { includeBOM = true } = options;
  
  if (!Array.isArray(data) || data.length === 0) {
    return includeBOM ? '\uFEFF' : '';
  }
  
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('Columns array is required');
  }
  
  const lines = [];

  // Header row
  const headers = columns.map(col => {
    const header = typeof col === 'string' ? col : (col.header || col.key || '');
    return escapeCsvField(header);
  });
  lines.push(headers.join(','));
  
  // Data rows
  data.forEach((row) => {
    const values = columns.map(col => {
      const key = typeof col === 'string' ? col : col.key;
      const transform = typeof col === 'object' && col.transform ? col.transform : null;
      
      let value = row[key];
      
      // Apply custom transform if provided
      if (transform && typeof transform === 'function') {
        value = transform(value, row);
      } else if (typeof col === 'object' && col.type === 'date') {
        // Auto-format dates if type is specified
        value = formatCsvDate(value);
      } else {
        value = safeCsvValue(value);
      }
      
      return escapeCsvField(value);
    });
    
    lines.push(values.join(','));
  });

  // UTF-8 BOM for Excel (Arabic text). It must PREFIX the header line — pushed as
  // its own line it left row 1 empty and put the headers on row 2 in Excel.
  const body = lines.join('\n');
  return includeBOM ? `﻿${body}` : body;
};

/**
 * Triggers a browser download of CSV content
 * @param {string} csvContent - The CSV content string
 * @param {string} filename - The filename for the download
 */
export const downloadCsv = (csvContent, filename) => {
  // Ensure filename has .csv extension
  const csvFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  
  // Create blob with UTF-8 encoding
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Create download link
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = csvFilename;
  link.style.display = 'none';
  
  // Trigger download
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

/**
 * Main export function - converts data to CSV and triggers download
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Column definitions
 * @param {string} filename - Filename for the download
 * @param {Object} options - Optional configuration
 * 
 * @example
 * exportToCsv(
 *   entries,
 *   [
 *     { key: 'studentName', header: 'اسم الطالب' },
 *     { key: 'email', header: 'البريد الإلكتروني' },
 *     { key: 'languageName', header: 'اللغة' },
 *     { key: 'registeredAt', header: 'تاريخ التسجيل', type: 'date' }
 *   ],
 *   'languages-export.csv'
 * );
 */
export const exportToCsv = (data, columns, filename, options = {}) => {
  try {
    const csvContent = convertToCsv(data, columns, options);
    downloadCsv(csvContent, filename);
    return true;
  } catch (error) {
    console.error('CSV export error:', error);
    throw error;
  }
};

/**
 * Helper to generate filename with current date
 * @param {string} prefix - Filename prefix
 * @param {string} extension - File extension (default: 'csv')
 * @returns {string} Formatted filename
 */
export const generateFilename = (prefix, extension = 'csv') => {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return `${prefix}-${dateStr}.${extension}`;
};
