"use client";

import * as React from "react";
import { NumberRoll } from "./number-roll";
import { TextMorph } from "./text-morph";
import { EASE_OUT, useInteractionReducedMotion } from "./ui-interaction-motion";

/* ─────────────────────────────────────────────────────────
 * BADGE: a status, a tag or a count
 *
 *   status   "Pending" → "Paid": the colours ease across and the
 *            word morphs, letters both share staying put
 *   live     a dot that breathes a ring outward (for "Live",
 *            "Building"); it rests when nothing is happening
 *   count    numbers roll the way they changed and cap at 99+;
 *            a count that drops to zero folds away
 * ───────────────────────────────────────────────────────── */

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger";

export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  children?: string;
  tone?: BadgeTone;
  /** Hairline only, no fill. */
  outline?: boolean;
  /** A dot before the text; `pulse` makes it breathe. */
  dot?: boolean | "pulse";
  /** A number instead of text: rolls, caps at `max`, folds away at 0 unless `showZero`. */
  count?: number;
  max?: number;
  showZero?: boolean;
  icon?: React.ReactNode;
  /** 20px or 24px tall. */
  size?: "sm" | "md";
}

const FILL: Record<BadgeTone, string> = {
  neutral: "bg-muted text-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/14 text-amber-700 dark:text-amber-400",
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
};
const LINE: Record<BadgeTone, string> = {
  neutral: "text-foreground shadow-[inset_0_0_0_1px_var(--border)]",
  primary: "text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_40%,transparent)]",
  success: "text-emerald-700 dark:text-emerald-400 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-emerald-500)_40%,transparent)]",
  warning: "text-amber-700 dark:text-amber-400 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-amber-500)_45%,transparent)]",
  danger: "text-red-600 dark:text-red-400 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-red-500)_40%,transparent)]",
};
const DOT: Record<BadgeTone, string> = { neutral: "bg-muted-foreground", primary: "bg-primary", success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-red-500" };

export function Badge({ children, tone = "neutral", outline, dot, count, max = 99, showZero, icon, size = "md", className = "", ...props }: BadgeProps) {
  const reduced = useInteractionReducedMotion();
  const isCount = count !== undefined;
  const hidden = isCount && count <= 0 && !showZero;
  const sm = size === "sm";

  const badge = (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-medium tabular-nums transition-[background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] [&_svg]:size-3 ${
        sm ? "h-5 gap-1 px-1.5 text-[11px]" : "h-6 gap-1.5 px-2 text-[12px]"
      } ${isCount ? (sm ? "min-w-5 justify-center" : "min-w-6 justify-center") : ""} ${outline ? LINE[tone] : FILL[tone]} ${className}`}
      {...props}
    >
      {dot && (
        <span className="relative flex size-1.5 shrink-0">
          {dot === "pulse" && !reduced && <span className={`absolute inset-0 rounded-full ${DOT[tone]} [animation:ui-ping_1.6s_cubic-bezier(0,0,0.2,1)_infinite]`} />}
          <span className={`relative size-1.5 rounded-full transition-colors duration-300 ${DOT[tone]}`} />
        </span>
      )}
      {icon}
      {isCount ? (
        count > max ? (
          <span>
            <NumberRoll value={max} />+
          </span>
        ) : (
          <NumberRoll value={Math.max(0, count)} />
        )
      ) : (
        children && <TextMorph>{children}</TextMorph>
      )}
    </span>
  );

  if (!isCount) return badge;
  // A count folds away at zero instead of blinking out.
  return (
    <span
      className="inline-grid"
      aria-hidden={hidden || undefined}
      style={{
        gridTemplateColumns: hidden ? "0fr" : "1fr",
        opacity: hidden ? 0 : 1,
        scale: hidden && !reduced ? "0.6" : "1",
        transition: reduced ? "none" : `grid-template-columns 320ms ${EASE_OUT}, opacity 200ms ${EASE_OUT}, scale 320ms ${EASE_OUT}`,
      }}
    >
      <span className="min-w-0 overflow-hidden">{badge}</span>
    </span>
  );
}

export default Badge;
