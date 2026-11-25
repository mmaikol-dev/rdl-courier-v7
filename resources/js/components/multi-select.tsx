"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Field, useFieldIds } from "./field";
import { enterStyle, themeVars, useDismiss, useFloating, usePresence } from "./floating";
import { NumberRoll } from "./number-roll";
import { TextMorph } from "./text-morph";
import { EASE_OUT, INTERACTION_FOCUS, INTERACTION_PRESS, useInteractionReducedMotion } from "./ui-interaction-motion";

/* ─────────────────────────────────────────────────────────
 * MULTI-SELECT: several choices from a short list
 *
 *   pill     says what's chosen in words ("Design, Sales"); past
 *            two it keeps the first and a "+3" that rolls as the
 *            count moves; the words morph as you tick
 *   list     rises off the pill; each row's tick draws itself, the
 *            highlight glides between rows, and the list stays open
 *            while you pick several
 *   find     past seven options a filter field sits on top and
 *            narrows the rows as you type
 *   bulk     Select all / Clear, and a count that rolls
 *
 * For long or remote lists that you search first, use combobox.
 * ───────────────────────────────────────────────────────── */

export interface MultiOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  options: MultiOption[];
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Shown above; also the accessible name. */
  label: string;
  hideLabel?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  placeholder?: string;
  /** Show the filter field (defaults to more than seven options). */
  searchable?: boolean;
  /** How many labels the pill names before "+N". */
  maxShown?: number;
  id?: string;
  disabled?: boolean;
  className?: string;
}

function Tick({ on, reduced }: { on: boolean; reduced: boolean }) {
  return (
    <span
      className={`relative flex size-4 shrink-0 items-center justify-center rounded-[5px] transition-[background-color,box-shadow] duration-200 ${on ? "bg-primary text-primary-foreground" : "bg-background shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_22%,var(--border))]"}`}
    >
      <svg viewBox="0 0 16 16" fill="none" className="size-3">
        <path
          d="M3.5 8.5 6.5 11.5 12.5 4.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          style={{ strokeDashoffset: on ? 0 : 1, transition: reduced ? "none" : `stroke-dashoffset ${on ? 260 : 120}ms ${EASE_OUT}` }}
        />
      </svg>
    </span>
  );
}

