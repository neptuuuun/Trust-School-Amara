import React, { useState } from 'react';
import { Megaphone, ChevronDown, ChevronUp } from 'lucide-react';
import { useAnnouncements } from '../../hooks/useAnnouncements';
import AnnouncementCard from './AnnouncementCard';

const INITIAL_VISIBLE = 2;

/**
 * Renders branch announcements targeted at a specific page.
 * Renders nothing at all when there are no announcements — no blank space.
 */
const PageAnnouncements = ({ page }) => {
  const { announcements, loading } = useAnnouncements(page);
  const [expanded, setExpanded] = useState(false);

  // Render nothing during load or when empty
  if (loading || announcements.length === 0) return null;

  const visible = expanded ? announcements : announcements.slice(0, INITIAL_VISIBLE);
  const hiddenCount = announcements.length - INITIAL_VISIBLE;

  return (
    <div className="mb-8" dir="rtl">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
          <Megaphone className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-base font-bold text-gray-800">إعلانات وتحديثات</h2>
        <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
          {announcements.length}
        </span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visible.map((a) => (
          <AnnouncementCard key={a.id} announcement={a} />
        ))}
      </div>

      {/* Show more / less */}
      {hiddenCount > 0 && (
        <div className="text-center mt-4">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                عرض أقل
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                عرض {hiddenCount} إعلان{hiddenCount > 1 ? 'ات' : ''} أخر{hiddenCount > 1 ? 'ى' : ''}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default PageAnnouncements;
