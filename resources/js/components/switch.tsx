// Hairline UI · switch · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

"use client";

import * as React from "react";
import { EASE_OUT, EASE_THROW, INTERACTION_FOCUS, interactionIcon, useInteractionReducedMotion } from "./ui-interaction-motion";

/* ─────────────────────────────────────────────────────────
 * SWITCH: on and off, with weight
 *
 *   press    the thumb stretches toward the side it will go
 *   flip     it's thrown across with a slight overshoot while the
 *            track fills; the fill and thumb move as one
 *   async    if onCheckedChange returns a promise, the switch
 *            flips at once and the thumb spins until it settles;
 *            a rejection throws it back and shakes the track
 * ───────────────────────────────────────────────────────── */

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> {
  checked?: boolean;
  defaultChecked?: boolean;
  /** Return a promise to show the pending thumb; throw to put it back. */
  onCheckedChange?: (checked: boolean) => void | Promise<unknown>;
  label?: React.ReactNode;
  description?: React.ReactNode;
  /** 16px or 20px tall. */
  size?: "sm" | "md";
  /** Put the label before the switch (settings rows). */
  labelPosition?: "start" | "end";
  ref?: React.Ref<HTMLButtonElement>;
}

const SIZES = { sm: { w: 28, h: 16, pad: 2 }, md: { w: 36, h: 20, pad: 2 } };

export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  size = "md",
  labelPosition = "end",
  disabled,
  className = "",
  id,
  ref,
  ...props
}: SwitchProps) {
  const reduced = useInteractionReducedMotion();
  const auto = React.useId();
  const switchId = id ?? auto;
  const track = React.useRef<HTMLSpanElement>(null);
  const [own, setOwn] = React.useState(defaultChecked);
  const [optimistic, setOptimistic] = React.useState<boolean | null>(null);
  const [pressed, setPressed] = React.useState(false);
  const on = optimistic ?? (checked !== undefined ? checked : own);
  const pending = optimistic !== null;
  const s = SIZES[size];
  const thumb = s.h - s.pad * 2;
  const travel = s.w - thumb - s.pad * 2;
  const stretch = pressed && !reduced ? 4 : 0;

  const toggle = () => {
    if (disabled || pending) return;
    const next = !on;
    const result = onCheckedChange?.(next);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setOptimistic(next);
      (result as Promise<unknown>).then(
        () => {
          if (checked === undefined) setOwn(next);
          setOptimistic(null);
        },
        () => {
          setOptimistic(null);
          if (!reduced) track.current?.animate([{ transform: "none" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "none" }], { duration: 320, easing: "ease-out" });
        },
      );
    } else if (checked === undefined) setOwn(next);
  };

  const control = (
    <button
      ref={ref}
      id={switchId}
      type="button"
      role="switch"
      aria-checked={on}
      aria-busy={pending || undefined}
      disabled={disabled}
      onClick={toggle}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onBlur={() => setPressed(false)}
      className={`relative inline-flex shrink-0 rounded-full cursor-pointer disabled:cursor-default disabled:opacity-50 ${INTERACTION_FOCUS}`}
      style={{ width: s.w, height: s.h }}
      {...props}
    >
      <span ref={track} className="absolute inset-0 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--foreground)_12%,var(--muted))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent)]">
        <span
          className="absolute inset-0 rounded-full bg-primary"
          style={{ opacity: on ? 1 : 0, transition: reduced ? "none" : `opacity 260ms ${EASE_OUT}` }}
        />
      </span>
      <span
        className="absolute rounded-full bg-background shadow-[0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent)]"
        style={{
          top: s.pad,
          left: s.pad,
          height: thumb,
          width: thumb + stretch,
          // Stretching toward where it's going: grow from the far edge when on.
          transform: `translateX(${on ? travel - stretch : 0}px)`,
          transition: reduced ? "none" : `transform 420ms ${EASE_THROW}, width 260ms ${EASE_OUT}`,
        }}
      >
        <span className="absolute inset-0 flex items-center justify-center text-primary" style={interactionIcon(pending, reduced)}>
          <span className={`size-[60%] rounded-full border-[1.5px] border-current border-t-transparent ${pending ? "animate-spin" : ""}`} />
        </span>
      </span>
    </button>
  );

  if (!label && !description) return <span className={className}>{control}</span>;

  return (
    <div className={`flex items-start gap-3 ${labelPosition === "start" ? "flex-row-reverse justify-between" : ""} ${className}`}>
      <span className="mt-0.5">{control}</span>
      <label htmlFor={switchId} className={`flex min-w-0 flex-col gap-0.5 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
        {label && <span className="text-[13.5px] font-medium leading-5 text-foreground">{label}</span>}
        {description && <span className="text-[12.5px] leading-snug text-muted-foreground">{description}</span>}
      </label>
    </div>
  );
}

export default Switch;
