"use client";

import * as React from "react";
import { NumberRoll } from "./number-roll";
import { TextMorph } from "./text-morph";

/* ─────────────────────────────────────────────────────────
 * SHARE BAR: parts of a whole as one bar that opens into a list
 *
 *   arrive    the segments grow out from the left edge in turn and
 *             the total rolls up
 *   point     point at a segment and the rest dim; the total becomes
 *             that part's figure and the line under it its name and
 *             share
 *   open      press the bar (or Breakdown) and the stack comes apart:
 *             each segment drops out of the bar and slides left into
 *             a row of its own, largest first, keeping exactly its
 *             width, so the list and the bar are the same picture.
 *             Each row's name and figure arrive once its bar has
 *             landed; the card grows to fit as they go
 *   close     the last row goes back first, each segment sliding
 *             right and up into its place in the stack
 *
 * One even-paced progress drives the whole move, each segment easing
 * its own phase, so pressing again mid-way turns it round from where
 * it is. Segments move by transform only.
 * ───────────────────────────────────────────────────────── */

export interface ShareBarItem {
  key: string;
  label: string;
  value: number;
  /** Any CSS colour. Defaults to your chart colours in turn. */
  color?: string;
}

export interface ShareBarProps extends React.HTMLAttributes<HTMLDivElement> {
  items: ShareBarItem[];
  title?: string;
  /** Under the total, e.g. "Visitors by source, last 30 days". */
  caption?: string;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  format?: Intl.NumberFormatOptions;
  locales?: string | string[];
}

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const BAR = 14; // the bar's height, stacked and in each row
/** The mark: a segment is a run of 2px upright hairlines, one every 4px. */
const TICKS = "repeating-linear-gradient(to right, #000 0 2px, transparent 2px 4px)";
const GAP = 3; // between stacked segments
const ROW = 46; // one row of the list
const LABEL = 18; // the name line over a row's bar
const STAGGER = 0.4; // how much of the move the stagger takes

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

// Formatting waits for hydration: the server and the hydrating render share one fixed locale, then the visitor's takes over.
const subscribeNothing = () => () => {};
const useHydrated = () => React.useSyncExternalStore(subscribeNothing, () => true, () => false);

/**
 * Progress that moves at an even pace toward its target (0 or 1) and turns round from wherever it is, so a second
 * press mid-way reverses the move without a jump. Each piece eases its own phase of it; a spring would front-load it.
 */
function createPacer(initial: number, duration: number, onFrame: () => void) {
  let value = initial;
  let target = initial;
  let frame = 0;
  let last = 0;
  const tick = (now: number) => {
    const dt = last ? (now - last) / duration : 0;
    last = now;
    value = target > value ? Math.min(target, value + dt) : Math.max(target, value - dt);
    onFrame();
    if (value !== target) frame = requestAnimationFrame(tick);
    else frame = last = 0;
  };
  return {
    get: () => value,
    set(next: number) {
      target = next;
      if (!frame && value !== target) frame = requestAnimationFrame(tick);
    },
    jump(next: number) {
      value = target = next;
      if (frame) cancelAnimationFrame(frame);
      frame = last = 0;
      onFrame();
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = last = 0;
    },
  };
}
type Pacer = ReturnType<typeof createPacer>;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const out = (t: number) => 1 - (1 - t) ** 3;

