"use client";

import * as React from "react";
import { TextMorph } from "./text-morph";
import { createSpring, projectInertia, releaseVelocity, samplePointer, type PointerSample, type Spring } from "./ui-interaction-motion";

/* ─────────────────────────────────────────────────────────
 * TIME OVERLAP: when can everyone make it?
 *
 *   days       each person is a strip of one day in your time,
 *              drawn in hairline marks: lit in their colour while
 *              they're at work, faint while they're not
 *   overlap    where everyone is at work at once, a line runs along
 *              the ruler above the strips
 *   drag       a glass band the length of the meeting crosses every
 *              strip; drag it and each person's local time ticks
 *              beside their row as it moves
 *   settle     let go near the overlap and the band glides into it
 *              and settles; anywhere else it lands on the nearest
 *              quarter hour
 *   status     the header says whether everyone is in hours, or who
 *              isn't; their time turns amber
 *
 * The band moves by transform while you drag; the times change once
 * per quarter hour and React re-renders only then. The day is drawn
 * once per set of people.
 * ───────────────────────────────────────────────────────── */

export interface OverlapPerson {
  id: string;
  name: string;
  /** IANA time zone, e.g. "Europe/Lisbon". */
  timeZone: string;
  /** Working hours in their own time, [start, end) in hours. Defaults to 9–17. */
  hours?: [number, number];
  /** Any CSS colour. Defaults to your chart colours in turn. */
  color?: string;
}

export interface TimeOverlapProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title" | "defaultValue" | "onChange"> {
  people: OverlapPerson[];
  /** The meeting's start. Controlled or not. */
  value?: Date | number;
  defaultValue?: Date | number;
  onValueChange?: (start: Date) => void;
  /** Minutes. */
  duration?: number;
  /** The day shown, in your time zone. Defaults to today. */
  day?: Date | number;
  /** The time zone the day is laid out in. Defaults to the visitor's. */
  timeZone?: string;
  title?: string;
  locales?: string | string[];
}

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const SLOT = 15 * 60_000;
const SLOTS = 96;
const SNAP_REACH = 6; // slots: let go within 90 minutes of the overlap and the band goes into it
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);
const subscribeNothing = () => () => {};
const useHydrated = () => React.useSyncExternalStore(subscribeNothing, () => true, () => false);
// Today, read once in the browser and never while rendering on the server (prerendering refuses a moving clock).
let firstNow: number | undefined;
const readNow = () => (firstNow ??= Date.now());
const useNow = () => React.useSyncExternalStore(subscribeNothing, readNow, () => null);

