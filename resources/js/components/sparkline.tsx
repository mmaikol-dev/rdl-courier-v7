"use client";

import * as React from "react";

/* ─────────────────────────────────────────────────────────
 * SPARKLINE: an ultra-compact inline trendline with scrubber
 *
 *   path       smooth or linear SVG stroke with an optional
 *              subtle gradient fill that fades to transparent
 *   scrubber   pointer movement magnetically tracks the nearest
 *              point, showing a vertical hairline indicator,
 *              a snapped dot, and a micro-tooltip readout
 *   auto-trend colors dynamically: emerald for positive change,
 *              rose for negative, or follows your primary token
 *   table-safe zero layout shift, designed to fit inside a single
 *              data-table cell, stat strip, or card header
 * ───────────────────────────────────────────────────────── */

export type SparklinePoint = number | { value: number; date?: string; label?: string };

export interface SparklineProps extends React.HTMLAttributes<HTMLDivElement> {
  data: SparklinePoint[];
  width?: number | string;
  height?: number;
  /** Stroke color mode: "auto" (green if up, red if down), "primary", or custom class. */
  color?: "auto" | "primary" | "muted" | string;
  /** Render style: line only or with gradient area fill. */
  variant?: "line" | "area" | "bars";
  /** Shows the interactive magnetic scrubber and micro-tooltip on hover. */
  showScrubber?: boolean;
  /** Highlights the latest (last) data point with a persistent dot when not hovering. */
  showLastPoint?: boolean;
  /** Stroke line width. Defaults to 1.35px hairline. */
  strokeWidth?: number;
  /** Value format for tooltip. */
  format?: Intl.NumberFormatOptions;
  prefix?: string;
  suffix?: string;
  /** Custom accessible label for screen readers. */
  label?: string;
}

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

function parsePoint(p: SparklinePoint): { val: number; date?: string; label?: string } {
  if (typeof p === "number") return { val: p };
  return { val: p.value, date: p.date, label: p.label };
}

