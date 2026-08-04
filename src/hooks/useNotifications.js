/**
 * useNotifications
 * ----------------
 * Live in-app notifications for the signed-in user, built on the EXISTING
 * `notifications` collection + backend read-tracking (see backend
 * notifyController markRead / markAllRead).
 *
 * Reads are client-side realtime (Firestore rules already allow a user to read
 * notifications where target == uid || target == 'all'). Writes (mark read) go
 * through the backend because the collection is `write: if false` — a per-user
 * `readBy` array records who has read each doc, which also works for broadcast
 * (`target: 'all'`) notifications.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import apiCall from '../utils/apiClient';

export default function useNotifications(userId, { max = 50 } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(
      collection(db, 'notifications'),
      where('target', 'in', ['all', userId]),
      orderBy('createdAt', 'desc'),
      limit(max)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('[useNotifications] snapshot error:', err);
        setNotifications([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [userId, max]);

  const isRead = useCallback(
    (n) => Array.isArray(n?.readBy) && n.readBy.includes(userId),
    [userId]
  );

  const unreadCount = useMemo(
    () => notifications.reduce((acc, n) => acc + (isRead(n) ? 0 : 1), 0),
    [notifications, isRead]
  );

  // Optimistically flag as read, then persist via the backend. The onSnapshot
  // listener reconciles the authoritative state when the write lands.
  const markRead = useCallback(
    async (id) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, readBy: Array.from(new Set([...(n.readBy || []), userId])) } : n
        )
      );
      try {
        await apiCall('/api/notify/read', {
          method: 'POST',
          body: JSON.stringify({ notificationId: id }),
        });
      } catch (e) {
        console.error('[useNotifications] markRead failed:', e);
      }
    },
    [userId]
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readBy: Array.from(new Set([...(n.readBy || []), userId])) }))
    );
    try {
      await apiCall('/api/notify/read-all', { method: 'POST' });
    } catch (e) {
      console.error('[useNotifications] markAllRead failed:', e);
    }
  }, [userId]);

  return { notifications, unreadCount, loading, isRead, markRead, markAllRead };
}
