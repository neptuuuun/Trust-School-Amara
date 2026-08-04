import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Home, ChevronLeft, ChevronRight, List, X, Hash } from 'lucide-react';
import { useHelp } from './DocsData';
import { iconFor, FaqAccordion } from './ui';
import DocsProse from './DocsProse';
import { pushRecent } from './recent';

export default function DocsArticlePage() {
  const { articleSlug } = useParams();
  const { guide, status, basePath } = useHelp();
  const [navOpen, setNavOpen] = useState(false);
  const [activeSub, setActiveSub] = useState(null);

  const slug = decodeURIComponent(articleSlug || '');
  const sections = guide?.doc?.sections || [];
  const idx = sections.findIndex((s) => s.slug === slug);
  const article = idx > -1 ? sections[idx] : null;

  useEffect(() => {
    if (guide && article) pushRecent(guide.id, { slug: article.slug, title: article.title });
  }, [guide, article]);

  useEffect(() => {
    if (!article || !(article.subs && article.subs.length)) return;
    const onScroll = () => {
      let cur = null;
      article.subs.forEach((sub) => {
        const el = document.getElementById(sub.id);
        if (el && el.getBoundingClientRect().top <= 130) cur = sub.id;
      });
      setActiveSub(cur);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [article]);

  if (status === 'error') return <div className="doc-container doc-loading">تعذّر تحميل المحتوى.</div>;
  if (status === 'ready' && guide && !article) return <Navigate to={basePath} replace />;
  if (!guide || !article) return <div className="doc-container doc-loading">جارٍ التحميل…</div>;

  const Icon = iconFor(guide.icon);
  const prev = sections[idx - 1];
  const next = sections[idx + 1];
  const related = [1, 2, 3]
    .map((o) => sections[(idx + o) % sections.length])
    .filter((s) => s && s.slug !== article.slug)
    .slice(0, 3);
  const hasToc = (article.subs ? article.subs.length : 0) >= 2;

  const scrollToSub = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.history.replaceState(null, '', `#${id}`); }
  };

  const SidebarNav = (
    <nav className="doc-sidenav" aria-label={`مقالات ${guide.name}`}>
      <div className="doc-sidenav-head">
        <Link to={basePath} className="doc-sidenav-guide"><Icon className="doc-sidenav-guide-icon" aria-hidden="true" /> {guide.title}</Link>
        <button className="doc-sidenav-close" onClick={() => setNavOpen(false)} aria-label="إغلاق"><X aria-hidden="true" /></button>
      </div>
      <ol className="doc-sidenav-list">
        {sections.map((s, i) => (
          <li key={s.slug}>
            <Link
              to={`${basePath}/${encodeURIComponent(s.slug)}`}
              onClick={() => setNavOpen(false)}
              className={`doc-sidenav-link ${s.slug === article.slug ? 'is-active' : ''}`}
              aria-current={s.slug === article.slug ? 'page' : undefined}
            >
              <span className="doc-sidenav-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="doc-sidenav-text">{s.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );

  return (
    <div className={`doc-article-shell ${hasToc ? '' : 'no-toc'}`}>
      <aside className="doc-aside doc-aside-nav">{SidebarNav}</aside>
      {navOpen && <div className="doc-drawer-overlay" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <aside className={`doc-drawer ${navOpen ? 'is-open' : ''}`}>{SidebarNav}</aside>

      <article className="doc-article">
        <nav className="doc-breadcrumb" aria-label="مسار التنقل">
          <Link to={basePath}><Home className="doc-bc-icon" aria-hidden="true" /> {guide.name}</Link>
          <ChevronLeft className="doc-bc-sep" aria-hidden="true" />
          <span className="doc-bc-current">{article.title}</span>
        </nav>

        <div className="doc-article-topbar">
          <button className="doc-nav-toggle" onClick={() => setNavOpen(true)}><List className="doc-nav-toggle-icon" aria-hidden="true" /> كل المقالات</button>
        </div>

        <header className="doc-article-head">
          <span className="doc-article-kicker"><Icon className="doc-article-kicker-icon" aria-hidden="true" /> {guide.title}</span>
          <h1 className="doc-article-h1">{article.title}</h1>
        </header>

        {article.faq ? <FaqAccordion items={article.faq} /> : <DocsProse html={article.html} />}

        <div className="doc-prevnext">
          {prev ? (
            <Link to={`${basePath}/${encodeURIComponent(prev.slug)}`} className="doc-pn doc-pn-prev">
              <ChevronRight className="doc-pn-icon" aria-hidden="true" />
              <span className="doc-pn-body"><span className="doc-pn-label">المقالة السابقة</span><span className="doc-pn-title">{prev.title}</span></span>
            </Link>
          ) : <span className="doc-pn-spacer" />}
          {next ? (
            <Link to={`${basePath}/${encodeURIComponent(next.slug)}`} className="doc-pn doc-pn-next">
              <span className="doc-pn-body"><span className="doc-pn-label">المقالة التالية</span><span className="doc-pn-title">{next.title}</span></span>
              <ChevronLeft className="doc-pn-icon" aria-hidden="true" />
            </Link>
          ) : <span className="doc-pn-spacer" />}
        </div>

        {related.length > 0 && (
          <section className="doc-related">
            <h2 className="doc-related-title">مقالات ذات صلة</h2>
            <div className="doc-related-grid">
              {related.map((r) => (
                <Link key={r.slug} to={`${basePath}/${encodeURIComponent(r.slug)}`} className="doc-related-card">
                  <span>{r.title}</span>
                  <ChevronLeft className="doc-related-arrow" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>

      {hasToc && (
        <aside className="doc-aside doc-aside-toc">
          <div className="doc-toc">
            <p className="doc-toc-head"><Hash className="doc-toc-icon" aria-hidden="true" /> في هذه المقالة</p>
            <ul>
              {article.subs.map((sub) => (
                <li key={sub.id}>
                  <a href={`#${sub.id}`} onClick={(e) => scrollToSub(e, sub.id)} className={activeSub === sub.id ? 'is-active' : ''}>{sub.title}</a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
}
