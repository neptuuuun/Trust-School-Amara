/**
 * PaymentProofViewer
 * ------------------
 * A full-screen, mobile-friendly viewer purpose-built for inspecting payment
 * receipts. Critical for the payment-verification workflow — an admin must be
 * able to read a receipt with zero friction before approving money.
 *
 * Features:
 *   - Large preview that fills the screen
 *   - Zoom (buttons, mouse wheel, double-tap, pinch-to-zoom on touch)
 *   - Pan by dragging when zoomed in
 *   - Rotate (receipts are often photographed sideways)
 *   - True fullscreen (Fullscreen API, hides browser chrome on mobile)
 *   - Download / open-in-new-tab
 *   - PDF support (receipts uploaded as PDF)
 *   - Keyboard shortcuts: Esc close, +/- zoom, 0 reset, r rotate
 *
 * Props:
 *   url          String  — image or PDF URL (required to render)
 *   studentName  String  — shown in the header for context
 *   onClose      fn      — close handler
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, ZoomIn, ZoomOut, RotateCw, Download, Maximize2, Minimize2,
  RefreshCw, FileText, AlertCircle, Loader2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const SCALE_STEP = 0.5;

const isPdf = (url) =>
  typeof url === 'string' && url.split('?')[0].toLowerCase().endsWith('.pdf');

const guessFileName = (url) => {
  try {
    const clean = url.split('?')[0];
    const last = clean.substring(clean.lastIndexOf('/') + 1);
    return decodeURIComponent(last) || 'payment-proof';
  } catch {
    return 'payment-proof';
  }
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const ControlButton = ({ onClick, label, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
  >
    {children}
  </button>
);

const PaymentProofViewer = ({ url, studentName, onClose }) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [isFs, setIsFs] = useState(false);

  const containerRef = useRef(null);
  const pointers = useRef(new Map());   // pointerId -> {x, y}
  const panStart = useRef(null);        // {px, py, baseX, baseY}
  const pinchStart = useRef(null);      // {dist, scale}
  const lastTap = useRef(0);

  const pdf = isPdf(url);

  // ── Reset everything when the URL changes ───────────────────────────────────
  useEffect(() => {
    setScale(1);
    setRotation(0);
    setPos({ x: 0, y: 0 });
    setLoading(true);
    setErrored(false);
  }, [url]);

  // ── Lock body scroll while open ─────────────────────────────────────────────
  useEffect(() => {
    if (!url) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [url]);

  // ── Track native fullscreen state ───────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const zoomIn = useCallback(() => {
    setScale((s) => clamp(s + SCALE_STEP, MIN_SCALE, MAX_SCALE));
  }, []);
  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = clamp(s - SCALE_STEP, MIN_SCALE, MAX_SCALE);
      if (next <= MIN_SCALE) setPos({ x: 0, y: 0 });
      return next;
    });
  }, []);
  const resetView = useCallback(() => { setScale(1); setRotation(0); setPos({ x: 0, y: 0 }); }, []);
  const rotate = useCallback(() => setRotation((r) => (r + 90) % 360), []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await (el.requestFullscreen?.() ?? Promise.resolve());
      } else {
        await (document.exitFullscreen?.() ?? Promise.resolve());
      }
    } catch {
      /* fullscreen not supported — the overlay is already near-fullscreen */
    }
  }, []);

  const handleDownload = useCallback(async () => {
    const name = guessFileName(url);
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Cross-origin or network issue — fall back to opening in a new tab.
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [url]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!url) return undefined;
    const onKey = (e) => {
      switch (e.key) {
        case 'Escape': onClose?.(); break;
        case '+': case '=': zoomIn(); break;
        case '-': case '_': zoomOut(); break;
        case '0': resetView(); break;
        case 'r': case 'R': rotate(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, onClose, zoomIn, zoomOut, resetView, rotate]);

  // ── Wheel zoom (desktop) ────────────────────────────────────────────────────
  const onWheel = (e) => {
    if (pdf) return;
    e.preventDefault();
    setScale((s) => {
      const next = clamp(s + (e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP), MIN_SCALE, MAX_SCALE);
      if (next <= MIN_SCALE) setPos({ x: 0, y: 0 });
      return next;
    });
  };

  // ── Pointer handlers: pan (1 finger) + pinch (2 fingers) ────────────────────
  const onPointerDown = (e) => {
    if (pdf) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: distance(a, b), scale };
      panStart.current = null;
    } else if (pointers.current.size === 1 && scale > 1) {
      panStart.current = { px: e.clientX, py: e.clientY, baseX: pos.x, baseY: pos.y };
    }
  };

  const onPointerMove = (e) => {
    if (pdf) return;
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const ratio = distance(a, b) / (pinchStart.current.dist || 1);
      setScale(() => {
        const next = clamp(pinchStart.current.scale * ratio, MIN_SCALE, MAX_SCALE);
        if (next <= MIN_SCALE) setPos({ x: 0, y: 0 });
        return next;
      });
    } else if (panStart.current) {
      setPos({
        x: panStart.current.baseX + (e.clientX - panStart.current.px),
        y: panStart.current.baseY + (e.clientY - panStart.current.py),
      });
    }
  };

  const onPointerUp = (e) => {
    if (pdf) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;
  };

  // Double-tap / double-click toggles zoom
  const onDoubleClick = () => {
    if (pdf) return;
    setScale((s) => {
      const next = s > 1 ? 1 : 2.5;
      if (next <= 1) setPos({ x: 0, y: 0 });
      return next;
    });
  };
  const onTouchEndTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) onDoubleClick();
    lastTap.current = now;
  };

  if (!url) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        className="fixed inset-0 z-[1200] bg-black/95 flex flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        dir="rtl"
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 bg-black/60 backdrop-blur-sm flex-shrink-0 flex-wrap">
          <div className="min-w-0 flex items-center gap-2 text-white">
            <FileText className="w-5 h-5 flex-shrink-0 opacity-70" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">إيصال الدفع</p>
              {studentName && (
                <p className="text-xs text-white/60 truncate">{studentName}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            {!pdf && (
              <>
                <ControlButton onClick={zoomOut} label="تصغير" disabled={scale <= MIN_SCALE}>
                  <ZoomOut className="w-5 h-5" />
                </ControlButton>
                <span className="hidden sm:inline-block text-white/80 text-xs font-medium w-12 text-center tabular-nums">
                  {Math.round(scale * 100)}%
                </span>
                <ControlButton onClick={zoomIn} label="تكبير" disabled={scale >= MAX_SCALE}>
                  <ZoomIn className="w-5 h-5" />
                </ControlButton>
                <ControlButton onClick={rotate} label="تدوير">
                  <RotateCw className="w-5 h-5" />
                </ControlButton>
                <ControlButton onClick={resetView} label="إعادة ضبط">
                  <RefreshCw className="w-5 h-5" />
                </ControlButton>
              </>
            )}
            <ControlButton onClick={handleDownload} label="تحميل">
              <Download className="w-5 h-5" />
            </ControlButton>
            <ControlButton onClick={toggleFullscreen} label={isFs ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}>
              {isFs ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </ControlButton>
            <ControlButton onClick={onClose} label="إغلاق">
              <X className="w-5 h-5" />
            </ControlButton>
          </div>
        </div>

        {/* Stage */}
        <div
          className="relative flex-1 overflow-hidden flex items-center justify-center select-none"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onTouchEnd={onTouchEndTap}
          onClick={(e) => { if (e.target === e.currentTarget && scale <= 1) onClose?.(); }}
          style={{ cursor: scale > 1 ? 'grab' : 'default', touchAction: 'none' }}
        >
          {loading && !errored && !pdf && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 gap-3 pointer-events-none">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">جاري تحميل الإيصال...</p>
            </div>
          )}

          {errored && (
            <div className="flex flex-col items-center justify-center text-white/80 gap-3 px-6 text-center">
              <AlertCircle className="w-10 h-10 text-warning-400" />
              <p className="text-sm">تعذّر تحميل الصورة.</p>
              <button
                onClick={handleDownload}
                className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium"
              >
                <Download className="w-4 h-4" /> فتح / تحميل الملف
              </button>
            </div>
          )}

          {pdf ? (
            <object data={url} type="application/pdf" className="w-full h-full">
              <embed src={url} type="application/pdf" />
              <div className="flex flex-col items-center justify-center h-full text-white/80 gap-3">
                <FileText className="w-10 h-10" />
                <p className="text-sm">لا يمكن عرض ملف PDF داخل المتصفح.</p>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium"
                >
                  <Download className="w-4 h-4" /> تحميل الملف
                </button>
              </div>
            </object>
          ) : (
            !errored && (
              <img
                src={url}
                alt={`إيصال الدفع${studentName ? ` - ${studentName}` : ''}`}
                draggable={false}
                onLoad={() => setLoading(false)}
                onError={() => { setLoading(false); setErrored(true); }}
                className="max-w-[95vw] max-h-full will-change-transform"
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale}) rotate(${rotation}deg)`,
                  transition: panStart.current || pinchStart.current ? 'none' : 'transform 0.15s ease-out',
                }}
              />
            )
          )}
        </div>

        {/* Hint bar */}
        {!pdf && !errored && (
          <div className="flex-shrink-0 px-4 py-2 bg-black/60 text-center">
            <p className="text-[11px] text-white/50">
              مرّر للتكبير · انقر نقرتين للتبديل · اسحب للتحريك عند التكبير
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default PaymentProofViewer;
