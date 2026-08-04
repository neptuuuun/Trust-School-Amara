/**
 * GlobalSearch — the admin dashboard's fast, intuitive command search.
 *
 * A topbar trigger (also opened with Ctrl/⌘+K) launches an AdminModal palette
 * that searches, debounced, across students and every payment type (languages,
 * trainings, support, annual fees) for the admin's branch. Selecting a result
 * navigates to the student's 360 profile (or the payment orders page).
 *
 * Reuses AdminModal (the single modal foundation) and the branch-scoped
 * /api/admin/search endpoint — no new UI conventions, no client-side data loads.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, User, CreditCard, ChevronLeft, Inbox, CornerDownLeft } from 'lucide-react';
import AdminModal from './AdminModal';
import { searchAdmin } from '../../services/adminSearchService';
import { PAYMENT_TYPE_LABELS } from '../../utils/receipt';

const STATUS_LABEL = {
  paid: 'مدفوع',
  pending_payment: 'بانتظار الدفع',
  failed: 'فشل',
  canceled: 'ملغى',
};

const serviceLabel = (t) => PAYMENT_TYPE_LABELS[t] || t || 'خدمة';

export default function GlobalSearch({ variant = 'button' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ students: [], payments: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Ctrl/⌘+K opens the palette from anywhere in the dashboard.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debounced search. Clears results below the 2-char minimum.
  useEffect(() => {
    if (!open) return undefined;
    const term = q.trim();
    if (term.length < 2) {
      setResults({ students: [], payments: [] });
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await searchAdmin(term);
        setResults({ students: res.students || [], payments: res.payments || [] });
      } catch (err) {
        console.error('[GlobalSearch] failed:', err);
        setResults({ students: [], payments: [] });
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [q, open]);

  const close = () => {
    setOpen(false);
    setQ('');
    setResults({ students: [], payments: [] });
  };

  const goToStudent = (id) => {
    if (!id) return;
    navigate(`/admin/students/${id}`);
    close();
  };

  const goToPayment = (p) => {
    if (p.userId) navigate(`/admin/students/${p.userId}`);
    else navigate('/admin/payment-orders');
    close();
  };

  const hasResults = results.students.length > 0 || results.payments.length > 0;
  const termReady = q.trim().length >= 2;

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="بحث"
        >
          <Search className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 transition-colors hover:border-primary-100 hover:text-primary"
          aria-label="بحث شامل"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">بحث…</span>
          <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-1.5 text-[10px] font-semibold text-gray-400 md:inline">Ctrl K</kbd>
        </button>
      )}

      {open && (
        <AdminModal
          open={open}
          onClose={close}
          size="lg"
          ariaLabel="بحث شامل"
          initialFocusRef={inputRef}
        >
          {/* Search field */}
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم، البريد، الهاتف، الدفع، الدورة…"
              className="w-full rounded-xl border border-gray-200 bg-white py-3 ps-11 pe-4 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {loading && <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />}
          </div>

          {/* Results */}
          <div className="mt-4 min-h-[8rem]">
            {!termReady ? (
              <p className="py-10 text-center text-sm text-gray-400">اكتب حرفين على الأقل للبحث…</p>
            ) : !loading && !hasResults ? (
              <div className="flex flex-col items-center py-10 text-center">
                <Inbox className="mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm font-semibold text-gray-700">لا توجد نتائج</p>
                <p className="mt-1 text-xs text-gray-400">جرّب اسماً أو بريداً أو رقم هاتف مختلفاً.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {results.students.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
                      <User className="h-3.5 w-3.5" /> الطلاب
                    </h3>
                    <ul className="space-y-1">
                      {results.students.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => goToStudent(s.id)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5 text-start transition-colors hover:border-primary/30 hover:bg-primary/5"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-gray-900">{s.name}</span>
                              <span className="block truncate text-xs text-gray-500">
                                {[s.email, s.phone].filter(Boolean).join(' · ') || '—'}
                              </span>
                            </span>
                            <ChevronLeft className="h-4 w-4 flex-shrink-0 text-gray-300" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {results.payments.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
                      <CreditCard className="h-3.5 w-3.5" /> المدفوعات والتسجيلات
                    </h3>
                    <ul className="space-y-1">
                      {results.payments.map((p) => (
                        <li key={p.orderId}>
                          <button
                            type="button"
                            onClick={() => goToPayment(p)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5 text-start transition-colors hover:border-primary/30 hover:bg-primary/5"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-gray-900">
                                {p.studentName || '—'}
                                <span className="mx-1 text-gray-300">·</span>
                                <span className="text-primary">{serviceLabel(p.serviceType)}</span>
                              </span>
                              <span className="block truncate text-xs text-gray-500">
                                {[p.serviceName, p.amount ? `${p.amount.toLocaleString('en-US')} دج` : '', STATUS_LABEL[p.status] || p.status]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </span>
                            <ChevronLeft className="h-4 w-4 flex-shrink-0 text-gray-300" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>

          <p className="mt-4 flex items-center justify-center gap-1 border-t border-gray-100 pt-3 text-[11px] text-gray-400">
            <CornerDownLeft className="h-3 w-3" /> اختر نتيجة لفتح ملف الطالب
          </p>
        </AdminModal>
      )}
    </>
  );
}
