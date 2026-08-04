// recent.js — "recently viewed" per help center (isolated localStorage key).
const keyFor = (guideId) => `tsa_help_recent_${guideId}`;
const MAX = 6;

export function getRecent(guideId) {
  try { return JSON.parse(localStorage.getItem(keyFor(guideId)) || '[]'); } catch { return []; }
}

export function pushRecent(guideId, item) {
  try {
    const list = getRecent(guideId).filter((x) => x.slug !== item.slug);
    list.unshift({ slug: item.slug, title: item.title });
    localStorage.setItem(keyFor(guideId), JSON.stringify(list.slice(0, MAX)));
  } catch { /* ignore */ }
}
