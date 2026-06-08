import React, { createContext, useCallback, useContext, useReducer } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext(null);

// ─── Reducer ──────────────────────────────────────────────────────────────────

const reducer = (state, action) => {
  switch (action.type) {
    case 'ADD':
      return [...state, action.toast];
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id);
    default:
      return state;
  }
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ToastProvider = ({ children }) => {
  const [toasts, dispatch] = useReducer(reducer, []);

  const show = useCallback((type, message, duration = 4000) => {
    const id = Date.now() + Math.random();
    dispatch({ type: 'ADD', toast: { id, type, message } });
    if (duration > 0) {
      setTimeout(() => dispatch({ type: 'REMOVE', id }), duration);
    }
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    dispatch({ type: 'REMOVE', id });
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
};

// ─── Icon map ─────────────────────────────────────────────────────────────────

const CONFIG = {
  success: {
    icon: CheckCircle,
    bar:  'bg-success-500',
    bg:   'bg-white border-success-200',
    icon_class: 'text-success-500',
    text: 'text-gray-900',
  },
  error: {
    icon: XCircle,
    bar:  'bg-danger-500',
    bg:   'bg-white border-danger-200',
    icon_class: 'text-danger-500',
    text: 'text-gray-900',
  },
  warning: {
    icon: AlertTriangle,
    bar:  'bg-warning-500',
    bg:   'bg-white border-warning-200',
    icon_class: 'text-warning-500',
    text: 'text-gray-900',
  },
  info: {
    icon: Info,
    bar:  'bg-secondary-500',
    bg:   'bg-white border-secondary-200',
    icon_class: 'text-secondary-500',
    text: 'text-gray-900',
  },
};

// ─── Single toast ─────────────────────────────────────────────────────────────

const Toast = ({ toast, onDismiss }) => {
  const cfg = CONFIG[toast.type] || CONFIG.info;
  const Icon = cfg.icon;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-3 w-full max-w-sm rounded-xl border shadow-lg px-4 py-3 ${cfg.bg} pointer-events-auto`}
      dir="rtl"
    >
      <div className={`flex-shrink-0 w-1 self-stretch rounded-full ${cfg.bar}`} />
      <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${cfg.icon_class}`} aria-hidden="true" />
      <p className={`flex-1 text-sm font-medium leading-snug ${cfg.text}`}>{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label="إغلاق الإشعار"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

// ─── Stack ────────────────────────────────────────────────────────────────────

const ToastStack = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none"
      aria-label="منطقة الإشعارات"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
