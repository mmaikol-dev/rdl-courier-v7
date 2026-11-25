"use client";

import * as React from "react";
import { durationShort, wallAt } from "./time-range-parse";

/* ─────────────────────────────────────────────────────────
 * TIME BRUSH: drag across any chart to pick the time under it
 *
 *   drag     a band follows the pointer from where you pressed,
 *            with its start, end and length written on it
 *   release  the band's span is passed to onSelect (zoom in),
 *            and the band fades as the chart redraws
 *   cancel   Escape, or a drag too short to mean anything
 *
 * Wrap a chart whose x axis runs from `start` to `end`. Nothing
 * re-renders while you drag: the band is moved directly.
 * ───────────────────────────────────────────────────────── */

export interface TimeBrushProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  /** The time at the chart's left edge. */
  start: Date;
  /** The time at its right edge. */
  end: Date;
  onSelect: (range: { start: Date; end: Date }) => void;
  /** The shortest span worth selecting, in ms. */
  minSpan?: number;
  /** Rounds a time to the nearest edge the chart can show (a day boundary on a daily chart). The band snaps to it while you drag. */
  snap?: (time: number) => number;
  /** How the band writes its edges; hours and minutes by default. `edge` says which end, so a daily chart can name the last day it covers. */
  formatTime?: (time: Date, edge: "start" | "end") => string;
  timeZone?: string;
  disabled?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function TimeBrush({ start, end, onSelect, minSpan = 60_000, snap, formatTime, timeZone, disabled = false, className = "", children, ...props }: TimeBrushProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const bandRef = React.useRef<HTMLDivElement>(null);
  const fillRef = React.useRef<HTMLSpanElement>(null);
  const leftRef = React.useRef<HTMLSpanElement>(null);
  const rightRef = React.useRef<HTMLSpanElement>(null);
  const tagRef = React.useRef<HTMLSpanElement>(null);
  const drag = React.useRef<{ x0: number; id: number; left: number; width: number; from: number; to: number } | null>(null);

  const timeAt = (x: number, width: number) => start.getTime() + (Math.min(Math.max(x, 0), width) / width) * (end.getTime() - start.getTime());
  const xAt = (t: number, width: number) => Math.min(Math.max(((t - start.getTime()) / (end.getTime() - start.getTime())) * width, 0), width);
  const label = (t: number, edge: "start" | "end") => {
    if (formatTime) return formatTime(new Date(t), edge);
    const w = wallAt(t, timeZone);
    return `${pad(w.hour)}:${pad(w.minute)}`;
  };

  const paint = (a: number, b: number, width: number) => {
    const band = bandRef.current;
    const tag = tagRef.current;
    const d = drag.current;
    if (!band || !tag || !d) return;
    let left = Math.max(0, Math.min(a, b));
    let right = Math.min(width, Math.max(a, b));
    d.from = timeAt(left, width);
    d.to = timeAt(right, width);
    if (snap) {
      // The band jumps from edge to edge the chart can show, so what it covers is what you get.
      d.from = Math.max(start.getTime(), snap(d.from));
      d.to = Math.min(end.getTime(), snap(d.to));
      left = xAt(d.from, width);
      right = xAt(d.to, width);
    }
    // Transforms only: a 1px fill scaled to the span, and two hairline edges moved into place.
    fillRef.current!.style.transform = `translateX(${left}px) scaleX(${right - left})`;
    leftRef.current!.style.transform = `translateX(${left}px)`;
    rightRef.current!.style.transform = `translateX(${right - 1}px)`;
    band.style.opacity = right - left > 2 ? "1" : "0";
    band.style.transition = "none";
    tag.textContent = `${label(d.from, "start")} – ${label(d.to, "end")} · ${durationShort(Math.max(60_000, d.to - d.from))}`;
    // The tag stays on the chart even when the band is near an edge.
    const tw = tag.offsetWidth;
    tag.style.transform = `translateX(${Math.min(Math.max(left + (right - left) / 2 - tw / 2, 0), width - tw)}px)`;
  };

  const finish = (commit: boolean) => {
    const d = drag.current;
    const band = bandRef.current;
    drag.current = null;
    if (band) {
      band.style.transition = "opacity 360ms cubic-bezier(0.16,1,0.3,1)";
      band.style.opacity = "0";
    }
    if (d && commit && d.to - d.from >= minSpan) onSelect({ start: new Date(d.from), end: new Date(d.to) });
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drag.current) finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      ref={rootRef}
      className={`relative select-none ${disabled ? "" : "cursor-crosshair"} ${className}`}
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        const r = e.currentTarget.getBoundingClientRect();
        drag.current = { x0: e.clientX - r.left, id: e.pointerId, left: r.left, width: r.width, from: 0, to: 0 };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.id) return;
        const x = e.clientX - d.left;
        if (Math.abs(x - d.x0) > 3 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
        paint(d.x0, x, d.width);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.id) return;
        finish(Math.abs(e.clientX - d.left - d.x0) > 6);
      }}
      onPointerCancel={() => finish(false)}
      {...props}
    >
      {children}
      <div ref={bandRef} aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0">
        <span ref={fillRef} className="absolute inset-y-0 left-0 w-px origin-left bg-primary/[0.09] will-change-transform" />
        <span ref={leftRef} className="absolute inset-y-0 left-0 w-px bg-primary/70 will-change-transform" />
        <span ref={rightRef} className="absolute inset-y-0 left-0 w-px bg-primary/70 will-change-transform" />
        <span ref={tagRef} className="absolute -top-6 left-0 whitespace-nowrap rounded-full bg-background px-2 py-0.5 font-mono text-[10.5px] tabular-nums text-foreground shadow-[inset_0_0_0_1px_var(--border)] will-change-transform" />
      </div>
    </div>
  );
}
