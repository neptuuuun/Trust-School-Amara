import { supabase } from '../supabase';

async function removeFromBucket(bucket, path) {
  if (!supabase || !path) return;
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch (e) {
    console.warn(`[storageCleanup] failed to remove ${bucket}/${path}:`, e?.message);
  }
}

function pathFromRef(ref) {
  if (!ref) return null;
  if (typeof ref === 'object' && ref.path) return ref.path;
  if (typeof ref === 'string') {
    const m = ref.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return m ? m[1] : null;
  }
  return null;
}

export async function cleanupDeletedStudent({ userId, photoUrl, idCardUrl, extraRefs = [] }) {
  const tasks = [];

  const photoPath = pathFromRef(photoUrl);
  if (photoPath) tasks.push(removeFromBucket('user-uploads', photoPath));

  const idPath = pathFromRef(idCardUrl);
  if (idPath) tasks.push(removeFromBucket('user-uploads', idPath));

  for (const ref of extraRefs) {
    const p = pathFromRef(ref);
    if (p) tasks.push(removeFromBucket('user-uploads', p));
  }

  await Promise.allSettled(tasks);
}

export async function cleanupRejectedRegistration({ photoUrl, idCardUrl, documents = [] }) {
  const tasks = [];

  const photoPath = pathFromRef(photoUrl);
  if (photoPath) tasks.push(removeFromBucket('user-uploads', photoPath));

  const idPath = pathFromRef(idCardUrl);
  if (idPath) tasks.push(removeFromBucket('user-uploads', idPath));

  for (const doc of documents) {
    const p = pathFromRef(doc);
    if (p) tasks.push(removeFromBucket('user-uploads', p));
  }

  await Promise.allSettled(tasks);
}