export function MultiSelect({
  options,
  value,
  defaultValue = [],
  onValueChange,
  label,
  hideLabel,
  hint,
  error,
  placeholder = "Choose",
  searchable,
  maxShown = 2,
  id,
  disabled,
  className = "",
}: MultiSelectProps) {
  const reduced = useInteractionReducedMotion();
  const ids = useFieldIds(id);
  const listId = React.useId();
  const [own, setOwn] = React.useState(defaultValue);
  const chosen = value ?? own;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState<string | null>(null);
  const [mark, setMark] = React.useState<{ y: number; h: number } | null>(null);
  const anchor = React.useRef<HTMLDivElement>(null);
  const surface = React.useRef<HTMLDivElement>(null);
  const list = React.useRef<HTMLDivElement>(null);
  const { mounted, shown } = usePresence(open, 180);
  const place = useFloating({ open: mounted, anchor, floating: surface, side: "bottom", align: "start", offset: 6 });
  const [vars, setVars] = React.useState<React.CSSProperties>({});
  const [width, setWidth] = React.useState(240);
  const find = searchable ?? options.length > 7;

  const visible = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));
  const pickable = visible.filter((o) => !o.disabled);

  const commit = (next: string[]) => {
    // Keep the options' own order, whatever order they were ticked in.
    const ordered = options.map((o) => o.value).filter((v) => next.includes(v));
    if (value === undefined) setOwn(ordered);
    onValueChange?.(ordered);
  };
  const flip = (v: string) => commit(chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v]);

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (refocus) document.getElementById(ids.id)?.focus();
  };
  useDismiss(open, (reason) => close(reason === "escape"), [anchor, surface]);

  React.useLayoutEffect(() => {
    if (!mounted) return;
    setVars(themeVars(anchor.current));
    setWidth(Math.max(240, anchor.current?.offsetWidth ?? 0));
  }, [mounted]);

  React.useEffect(() => {
    if (!open || !shown) return;
    (find ? surface.current?.querySelector<HTMLElement>("input") : list.current)?.focus({ preventScroll: true });
  }, [open, shown, find]);

  React.useLayoutEffect(() => {
    const l = list.current;
    if (!l) return;
    const measure = () => {
      const el = active ? l.querySelector<HTMLElement>(`[data-option="${CSS.escape(active)}"]`) : null;
      setMark((p) => (el ? (p && p.y === el.offsetTop && p.h === el.offsetHeight ? p : { y: el.offsetTop, h: el.offsetHeight }) : null));
      el?.scrollIntoView({ block: "nearest" });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(l);
    return () => ro.disconnect();
  }, [active, query, mounted]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = pickable.findIndex((o) => o.value === active);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = pickable[e.key === "ArrowDown" ? (i + 1) % pickable.length : (i - 1 + pickable.length) % pickable.length];
      if (next) setActive(next.value);
    } else if ((e.key === "Enter" || (e.key === " " && !find)) && i >= 0) {
      e.preventDefault();
      flip(pickable[i].value);
    } else if (e.key === "Tab") close(false);
  };

  const names = options.filter((o) => chosen.includes(o.value)).map((o) => o.label);
  const extra = Math.max(0, names.length - maxShown);
  const summary = names.slice(0, maxShown).join(", ");
  const allOn = pickable.length > 0 && pickable.every((o) => chosen.includes(o.value));

  return (
    <Field id={ids.id} label={hideLabel ? undefined : label} hint={hint} error={error} className={className}>
      <div ref={anchor}>
        <button
          id={ids.id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={`${label}: ${names.length ? names.join(", ") : "none chosen"}`}
          onClick={() => (open ? close(false) : (setActive(null), setOpen(true)))}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(pickable[0]?.value ?? null);
              setOpen(true);
            }
          }}
          className={`flex h-9 w-full items-center gap-2 rounded-full bg-background pl-4 pr-3 text-left text-[13.5px] cursor-pointer shadow-[inset_0_0_0_1px_var(--border)] transition-[box-shadow,background-color] duration-200 hover:bg-accent/40 disabled:cursor-default disabled:opacity-50 ${
            error ? "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-red-500)_55%,transparent)]" : open ? "shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklab,var(--ring)_16%,transparent)]" : ""
          } ${INTERACTION_FOCUS}`}
        >
          <span className={`min-w-0 flex-1 truncate ${names.length ? "text-foreground" : "text-muted-foreground/70"}`}>
            <TextMorph>{names.length ? summary : placeholder}</TextMorph>
          </span>
          <span
            className="grid shrink-0"
            style={{ gridTemplateColumns: extra ? "1fr" : "0fr", opacity: extra ? 1 : 0, transition: reduced ? "none" : `grid-template-columns 320ms ${EASE_OUT}, opacity 200ms ${EASE_OUT}` }}
          >
            <span className="min-w-0 overflow-hidden">
              <span className="block rounded-full bg-muted px-1.5 text-[11.5px] font-medium tabular-nums text-muted-foreground">
                +<NumberRoll value={Math.max(1, extra)} />
              </span>
            </span>
          </span>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" style={{ transform: open ? "rotate(180deg)" : "none", transition: reduced ? "none" : `transform 380ms ${EASE_OUT}` }}>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {mounted &&
        createPortal(
          <div
            ref={surface}
            data-hairline-floating=""
            onKeyDown={onKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto fixed left-0 top-0 z-[55] flex max-h-[min(360px,70dvh)] flex-col overflow-hidden rounded-[16px] bg-popover text-popover-foreground shadow-[0_0_0_1px_var(--border)]"
            style={{ ...vars, width, left: place.x, top: place.y, transformOrigin: place.origin, ...enterStyle(shown, place.side, reduced) }}
          >
            {find && (
              <div className="border-b border-border p-1.5">
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(null);
                  }}
                  placeholder="Filter"
                  aria-label={`Filter ${label}`}
                  aria-controls={listId}
                  className="h-8 w-full rounded-full bg-muted/60 px-3 text-[16px] outline-none sm:text-[13px] placeholder:text-muted-foreground/70"
                />
              </div>
            )}
            <div
              ref={list}
              id={listId}
              role="listbox"
              aria-multiselectable="true"
              aria-label={label}
              aria-activedescendant={active ? `${listId}-${active}` : undefined}
              tabIndex={find ? -1 : 0}
              onPointerLeave={() => setActive(null)}
              className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 outline-none"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-1 top-0 rounded-[10px] bg-accent"
                style={{ transform: `translateY(${mark?.y ?? 0}px)`, height: mark?.h ?? 0, opacity: mark ? 1 : 0, transition: reduced ? "opacity 120ms" : `transform 220ms ${EASE_OUT}, height 220ms ${EASE_OUT}, opacity 160ms ${EASE_OUT}` }}
              />
              {visible.map((o) => {
                const on = chosen.includes(o.value);
                return (
                  <div
                    key={o.value}
                    id={`${listId}-${o.value}`}
                    data-option={o.value}
                    role="option"
                    aria-selected={on}
                    aria-disabled={o.disabled || undefined}
                    onPointerMove={() => !o.disabled && active !== o.value && setActive(o.value)}
                    onClick={() => !o.disabled && flip(o.value)}
                    className={`relative flex min-h-8 select-none items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[13px] ${o.disabled ? "cursor-default opacity-40" : "cursor-pointer"}`}
                  >
                    <Tick on={on} reduced={reduced} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-foreground">{o.label}</span>
                      {o.description && <span className="truncate text-[12px] text-muted-foreground">{o.description}</span>}
                    </span>
                  </div>
                );
              })}
              {!visible.length && <p className="px-2.5 py-3 text-[13px] text-muted-foreground">Nothing matches “{query}”.</p>}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-1.5 py-1.5">
              <span className="pl-2 text-[12px] tabular-nums text-muted-foreground" aria-live="polite">
                <NumberRoll value={chosen.length} /> selected
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => commit(allOn ? chosen.filter((v) => !pickable.some((o) => o.value === v)) : [...new Set([...chosen, ...pickable.map((o) => o.value)])])}
                  className={`h-7 rounded-full px-2.5 text-[12.5px] font-medium text-foreground cursor-pointer hover:bg-accent ${INTERACTION_PRESS} ${INTERACTION_FOCUS}`}
                >
                  <TextMorph>{allOn ? "Select none" : "Select all"}</TextMorph>
                </button>
                <button
                  type="button"
                  onClick={() => close(true)}
                  className={`h-7 rounded-full bg-primary px-3 text-[12.5px] font-medium text-primary-foreground cursor-pointer hover:bg-primary/90 ${INTERACTION_PRESS} ${INTERACTION_FOCUS}`}
                >
                  Done
                </button>
              </span>
            </div>
          </div>,
          document.body,
        )}
    </Field>
  );
}

export default MultiSelect;
