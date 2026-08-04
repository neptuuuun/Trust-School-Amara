import React, { useState } from 'react';
import {
  BookOpen, ShieldCheck, GraduationCap, Lock, ScrollText, FileText, Users, Sparkles, ChevronDown,
} from 'lucide-react';

const ICONS = { BookOpen, ShieldCheck, GraduationCap, Lock, ScrollText, FileText, Users, Sparkles };
export const iconFor = (name) => ICONS[name] || FileText;

export function FaqAccordion({ items }) {
  const [open, setOpen] = useState(() => new Set());
  return (
    <div className="doc-faq">
      {items.map((it, idx) => {
        const isOpen = open.has(idx);
        return (
          <div key={idx} className={`doc-faq-item ${isOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen((s) => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}
              className="doc-faq-q"
            >
              <span>{it.q}</span>
              <ChevronDown className="doc-faq-chev" aria-hidden="true" />
            </button>
            {isOpen && <div className="doc-faq-a doc-prose" dangerouslySetInnerHTML={{ __html: it.aHtml }} />}
          </div>
        );
      })}
    </div>
  );
}
