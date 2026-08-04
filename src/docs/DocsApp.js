/**
 * HelpSite — one standalone, self-contained help center for a single guide.
 *
 * Mounted three times (student / admin / owner) at independent URLs. Each mount
 * knows ONLY its own guide: its own landing, search, navigation, theme and
 * browser title. There is no role switcher and no link to any other center.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { Search, ArrowLeft } from 'lucide-react';
import LogoImage from '../assets/images/logo.png';
import { HelpProvider, useHelp } from './DocsData';
import { getGuide } from './registry';
import SearchModal from './SearchModal';
import DocsLanding from './DocsLanding';
import DocsArticlePage from './DocsArticlePage';
import './docs.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

function Topbar({ meta, basePath, onOpenSearch }) {
  return (
    <header className="doc-topbar">
      <div className="doc-topbar-in">
        <Link to={basePath} className="doc-brand" aria-label={`${meta.name} — Trust School Amara`}>
          <img src={LogoImage} alt="" className="doc-brand-logo" />
          <span className="doc-brand-text">
            <span className="doc-brand-name">Trust School Amara</span>
            <span className="doc-brand-sub">{meta.name}</span>
          </span>
        </Link>

        <button type="button" className="doc-search-trigger" onClick={onOpenSearch} aria-label="بحث">
          <Search className="doc-search-trigger-icon" aria-hidden="true" />
          <span className="doc-search-trigger-text">ابحث في {meta.name}…</span>
          <kbd className="doc-kbd doc-kbd-shortcut">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>

        <Link to="/home" className="doc-topbar-back">
          <ArrowLeft className="doc-topbar-back-icon" aria-hidden="true" />
          <span>العودة إلى الموقع</span>
        </Link>
      </div>
    </header>
  );
}

function HelpFooter({ meta, basePath }) {
  return (
    <footer className="doc-footer">
      <div className="doc-footer-in">
        <div className="doc-footer-brand">
          <img src={LogoImage} alt="" className="doc-footer-logo" />
          <span>Trust School Amara — {meta.name}</span>
        </div>
        <nav className="doc-footer-links" aria-label="روابط">
          <Link to={basePath}>الرئيسية</Link>
          <Link to="/home">موقع Trust School Amara</Link>
          <Link to="/contact">اتصل بنا</Link>
        </nav>
        <p className="doc-footer-copy">© Trust School Amara — جميع الحقوق محفوظة.</p>
      </div>
    </footer>
  );
}

function HelpNotFound({ basePath }) {
  const navigate = useNavigate();
  return (
    <div className="doc-container doc-empty">
      <h1>الصفحة غير موجودة</h1>
      <p>تعذّر العثور على ما تبحث عنه.</p>
      <button className="doc-btn" onClick={() => navigate(basePath)}>العودة إلى الصفحة الرئيسية</button>
    </div>
  );
}

function HelpShell({ guideId }) {
  const meta = getGuide(guideId);
  const { basePath } = useHelp();
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);

  useEffect(() => {
    document.title = `${meta ? meta.name : 'مركز المساعدة'} — Trust School Amara`;
  }, [meta]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!meta) return <div className="doc-root" dir="rtl"><div className="doc-container doc-empty"><h1>غير متاح</h1></div></div>;

  return (
    <div className={`doc-root doc-theme-${meta.theme}`} dir="rtl">
      <Topbar meta={meta} basePath={basePath} onOpenSearch={openSearch} />
      <main className="doc-main">
        <Routes>
          <Route index element={<DocsLanding onOpenSearch={openSearch} />} />
          <Route path=":articleSlug" element={<DocsArticlePage />} />
          <Route path="*" element={<HelpNotFound basePath={basePath} />} />
        </Routes>
      </main>
      <HelpFooter meta={meta} basePath={basePath} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export default function HelpSite({ guideId }) {
  return (
    <HelpProvider guideId={guideId}>
      <HelpShell guideId={guideId} />
    </HelpProvider>
  );
}
