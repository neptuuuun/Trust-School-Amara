/**
 * Branch-scoped announcement service.
 * All announcements live at: branches/{branchId}/announcements/{announcementId}
 *
 * Branch isolation is enforced at three levels:
 *  1. Firestore path — queries only ever touch one branch's subcollection.
 *  2. Firestore security rules — admin write and student read are gated by branchId in the path.
 *  3. This service — every public function requires branchId as its first argument.
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── Collection path helper ───────────────────────────────────────────────────
const branchAnnouncementsRef = (branchId) =>
  collection(db, 'branches', branchId, 'announcements');

const branchAnnouncementDoc = (branchId, id) =>
  doc(db, 'branches', branchId, 'announcements', id);

// ─── Constants ────────────────────────────────────────────────────────────────

export const ANNOUNCEMENT_CATEGORIES = {
  languages:  { label: 'اللغات' },
  trainings:  { label: 'الدورات التكوينية' },
  support:    { label: 'دروس الدعم' },
  events:     { label: 'الفعاليات' },
  general:    { label: 'عام' },
};

export const ANNOUNCEMENT_STYLES = {
  info:    { label: 'معلومة',  icon: '📢', accent: '#3b82f6', lightBg: '#eff6ff', darkText: '#1e3a8a', border: '#93c5fd' },
  warning: { label: 'تنبيه',  icon: '⚠️', accent: '#f59e0b', lightBg: '#fffbeb', darkText: '#78350f', border: '#fcd34d' },
  success: { label: 'إيجابي', icon: '✅', accent: '#10b981', lightBg: '#f0fdf4', darkText: '#14532d', border: '#6ee7b7' },
  urgent:  { label: 'عاجل',   icon: '🚨', accent: '#ef4444', lightBg: '#fef2f2', darkText: '#7f1d1d', border: '#fca5a5' },
};

// Pages where announcements can be targeted
export const PAGE_TARGETS = {
  all:        'جميع الصفحات',
  languages:  'صفحة اللغات',
  trainings:  'صفحة الدورات التكوينية',
  support:    'صفحة دروس الدعم',
};

// ─── Shared filter logic ──────────────────────────────────────────────────────

function filterAnnouncements(docs, { page } = {}) {
  const now = new Date();
  return docs
    .filter((a) => {
      if (!a.isPublished) return false;

      if (a.expiresAt) {
        const expiry = a.expiresAt.toDate ? a.expiresAt.toDate() : new Date(a.expiresAt);
        if (expiry < now) return false;
      }

      if (a.publishAt) {
        const scheduled = a.publishAt.toDate ? a.publishAt.toDate() : new Date(a.publishAt);
        if (scheduled > now) return false;
      }

      // targetPage: 'all' | 'languages' | 'trainings' | 'support'
      if (page && a.targetPage && a.targetPage !== 'all' && a.targetPage !== page) return false;

      return true;
    })
    .sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
      const pa = Number(a.priority) || 5;
      const pb = Number(b.priority) || 5;
      if (pa !== pb) return pb - pa;
      const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return bt - at;
    });
}

// ─── Public stream (students, filtered) ─────────────────────────────────────

/**
 * Stream published, non-expired announcements for a branch + page.
 * Returns an unsubscribe function.
 */
export function streamBranchAnnouncements({ branchId, page, onData, onError }) {
  if (!branchId) {
    onData([]);
    return () => {};
  }

  const q = query(branchAnnouncementsRef(branchId), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const raw = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(filterAnnouncements(raw, { page }));
    },
    (err) => {
      console.error('[announcements] stream error:', err);
      if (onError) onError(err);
    }
  );
}

// ─── Admin stream (all, including unpublished) ────────────────────────────────

/**
 * Stream all announcements for a branch, including drafts.
 * Only admins should call this (enforced by Firestore rules).
 */
export function streamAdminAnnouncements(branchId, onData, onError) {
  if (!branchId) {
    onData([]);
    return () => {};
  }

  const q = query(branchAnnouncementsRef(branchId), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (err) => {
      console.error('[announcements] admin stream error:', err);
      if (onError) onError(err);
    }
  );
}

// ─── CRUD (admin only — rules enforce this) ───────────────────────────────────

export async function createAnnouncement(branchId, data, adminUid) {
  return addDoc(branchAnnouncementsRef(branchId), {
    title:       data.title?.trim() || '',
    body:        data.body?.trim() || '',
    emoji:       data.emoji?.trim() || null,
    category:    data.category || 'general',
    style:       data.style || 'info',
    targetPage:  data.targetPage || 'all',
    targetYear:  data.targetYear?.trim() || null,
    targetGroup: data.targetGroup?.trim() || null,
    isPinned:    Boolean(data.isPinned),
    priority:    Number(data.priority) || 5,
    isPublished: data.isPublished !== false,
    publishAt:   data.publishAt || null,
    expiresAt:   data.expiresAt || null,
    ctaLabel:    data.ctaLabel?.trim() || null,
    ctaLink:     data.ctaLink?.trim() || null,
    branchId,
    createdBy:   adminUid,
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp(),
  });
}

export async function updateAnnouncement(branchId, id, data) {
  return updateDoc(branchAnnouncementDoc(branchId, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAnnouncement(branchId, id) {
  return deleteDoc(branchAnnouncementDoc(branchId, id));
}
