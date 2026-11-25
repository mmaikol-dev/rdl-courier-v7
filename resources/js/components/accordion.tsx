"use client";

import * as React from "react";
import { EASE_OUT, INTERACTION_FOCUS, useInteractionReducedMotion } from "./ui-interaction-motion";

/* ─────────────────────────────────────────────────────────
 * ACCORDION: sections that open in place
 *
 *   open     the section's height eases open (0fr → 1fr) while its
 *            content rises out of a blur a beat later; the chevron
 *            turns over in the same motion
 *   single   opening one folds the open one at the same time, so
 *            the page below barely moves
 *   keys     ↑/↓ move between headers, Home/End jump; Enter and
 *            Space open
 *
 * For FAQ sections on landing pages there is faq-accordion; this
 * is the plain one for settings, filters and details.
 * ───────────────────────────────────────────────────────── */

export interface AccordionItem {
  value: string;
  title: React.ReactNode;
  /** A second line under the title. */
  subtitle?: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** One open at a time, or any number. */
  type?: "single" | "multiple";
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Hairline rows, or each section as its own card. */
  variant?: "rows" | "cards";
  className?: string;
}

/** The fold every disclosure in the library uses: height by grid rows, content through a blur. */
export function Fold({ open, children, reduced, id, labelledBy }: { open: boolean; children: React.ReactNode; reduced: boolean; id?: string; labelledBy?: string }) {
  return (
    <div
      id={id}
      role={labelledBy ? "region" : undefined}
      aria-labelledby={labelledBy}
      inert={!open || undefined}
      className="grid"
      style={{ gridTemplateRows: open ? "1fr" : "0fr", transition: reduced ? "none" : `grid-template-rows 420ms ${EASE_OUT}` }}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          style={{
            opacity: open ? 1 : 0,
            filter: open || reduced ? "blur(0px)" : "blur(4px)",
            translate: open || reduced ? "0 0" : "0 -6px",
            transition: reduced ? "none" : open ? `opacity 300ms ${EASE_OUT} 90ms, filter 300ms ${EASE_OUT} 90ms, translate 420ms ${EASE_OUT}` : `opacity 160ms ${EASE_OUT}, filter 160ms ${EASE_OUT}, translate 260ms ${EASE_OUT}`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function Chevron({ open, reduced }: { open: boolean; reduced: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="size-3.5 shrink-0 text-muted-foreground"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: reduced ? "none" : `transform 420ms ${EASE_OUT}` }}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Accordion({ items, type = "single", value, defaultValue = [], onValueChange, variant = "rows", className = "" }: AccordionProps) {
  const reduced = useInteractionReducedMotion();
  const baseId = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [own, setOwn] = React.useState(defaultValue);
  const open = value ?? own;
  const cards = variant === "cards";

  const toggle = (v: string) => {
    const next = open.includes(v) ? open.filter((x) => x !== v) : type === "single" ? [v] : [...open, v];
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const heads = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-accordion-head]:not(:disabled)") ?? []);
    const i = heads.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === "ArrowDown") next = (i + 1) % heads.length;
    else if (e.key === "ArrowUp") next = (i - 1 + heads.length) % heads.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = heads.length - 1;
    if (next < 0) return;
    e.preventDefault();
    heads[next].focus();
  };

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} className={`flex w-full flex-col ${cards ? "gap-2" : "divide-y divide-border border-y border-border"} ${className}`}>
      {items.map((item) => {
        const on = open.includes(item.value);
        const head = `${baseId}-h-${item.value}`;
        const panel = `${baseId}-p-${item.value}`;
        return (
          <div key={item.value} className={cards ? `rounded-[16px] bg-card shadow-[inset_0_0_0_1px_var(--border)] transition-colors duration-300 ${on ? "" : "hover:bg-accent/40"}` : ""}>
            <h3 className="m-0">
              <button
                type="button"
                id={head}
                data-accordion-head=""
                aria-expanded={on}
                aria-controls={panel}
                disabled={item.disabled}
                onClick={() => toggle(item.value)}
                className={`flex w-full items-center gap-3 text-left cursor-pointer disabled:cursor-default disabled:opacity-40 ${cards ? "rounded-[16px] px-4 py-3.5" : "py-3.5"} ${INTERACTION_FOCUS} focus-visible:ring-offset-0`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-medium text-foreground">{item.title}</span>
                  {item.subtitle && <span className="text-[12.5px] text-muted-foreground">{item.subtitle}</span>}
                </span>
                <Chevron open={on} reduced={reduced} />
              </button>
            </h3>
            <Fold open={on} reduced={reduced} id={panel} labelledBy={head}>
              <div className={`text-[13.5px] leading-relaxed text-muted-foreground ${cards ? "px-4 pb-4" : "pb-4"}`}>{item.content}</div>
            </Fold>
          </div>
        );
      })}
    </div>
  );
}

export default Accordion;
