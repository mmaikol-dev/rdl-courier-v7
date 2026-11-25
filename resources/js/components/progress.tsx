"use client";

import * as React from "react";
import { NumberRoll } from "./number-roll";
import { TextMorph } from "./text-morph";
import { EASE_OUT, useInteractionReducedMotion } from "./ui-interaction-motion";

/* ─────────────────────────────────────────────────────────
 * PROGRESS: how far along, as a bar or a ring
 *
 *   advance   the fill eases to each new value (it never jumps a
 *             step) and the percent rolls the way it moved
 *   unknown   without a value, a short segment sweeps along
 *   done      at 100 the fill turns green, a check draws itself
 *             and the label morphs to `doneLabel`
 *   error     the fill turns red where it stopped
 * ───────────────────────────────────────────────────────── */

export interface ProgressProps {
  /** 0–100; leave it out for "working, no idea how long". */
  value?: number | null;
  /** Shown above a bar, beside the percent. */
  label?: string;
  /** Replaces the label at 100. */
  doneLabel?: string;
  error?: boolean;
  showValue?: boolean;
  variant?: "bar" | "ring";
  /** Ring size in px. */
  size?: number;
  className?: string;
}

function Check({ on, reduced }: { on: boolean; reduced: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        style={{ strokeDashoffset: on ? 0 : 1, transition: reduced ? "none" : `stroke-dashoffset 360ms ${EASE_OUT} 160ms` }}
      />
    </svg>
  );
}

export function Progress({ value, label, doneLabel = "Done", error, showValue = true, variant = "bar", size = 44, className = "" }: ProgressProps) {
  const reduced = useInteractionReducedMotion();
  const known = value !== undefined && value !== null;
  const v = known ? Math.max(0, Math.min(100, value)) : 0;
  const done = known && v >= 100 && !error;
  const tone = error ? "bg-red-500" : done ? "bg-emerald-500" : "bg-primary";
  const text = error ? "text-red-600 dark:text-red-400" : done ? "text-emerald-600 dark:text-emerald-400" : "text-foreground";
  const aria = {
    role: "progressbar" as const,
    "aria-label": label ?? "Progress",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": known ? Math.round(v) : undefined,
    "aria-busy": !done || undefined,
  };

  if (variant === "ring") {
    const r = 15;
    return (
      <span {...aria} className={`relative inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }}>
        <svg viewBox="0 0 36 36" className={`absolute inset-0 size-full -rotate-90 ${known ? "" : "animate-spin [animation-duration:1.1s]"}`} aria-hidden="true">
          <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            className={`${error ? "stroke-red-500" : done ? "stroke-emerald-500" : "stroke-primary"} transition-[stroke] duration-300`}
            style={{ strokeDashoffset: known ? 100 - v : 72, transition: reduced ? "none" : `stroke-dashoffset 600ms ${EASE_OUT}, stroke 300ms` }}
          />
        </svg>
        <span className={`relative flex items-center justify-center text-[11px] font-medium tabular-nums ${text}`}>
          {done ? <Check on reduced={reduced} /> : known && showValue ? <NumberRoll value={Math.round(v)} suffix="%" /> : null}
        </span>
      </span>
    );
  }

  return (
    <div className={`flex w-full flex-col gap-2 ${className}`}>
      {(label || showValue) && (
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className={`flex items-center gap-1.5 font-medium transition-colors duration-300 ${done ? text : "text-foreground"}`}>
            <span className="grid" style={{ gridTemplateColumns: done ? "1fr" : "0fr", transition: reduced ? "none" : `grid-template-columns 320ms ${EASE_OUT}` }}>
              <span className="min-w-0 overflow-hidden">
                <Check on={done} reduced={reduced} />
              </span>
            </span>
            {label && <TextMorph>{done ? doneLabel : label}</TextMorph>}
          </span>
          {showValue && known && (
            <span className="tabular-nums text-muted-foreground">
              <NumberRoll value={Math.round(v)} suffix="%" />
            </span>
          )}
        </div>
      )}
      <div {...aria} className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {known ? (
          <div
            className={`absolute inset-0 origin-left rounded-full transition-colors duration-300 ${tone}`}
            style={{ transform: `scaleX(${v / 100})`, transition: reduced ? "none" : `transform 600ms ${EASE_OUT}, background-color 300ms` }}
          />
        ) : (
          <div className={`absolute inset-y-0 left-0 w-[30%] rounded-full ${tone} [animation:ui-indeterminate_1.3s_cubic-bezier(0.65,0,0.35,1)_infinite] motion-reduce:[animation-duration:3s]`} />
        )}
      </div>
    </div>
  );
}

export default Progress;
