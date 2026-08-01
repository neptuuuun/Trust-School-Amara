import React from 'react';

/**
 * TikTokIcon — lucide-compatible TikTok brand glyph.
 *
 * lucide-react (and the currently installed version) ships no TikTok brand icon,
 * and react-icons is not a dependency. This inline SVG mirrors the lucide icon
 * API (24×24 viewBox, `currentColor`, forwards `className`/props) so it drops
 * straight into the same `SOCIAL_ICONS` map as `Facebook`/`Instagram`.
 */
const TikTokIcon = ({ className, ...props }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M16.5 3a5.6 5.6 0 0 0 4.5 4.5v3a8.6 8.6 0 0 1-4.5-1.28v6.03a6.25 6.25 0 1 1-6.25-6.25c.34 0 .67.03 1 .08v3.1a3.2 3.2 0 1 0 2.25 3.06V3h3z" />
  </svg>
);

export default TikTokIcon;
