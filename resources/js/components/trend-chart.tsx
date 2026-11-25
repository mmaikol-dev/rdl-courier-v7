"use client";

import * as React from "react";
import { NumberRoll } from "./number-roll";
import { TextMorph } from "./text-morph";
import { TimeBrush } from "./time-brush";

/* ─────────────────────────────────────────────────────────
 * TREND CHART: one metric over time, read by pointer or keys
 *
 *   change   same buckets, new numbers (a filter): the line morphs
 *            into place and the scale rolls. New buckets (a range):
 *            the old line stretches or shrinks to where its days sit
 *            on the new axis while the new one fades in over it, so
 *            zooming in looks like zooming in
 *   compare  the period before as a dashed line, drawn in from the
 *            left when it's turned on
 *   hover    a hairline and a dot follow the pointer; one readout
 *            card glides beside them, its date morphing and its
 *            figures rolling
 *   drag     drag across the chart to zoom into those buckets (Time
 *            brush, snapped to bucket edges)
 *   today    a bucket that isn't over yet is drawn dashed, so a dip
 *            at the end isn't news
 * ───────────────────────────────────────────────────────── */

export type TrendInterval = "hour" | "day" | "week" | "month";
/** How the figures read: plain counts (or money, with `format`), percentages (0–100) or durations in seconds. */
export type TrendKind = "count" | "percent" | "duration";

export interface TrendChartProps {
  /** Bucket starts (epoch ms), oldest first. */
  buckets: number[];
  /** One value per bucket. */
  values: number[];
  /** The period before, bucket for bucket; null or left out hides the dashed line. */
  previous?: number[] | null;
  /** How long one bucket is. */
  interval?: TrendInterval;
  kind?: TrendKind;
  /** Number format for counts, e.g. { style: "currency", currency: "USD" }. The scale writes the same format compactly. */
  format?: Intl.NumberFormatOptions;
  /** What one value is called in a sentence: "3,412 visitors". */
  unit?: string;
  /** How the readout names the dashed line. */
  previousLabel?: string;
  /** The time now (epoch ms): a last bucket that ends after it is unfinished and drawn dashed. The clock at mount by default. */
  now?: number;
  /** Called with the span dragged across. Leave it out and the chart can't be brushed. */
  onZoom?: (range: { start: number; end: number }) => void;
  /** A line under the figures in the readout, e.g. who sent that day's visitors. */
  note?: (index: number) => string | null | undefined;
  /** The bucket the pointer or keys are on, for linking other widgets to the readout. */
  onActiveChange?: (index: number | null) => void;
  /** Accessible name. */
  label: string;
  /** For dates and numbers; the viewer's own by default. */
  locale?: string;
  className?: string;
}

type Snapshot = {
  key: string;
  buckets: number[];
  centers: number[];
  values: number[];
  previous: number[] | null;
  domain: [number, number];
  max: number;
  partial: boolean;
  interval: TrendInterval;
};

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const THROW = "cubic-bezier(0.34,1.36,0.64,1)";
const DURATION = 640;
const TOP = 10;
const AXIS = 26;
const STEPS = 4;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () => React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

const ease = (t: number) => 1 - Math.pow(1 - t, 4);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAll = (a: number[], b: number[], t: number) => b.map((v, i) => lerp(a[i] ?? v, v, t));

/** `t` moved on by one bucket, in calendar terms (a day across a clock change is still one day). */
function nextBucket(t: number, interval: TrendInterval) {
  if (interval === "hour") return t + HOUR;
  const d = new Date(t);
  if (interval === "month") d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + (interval === "week" ? 7 : 1));
  return d.getTime();
}