export function ShareBar({
  items,
  title = "Traffic",
  caption,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  format,
  locales,
  className = "",
  ...props
}: ShareBarProps) {
  const reduced = useReducedMotion();
  const hydrated = useHydrated();
  const locale = locales ?? (hydrated ? undefined : "en-US");
  const id = React.useId();
  const [own, setOwn] = React.useState(defaultExpanded);
  const open = expanded ?? own;
  // Largest first, in the stack and in the list, so a segment's row is its rank.
  const ranked = React.useMemo(
    () => items.map((it, i) => ({ ...it, color: it.color ?? `var(--chart-${(i % 5) + 1}, var(--primary))` })).sort((a, b) => b.value - a.value),
    [items],
  );
  const n = ranked.length;
  const total = ranked.reduce((s, it) => s + Math.max(0, it.value), 0);

  const [visible, setVisible] = React.useState(false);
  const [active, setActive] = React.useState<string | null>(null);
  const [width, setWidth] = React.useState(0);
  const [legendH, setLegendH] = React.useState(20);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const legendRef = React.useRef<HTMLDivElement>(null);
  const segRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const rowRefs = React.useRef<(HTMLLIElement | null)[]>([]);
  const trackRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const springRef = React.useRef<Pacer | null>(null);
  const live = React.useRef({ width: 0, n: 0, shares: [] as number[], legendH: 20 });

  const shares = React.useMemo(() => ranked.map((it) => (total ? Math.max(0, it.value) / total : 0)), [ranked, total]);

  // One frame: each segment between its place in the stack and its row, the card's height, and what fades.
  const paint = React.useCallback(() => {
    const s = springRef.current;
    const L = live.current;
    if (!s || !L.width) return;
    const p = s.get();
    let left = 0;
    for (let i = 0; i < L.n; i++) {
      const w = Math.max(2, L.shares[i] * (L.width - GAP * (L.n - 1)));
      const delay = L.n > 1 ? (i / (L.n - 1)) * STAGGER : 0;
      const t = clamp01((p * (1 + STAGGER) - delay) / 1);
      // It drops first and slides second, so it leaves the stack on a curve rather than a diagonal.
      const ty = ease(clamp01(t / 0.8));
      const tx = ease(clamp01((t - 0.15) / 0.85));
      const x = left * (1 - tx);
      const y = (i * ROW + LABEL) * ty;
      const seg = segRefs.current[i];
      if (seg) {
        seg.style.width = `${w}px`;
        seg.style.transform = `translate3d(${x}px,${y}px,0)`;
      }
      const row = rowRefs.current[i];
      const arrived = out(clamp01((t - 0.62) / 0.38));
      if (row) {
        row.style.opacity = String(arrived);
        row.style.transform = `translate3d(0,${(1 - arrived) * 4}px,0)`;
      }
      const track = trackRefs.current[i];
      if (track) track.style.opacity = String(arrived);
      left += w + GAP;
    }
    const legend = legendRef.current;
    if (legend) {
      const gone = clamp01(p * 3);
      legend.style.opacity = String(1 - gone);
      legend.style.transform = `translate3d(0,${gone * -4}px,0)`;
    }
    const stage = stageRef.current;
    if (stage) {
      const closedH = BAR + 14 + L.legendH;
      const openH = Math.max(1, L.n) * ROW - (ROW - LABEL - BAR);
      stage.style.height = `${closedH + (openH - closedH) * ease(clamp01(p * 1.1))}px`;
    }
  }, []);

  const startOpen = React.useRef(open);
  React.useLayoutEffect(() => {
    const s = createPacer(startOpen.current ? 1 : 0, 1100, paint);
    springRef.current = s;
    return () => {
      s.stop();
      springRef.current = null;
    };
  }, [paint]);

  React.useLayoutEffect(() => {
    live.current = { width, n, shares, legendH };
    paint();
  }, [width, n, shares, legendH, paint]);

  React.useEffect(() => {
    const s = springRef.current;
    if (!s) return;
    if (reduced) s.jump(open ? 1 : 0);
    else s.set(open ? 1 : 0);
  }, [open, reduced]);

  React.useLayoutEffect(() => {
    const stage = stageRef.current;
    const legend = legendRef.current;
    if (!stage || !legend) return;
    const measure = () => {
      setWidth((w) => (w === stage.offsetWidth ? w : stage.offsetWidth));
      setLegendH((h) => (h === legend.offsetHeight ? h : legend.offsetHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(legend);
    return () => observer.disconnect();
  }, []);

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

  const toggle = () => {
    const next = !open;
    if (expanded === undefined) setOwn(next);
    onExpandedChange?.(next);
  };

  const fmt = (v: number) => new Intl.NumberFormat(locale, format).format(v);
  const pct = (share: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: share < 0.1 ? 1 : 0 }).format(share);
  const shownIndex = active ? ranked.findIndex((it) => it.key === active) : -1;
  const shown = shownIndex >= 0 ? ranked[shownIndex] : null;
  const point = (key: string | null) => (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && e.type === "pointerleave") return;
    setActive(key);
  };

  return (
    <div ref={rootRef} className={`w-full rounded-[22px] bg-background shadow-[0_0_0_1px_var(--border)] ${className}`} {...props}>
      {/* Its natural width where the parent sizes to its content (a centred flex column), without forcing it on narrow screens. */}
      <div aria-hidden="true" data-natural-width className="grid h-0" style={{ gridTemplateColumns: "minmax(0, 480px)" }} />
      <div className="@container w-full">
      <div className="p-4 @md:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-muted-foreground @md:text-[13px]">{title}</p>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            onClick={toggle}
            className={`-my-1 inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full pl-3 pr-2 text-[12px] font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] transition-[color,scale] duration-200 hover:text-foreground active:scale-[0.97] @md:text-[12.5px] ${FOCUS}`}
            style={{ transitionTimingFunction: EASE }}
          >
            <TextMorph>{open ? "Collapse" : "Breakdown"}</TextMorph>
            <svg
              viewBox="0 0 12 12"
              aria-hidden="true"
              className="size-3"
              style={{ transform: open ? "rotate(180deg)" : "none", transition: reduced ? "none" : `transform 420ms ${EASE}` }}
            >
              <path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="mt-0.5 text-[22px] font-medium leading-tight tracking-[-0.03em] text-foreground tabular-nums @md:text-[26px]">
          <NumberRoll value={visible ? (shown ? shown.value : total) : 0} format={format} locales={locale} duration={shown ? 600 : 1000} />
        </p>
        <p className="mt-0.5 truncate whitespace-nowrap text-[11.5px] text-muted-foreground @md:text-[12.5px]">
          <TextMorph>{shown ? `${shown.label} · ${pct(shares[shownIndex])}` : (caption ?? "Total")}</TextMorph>
        </p>

        <div ref={stageRef} className="relative mt-4 @md:mt-5" style={{ height: BAR + 14 + legendH }} onPointerLeave={point(null)}>
          {/* Row tracks: the whole width is 100%, so a short bar reads as a small share. */}
          {ranked.map((it, i) => (
            <div
              key={`${it.key}-track`}
              ref={(el) => {
                trackRefs.current[i] = el;
              }}
              aria-hidden="true"
              className="absolute inset-x-0 bg-foreground/[0.1]"
              style={{ top: i * ROW + LABEL, height: BAR, opacity: 0, maskImage: TICKS, WebkitMaskImage: TICKS }}
            />
          ))}

          {/* The segments: one bar when closed, the bars of the list when open. */}
          <div
            aria-hidden="true"
            onClick={toggle}
            className="absolute inset-x-0 top-0 cursor-pointer"
            style={{ height: BAR, clipPath: visible || reduced ? "inset(-200px -10px -2000px -10px)" : "inset(-200px 100% -2000px -10px)", transition: reduced ? "none" : `clip-path 900ms ${EASE}` }}
          >
            {ranked.map((it, i) => (
              <div
                key={it.key}
                ref={(el) => {
                  segRefs.current[i] = el;
                }}
                onPointerMove={(e) => {
                  if (e.pointerType === "mouse" || e.buttons) setActive(it.key);
                }}
                onPointerDown={() => setActive(it.key)}
                className="absolute left-0 top-0"
                style={{
                  height: BAR,
                  background: it.color,
                  maskImage: TICKS,
                  WebkitMaskImage: TICKS,
                  opacity: active && active !== it.key ? 0.32 : 1,
                  transition: reduced ? "none" : `opacity 220ms ${EASE}`,
                  willChange: "transform",
                }}
              />
            ))}
          </div>

          {/* Closed: a legend under the bar. */}
          <div ref={legendRef} aria-hidden={open} className="absolute inset-x-0 flex flex-wrap gap-x-4 gap-y-1" style={{ top: BAR + 14, pointerEvents: open ? "none" : undefined }}>
            {ranked.map((it, i) => (
              <span
                key={it.key}
                onPointerEnter={point(it.key)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-muted-foreground transition-opacity duration-200 @md:text-[12.5px]"
                style={{ opacity: active && active !== it.key ? 0.45 : 1 }}
              >
                <span className="size-2 rounded-[2px]" style={{ background: it.color }} />
                {it.label}
                <span className="tabular-nums text-foreground">{pct(shares[i])}</span>
              </span>
            ))}
          </div>

          {/* Open: each row's name and figure, over the bar that landed there. */}
          <ul id={`${id}-list`} aria-label={`${title} by share`} className="absolute inset-x-0 top-0" style={{ pointerEvents: open ? undefined : "none" }}>
            {ranked.map((it, i) => (
              <li
                key={it.key}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                aria-hidden={!open}
                onPointerEnter={point(it.key)}
                className="absolute inset-x-0 flex items-baseline justify-between gap-3 text-[12px] @md:text-[13px]"
                style={{ top: i * ROW, height: LABEL + BAR + 4, opacity: 0, transition: reduced ? "none" : `color 200ms ${EASE}` }}
              >
                <span className={`truncate transition-colors duration-200 ${active && active !== it.key ? "text-muted-foreground" : "text-foreground"}`}>{it.label}</span>
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                  <span className="text-muted-foreground">{fmt(it.value)}</span>
                  <span className="w-[3.2em] text-right font-medium text-foreground">{pct(shares[i])}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="sr-only"><table>
          <caption>
            {title}: {fmt(total)}
          </caption>
          <tbody>
            {ranked.map((it, i) => (
              <tr key={it.key}>
                <th scope="row">{it.label}</th>
                <td>{fmt(it.value)}</td>
                <td>{pct(shares[i])}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      </div>
    </div>
  );
}