const formats = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, make: () => Intl.DateTimeFormat) {
  let f = formats.get(key);
  if (!f) formats.set(key, (f = make()));
  return f;
}
/** Minutes past midnight in a time zone, and that zone's offset from UTC in ms. */
function clock(ms: number, timeZone: string) {
  const parts = fmt(`p|${timeZone}`, () =>
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }),
  ).formatToParts(ms);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return { minutes: (get("hour") % 24) * 60 + get("minute"), offset: asUtc - Math.floor(ms / 60_000) * 60_000, y: get("year"), m: get("month"), d: get("day") };
}
/** The instant the day starts in a time zone. */
function dayStart(at: number, timeZone: string) {
  const { y, m, d } = clock(at, timeZone);
  const guess = Date.UTC(y, m - 1, d);
  return guess - clock(guess, timeZone).offset;
}
const inHours = (minutes: number, [a, b]: [number, number]) => (a <= b ? minutes >= a * 60 && minutes < b * 60 : minutes >= a * 60 || minutes < b * 60);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function TimeOverlap({
  people,
  value: valueProp,
  defaultValue,
  onValueChange,
  duration = 60,
  day,
  timeZone: zoneProp,
  title = "Find a time",
  locales,
  className = "",
  ...props
}: TimeOverlapProps) {
  const reduced = useReducedMotion();
  const hydrated = useHydrated();
  const locale = locales ?? (hydrated ? undefined : "en-US");
  // Times depend on the visitor's zone and clock: lay the day out once mounted.
  const zone = zoneProp ?? (hydrated ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");
  const now = useNow();
  const start = React.useMemo(() => dayStart(day === undefined ? (now ?? 0) : +day, zone), [day, now, zone]);
  const span = clamp(Math.round(duration / 15), 1, SLOTS);

  // Who is at work in each quarter hour, and where everyone is.
  const grid = React.useMemo(
    () => people.map((p) => Array.from({ length: SLOTS }, (_, i) => inHours(clock(start + i * SLOT, p.timeZone).minutes, p.hours ?? [9, 17]))),
    [people, start],
  );
  const runs = React.useMemo(() => {
    const out: [number, number][] = [];
    let from = -1;
    for (let i = 0; i <= SLOTS; i++) {
      const all = i < SLOTS && grid.length > 0 && grid.every((g) => g[i]);
      if (all && from < 0) from = i;
      if (!all && from >= 0) {
        out.push([from, i]);
        from = -1;
      }
    }
    return out;
  }, [grid]);

  const controlled = valueProp !== undefined;
  const toSlot = React.useCallback((v: Date | number | undefined) => (v === undefined ? null : clamp(Math.round((+v - start) / SLOT), 0, SLOTS - span)), [start, span]);
  const firstFit = runs.find(([a, b]) => b - a >= span)?.[0] ?? 36;
  const [own, setOwn] = React.useState<number | null>(null);
  const slot = (controlled ? toSlot(valueProp) : (own ?? toSlot(defaultValue))) ?? firstFit;
  // While dragging, what the band is over (re-rendered once per quarter hour).
  const [preview, setPreview] = React.useState<number | null>(null);
  const shown = preview ?? slot;

  const trackRef = React.useRef<HTMLDivElement>(null);
  const bandRef = React.useRef<HTMLDivElement>(null);
  const pitch = React.useRef(0);
  const spring = React.useRef<Spring | null>(null);
  const drag = React.useRef<{ id: number; x0: number; s0: number; samples: PointerSample[]; moved: boolean } | null>(null);

  const paint = React.useCallback(() => {
    const band = bandRef.current;
    if (band && spring.current) band.style.transform = `translateX(${spring.current.get() * pitch.current}px)`;
  }, []);

  React.useLayoutEffect(() => {
    spring.current = createSpring(slot, { stiffness: 300, damping: 30 }, paint, 0.002);
    return () => spring.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint]);

  React.useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      pitch.current = track.clientWidth / SLOTS;
      paint();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [paint]);

  // The band follows the value when nothing is holding it.
  React.useEffect(() => {
    const s = spring.current;
    if (!s || drag.current) return;
    if (reduced) s.jump(slot);
    else s.set(slot);
  }, [slot, reduced]);

  const commit = (next: number) => {
    if (!controlled) setOwn(next);
    if (next !== slot) onValueChange?.(new Date(start + next * SLOT));
  };

  /** Where a band let go near `at` should come to rest. */
  const settle = (at: number) => {
    const free = clamp(Math.round(at), 0, SLOTS - span);
    let best: number | null = null;
    for (const [a, b] of runs) {
      if (b - a < span) continue;
      const inside = clamp(at, a, b - span);
      if (Math.abs(inside - at) <= SNAP_REACH && (best === null || Math.abs(inside - at) < Math.abs(best - at))) best = Math.round(inside);
    }
    return best ?? free;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !pitch.current) return;
    const s = spring.current!;
    const r = trackRef.current!.getBoundingClientRect();
    const scale = r.width / (trackRef.current!.clientWidth || 1);
    const at = (e.clientX - r.left) / scale / pitch.current;
    const onBand = at >= s.get() && at <= s.get() + span;
    // Pressing the strips away from the band brings the band to the pointer.
    const s0 = onBand ? s.get() : clamp(at - span / 2, 0, SLOTS - span);
    if (!onBand) {
      s.set(s0);
      if (reduced) s.jump(s0);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x0: e.clientX / scale, s0, samples: [], moved: !onBand };
    samplePointer(drag.current.samples, e.clientX / scale, e.timeStamp);
    setPreview(clamp(Math.round(s0), 0, SLOTS - span));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const r = trackRef.current!.getBoundingClientRect();
    const scale = r.width / (trackRef.current!.clientWidth || 1);
    const x = e.clientX / scale;
    if (Math.abs(x - d.x0) > 3) d.moved = true;
    samplePointer(d.samples, x, e.timeStamp);
    const raw = d.s0 + (x - d.x0) / pitch.current;
    const max = SLOTS - span;
    // Past either end of the day the band gives a little, then stops.
    const soft = raw < 0 ? raw * 0.25 : raw > max ? max + (raw - max) * 0.25 : raw;
    spring.current!.jump(soft);
    const q = clamp(Math.round(raw), 0, max);
    setPreview((p) => (p === q ? p : q));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const s = spring.current!;
    const v = releaseVelocity(d.samples, e.timeStamp);
    const projected = s.get() + projectInertia(0, v, 0.12) / pitch.current;
    const target = settle(projected);
    s.push((v * 1000) / pitch.current);
    if (reduced) s.jump(target);
    else s.set(target);
    setPreview(null);
    commit(target);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const max = SLOTS - span;
    const keys: Record<string, number> = { ArrowLeft: slot - 1, ArrowRight: slot + 1, PageUp: slot + 4, PageDown: slot - 4, Home: 0, End: max };
    if (!(e.key in keys)) return;
    e.preventDefault();
    commit(clamp(keys[e.key], 0, max));
  };

  // Readouts.
  const time = (ms: number, tz: string) => fmt(`t|${tz}|${locale}`, () => new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "numeric", minute: "2-digit" })).format(ms);
  const at = start + shown * SLOT;
  const out = people.filter((_, i) => !grid[i].slice(shown, shown + span).every(Boolean));
  const status = !people.length ? "" : out.length === 0 ? `Everyone’s in hours` : out.length === 1 ? `${out[0].name} is outside hours` : `${out.length} people outside hours`;
  const longest = runs.reduce((m, [a, b]) => Math.max(m, b - a), 0);
  const hoursText = (slots: number) => (slots % 4 === 0 ? `${slots / 4} h` : `${Math.floor(slots / 4) ? `${Math.floor(slots / 4)} h ` : ""}${(slots % 4) * 15} min`);
  const colorOf = (p: OverlapPerson, i: number) => p.color ?? `color-mix(in oklab, var(--chart-${(i % 5) + 1}, var(--primary)) 80%, var(--foreground))`;

  return (
    <div className={`w-full rounded-[20px] bg-background shadow-[0_0_0_1px_var(--border)] ${className}`} {...props}>
      <div aria-hidden="true" data-natural-width className="grid h-0" style={{ gridTemplateColumns: "minmax(0, 520px)" }} />
      <div className="@container w-full p-4 @md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="truncate text-[12.5px] text-muted-foreground">{title}</p>
            <p className="mt-1 whitespace-nowrap text-[15px] font-medium tracking-[-0.02em] text-foreground tabular-nums @md:text-[17px]" suppressHydrationWarning>
              {hydrated ? `${time(at, zone)} – ${time(at + span * SLOT, zone)}` : " "}
            </p>
          </div>
          <p className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium">
            <span className={`size-1.5 rounded-full transition-colors duration-300 ${out.length ? "bg-amber-500" : "bg-emerald-500"}`} />
            <span className={out.length ? "text-amber-600 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}>
              <TextMorph>{status}</TextMorph>
            </span>
          </p>
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,60px)_minmax(0,1fr)_auto] items-center gap-x-2.5 @md:grid-cols-[minmax(0,96px)_minmax(0,1fr)_auto] @md:gap-x-3">
          {/* The ruler: your day, and where everyone overlaps. */}
          <span className="text-[11px] text-muted-foreground">{longest ? hoursText(longest) : "No"} overlap</span>
          <div className="relative h-5" aria-hidden="true">
            {[0, 6, 12, 18].map((h) => (
              <span key={h} className={`absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10.5px] tabular-nums text-muted-foreground first:translate-x-0 ${h % 12 ? "@max-[24rem]:hidden" : ""}`} style={{ left: `${(h / 24) * 100}%` }} suppressHydrationWarning>
                {hydrated ? fmt(`h|${zone}|${locale}`, () => new Intl.DateTimeFormat(locale, { timeZone: zone, hour: "numeric" })).format(start + h * 4 * SLOT) : ""}
              </span>
            ))}
            {runs.map(([a, b]) => (
              <span key={a} className="absolute bottom-0.5 h-[3px] rounded-full bg-emerald-500" style={{ left: `${(a / SLOTS) * 100}%`, width: `${((b - a) / SLOTS) * 100}%` }} />
            ))}
          </div>
          <span />

          {people.map((p, i) => (
            <Row key={p.id} row={i + 2} person={p} color={colorOf(p, i)} slots={grid[i]} local={hydrated ? time(at, p.timeZone) : ""} out={out.includes(p)} />
          ))}

          {/* The band: over the strips, the length of the meeting. */}
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label={`${title}, ${duration} minutes`}
            aria-valuemin={0}
            aria-valuemax={SLOTS - span}
            aria-valuenow={slot}
            aria-valuetext={hydrated ? `${time(start + slot * SLOT, zone)}. ${status}` : undefined}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`relative cursor-grab touch-pan-y self-stretch rounded-[10px] active:cursor-grabbing ${FOCUS}`}
            style={{ gridColumn: 2, gridRow: `2 / span ${Math.max(1, people.length)}` }}
          >
            <div
              ref={bandRef}
              aria-hidden="true"
              className="absolute inset-y-0 left-0 rounded-[9px] transition-[box-shadow,background-color] duration-300"
              style={{
                width: `${(span / SLOTS) * 100}%`,
                background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
                boxShadow: out.length
                  ? "inset 0 0 0 1.5px color-mix(in oklab, var(--foreground) 30%, transparent)"
                  : "inset 0 0 0 1.5px color-mix(in oklab, var(--color-emerald-500, #10b981) 85%, var(--foreground))",
                transitionTimingFunction: EASE,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const Row = React.memo(function Row({ row, person, color, slots, local, out }: { row: number; person: OverlapPerson; color: string; slots: boolean[]; local: string; out: boolean }) {
  const city = person.timeZone.split("/").pop()?.replace(/_/g, " ") ?? person.timeZone;
  return (
    <>
      <div className="flex h-9 min-w-0 flex-col justify-center" style={{ gridRow: row, gridColumn: 1 }}>
        <p className="truncate text-[12.5px] font-medium leading-tight text-foreground">{person.name}</p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{city}</p>
      </div>
      <Strip slots={slots} color={color} row={row} />
      <p className={`h-9 min-w-[40px] whitespace-nowrap text-right text-[11.5px] leading-9 tabular-nums @md:min-w-[52px] @md:text-[12px] transition-colors duration-300 ${out ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`} style={{ gridRow: row, gridColumn: 3 }} suppressHydrationWarning>
        {local}
      </p>
    </>
  );
});

/** One day in hairline marks, one every half hour: their colour at work, faint otherwise. */
const Strip = React.memo(function Strip({ slots, color, row }: { slots: boolean[]; color: string; row: number }) {
  const marks = [];
  for (let i = 0; i < SLOTS; i += 2) marks.push(slots[i]);
  return (
    <div aria-hidden="true" className="flex h-9 items-center" style={{ gridRow: row, gridColumn: 2 }}>
      {marks.map((on, i) => (
        <span key={i} className="flex h-5 flex-1 justify-center">
          <span className="w-[2px] rounded-full" style={{ background: on ? color : "color-mix(in oklab, var(--foreground) 11%, transparent)", height: on ? "100%" : "55%", marginTop: on ? 0 : "auto" }} />
        </span>
      ))}
    </div>
  );
});
