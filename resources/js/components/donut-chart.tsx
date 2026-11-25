"use client";

import * as React from "react";
import { NumberRoll } from "./number-roll";
import { TextMorph } from "./text-morph";

/* ─────────────────────────────────────────────────────────
 * DONUT CHART: parts of a whole as a ring or a half-ring gauge
 *
 *   arrive    the first time it's on screen each slice draws
 *             round from where it starts, one after another,
 *             and the total rolls up from zero
 *   point     point at a slice (or its legend row) and it
 *             thickens while the others step back; the centre's
 *             label morphs to the slice's name and the figure
 *             rolls from the total to its value, with its share
 *             opening underneath
 *   toggle    a legend row hides or shows its slice: the others
 *             slide round to close the gap and every share and
 *             the total roll to the new sums
 *   data      new numbers (another month) slide every slice to
 *             its new place instead of redrawing
 *   max       given a max, the slices fill only their share of
 *             it and the rest of the track stays empty: budget
 *             spent, storage used
 *
 * Each slice is one circle's stroke: its length and where it
 * starts are stroke-dasharray and stroke-dashoffset, so a CSS
 * transition carries every change. The legend is the accessible
 * part (buttons that show and hide slices); the ring is drawn
 * for the eye only.
 * ───────────────────────────────────────────────────────── */

export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  /** Any CSS colour; slices without one take --chart-1 to --chart-5 in order. */
  color?: string;
}

export interface DonutChartProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  data: DonutSlice[];
  /** A full ring, or a half-ring gauge read from left to right. */
  variant?: "donut" | "gauge";
  /** What a full ring stands for. With it the slices fill only their share and the rest of the track stays empty. */
  max?: number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Beside the title, e.g. a period switch. */
  action?: React.ReactNode;
  /** Above the figure in the centre while nothing is pointed at. */
  centerLabel?: string;
  format?: Intl.NumberFormatOptions;
  locales?: string | string[];
  /** Ring thickness in px, at the ring's full size. */
  thickness?: number;
  /** Ids of the slices taken out, controlled or not. */
  hiddenSlices?: string[];
  defaultHiddenSlices?: string[];
  onHiddenSlicesChange?: (hidden: string[]) => void;
  /** Show the legend (which also shows and hides slices). */
  legend?: boolean;
}

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const PALETTE = ["var(--chart-1, var(--primary))", "var(--chart-2, #e8743b)", "var(--chart-3, #1baf7a)", "var(--chart-4, #8b6fe8)", "var(--chart-5, #e0a21b)"];
const NONE: string[] = [];
const SIZE = 200;
/** How much a pointed-at slice thickens, in px; the ring leaves room for it. */
const GROW = 5;
/** The gap between two slices, in px along the ring. */
const GAP = 3.5;

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);
const subscribeNothing = () => () => {};
/** Text in the visitor's locale waits for hydration, so the server's en-US render and the first client render match. */
const useHydrated = () => React.useSyncExternalStore(subscribeNothing, () => true, () => false);

/** Past the fifth slice, colours repeat a step darker so neighbours never match. */
const colorOf = (slice: DonutSlice, i: number) =>
  slice.color ?? (i < PALETTE.length ? PALETTE[i] : `color-mix(in oklab, ${PALETTE[i % PALETTE.length]} 70%, var(--foreground))`);