/** "2m 41s", "48s", "1h 3m". */
export function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** A round top for a scale with four steps: 1,840 → 2,000. Durations step in whole minutes. */
function niceTop(value: number, kind: TrendKind) {
  if (value <= 0) return kind === "duration" ? 240 : kind === "percent" ? 100 : STEPS;
  if (kind === "percent") return Math.min(100, Math.ceil(value / 20) * 20) || 100;
  const raw = value / STEPS;
  if (kind === "duration") {
    const step = [15, 30, 60, 90, 120, 180, 300, 600, 900, 1800].find((s) => s >= raw) ?? Math.ceil(raw / 1800) * 1800;
    return step * STEPS;
  }
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((x) => x * mag).find((s) => s >= raw) ?? 10 * mag;
  return step * STEPS;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A smooth line that never overshoots its points (monotone cubic), split into segments so the last one can be drawn dashed. */
function monotoneSegments(points: [number, number][]) {
  const n = points.length;
  if (!n) return { head: "", segments: [] as string[] };
  const head = `M${r2(points[0][0])},${r2(points[0][1])}`;
  if (n === 1) return { head, segments: [] as string[] };
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) m.push((points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0] || 1));
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  const segments: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = (x1 - x0) / 3;
    segments.push(`C${r2(x0 + dx)},${r2(y0 + t[i] * dx)} ${r2(x1 - dx)},${r2(y1 - t[i + 1] * dx)} ${r2(x1)},${r2(y1)}`);
  }
  return { head, segments };
}

/** Dates for one locale: the readout's title, the axis ticks and the brush's edges. */
function dateWords(locale: string | undefined) {
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const hour = new Intl.DateTimeFormat(locale, { hour: "numeric" });
  const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const monthShort = new Intl.DateTimeFormat(locale, { month: "short" });
  return {
    /** "Fri 18 Sep" · "Fri 18 Sep, 2 PM" · "Week of 14 Sep" · "September 2026". */
    title: (t: number, interval: TrendInterval) =>
      interval === "hour" ? `${day.format(t)}, ${hour.format(t)}` : interval === "week" ? `Week of ${short.format(t)}` : interval === "month" ? month.format(t) : day.format(t),
    /** "18 Sep", "2 PM", "Sep". */
    tick: (t: number, interval: TrendInterval) => (interval === "hour" ? hour.format(t) : interval === "month" ? monthShort.format(t) : short.format(t)),
    edge: (t: number, interval: TrendInterval) => (interval === "hour" ? clock.format(t) : interval === "month" ? monthShort.format(t) : short.format(t)),
  };
}

function snapshotOf(p: { buckets: number[]; values: number[]; previous: number[] | null; interval: TrendInterval; kind: TrendKind; now: number | null }): Snapshot | null {
  const n = p.buckets.length;
  if (!n) return null;
  const ends = p.buckets.map((b, i) => p.buckets[i + 1] ?? nextBucket(b, p.interval));
  return {
    key: `${p.kind}|${p.interval}|${p.buckets[0]}|${n}|${p.values.join(",")}|${p.previous?.join(",") ?? ""}`,
    buckets: p.buckets,
    centers: p.buckets.map((b, i) => (b + ends[i]) / 2),
    values: p.values,
    previous: p.previous,
    domain: [p.buckets[0], ends[n - 1]],
    max: niceTop(Math.max(0, ...p.values, ...(p.previous ?? [])), p.kind),
    partial: p.now !== null && ends[n - 1] > p.now + 60_000,
    interval: p.interval,
  };
}

const sameBuckets = (a: Snapshot, b: Snapshot) => a.interval === b.interval && a.buckets.length === b.buckets.length && a.buckets[0] === b.buckets[0];

/**
 * A sentence that changes crossfades whole: the old one lifts away through a blur while the
 * new one rises in. (Letters of two sentences don't morph well; labels use TextMorph.)
 */
