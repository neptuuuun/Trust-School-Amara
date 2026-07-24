import React from 'react';
import { Download, Printer } from 'lucide-react';
import { exportToCsv } from '../../utils/csvExport';

/**
 * Reporting actions for owner analytics tables: export the current rows to CSV
 * (UTF-8 BOM → Excel/Arabic safe, via src/utils/csvExport) or print the page to
 * PDF via the browser. We deliberately avoid jsPDF — it mangles Arabic shaping
 * and bidi; the browser's own print pipeline renders RTL correctly.
 *
 * Props:
 *   rows:     array of objects to export
 *   columns:  [{ key, header, transform?, type? }] — same shape exportToCsv expects
 *   filename: download filename (e.g. generateFilename('revenue'))
 *   title:    optional label shown before the buttons
 */
export default function ExportButtons({ rows = [], columns = [], filename = 'export.csv', title, disabled = false }) {
  const empty = !Array.isArray(rows) || rows.length === 0;

  const handleCsv = () => {
    if (empty) return;
    try { exportToCsv(rows, columns, filename); }
    catch (e) { console.error('CSV export failed:', e); }
  };

  const handlePrint = () => { window.print(); };

  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="flex items-center gap-2 print:hidden">
      {title && <span className="text-xs text-gray-400 me-1 hidden sm:inline">{title}</span>}
      <button type="button" onClick={handleCsv} disabled={disabled || empty} className={btn} aria-label="تصدير CSV">
        <Download className="h-4 w-4" aria-hidden="true" /> CSV
      </button>
      <button type="button" onClick={handlePrint} disabled={disabled} className={btn} aria-label="طباعة">
        <Printer className="h-4 w-4" aria-hidden="true" /> طباعة
      </button>
    </div>
  );
}
