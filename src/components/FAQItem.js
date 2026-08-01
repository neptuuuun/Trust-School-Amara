import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * FAQItem — a single expand/collapse question on the public «اتصل بنا» page.
 *
 * Content is owner-authored (CMS-driven from Firestore), so the answer must
 * render at any length — the expand uses a CSS grid-rows transition (0fr → 1fr)
 * instead of a fixed max-height, which never truncates long answers.
 */
const FAQItem = ({ question, answer }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md" dir="rtl">
            <button
                type="button"
                onClick={() => setIsOpen((o) => !o)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-right"
            >
                <span className="font-semibold text-gray-900">{question}</span>
                <ChevronDown
                    className={`h-5 w-5 flex-shrink-0 text-primary transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                />
            </button>
            {/* grid-rows trick: animates smoothly to the content's natural height */}
            <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                    <p className="px-5 pb-4 leading-relaxed text-gray-600">{answer}</p>
                </div>
            </div>
        </div>
    );
};

export default FAQItem;