function Swap({ text, reduced, className = "" }: { text: string; reduced: boolean; className?: string }) {
  const [shown, setShown] = React.useState({ text, key: 0 });
  const [leaving, setLeaving] = React.useState<{ text: string; key: number }[]>([]);
  if (text !== shown.text) {
    if (shown.text && !reduced) setLeaving((l) => [...l.slice(-2), shown]);
    setShown({ text, key: shown.key + 1 });
  }
  return (
    <span className={`relative block ${className}`}>
      <span
        key={shown.key}
        className="block truncate"
        ref={(el) => {
          if (!el || reduced || shown.key === 0 || el.dataset.in) return;
          el.dataset.in = "1";
          el.animate([{ opacity: 0, transform: "translateY(0.3em)", filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "blur(0px)" }], { duration: 320, delay: 40, easing: EASE, fill: "backwards" });
        }}
      >
        {shown.text || " "}
      </span>
      {leaving.map((l) => (
        <span
          key={l.key}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 block truncate"
          ref={(el) => {
            if (!el || el.dataset.out) return;
            el.dataset.out = "1";
            el.animate([{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, transform: "translateY(-0.3em)", filter: "blur(4px)" }], { duration: 160, easing: EASE, fill: "forwards" }).onfinish = () =>
              setLeaving((all) => all.filter((x) => x.key !== l.key));
          }}
        >
          {l.text}
        </span>
      ))}
    </span>
  );
}