export function Sparkline({
  data,
  width = "100%",
  height = 32,
  color = "auto",
  variant = "area",
  showScrubber = true,
  showLastPoint = true,
  strokeWidth = 1.35,
  format,
  prefix,
  suffix,
  label = "Metric trend",
  className = "",
  style,
  ...rest
}: SparklineProps) {
  const uid = React.useId();
  const gradId = `spark-grad-${uid.replace(/:/g, "")}`;
  const reduced = useReducedMotion();
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const [containerWidth, setContainerWidth] = React.useState<number>(100);

  // Parse points
  const points = React.useMemo(() => data.map(parsePoint), [data]);
  const values = React.useMemo(() => points.map((p) => p.val), [points]);

  // Track container width via ResizeObserver
  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(w);
      }
    });
    ro.observe(el);
    setContainerWidth(el.offsetWidth || 100);
    return () => ro.disconnect();
  }, []);

  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 1;
  const range = maxVal - minVal || 1;

  // Compute trend color
  const isPositive = values.length >= 2 ? values[values.length - 1] >= values[0] : true;
  const colorClass = React.useMemo(() => {
    if (color === "auto") {
      return isPositive
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400";
    }
    if (color === "primary") return "text-primary";
    if (color === "muted") return "text-muted-foreground";
    return color;
  }, [color, isPositive]);

  // Coordinates
  const padY = 4;
  const usableH = Math.max(1, height - padY * 2);
  const n = points.length;

  const coords = React.useMemo(() => {
    if (n === 0) return [];
    if (n === 1) return [{ x: containerWidth / 2, y: height / 2 }];

    return points.map((p, i) => {
      const x = (i / (n - 1)) * containerWidth;
      const normalizedY = (p.val - minVal) / range;
      const y = height - padY - normalizedY * usableH;
      return { x, y };
    });
  }, [containerWidth, height, minVal, n, padY, points, range, usableH]);

  // Build SVG path strings
  const { linePath, areaPath } = React.useMemo(() => {
    if (coords.length < 2) return { linePath: "", areaPath: "" };

    // Smooth bezier curve generator
    let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[Math.max(0, i - 1)];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[Math.min(coords.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    const last = coords[coords.length - 1];
    const first = coords[0];
    const area = `${d} L ${last.x.toFixed(1)} ${height} L ${first.x.toFixed(1)} ${height} Z`;

    return { linePath: d, areaPath: area };
  }, [coords, height]);

  // Pointer interactions for magnetic scrubber
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!showScrubber || n < 2 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, relX / rect.width));
    const nearestIdx = Math.round(ratio * (n - 1));
    setHoverIndex(nearestIdx);
  };

  const handlePointerLeave = () => {
    setHoverIndex(null);
  };

  const activeIdx = hoverIndex;
  const activeCoord = activeIdx !== null && coords[activeIdx] ? coords[activeIdx] : null;
  const activePoint = activeIdx !== null && points[activeIdx] ? points[activeIdx] : null;
  const lastCoord = coords.length ? coords[coords.length - 1] : null;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      onPointerDown={handlePointerMove}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`relative inline-flex items-center overflow-visible select-none touch-pan-y ${colorClass} ${className}`}
      style={{
        width,
        height,
        ...style,
      }}
      {...rest}
    >
      <svg
        width={containerWidth}
        height={height}
        className="overflow-visible"
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Variant Area Fill */}
        {variant === "area" && areaPath && (
          <path
            d={areaPath}
            fill={`url(#${gradId})`}
            className="transition-opacity duration-300"
          />
        )}

        {/* Variant Bars */}
        {variant === "bars" && (
          <g>
            {coords.map((c, i) => {
              const barW = Math.max(2, Math.min(8, (containerWidth / n) * 0.55));
              const barH = height - c.y;
              const isHovered = activeIdx === i;
              return (
                <rect
                  key={i}
                  x={c.x - barW / 2}
                  y={c.y}
                  width={barW}
                  height={Math.max(2, barH)}
                  rx={1.5}
                  fill="currentColor"
                  opacity={isHovered ? 1 : 0.45}
                  className="transition-[opacity,height] duration-200"
                />
              );
            })}
          </g>
        )}

        {/* Stroke Line */}
        {variant !== "bars" && linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transition: reduced ? "none" : "d 300ms cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        )}

        {/* Persistent Last Point dot */}
        {showLastPoint && lastCoord && activeIdx === null && variant !== "bars" && (
          <circle
            cx={lastCoord.x}
            cy={lastCoord.y}
            r={2.25}
            fill="currentColor"
            className="transition-transform duration-200"
          />
        )}

        {/* Scrubber Vertical Line & Snapped Dot */}
        {activeCoord && showScrubber && (
          <g className="transition-opacity duration-150">
            {/* 1px Vertical Guide Hairline */}
            <line
              x1={activeCoord.x}
              y1={0}
              x2={activeCoord.x}
              y2={height}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="2 2"
            />

            {/* Glowing Scrubber Dot */}
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r={3.25}
              fill="var(--background)"
              stroke="currentColor"
              strokeWidth={1.75}
            />
          </g>
        )}
      </svg>

      {/* Floating Micro-Tooltip */}
      {activeCoord && activePoint && showScrubber && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-8 z-30 flex -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-md border border-border bg-popover px-1.5 py-0.5 text-popover-foreground shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-none animate-in fade-in-0 zoom-in-95 duration-100"
          style={{
            left: `${activeCoord.x}px`,
          }}
        >
          <div className="flex items-center gap-1 font-mono text-[11px] font-medium leading-none">
            {prefix && <span>{prefix}</span>}
            <span>{format ? activePoint.val.toLocaleString(undefined, format) : activePoint.val.toLocaleString()}</span>
            {suffix && <span>{suffix}</span>}
          </div>
          {activePoint.date && (
            <span className="mt-0.5 text-[9.5px] text-muted-foreground leading-none">
              {activePoint.date}
            </span>
          )}
        </div>
      )}

      {/* Screen reader summary */}
      <span className="sr-only">
        {label}: start {values[0] ?? 0}, end {values[values.length - 1] ?? 0}, {isPositive ? "upward trend" : "downward trend"}.
      </span>
    </div>
  );
}
