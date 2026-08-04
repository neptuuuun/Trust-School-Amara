/**
 * NotificationBell
 * ----------------
 * Navbar bell + dropdown notification center for the signed-in user (student,
 * admin, or owner). Shows an unread counter, read/unread state, per-item and
 * bulk "mark as read", timestamps, full history, and an empty state.
 *
 * Self-contained: pass the current `userId` and it wires up live data via
 * useNotifications. `tone="onPrimary"` renders a white bell for the blue public
 * header; the default renders a gray bell for white dashboard toolbars.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, X, Inbox } from 'lucide-react';
import useNotifications from '../../hooks/useNotifications';
import { formatDate } from '../../utils/dateUtils';

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const d = new Date(value);
  return isNaN(d) ? null : d;
};

function timeAgoAr(date) {
  if (!date) return '';
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return 'الآن';
  const min = Math.floor(sec / 60);
  if (min < 60) return `منذ ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `منذ ${day} يوم`;
  return formatDate(date);
}

export default function NotificationBell({ userId, tone = 'default' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const { notifications, unreadCount, loading, isRead, markRead, markAllRead } = useNotifications(userId);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!userId) return null;

  const bellColor =
    tone === 'onPrimary'
      ? 'text-white hover:bg-white/15'
      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700';

  return (
    <div className="relative" ref={rootRef} dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${bellColor}`}
        aria-label="الإشعارات"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -end-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 z-[1200] mt-2 w-[calc(100vw-2rem)] max-w-sm origin-top-left overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900">الإشعارات</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  {unreadCount} جديد
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  تعليم الكل كمقروء
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[70vh] overflow-y-auto sm:max-h-96">
            {loading ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-3 w-1/3 rounded bg-gray-200" />
                    <div className="h-3 w-4/5 rounded bg-gray-100" />
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
                  <Inbox className="h-7 w-7 text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-900">لا توجد إشعارات</p>
                <p className="mt-1 text-xs text-gray-500">ستظهر هنا التحديثات المتعلقة بحسابك وطلباتك.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {notifications.map((n) => {
                  const read = isRead(n);
                  const when = timeAgoAr(toDate(n.createdAt));
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => !read && markRead(n.id)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-gray-50 ${
                          read ? 'bg-white' : 'bg-primary/[0.03]'
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                            read ? 'bg-transparent' : 'bg-primary'
                          }`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className={`truncate text-sm ${read ? 'font-medium text-gray-700' : 'font-bold text-gray-900'}`}>
                              {n.title || 'إشعار'}
                            </span>
                            {when && <span className="flex-shrink-0 text-[11px] text-gray-400">{when}</span>}
                          </span>
                          {n.body && <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{n.body}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
