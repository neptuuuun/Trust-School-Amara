import React from 'react';
import { Info } from 'lucide-react';

/**
 * SectionIntro — the contextual-help banner shown at the top of every Website
 * Management tab. Explains, in plain language for a non-technical owner, WHAT the
 * section controls and WHERE it appears on the public website.
 *
 * Props:
 *   title    — what this section is
 *   children — a short explanation (what it controls + where it shows)
 */
const SectionIntro = ({ title, children }) => (
  <div className="flex items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3.5">
    <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Info className="h-4.5 w-4.5" />
    </span>
    <div className="text-sm leading-relaxed text-primary-900/80">
      {title && <p className="mb-0.5 font-semibold text-primary-900">{title}</p>}
      <p>{children}</p>
    </div>
  </div>
);

export default SectionIntro;
