import React from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronLeft, Clock } from 'lucide-react';
import { useHelp } from './DocsData';
import { getRecent } from './recent';
import { iconFor } from './ui';

export default function DocsLanding({ onOpenSearch }) {
  const { guide, articles, status, basePath } = useHelp();
  if (status === 'error') return <div className="doc-container doc-loading">تعذّر تحميل المحتوى.</div>;
  if (status !== 'ready' || !guide) return <div className="doc-container doc-loading">جارٍ التحميل…</div>;

  const Icon = iconFor(guide.icon);
  const sections = guide.doc.sections;
  const popular = (guide.popular || [])
    .map((m) => articles.find((a) => a.id.includes(m)))
    .filter(Boolean)
    .slice(0, 6);
  const recent = getRecent(guide.id).filter((r) => sections.some((s) => s.slug === r.slug));
  const preview = (s) => { const t = s.text || ''; return t.length > 130 ? t.slice(0, 130) + '…' : t; };

  return (
    <div className="doc-landing">
      <section className="doc-hero">
        <div className="doc-hero-in">
          <span className="doc-hero-eyebrow"><Icon className="doc-hero-eyebrow-icon" aria-hidden="true" /> {guide.name}</span>
          <h1 className="doc-hero-title">{guide.hero}</h1>
          <p className="doc-hero-sub">{guide.tagline}</p>
          <button className="doc-hero-search" onClick={onOpenSearch} aria-label="ابحث">
            <Search className="doc-hero-search-icon" aria-hidden="true" />
            <span className="doc-hero-search-text">ابحث عن سؤال أو موضوع…</span>
            <kbd className="doc-kbd">Ctrl K</kbd>
          </button>
        </div>
      </section>

      <div className="doc-container">
        {popular.length > 0 && (
          <section className="doc-section">
            <h2 className="doc-section-title">الأكثر بحثاً</h2>
            <div className="doc-popular">
              {popular.map((a) => (
                <Link key={a.slug} to={`${basePath}/${encodeURIComponent(a.slug)}`} className="doc-popular-chip">
                  <span>{a.title}</span>
                  <ChevronLeft className="doc-popular-arrow" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section className="doc-section">
            <h2 className="doc-section-title"><Clock className="doc-inline-icon" aria-hidden="true" /> شوهدت مؤخراً</h2>
            <div className="doc-recent">
              {recent.map((r) => (
                <Link key={r.slug} to={`${basePath}/${encodeURIComponent(r.slug)}`} className="doc-recent-item">
                  <span className="doc-recent-title">{r.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="doc-section">
          <h2 className="doc-section-title doc-articles-title">كل المقالات <span className="doc-count-pill">{sections.length}</span></h2>
          <div className="doc-article-list">
            {sections.map((s, i) => (
              <Link key={s.slug} to={`${basePath}/${encodeURIComponent(s.slug)}`} className="doc-article-row">
                <span className="doc-article-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="doc-article-main">
                  <span className="doc-article-title">{s.title}</span>
                  <span className="doc-article-desc">{preview(s)}</span>
                </span>
                <ChevronLeft className="doc-article-arrow" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
