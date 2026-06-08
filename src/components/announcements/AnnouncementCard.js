import React from 'react';
import { Pin, ExternalLink, Clock, Users } from 'lucide-react';
import { ANNOUNCEMENT_STYLES, ANNOUNCEMENT_CATEGORIES } from '../../services/announcementService';

const AnnouncementCard = ({ announcement }) => {
  const s = ANNOUNCEMENT_STYLES[announcement.style] || ANNOUNCEMENT_STYLES.info;
  const category = ANNOUNCEMENT_CATEGORIES[announcement.category];
  const isUrgent = announcement.style === 'urgent';

  const formatExpiry = (expiresAt) => {
    if (!expiresAt) return null;
    const date = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    const diffDays = Math.ceil((date - new Date()) / 864e5);
    if (diffDays <= 0) return null;
    if (diffDays === 1) return 'ينتهي غداً';
    if (diffDays <= 7) return `ينتهي خلال ${diffDays} أيام`;
    return null;
  };

  const expiryLabel = formatExpiry(announcement.expiresAt);

  return (
    <div
      dir="rtl"
      className="relative bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 transition-shadow hover:shadow-md"
      style={{ borderRight: `4px solid ${s.accent}` }}
    >
      {/* Urgent animated stripe */}
      {isUrgent && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5 animate-pulse"
          style={{ background: s.accent }}
        />
      )}

      <div className="p-5">
        {/* Top row: badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {announcement.isPinned && (
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${s.accent}18`, color: s.accent }}
            >
              <Pin className="w-3 h-3" />
              مثبت
            </span>
          )}
          {isUrgent && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block" />
              عاجل
            </span>
          )}
          {category && (
            <span
              className="text-xs font-medium px-2.5 py-0.5 rounded-full"
              style={{ background: `${s.accent}15`, color: s.darkText }}
            >
              {category.label}
            </span>
          )}
          {expiryLabel && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {expiryLabel}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-bold text-gray-900 text-base leading-snug mb-1">
          {announcement.emoji && (
            <span className="ml-1.5" role="img" aria-hidden>{announcement.emoji}</span>
          )}
          {announcement.title}
        </h3>

        {/* Body */}
        {announcement.body && (
          <p className="text-sm text-gray-600 leading-relaxed mb-3">
            {announcement.body}
          </p>
        )}

        {/* Target year / group chips */}
        {(announcement.targetYear || announcement.targetGroup) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {announcement.targetYear && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-200">
                <Users className="w-3 h-3" />
                {announcement.targetYear}
              </span>
            )}
            {announcement.targetGroup && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-200">
                <Users className="w-3 h-3" />
                {announcement.targetGroup}
              </span>
            )}
          </div>
        )}

        {/* CTA button */}
        {announcement.ctaLabel && announcement.ctaLink && (
          <a
            href={announcement.ctaLink}
            target={announcement.ctaLink.startsWith('http') ? '_blank' : '_self'}
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-85"
            style={{ background: s.accent }}
          >
            {announcement.ctaLabel}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
};

export default AnnouncementCard;
