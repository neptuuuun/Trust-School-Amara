import React from 'react';

/**
 * Lightweight dependency-free SVG chart for owner trends.
 * Renders a bar series (e.g. active students per month) with an optional line
 * series on a 0–100 scale (e.g. retention %). RTL-friendly: months read L→R as a
 * timeline regardless of page dir.
 *
 * Props:
 *   data: [{ label, bar, line }]   line is a 0–100 percentage (nullable)
 *   barColor, lineColor: CSS color strings
 *   height: px (default 220)
 */
export default function TrendChart({ data = [], barColor = '#2563eb', lineColor = '#f59e0b', height = 220 }) {
  if (!data.length) return null;

  const W = Math.max(320, data.length * 70);
  const H = height;
  const padX = 36, padTop = 16, padBottom = 36;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const maxBar = Math.max(1, ...data.map((d) => Number(d.bar) || 0));
  const stepX = innerW / data.length;
  const barW = Math.min(40, stepX * 0.5);

  const x = (i) => padX + stepX * i + stepX / 2;
  const yBar = (v) => padTop + innerH - (Math.max(0, v) / maxBar) * innerH;
  const yLine = (pct) => padTop + innerH - (Math.min(100, Math.max(0, pct)) / 100) * innerH;

  const linePts = data
    .map((d, i) => (d.line == null ? null : `${x(i)},${yLine(d.line)}`))
    .filter(Boolean)
    .join(' ');

  return (
    <div className="overflow-x-auto" dir="ltr">
      <svg width={W} height={H} role="img" aria-label="مخطط الاتجاه">
        {/* baseline */}
        <line x1={padX} y1={padTop + innerH} x2={W - padX} y2={padTop + innerH} stroke="#e5e7eb" />
        {/* bars */}
        {data.map((d, i) => {
          const v = Number(d.bar) || 0;
          return (
            <g key={i}>
              <rect x={x(i) - barW / 2} y={yBar(v)} width={barW} height={padTop + innerH - yBar(v)} rx="3" fill={barColor} opacity="0.85" />
              <text x={x(i)} y={yBar(v) - 4} textAnchor="middle" fontSize="10" fill="#374151">{v}</text>
              <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="10" fill="#6b7280">{d.label}</text>
            </g>
          );
        })}
        {/* retention line + points */}
        {linePts && <polyline points={linePts} fill="none" stroke={lineColor} strokeWidth="2" />}
        {data.map((d, i) => (d.line == null ? null : (
          <circle key={`p${i}`} cx={x(i)} cy={yLine(d.line)} r="3" fill={lineColor} />
        )))}
      </svg>
    </div>
  );
}