export function TrendChart({
  buckets,
  values,
  previous = null,
  interval = "day",
  kind = "count",
  format,
  unit,
  previousLabel = "the period before",
  now: nowProp,
  onZoom,
  note,
  onActiveChange,
  label,
  locale,
  className = "",
}: TrendChartProps) {
  const reduced = useReducedMotion();
  const gradientId = `trend-wash-${React.useId().replace(/:/g, "")}`;
  // Without a `now`, the clock at mount (null on the server, so the first paint matches).
  const [mountedAt, setMountedAt] = React.useState<number | null>(null);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setMountedAt(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const now = nowProp ?? mountedAt;
  const target = React.useMemo(() => snapshotOf({ buckets, values, previous, interval, kind, now }), [buckets, values, previous, interval, kind, now]);
  const [frame, setFrame] = React.useState<{ from: Snapshot | null; to: Snapshot | null; morph: boolean; p: number }>({ from: null, to: null, morph: false, p: 1 });
  const drawnRef = React.useRef(frame);
  React.useLayoutEffect(() => {
    drawnRef.current = frame;
  });
  const [arrived, setArrived] = React.useState(false);
  const [width, setWidth] = React.useState(0);
  const [plotH, setPlotH] = React.useState(200);
  const [active, setActive] = React.useState<number | null>(null);
  const [keyboard, setKeyboard] = React.useState(false);
  const [card, setCard] = React.useState({ w: 180, h: 80 });
  const plotRef = React.useRef<HTMLDivElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const words = React.useMemo(() => dateWords(locale), [locale]);
  const numbers = React.useMemo(() => new Intl.NumberFormat(locale, format ?? WHOLE), [locale, format]);

  // A new target: start from wherever the drawing is now (mid-change included).
  React.useLayoutEffect(() => {
    if (!target) return;
    const cur = drawnRef.current;
    if (!cur.to || reduced) {
      setFrame({ from: null, to: target, morph: false, p: 1 });
      if (!cur.to) requestAnimationFrame(() => requestAnimationFrame(() => setArrived(true)));
      return;
    }
    if (cur.to.key === target.key) return;
    const e = ease(cur.p);
    const here: Snapshot = cur.from
      ? {
          ...cur.to,
          values: cur.morph ? lerpAll(cur.from.values, cur.to.values, e) : cur.to.values,
          domain: [lerp(cur.from.domain[0], cur.to.domain[0], e), lerp(cur.from.domain[1], cur.to.domain[1], e)],
          max: lerp(cur.from.max, cur.to.max, e),
        }
      : cur.to;
    const morph = sameBuckets(here, target);
    setFrame({ from: here, to: target, morph, p: 0 });
    const begin = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - begin) / DURATION);
      setFrame((f) => (f.to === target ? { ...f, p } : f));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key, reduced]);

  // The plot's size comes from CSS (its height steps down in narrow cards).
  React.useLayoutEffect(() => {
    const el = boxRef.current;
    const plot = plotRef.current;
    if (!el || !plot) return;
    const measure = () => {
      setPlotH((h) => (el.offsetHeight - AXIS > 0 && el.offsetHeight - AXIS !== h ? el.offsetHeight - AXIS : h));
      setWidth((w) => (plot.offsetWidth === w ? w : plot.offsetWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);

  React.useLayoutEffect(() => {
    const el = cardRef.current;
    if (el && active !== null) setCard((c) => (Math.abs(c.w - el.offsetWidth) < 1 && Math.abs(c.h - el.offsetHeight) < 1 ? c : { w: el.offsetWidth, h: el.offsetHeight }));
  }, [active]);

  const activeRef = React.useRef<number | null>(null);
  const setActiveIndex = (i: number | null) => {
    if (activeRef.current === i) return;
    activeRef.current = i;
    setActive(i);
    onActiveChange?.(i);
  };

  const { from, to, morph, p } = frame;
  const e = ease(p);
  const domain: [number, number] = to ? (from ? [lerp(from.domain[0], to.domain[0], e), lerp(from.domain[1], to.domain[1], e)] : to.domain) : [0, 1];
  const max = to ? (from ? lerp(from.max, to.max, e) : to.max) : niceTop(0, kind);
  const x = (t: number) => ((t - domain[0]) / (domain[1] - domain[0] || 1)) * width;
  const y = (v: number) => TOP + (plotH - TOP) * (1 - Math.min(1.08, v / (max || 1)));

  // What's drawn: one morphing series, or the old one fading under the new one.
  const layers: { snap: Snapshot; values: number[]; alpha: number }[] = [];
  if (to) {
    if (from && morph) layers.push({ snap: to, values: lerpAll(from.values, to.values, e), alpha: 1 });
    else {
      if (from && p < 1) layers.push({ snap: from, values: from.values, alpha: 1 - e });
      layers.push({ snap: to, values: to.values, alpha: from ? e : 1 });
    }
  }
  const shownValues = layers[layers.length - 1]?.values ?? [];

  const paths = (snap: Snapshot, vals: number[]) => {
    const points = snap.centers.map((c, i) => [x(c), y(vals[i] ?? 0)] as [number, number]);
    const { head, segments } = monotoneSegments(points);
    const n = points.length;
    const tail = snap.partial && n > 1;
    const solid = head + (tail ? segments.slice(0, -1) : segments).join("");
    const dashed = tail ? `M${points[n - 2][0]},${points[n - 2][1]}${segments[n - 2]}` : "";
    const area = n > 1 ? `${head}${segments.join("")}L${points[n - 1][0]},${plotH}L${points[0][0]},${plotH}Z` : "";
    return { solid, dashed, area };
  };
  const prevPath = (snap: Snapshot, prev: number[]) => {
    const points = snap.centers.map((c, i) => [x(c), y(prev[i] ?? 0)] as [number, number]);
    const { head, segments } = monotoneSegments(points);
    return head + segments.join("");
  };

  const comparing = !!to?.previous;
  const [compareShown, setCompareShown] = React.useState(false);
  const [seenComparing, setSeenComparing] = React.useState(comparing);
  if (comparing !== seenComparing) {
    setSeenComparing(comparing);
    if (!comparing) setCompareShown(false);
  }
  React.useEffect(() => {
    if (!comparing) return;
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setCompareShown(true));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [comparing]);

  const n = to?.buckets.length ?? 0;
  const indexAt = (clientX: number) => {
    const r = plotRef.current?.getBoundingClientRect();
    if (!r || !to || !n) return null;
    const t = domain[0] + ((clientX - r.left) / r.width) * (domain[1] - domain[0]);
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(to.centers[i] - t) < Math.abs(to.centers[best] - t)) best = i;
    return best;
  };
  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (!n) return;
    const at = active ?? n - 1;
    const moves: Record<string, number> = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: n - 1 };
    if (ev.key === "Escape") return setActiveIndex(null);
    if (!(ev.key in moves)) return;
    ev.preventDefault();
    setKeyboard(true);
    setActiveIndex(Math.min(n - 1, Math.max(0, active === null ? at : moves[ev.key])));
  };

  // Ticks along the bottom: as many as fit, counted back from the newest so it always has one.
  const ticks = (snap: Snapshot) => {
    const gap = snap.interval === "hour" ? 52 : 64;
    const every = width ? Math.max(1, Math.ceil(gap / (width / snap.buckets.length))) : snap.buckets.length;
    return snap.buckets.map((b, i) => ({ b, i })).filter(({ i }) => (snap.buckets.length - 1 - i) % every === 0);
  };

  const fmt = (v: number) => (kind === "percent" ? `${Math.round(v)}%` : kind === "duration" ? formatDuration(v) : numbers.format(v));
  const scale = (f: number) => {
    const v = (to?.max ?? max) * f;
    if (kind === "duration") return <TextMorph>{v ? formatDuration(v).replace(/ 0s$/, "") : "0"}</TextMorph>;
    if (kind === "percent") return <NumberRoll value={v} format={WHOLE} suffix="%" locales={locale} duration={700} />;
    return <NumberRoll value={v} format={{ ...format, notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }} locales={locale} duration={700} />;
  };

  // The brush snaps to bucket edges, so what it covers is whole buckets.
  const brush = React.useMemo(() => (to ? { start: new Date(to.domain[0]), end: new Date(to.domain[1]) } : null), [to]);
  const snap = (t: number) => {
    if (!to) return t;
    const edges = [...to.buckets, to.domain[1]];
    let best = edges[0];
    for (const edge of edges) if (Math.abs(edge - t) < Math.abs(best - t)) best = edge;
    return best;
  };
  const minSpan = interval === "hour" ? HOUR : interval === "day" ? DAY - 2 * HOUR : interval === "week" ? 6 * DAY : 27 * DAY;
  const tag = (d: Date, edge: "start" | "end") => words.edge(edge === "end" && interval !== "hour" ? d.getTime() - 1 : d.getTime(), interval);

  const activeValue = active !== null ? (to?.values[active] ?? 0) : 0;
  const activePrev = active !== null ? (to?.previous?.[active] ?? null) : null;
  const ax = active !== null && to ? x(to.centers[active]) : 0;
  const ay = active !== null ? y(shownValues[active] ?? 0) : 0;
  // The card sits beside the dot, on whichever side has room. In a narrow chart with room on
  // neither side, it moves to the half of the plot the dot isn't in, so it never covers it.
  const flip = ax + 16 + card.w > width;
  const cardX = Math.max(0, Math.min(width - card.w, flip ? ax - 16 - card.w : ax + 16));
  const cramped = flip && ax - 16 - card.w < 0;
  const cardY = cramped && ay < plotH / 2 ? Math.max(0, plotH - card.h - 4) : 0;
  const noteText = active !== null ? (note?.(active) ?? null) : null;
  const brushable = !!onZoom && !!to && n > 1;

  return (
    <div className={`@container relative [--gutter:34px] [--plot:170px] @[560px]:[--gutter:44px] @[560px]:[--plot:232px] ${className}`}>
      <div ref={boxRef} className="relative" style={{ height: `calc(var(--plot) + ${AXIS}px)` }}>
        {/* The scale: hairlines at fixed heights, figures that roll to the new top. */}
        {Array.from({ length: STEPS + 1 }, (_, k) => 1 - k / STEPS).map((f) => (
          <div key={f} aria-hidden="true" className="absolute inset-x-0" style={{ top: TOP + (plotH - TOP) * (1 - f) }}>
            <span className="absolute left-0 top-0 -translate-y-1/2 whitespace-nowrap text-right text-[10.5px] leading-none tabular-nums text-muted-foreground" style={{ width: "calc(var(--gutter) - 10px)" }}>
              {to ? scale(f) : null}
            </span>
            <div className={`border-t ${f === 0 ? "border-border" : "border-dashed border-border/80"}`} style={{ marginLeft: "var(--gutter)" }} />
          </div>
        ))}

        <div className="absolute right-0 top-0" style={{ left: "var(--gutter)", height: plotH }}>
          <TimeBrush
            start={brush?.start ?? new Date(0)}
            end={brush?.end ?? new Date(1)}
            onSelect={({ start, end }) => {
              setActiveIndex(null);
              onZoom?.({ start: start.getTime(), end: end.getTime() });
            }}
            snap={snap}
            formatTime={tag}
            minSpan={minSpan}
            disabled={!brushable}
            className="h-full w-full"
          >
            <div
              ref={plotRef}
              role="group"
              tabIndex={0}
              aria-label={`${label}. Arrow keys read each point${onZoom ? "; drag across the chart to zoom in" : ""}.`}
              onKeyDown={onKeyDown}
              onBlur={() => keyboard && (setActiveIndex(null), setKeyboard(false))}
              onPointerMove={(ev) => {
                if (ev.buttons & 1 && brushable) return setActiveIndex(null);
                setKeyboard(false);
                setActiveIndex(indexAt(ev.clientX));
              }}
              onPointerDown={(ev) => ev.pointerType !== "mouse" && setActiveIndex(indexAt(ev.clientX))}
              onPointerLeave={(ev) => ev.pointerType === "mouse" && setActiveIndex(null)}
              className="absolute inset-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <div
                className="absolute inset-0"
                style={{
                  clipPath: arrived ? "inset(-12px -12px -12px -12px)" : "inset(-12px 100% -12px -12px)",
                  transition: reduced ? "none" : `clip-path 1100ms ${EASE}`,
                }}
              >
                <svg aria-hidden="true" width={width} height={plotH} className="absolute inset-0 overflow-visible">
                  <defs>
                    <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.16" />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {width > 0 &&
                    layers.map(({ snap, values: vals, alpha }, li) => {
                      const d = paths(snap, vals);
                      return (
                        <g key={li === layers.length - 1 ? "now" : "was"} opacity={alpha}>
                          <path d={d.area} fill={`url(#${gradientId})`} />
                          <path d={d.solid} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          {d.dashed && <path d={d.dashed} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 5" />}
                        </g>
                      );
                    })}
                </svg>
              </div>

              {/* The period before: drawn in from the left when comparing starts. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  clipPath: compareShown ? "inset(-12px -12px -12px -12px)" : "inset(-12px 100% -12px -12px)",
                  opacity: compareShown ? 1 : 0,
                  transition: reduced ? "none" : `clip-path 900ms ${EASE}, opacity 300ms ${EASE}`,
                }}
              >
                <svg width={width} height={plotH} className="absolute inset-0 overflow-visible">
                  {width > 0 &&
                    layers.map(({ snap, alpha }, li) =>
                      snap.previous ? (
                        <path
                          key={li === layers.length - 1 ? "now" : "was"}
                          d={prevPath(snap, morph && from?.previous && li === layers.length - 1 ? lerpAll(from.previous, snap.previous, e) : snap.previous)}
                          opacity={alpha}
                          fill="none"
                          stroke="var(--muted-foreground)"
                          strokeOpacity="0.7"
                          strokeWidth="1.5"
                          strokeDasharray="4 4"
                        />
                      ) : null,
                    )}
                </svg>
              </div>

              {/* The pointer: a hairline, a dot, and the readout card beside them. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 w-px bg-foreground/15"
                style={{ height: plotH, transform: `translateX(${ax}px)`, opacity: active !== null ? 1 : 0, transition: reduced ? "none" : `transform 240ms ${THROW}, opacity 180ms ${EASE}` }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0 size-2.5 rounded-full bg-primary shadow-[0_0_0_2.5px_var(--background)]"
                style={{
                  transform: `translate(${ax - 5}px, ${ay - 5}px) scale(${active !== null ? 1 : 0.4})`,
                  opacity: active !== null ? 1 : 0,
                  transition: reduced ? "none" : `transform 240ms ${THROW}, opacity 180ms ${EASE}`,
                }}
              />
              <div
                ref={cardRef}
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-1 z-10 w-max min-w-[148px] max-w-[240px] rounded-[12px] bg-popover px-3 py-2.5 text-popover-foreground shadow-[0_0_0_1px_var(--border)]"
                style={{
                  transform: `translateX(${cardX}px) translateY(${cardY + (active !== null ? 0 : 4)}px)`,
                  opacity: active !== null ? 1 : 0,
                  transition: reduced ? "none" : `transform 260ms ${THROW}, opacity 180ms ${EASE}`,
                }}
              >
                <p className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                  <TextMorph>{active !== null && to ? words.title(to.buckets[active], to.interval) : " "}</TextMorph>
                </p>
                <p className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap">
                  <span data-slot="figure" className="text-[19px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                    {kind === "duration" ? (
                      <TextMorph>{formatDuration(activeValue)}</TextMorph>
                    ) : (
                      <NumberRoll value={activeValue} suffix={kind === "percent" ? "%" : ""} format={kind === "percent" ? WHOLE : (format ?? WHOLE)} locales={locale} duration={500} />
                    )}
                  </span>
                  {unit && <span className="text-[12px] text-muted-foreground">{unit}</span>}
                </p>
                {activePrev !== null && (
                  <p className="mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-muted-foreground">
                    <span aria-hidden="true" className="w-3 border-t border-dashed border-muted-foreground" />
                    <span className="tabular-nums">{fmt(activePrev)}</span> {previousLabel}
                  </p>
                )}
                {noteText !== null && <Swap text={noteText} reduced={reduced} className="mt-1.5 border-t border-border pt-1.5 text-[11.5px] text-foreground" />}
              </div>
            </div>
          </TimeBrush>
        </div>

        {/* Along the bottom. */}
        <div aria-hidden="true" className="pointer-events-none absolute right-0 [clip-path:inset(-4px_0)]" style={{ left: "var(--gutter)", top: plotH + 9, height: 16 }}>
          {width > 0 &&
            layers.map(({ snap, alpha }, li) => (
              <div key={li === layers.length - 1 ? "now" : "was"} style={{ opacity: alpha }}>
                {ticks(snap).map(({ b, i }) => {
                  // Labels near an edge hang inward instead of running off the card.
                  const at = x(snap.centers[i]);
                  const shift = at < 22 ? "0%" : at > width - 22 ? "-100%" : "-50%";
                  return (
                    <span
                      key={b}
                      className={`absolute top-0 whitespace-nowrap text-[11px] leading-none transition-colors duration-200 ${active === i && li === layers.length - 1 ? "text-foreground" : "text-muted-foreground"}`}
                      style={{ left: at, transform: `translateX(${shift})` }}
                    >
                      {words.tick(b, snap.interval)}
                    </span>
                  );
                })}
              </div>
            ))}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {keyboard && active !== null && to
          ? `${words.title(to.buckets[active], to.interval)}: ${fmt(to.values[active] ?? 0)}${unit ? ` ${unit}` : ""}${activePrev !== null ? `, ${fmt(activePrev)} ${previousLabel}` : ""}${noteText ? `. ${noteText}` : ""}`
          : ""}
      </p>
      {to && (
        <table className="sr-only">
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">{unit ?? "Value"}</th>
              {to.previous && <th scope="col">{previousLabel.replace(/^\w/, (c) => c.toUpperCase())}</th>}
            </tr>
          </thead>
          <tbody>
            {to.buckets.map((b, i) => (
              <tr key={b}>
                <th scope="row">{words.title(b, to.interval)}</th>
                <td>{fmt(to.values[i] ?? 0)}</td>
                {to.previous && <td>{fmt(to.previous[i] ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