export function DonutChart({
  data,
  variant = "donut",
  max,
  title,
  description,
  action,
  centerLabel = "Total",
  format,
  locales,
  thickness = 16,
  hiddenSlices,
  defaultHiddenSlices = NONE,
  onHiddenSlicesChange,
  legend = true,
  className = "",
  ...props
}: DonutChartProps) {
  const reduced = useReducedMotion();
  const gauge = variant === "gauge";
  const [ownHidden, setOwnHidden] = React.useState(defaultHiddenSlices);
  const off = hiddenSlices ?? ownHidden;
  const [active, setActive] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState(false);
  const [settled, setSettled] = React.useState(false);
  const hydrated = useHydrated();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const ringRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Slices draw in one after another the first time only; after that every change moves them together.
  React.useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setSettled(true), 900 + data.length * 90);
    return () => window.clearTimeout(timer);
  }, [visible, data.length]);

  // A tap on a slice holds it; a tap anywhere else lets go.
  React.useEffect(() => {
    if (active === null) return;
    const onDown = (e: PointerEvent) => {
      if (!ringRef.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active]);

  const toggle = (id: string) => {
    const shown = data.filter((s) => !off.includes(s.id)).length;
    const next = off.includes(id) ? off.filter((x) => x !== id) : shown > 1 ? [...off, id] : off;
    if (next === off) return;
    if (hiddenSlices === undefined) setOwnHidden(next);
    onHiddenSlicesChange?.(next);
  };

  // Geometry: one circle, the slices laid along its stroke.
  const stroke = thickness;
  const r = SIZE / 2 - (stroke + GROW) / 2 - 1;
  const circumference = 2 * Math.PI * r;
  const span = gauge ? circumference / 2 : circumference;
  const height = gauge ? SIZE / 2 + (stroke + GROW) / 2 + 1 : SIZE;
  const centre = SIZE / 2;

  const slices = data.map((s, i) => ({ ...s, color: colorOf(s, i), shown: !off.includes(s.id), amount: Math.max(0, s.value) }));
  const total = slices.reduce((sum, s) => sum + (s.shown ? s.amount : 0), 0);
  const fill = max && max > 0 ? Math.min(1, total / max) : 1;
  const shownCount = slices.filter((s) => s.shown && s.amount > 0).length;
  const whole = !gauge && fill >= 1 && shownCount === 1;

  const shares = slices.map((s) => (s.shown && total > 0 ? s.amount / total : 0));
  const starts: number[] = [];
  for (let i = 0, run = 0; i < shares.length; i++) {
    starts.push(run);
    run += shares[i] * fill * span;
  }
  const arcs = slices.map((s, i) => {
    const share = shares[i];
    const length = share * fill * span;
    const start = starts[i];
    // Round caps reach past each end by half the stroke: shorten the dash so the gaps stay GAP wide.
    const drawn = whole && share > 0 ? circumference : Math.max(0, length - GAP - stroke);
    const at = whole ? 0 : start + (GAP + stroke) / 2 + (length > 0 && length < GAP + stroke ? (length - GAP - stroke) / 2 : 0);
    return { ...s, share, drawn: visible ? drawn : 0, at, on: visible && share > 0, delay: settled ? 0 : i * 90 };
  });

  const current = arcs.find((a) => a.id === active && a.shown) ?? null;
  const fmt = (n: number) => new Intl.NumberFormat(hydrated ? locales : (locales ?? "en-US"), format).format(n);
  const trackLength = gauge ? span - stroke : circumference;
  const turn = gauge ? 180 : -90;
  const transitionFor = (delay: number) =>
    reduced ? "none" : `stroke-dasharray 900ms ${EASE} ${delay}ms, stroke-dashoffset 900ms ${EASE} ${delay}ms, stroke-width 320ms ${EASE}, opacity 300ms ${EASE}`;
  const point = (id: string | null) => setActive(id);

  const figureSize = gauge ? "text-[26px] @md:text-[30px]" : "text-[24px] @md:text-[28px]";

  return (
    <div ref={rootRef} className={`w-full rounded-[22px] bg-background shadow-[0_0_0_1px_var(--border)] ${className}`} {...props}>
      {/* Its natural width where the parent sizes to its content (a centred flex column), without forcing it on narrow screens. */}
      <div aria-hidden="true" data-natural-width className="grid h-0" style={{ gridTemplateColumns: "minmax(0, 520px)" }} />
      <div className="@container w-full">
      <div className="p-4 @md:p-5">
        {(title || description || action) && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {title && <p className="text-[13.5px] font-medium text-foreground @md:text-[14px]">{title}</p>}
              {description && <p className="mt-0.5 text-[12px] text-muted-foreground @md:text-[12.5px]">{description}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        )}

        <div className={`flex flex-col items-center gap-4 ${legend && !gauge ? "@lg:flex-row @lg:items-center @lg:gap-6" : ""}`}>
          <div ref={ringRef} className={`relative shrink-0 ${gauge ? "w-[220px] @md:w-[236px]" : "w-[176px] @md:w-[196px]"}`} onPointerLeave={(e) => e.pointerType === "mouse" && point(null)}>
            <svg viewBox={`0 0 ${SIZE} ${height}`} className="block w-full overflow-visible" aria-hidden="true">
              <circle
                cx={centre}
                cy={centre}
                r={r}
                fill="none"
                stroke="color-mix(in oklab, var(--foreground) 7%, transparent)"
                strokeWidth={stroke}
                strokeLinecap={gauge ? "round" : "butt"}
                strokeDasharray={`${trackLength} ${circumference}`}
                strokeDashoffset={gauge ? -stroke / 2 : 0}
                transform={`rotate(${turn} ${centre} ${centre})`}
              />
              {arcs.map((a) => {
                const dim = current !== null && current.id !== a.id;
                const common = {
                  cx: centre,
                  cy: centre,
                  r,
                  fill: "none",
                  strokeLinecap: "round" as const,
                  strokeDasharray: `${a.drawn} ${circumference}`,
                  strokeDashoffset: -a.at,
                  transform: `rotate(${turn} ${centre} ${centre})`,
                };
                return (
                  <g key={a.id}>
                    <circle
                      {...common}
                      stroke={a.color}
                      strokeWidth={current?.id === a.id ? stroke + GROW : stroke}
                      style={{ opacity: a.on ? (dim ? 0.3 : 1) : 0, transition: transitionFor(a.delay) }}
                    />
                    {/* A wider, invisible copy takes the pointer, so thin slices are easy to hit. */}
                    <circle
                      {...common}
                      stroke="transparent"
                      strokeWidth={stroke + 14}
                      pointerEvents={a.on ? "stroke" : "none"}
                      className="cursor-pointer"
                      onPointerEnter={(e) => e.pointerType === "mouse" && point(a.id)}
                      onClick={() => point(active === a.id ? null : a.id)}
                    />
                  </g>
                );
              })}
            </svg>

            {/* The centre: the total, or the slice being pointed at. */}
            <div className={`pointer-events-none absolute inset-x-0 flex flex-col items-center text-center ${gauge ? "bottom-0" : "inset-y-0 justify-center"}`}>
              <span className="max-w-[70%] truncate text-[11.5px] text-muted-foreground @md:text-[12px]">
                <TextMorph>{total === 0 ? "No data" : current ? current.label : centerLabel}</TextMorph>
              </span>
              <span className={`font-semibold leading-tight tracking-[-0.03em] text-foreground tabular-nums ${figureSize}`}>
                <NumberRoll value={visible ? (current ? current.amount : total) : 0} format={format} locales={locales} duration={900} />
              </span>
              <span
                className="grid text-[11.5px] text-muted-foreground tabular-nums transition-[grid-template-rows,opacity] duration-300 @md:text-[12px]"
                style={{ gridTemplateRows: current || max ? "1fr" : "0fr", opacity: current || max ? 1 : 0, transitionTimingFunction: EASE }}
              >
                <span className="min-h-0 overflow-hidden">
                  {current ? (
                    <NumberRoll value={current.share} format={{ style: "percent" }} duration={700} />
                  ) : max ? (
                    <>
                      of <NumberRoll value={max} format={format} locales={locales} duration={900} />
                    </>
                  ) : (
                    " "
                  )}
                </span>
              </span>
            </div>
          </div>

          {legend && (
            <ul className="w-full min-w-0 flex-1" aria-label="Slices">
              {arcs.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    aria-pressed={a.shown}
                    aria-label={`${a.label}: ${fmt(a.amount)}${a.shown ? `, ${Math.round(a.share * 100)}%` : ", hidden"}`}
                    onClick={() => toggle(a.id)}
                    onPointerEnter={(e) => e.pointerType === "mouse" && point(a.id)}
                    onPointerLeave={(e) => e.pointerType === "mouse" && point(null)}
                    onFocus={() => point(a.id)}
                    onBlur={() => point(null)}
                    className={`flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2 text-left text-[12.5px] transition-[background-color,opacity] duration-200 hover:bg-accent @md:text-[13px] ${FOCUS}`}
                    style={{ opacity: a.shown ? (current && current.id !== a.id ? 0.55 : 1) : 0.45 }}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full transition-[background-color,box-shadow] duration-300"
                      style={{ background: a.shown ? a.color : "transparent", boxShadow: `inset 0 0 0 1.5px ${a.color}` }}
                    />
                    <span className={`min-w-0 flex-1 truncate ${a.shown ? "text-foreground" : "text-muted-foreground line-through decoration-muted-foreground/60"}`}>{a.label}</span>
                    <span className="tabular-nums text-foreground">
                      <NumberRoll value={visible ? a.amount : 0} format={format} locales={locales} duration={900} />
                    </span>
                    <span className="w-10 text-right text-[11.5px] tabular-nums text-muted-foreground @md:text-[12px]">
                      <NumberRoll value={visible ? a.share : 0} format={{ style: "percent" }} duration={900} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
