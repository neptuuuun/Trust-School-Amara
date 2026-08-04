/**
 * DocsProse — renders an article's HTML and makes it "interactive":
 *   • inline route tokens (`/admin/users`) become links into the app,
 *   • curated page names (دروس الدعم، الملف الشخصي، …) are linked on first mention,
 *   • in-article #anchor links smooth-scroll to their heading.
 * Content is authored in-repo (trusted) so innerHTML is safe.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { linkifyRouteCode, PHRASE_LINKS } from './appLinks';

export default function DocsProse({ html }) {
  const ref = useRef(null);
  const navigate = useNavigate();
  const processed = useMemo(() => linkifyRouteCode(html), [html]);

  // Link the first mention of each curated page name (DOM-safe: skips links,
  // code and headings so we never break existing markup).
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const linked = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || p.closest('a, code, h1, h2, h3, h4')) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) {
      for (const { text, route } of PHRASE_LINKS) {
        if (linked.has(route)) continue;
        const idx = node.nodeValue.indexOf(text);
        if (idx < 0) continue;
        linked.add(route);
        const after = node.splitText(idx);
        after.nodeValue = after.nodeValue.slice(text.length);
        const a = document.createElement('a');
        a.className = 'doc-applink';
        a.setAttribute('data-route', route);
        a.setAttribute('href', route);
        a.textContent = text;
        node.parentNode.insertBefore(a, after);
        break;
      }
    }
  }, [processed]);

  const onClick = (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const route = a.getAttribute('data-route');
    if (route) { e.preventDefault(); navigate(route); return; }
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      const el = document.getElementById(id) || document.getElementsByName(id)[0];
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.history.replaceState(null, '', `#${id}`); }
    }
  };

  return <div ref={ref} className="doc-prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: processed }} />;
}
