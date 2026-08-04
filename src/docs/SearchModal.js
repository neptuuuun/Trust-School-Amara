import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, CornerDownLeft } from 'lucide-react';
import { useHelp, searchArticles, snippetFor } from './DocsData';

export default function SearchModal({ open, onClose }) {
  const { articles, basePath } = useHelp();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const results = useMemo(() => searchArticles(articles, q, 8), [articles, q]);

  useEffect(() => { if (open) { setQ(''); setActive(0); const t = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(t); } }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === 'Enter') { const r = results[active]; if (r) go(r); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, active]);

  const go = (r) => { onClose(); navigate(`${basePath}/${encodeURIComponent(r.slug)}`); };

  if (!open) return null;
  return (
    <div className="doc-search-overlay" onMouseDown={onClose}>
      <div className="doc-search-modal" role="dialog" aria-modal="true" aria-label="بحث" onMouseDown={(e) => e.stopPropagation()}>
        <div className="doc-search-head">
          <Search className="doc-search-icon" aria-hidden="true" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} type="text" placeholder="ابحث في هذا الدليل…" aria-label="ابحث" />
          <kbd className="doc-kbd">Esc</kbd>
        </div>

        <div className="doc-search-body">
          {q.trim().length < 2 ? (
            <p className="doc-search-hint">اكتب كلمتين على الأقل للبحث…</p>
          ) : results.length === 0 ? (
            <p className="doc-search-empty">لا توجد نتائج مطابقة لـ «{q}». جرّب كلمات أخرى.</p>
          ) : (
            <ul className="doc-search-results">
              {results.map((r, i) => (
                <li key={r.slug}>
                  <button className={`doc-search-item ${i === active ? 'is-active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
                    <FileText className="doc-search-item-icon" aria-hidden="true" />
                    <span className="doc-search-item-main">
                      <span className="doc-search-item-title">{r.title}</span>
                      <span className="doc-search-item-snip">{snippetFor(r.text, q)}</span>
                    </span>
                    {i === active && <CornerDownLeft className="doc-search-enter" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="doc-search-foot">
          <span><kbd className="doc-kbd">↑</kbd><kbd className="doc-kbd">↓</kbd> للتنقل</span>
          <span><kbd className="doc-kbd">↵</kbd> للفتح</span>
          <span><kbd className="doc-kbd">Esc</kbd> للإغلاق</span>
        </div>
      </div>
    </div>
  );
}
