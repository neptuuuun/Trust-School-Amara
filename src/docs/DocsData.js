/**
 * HelpProvider — loads and parses the ONE guide that belongs to this help center.
 * Each center is isolated: it never loads or indexes any other center's content.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getGuide, guideUrl, basePathFor } from './registry';
import { parseGuide } from './markdown';

const Ctx = createContext({ status: 'loading', guide: null, articles: [], basePath: '/help' });

export function HelpProvider({ guideId, children }) {
  const meta = getGuide(guideId);
  const [state, setState] = useState({ status: 'loading', guide: null, articles: [], basePath: basePathFor(guideId) });

  useEffect(() => {
    if (!meta) { setState((s) => ({ ...s, status: 'error' })); return; }
    let alive = true;
    setState((s) => ({ ...s, status: 'loading', basePath: basePathFor(guideId) }));
    fetch(guideUrl(meta))
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
      .then((md) => {
        if (!alive) return;
        const doc = parseGuide(md);
        const articles = doc.sections.map((s, i) => ({
          guideId, slug: s.slug, id: s.id, title: s.title, text: s.text, index: i,
        }));
        setState({ status: 'ready', guide: { ...meta, doc }, articles, basePath: basePathFor(guideId) });
      })
      .catch(() => { if (alive) setState((s) => ({ ...s, status: 'error' })); });
    return () => { alive = false; };
  }, [guideId]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useHelp = () => useContext(Ctx);

// Relevance search over THIS center's articles only.
export function searchArticles(articles, query, limit = 8) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const a of articles) {
    const title = a.title.toLowerCase();
    const text = a.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 8;
      if (text.includes(t)) score += 3;
    }
    if (title.includes(q)) score += 10;
    if (score > 0) scored.push({ ...a, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function snippetFor(text, query) {
  const q = query.trim().toLowerCase();
  const i = text.toLowerCase().indexOf(q.split(/\s+/)[0] || q);
  if (i < 0) return text.slice(0, 120) + (text.length > 120 ? '…' : '');
  const start = Math.max(0, i - 40);
  return (start > 0 ? '…' : '') + text.slice(start, start + 150) + '…';
}
