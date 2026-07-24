import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Owner identity helpers — mirror adminService.js. The cross-branch owner role is
 * stored in the root `owners/{uid}` collection (provisioned via the backend
 * `provision-owner.js` script; no client may write it).
 */

/** Fetch the owner document for a uid, or null if the user is not an owner. */
export const getOwnerByUid = async (uid) => {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'owners', uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.error('Error fetching owner document:', error);
    return null;
  }
};

/** Realtime listener on the owner document. Calls back with the doc or null. */
export const onOwnerSnapshot = (uid, callback) => {
  if (!uid) { callback(null); return () => {}; }
  return onSnapshot(
    doc(db, 'owners', uid),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (error) => { console.error('Owner snapshot error:', error); callback(null); }
  );
};
