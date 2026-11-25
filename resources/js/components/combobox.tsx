"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { EASE, fly, play, snapshot, textRect, type Snapshot } from "./combobox-motion";
import { NumberRoll } from "./number-roll";
import { StatusButton } from "./status-button";
import { TextMorph } from "./text-morph";

/* ─────────────────────────────────────────────────────────
 * COMBOBOX: pick from a list too long to scroll, or one your
 * server has to search
 *
 *   open      the panel unfolds from the field's edge, clear of
 *             it, with the search field already focused; things
 *             you picked before come first
 *   search    your search() is called as you type: debounced,
 *             older requests aborted, answers cached so going
 *             back a letter is instant. While it asks, the old
 *             results stay (dimmed after a beat) and a hairline
 *             runs under the field; when the answer lands, rows
 *             that stay glide to their new places, new ones rise
 *             in and gone ones fade where they stood
 *   match     the letters you typed are picked out in each row
 *   pick      one: the panel folds and the label morphs. Several:
 *             the row's name is carried up into the chip it
 *             becomes, and a check draws in the row
 *   remove    a chip's × (or Backspace in an empty search) and
 *             the other chips glide into its place
 *   create    nothing fits: "Create “design-review”" runs your
 *             onCreate and picks what it returns
 *
 * The panel lives on the page's body, so no card or scroller
 * clips it; it follows the field when the page scrolls and
 * opens upward when there's no room below.
 * ───────────────────────────────────────────────────────── */

export interface ComboboxOption {
  value: string;
  label: string;
  /** A second line: an email, a repository's owner, a count. */
  description?: string;
  /** An avatar picture. */
  image?: string;
  /** Letters for an avatar without a picture. */
  initials?: string;
  /** Any icon instead of an avatar. */
  icon?: React.ReactNode;
  /** More words a search should match (a team, an old name). */
  keywords?: string[];
  /** Rows with the same group sit together under its name. */
  group?: string;
  disabled?: boolean;
}

interface ComboboxBase {
  /** Accessible name, e.g. "Assignee". */
  label: string;
  /** What the field says while nothing is picked. */
  placeholder?: string;
  searchPlaceholder?: string;
  /** A list to filter here. */
  options?: ComboboxOption[];
  /** Or ask your server. Called with "" when the panel opens; pass the signal on to fetch. */
  search?: (query: string, context: { signal: AbortSignal }) => Promise<ComboboxOption[]>;
  /** Milliseconds to wait after a keystroke before calling search. */
  debounce?: number;
  /** Shows "Create …" when nothing matches exactly; return the new option (or nothing to use the text). */
  onCreate?: (query: string) => Promise<ComboboxOption | void> | ComboboxOption | void;
  createLabel?: (query: string) => string;
  emptyMessage?: (query: string) => string;
  /** Rows to show at once; the rest wait for a narrower search. */
  limit?: number;
  /** "field" is a 38px form field; "pill" a 28px pill for sidebars and toolbars. */
  variant?: "field" | "pill";
  /** The panel's least width; it's never narrower than the field. */
  width?: number;
  /** Which edge of the field the panel lines up with. */
  align?: "start" | "end";
  /** A × that clears a single choice. */
  clearable?: boolean;
  /** Submits the chosen values with a form. */
  name?: string;
  disabled?: boolean;
  className?: string;
}

export interface ComboboxSingleProps extends ComboboxBase {
  multiple?: false;
  value?: ComboboxOption | null;
  defaultValue?: ComboboxOption | null;
  onValueChange?: (value: ComboboxOption | null) => void;
}

export interface ComboboxMultipleProps extends ComboboxBase {
  multiple: true;
  value?: ComboboxOption[];
  defaultValue?: ComboboxOption[];
  onValueChange?: (value: ComboboxOption[]) => void;
  /** How many can be picked. */
  max?: number;
}

export type ComboboxProps = ComboboxSingleProps | ComboboxMultipleProps;

type Phase = "closed" | "opening" | "open" | "closing";
type Nav = { key: string; option?: ComboboxOption; create?: true };
type Flight = { value: string; rect: DOMRect; text: string; style: Partial<CSSStyleDeclaration> };

const GAP = 6;
const MAX_LIST = 300;
const SEARCH_H = 41;
const FOOTER_H = 37;
const CREATE_KEY = "+create";
const NONE: ComboboxOption[] = [];
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
// The theme travels with the panel, so it matches the field wherever the field's colours were set.
const TOKENS = ["--background", "--foreground", "--popover", "--popover-foreground", "--border", "--accent", "--accent-foreground", "--primary", "--primary-foreground", "--muted", "--muted-foreground", "--ring"];

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

/* ── Matching ─────────────────────────────────────────── */

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const terms = (q: string) => fold(q).split(/\s+/).filter(Boolean);
const BOUNDARY = /[\s\-_/.@:#(]/;

/** Lower is better: the label starts with it, a word in it does, it's inside it, or only the description has it. */
function rank(option: ComboboxOption, words: string[]): number | null {
  const label = fold(option.label);
  const rest = fold([option.description ?? "", ...(option.keywords ?? []), option.value].join(" "));
  let score = 0;
  for (const w of words) {
    const at = label.indexOf(w);
    if (at === 0) continue;
    if (at > 0) score += BOUNDARY.test(label[at - 1]) ? 1 : 2;
    else if (rest.includes(w)) score += 3;
    else return null;
  }
  return score;
}

/** Filters and orders a list the way the panel would; useful on a server too. */
export function filterOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const words = terms(query);
  if (!words.length) return options;
  return options
    .map((option, i) => ({ option, i, score: rank(option, words) }))
    .filter((x): x is { option: ComboboxOption; i: number; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((x) => x.option);
}

/** The label with the typed words picked out (a word start wins over a match mid-word). */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = terms(query);
  const folded = fold(text);
  if (!words.length || folded.length !== text.length) return <>{text}</>;
  const hit = new Array<boolean>(text.length).fill(false);
  for (const w of words) {
    let at = -1;
    for (let i = folded.indexOf(w); i !== -1; i = folded.indexOf(w, i + 1)) {
      if (at === -1) at = i;
      if (i === 0 || BOUNDARY.test(folded[i - 1])) {
        at = i;
        break;
      }
    }
    if (at !== -1) for (let i = at; i < at + w.length; i++) hit[i] = true;
  }
  const parts: React.ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || hit[i] !== hit[start]) {
      const piece = text.slice(start, i);
      parts.push(
        hit[start] ? (
          <span key={start} className="font-semibold text-foreground">
            {piece}
          </span>
        ) : (
          piece
        ),
      );
      start = i;
    }
  }
  return <>{parts}</>;
}

/** Keeps each group's rows together, groups in the order they first appear. */
function grouped(list: ComboboxOption[]) {
  if (!list.some((o) => o.group)) return list;
  const order: string[] = [];
  for (const o of list) if (!order.includes(o.group ?? "")) order.push(o.group ?? "");
  return order.flatMap((g) => list.filter((o) => (o.group ?? "") === g));
}

const unique = (list: ComboboxOption[]) => {
  const seen = new Set<string>();
  return list.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
};

/* ── Small parts ──────────────────────────────────────── */

const hasLead = (o?: ComboboxOption | null) => Boolean(o && (o.icon || o.image || o.initials));

function Lead({ option, size }: { option: ComboboxOption; size: number }) {
  if (option.icon) return <span className="flex shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-full" style={{ width: size, height: size }}>{option.icon}</span>;
  if (option.image)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={option.image} alt="" draggable={false} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {option.initials}
    </span>
  );
}

/** The single choice's avatar or icon: the slot opens and closes, and a new one scales in through a blur as the old one leaves. */
function LeadSlot({ option, size, reduced }: { option: ComboboxOption | undefined; size: number; reduced: boolean }) {
  const [out, setOut] = React.useState<ComboboxOption | null>(null);
  const last = React.useRef(option);
  const key = option?.value ?? "";
  React.useLayoutEffect(() => {
    const prev = last.current;
    last.current = option;
    if (!prev || prev.value === key || !hasLead(prev) || reduced) return;
    setOut(prev);
    const timer = window.setTimeout(() => setOut(null), 260);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);
  const on = hasLead(option);
  return (
    <span
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: on ? size : 0, height: size, marginRight: on ? 8 : 0, transition: reduced ? "none" : `width 380ms ${EASE}, margin 380ms ${EASE}` }}
    >
      {out && (
        <span
          key={`out-${out.value}`}
          className="absolute inset-0 flex items-center justify-center"
          ref={(el) => {
            if (!el || el.dataset.out) return;
            el.dataset.out = "1";
            el.animate(
              [
                { opacity: 1, transform: "none", filter: "blur(0px)" },
                { opacity: 0, transform: "scale(0.6)", filter: "blur(3px)" },
              ],
              { duration: 220, easing: EASE, fill: "forwards" },
            );
          }}
        >
          <Lead option={out} size={size} />
        </span>
      )}
      {on && option && (
        <span
          key={key}
          className="absolute inset-0 flex items-center justify-center"
          ref={(el) => {
            if (!el || reduced || el.dataset.in) return;
            el.dataset.in = "1";
            el.animate(
              [
                { opacity: 0, transform: "scale(0.6)", filter: "blur(3px)" },
                { opacity: 1, transform: "none", filter: "blur(0px)" },
              ],
              { duration: 380, delay: 60, easing: EASE, fill: "backwards" },
            );
          }}
        >
          <Lead option={option} size={size} />
        </span>
      )}
    </span>
  );
}

function Chevron({ up, reduced, className = "" }: { up: boolean; reduced: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={`shrink-0 text-muted-foreground ${className}`} style={{ transform: up ? "rotate(180deg)" : "none", transition: reduced ? "none" : `transform 320ms ${EASE}` }}>
      <path d="M4.5 6.25 8 9.75l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross({ className = "size-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
      <path d="M3.5 3.5 8.5 8.5M8.5 3.5 3.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Check({ drawn, reduced, className = "size-3.5" }: { drawn: boolean; reduced: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        style={{ strokeDashoffset: drawn ? 0 : 1, transition: reduced ? "none" : `stroke-dashoffset ${drawn ? 380 : 200}ms ${EASE} ${drawn ? 80 : 0}ms` }}
      />
    </svg>
  );
}

/** A square for rows you can pick several of: it fills and its check draws itself. */
function Box({ on, reduced }: { on: boolean; reduced: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-4 shrink-0 items-center justify-center rounded-[5px]"
      style={{
        background: on ? "var(--primary)" : "transparent",
        color: "var(--primary-foreground)",
        boxShadow: on ? "inset 0 0 0 1px var(--primary)" : "inset 0 0 0 1px color-mix(in oklab, var(--foreground) 22%, transparent)",
        transition: reduced ? "none" : `background-color 200ms ${EASE}, box-shadow 200ms ${EASE}`,
      }}
    >
      <Check drawn={on} reduced={reduced} className="size-3" />
    </span>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground">
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.25 10.25 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5 shrink-0">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.75v3.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="8" cy="11" r="1" fill="currentColor" />
    </svg>
  );
}

const shake = (el: Element | null | undefined, reduced: boolean) => {
  if (!el || reduced) return;
  el.animate([{ transform: "none" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }], {
    duration: 380,
    easing: "ease-out",
    composite: "add",
  });
};

/* ── The combobox ─────────────────────────────────────── */

export function Combobox(props: ComboboxProps) {
  const {
    label,
    placeholder = "Choose",
    searchPlaceholder = "Search",
    options,
    search,
    debounce = 180,
    onCreate,
    createLabel = (q: string) => `Create “${q}”`,
    emptyMessage = (q: string) => (q ? `No matches for “${q}”` : "Nothing to choose yet"),
    limit = 100,
    variant = "field",
    width = 280,
    align = "start",
    clearable = false,
    name,
    disabled = false,
    className = "",
  } = props;
  const multiple = props.multiple === true;
  const max = props.multiple ? props.max : undefined;
  const uid = React.useId();
  const reduced = useReducedMotion();

  // What's picked, always a list inside.
  const listOf = (v: ComboboxOption | ComboboxOption[] | null | undefined) => (v == null ? NONE : Array.isArray(v) ? v : [v]);
  const [own, setOwn] = React.useState<ComboboxOption[]>(() => listOf(props.defaultValue));
  const selected = props.value !== undefined ? listOf(props.value) : own;
  const selectedKey = selected.map((o) => o.value).join("\u0000");
  const picked = React.useMemo(() => new Set(selected.map((o) => o.value)), [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [phase, setPhase] = React.useState<Phase>("closed");
  const [fit, setFit] = React.useState({ x: 0, y: 0, w: width, up: false, room: 480, theme: {} as Record<string, string> });
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ComboboxOption[] | null>(null);
  const [resultsFor, setResultsFor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const [created, setCreated] = React.useState<ComboboxOption[]>([]);
  const [creating, setCreating] = React.useState<"idle" | "pending" | "error">("idle");
  const [pinned, setPinned] = React.useState<ComboboxOption[]>([]);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [mark, setMark] = React.useState({ y: 0, h: 0, on: false, slide: false });
  const [listH, setListH] = React.useState(0);
  const [sized, setSized] = React.useState(false);
  const [fieldH, setFieldH] = React.useState(0);
  const [ring, setRing] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const anchorRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const rowGhosts = React.useRef<HTMLDivElement>(null);
  const chipsRef = React.useRef<HTMLDivElement>(null);
  const chipGhosts = React.useRef<HTMLDivElement>(null);
  const cache = React.useRef(new Map<string, ComboboxOption[]>());
  const searchRef = React.useRef(search);
  const resultsForRef = React.useRef<string | null>(null);
  const rowSnap = React.useRef<Snapshot | null>(null);
  const chipSnap = React.useRef<Snapshot | null>(null);
  const flight = React.useRef<Flight | null>(null);
  const timer = React.useRef(0);

  const mounted = phase !== "closed";
  const expanded = phase === "open";
  const async = Boolean(search);
  const q = query.trim();
  const panelId = `${uid}-panel`;
  const listId = `${uid}-list`;

  React.useLayoutEffect(() => {
    searchRef.current = search;
    resultsForRef.current = resultsFor;
  });

  const commit = (next: ComboboxOption[]) => {
    if (props.value === undefined) setOwn(next);
    if (props.multiple === true) props.onValueChange?.(next);
    else (props as ComboboxSingleProps).onValueChange?.(next[0] ?? null);
  };

  /* ── What the list shows ── */

  const pool = React.useMemo(() => {
    const extra = filterOptions(created, query);
    // Rows for an older query stay while a newer one is asked, but not under its error.
    const answer = failed && resultsFor !== q ? NONE : (results ?? NONE);
    const base = async ? unique([...extra, ...answer]) : filterOptions(unique([...created, ...(options ?? [])]), query);
    if (q || !pinned.length) return grouped(base);
    // Before you type, what you'd already picked comes first, in the order it was when the panel opened.
    const first = pinned.map((p) => base.find((o) => o.value === p.value) ?? p);
    const ids = new Set(first.map((o) => o.value));
    return [...first, ...grouped(base.filter((o) => !ids.has(o.value)))];
  }, [async, results, resultsFor, failed, options, created, query, q, pinned]);
  const shown = pool.length > limit ? pool.slice(0, limit) : pool;
  const more = pool.length - shown.length;
  const canCreate = Boolean(onCreate && q && !pool.some((o) => fold(o.label) === fold(q)));
  const firstLoad = async && results === null && !failed;
  const nav: Nav[] = React.useMemo(() => {
    const out: Nav[] = shown.filter((o) => !o.disabled).map((o) => ({ key: o.value, option: o }));
    if (canCreate) out.push({ key: CREATE_KEY, create: true });
    return out;
  }, [shown, canCreate]);
  const activeIndex = Math.max(0, nav.findIndex((n) => n.key === activeKey));
  const active = nav.length ? nav[activeIndex] : undefined;
  const rowsKey = [
    ...shown.map((o) => o.value),
    canCreate ? CREATE_KEY : "",
    firstLoad ? "!loading" : "",
    failed ? "!error" : "",
    !shown.length && !canCreate && !firstLoad && !failed ? "!empty" : "",
    more ? "!more" : "",
  ].join("\u0000");
  const stale = async && loading && resultsFor !== null && resultsFor !== q;

  /* ── Panel placement ── */

  const place = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = Math.min(Math.max(width, r.width), vw - 16);
    const x = Math.min(Math.max(8, align === "start" ? r.left : r.right - w), vw - 8 - w);
    const below = vh - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    const up = below < 240 && above > below;
    const cs = getComputedStyle(anchor);
    const theme: Record<string, string> = { colorScheme: cs.colorScheme, fontFamily: cs.fontFamily };
    for (const t of TOKENS) {
      const v = cs.getPropertyValue(t);
      if (v) theme[t] = v;
    }
    setFit({ x, y: up ? vh - r.top + GAP : r.bottom + GAP, w, up, room: up ? above : below, theme });
  }, [width, align]);

  const open = (seed = "") => {
    if (disabled || phase === "open" || phase === "opening") return;
    window.clearTimeout(timer.current);
    place();
    setQuery(seed);
    const hit = async ? cache.current.get(seed.trim()) : undefined;
    setResults(hit ?? null);
    setResultsFor(hit ? seed.trim() : null);
    setFailed(null);
    setPinned(multiple ? selected : NONE);
    setActiveKey(!multiple && selected[0] ? selected[0].value : null);
    setNotice(null);
    setCreating("idle");
    setSized(false);
    setMark({ y: 0, h: 0, on: false, slide: false });
    setPhase(reduced ? "open" : "opening");
  };

  const close = React.useCallback(
    (refocus = true) => {
      window.clearTimeout(timer.current);
      if (refocus) triggerRef.current?.focus({ preventScroll: true });
      if (reduced) return setPhase("closed");
      setPhase("closing");
      timer.current = window.setTimeout(() => setPhase("closed"), 240);
    },
    [reduced],
  );

  const toggle = () => (phase === "open" || phase === "opening" ? close() : open());

  React.useEffect(() => {
    if (phase !== "opening") return;
    let inner = 0;
    const outer = requestAnimationFrame(() => (inner = requestAnimationFrame(() => setPhase("open"))));
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [phase]);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  React.useLayoutEffect(() => {
    if (phase === "opening" || (reduced && phase === "open")) inputRef.current?.focus({ preventScroll: true });
  }, [phase, reduced]);

  // Outside presses close it; the page scrolling or resizing carries it along with the field.
  React.useEffect(() => {
    if (!mounted) return;
    const inside = (n: Node) => Boolean(anchorRef.current?.contains(n) || surfaceRef.current?.contains(n));
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target as Node)) close(false);
    };
    let frame = 0;
    const follow = (e: Event) => {
      if (e.target instanceof Node && surfaceRef.current?.contains(e.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = anchorRef.current?.getBoundingClientRect();
        if (!r || r.bottom < 0 || r.top > window.innerHeight) close(false);
        else place();
      });
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    // A field that grows (chips wrapping onto a new line) pushes the panel down with it.
    const resized = new ResizeObserver(() => place());
    if (anchorRef.current) resized.observe(anchorRef.current);
    return () => {
      resized.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [mounted, close, place]);

  /* ── Asking the server ── */

  const show = (list: ComboboxOption[], forQuery: string) => {
    if (!reduced) rowSnap.current = snapshot(listRef.current, "data-row");
    setResults(list);
    setResultsFor(forQuery);
  };

  React.useEffect(() => {
    const ask = searchRef.current;
    if (!mounted || !ask) return;
    const hit = cache.current.get(q);
    if (hit) {
      if (resultsForRef.current !== q) show(hit, q);
      setLoading(false);
      setFailed(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const wait = window.setTimeout(
      () => {
        ask(q, { signal: controller.signal }).then(
          (list) => {
            if (controller.signal.aborted) return;
            cache.current.set(q, list);
            // A small memory: the oldest answers go first.
            if (cache.current.size > 40) cache.current.delete(cache.current.keys().next().value!);
            show(list, q);
            setLoading(false);
            setFailed(null);
          },
          (err: unknown) => {
            if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) return;
            if (!reduced) rowSnap.current = snapshot(listRef.current, "data-row");
            setLoading(false);
            setFailed(err instanceof Error && err.message ? err.message : "Couldn’t load results.");
          },
        );
      },
      resultsForRef.current === null ? 0 : debounce,
    );
    return () => {
      window.clearTimeout(wait);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mounted, retry, debounce]);

  // Rows that changed: glide, rise in, fade out (from positions taken right before the change).
  React.useLayoutEffect(() => {
    const snap = rowSnap.current;
    rowSnap.current = null;
    if (snap) play(listRef.current, "data-row", snap, rowGhosts.current);
  }, [rowsKey]);

  // The count, said once typing settles.
  React.useEffect(() => {
    if (!expanded || !q || firstLoad) return;
    const t = window.setTimeout(() => setAnnounce(shown.length ? `${pool.length} ${pool.length === 1 ? "result" : "results"}` : emptyMessage(q)), 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey, expanded]);

  /* ── List height and the highlight ── */

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !mounted) return;
    const measure = () => setListH((h) => (h === list.offsetHeight ? h : list.offsetHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [mounted]);
  React.useEffect(() => {
    if (expanded && listH && !sized) {
      const frame = requestAnimationFrame(() => setSized(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [expanded, listH, sized]);

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !mounted) return;
    const row = active ? list.querySelector<HTMLElement>(`[data-nav="${activeIndex}"]`) : null;
    if (!row) {
      setMark((m) => (m.on ? { ...m, on: false, slide: false } : m));
      return;
    }
    setMark((m) => (m.y === row.offsetTop && m.h === row.offsetHeight && m.on ? m : { y: row.offsetTop, h: row.offsetHeight, on: true, slide: m.on }));
    const scroller = list.parentElement;
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      if (row.offsetTop < scroller.scrollTop) scroller.scrollTop = row.offsetTop - 4;
      else if (row.offsetTop + row.offsetHeight > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = row.offsetTop + row.offsetHeight - scroller.clientHeight + 8;
    }
  }, [activeIndex, active, rowsKey, mounted, listH]);

  /* ── Chips ── */

  React.useLayoutEffect(() => {
    const chips = chipsRef.current;
    if (!chips) return;
    const measure = () => setFieldH((h) => (h === chips.offsetHeight ? h : chips.offsetHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(chips);
    return () => observer.disconnect();
  }, []);

  React.useLayoutEffect(() => {
    const snap = chipSnap.current;
    chipSnap.current = null;
    const f = flight.current;
    flight.current = null;
    const to = f && chipsRef.current?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(f.value)}"] [data-chip-label]`);
    if (f && to) fly(f, to);
    if (snap) play(chipsRef.current, "data-chip", snap, chipGhosts.current, { enter: "pop", duration: 340 });
  }, [selectedKey]);

  // Declared after the effects that use them: a snapshot no change used (the same rows came back) would be stale by the next one.
  React.useLayoutEffect(() => {
    rowSnap.current = null;
    chipSnap.current = null;
    flight.current = null;
  });

  /* ── Picking ── */

  const pick = (option: ComboboxOption, row?: HTMLElement | null) => {
    if (option.disabled) return;
    if (!multiple) {
      if (option.value !== selected[0]?.value) commit([option]);
      setAnnounce(`${option.label} selected`);
      close();
      return;
    }
    const on = picked.has(option.value);
    if (!on && max !== undefined && selected.length >= max) {
      setNotice(`You can pick up to ${max}.`);
      shake(row, reduced);
      return;
    }
    if (!reduced) chipSnap.current = snapshot(chipsRef.current, "data-chip");
    const label = row?.querySelector<HTMLElement>("[data-label]");
    if (!on && label && variant === "field" && !reduced) {
      const cs = getComputedStyle(label);
      flight.current = {
        value: option.value,
        rect: textRect(label),
        text: option.label,
        style: {
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          fontStyle: cs.fontStyle,
          color: cs.color,
          letterSpacing: cs.letterSpacing,
        },
      };
    }
    const next = on ? selected.filter((o) => o.value !== option.value) : [...selected, option];
    commit(next);
    setNotice(null);
    setAnnounce(`${option.label} ${on ? "removed" : "added"}. ${next.length} selected.`);
  };

  const remove = (option: ComboboxOption) => {
    if (!reduced) chipSnap.current = snapshot(chipsRef.current, "data-chip");
    const next = selected.filter((o) => o.value !== option.value);
    commit(next);
    setNotice(null);
    setAnnounce(`${option.label} removed. ${next.length} selected.`);
  };

  const clear = () => {
    if (!reduced) chipSnap.current = snapshot(chipsRef.current, "data-chip");
    commit(NONE);
    setNotice(null);
    setAnnounce("Cleared");
  };

  const create = async () => {
    if (!onCreate || !q || creating === "pending") return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-row="${CREATE_KEY}"]`);
    setCreating("pending");
    setNotice(null);
    try {
      const made = await onCreate(q);
      const option = made && typeof made === "object" ? made : { value: q, label: q };
      setCreated((list) => [option, ...list.filter((o) => o.value !== option.value)]);
      setCreating("idle");
      setActiveKey(option.value);
      pick(option, row);
    } catch (err) {
      setCreating("error");
      setNotice(err instanceof Error && err.message ? err.message : `Couldn’t create “${q}”.`);
      shake(row, reduced);
    }
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const go = (i: number) => {
      e.preventDefault();
      if (nav.length) setActiveKey(nav[((i % nav.length) + nav.length) % nav.length].key);
    };
    if (e.key === "ArrowDown") go(activeIndex + 1);
    else if (e.key === "ArrowUp") go(activeIndex - 1);
    else if (e.key === "PageDown") go(Math.min(nav.length - 1, activeIndex + 8));
    else if (e.key === "PageUp") go(Math.max(0, activeIndex - 8));
    else if (e.key === "Enter") {
      e.preventDefault();
      if (!active) return;
      if (active.create) void create();
      else if (active.option) pick(active.option, listRef.current?.querySelector<HTMLElement>(`[data-nav="${activeIndex}"]`));
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      e.preventDefault();
      close();
    } else if (e.key === "Backspace" && multiple && !query && selected.length) {
      e.preventDefault();
      remove(selected[selected.length - 1]);
    }
  };

  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      open();
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typing on the closed field opens it with what you typed.
      e.preventDefault();
      open(e.key);
    } else if (e.key === "Backspace" && multiple && selected.length && !mounted) {
      e.preventDefault();
      remove(selected[selected.length - 1]);
    }
  };

  /* ── The field ── */

  const single = selected[0];
  const pill = variant === "pill";
  const summary = !selected.length ? placeholder : multiple ? (selected.length === 1 ? selected[0].label : `${selected[0].label} +${selected.length - 1}`) : single!.label;
  const triggerName = `${label}: ${selected.length ? selected.map((o) => o.label).join(", ") : "none"}`;
  const ringStyle = mounted || ring ? "color-mix(in oklab, var(--ring) 55%, var(--border))" : "var(--border)";
  const triggerProps = {
    ref: triggerRef,
    type: "button" as const,
    disabled,
    "aria-haspopup": "dialog" as const,
    "aria-expanded": expanded,
    "aria-controls": mounted ? panelId : undefined,
    "aria-label": triggerName,
    onKeyDown: onTriggerKey,
    onFocus: (e: React.FocusEvent<HTMLButtonElement>) => setRing(e.currentTarget.matches(":focus-visible")),
    onBlur: () => setRing(false),
  };

  let field: React.ReactNode;
  if (multiple && !pill) {
    field = (
      <div
        onMouseDown={(e) => {
          if (disabled || e.button !== 0 || (e.target as HTMLElement).closest("[data-chip-remove]")) return;
          e.preventDefault();
          toggle();
        }}
        className={`rounded-[19px] border bg-background transition-[border-color] duration-200 ${disabled ? "cursor-default opacity-60" : "cursor-pointer"}`}
        style={{ borderColor: ringStyle }}
      >
        {/* clip, not hidden: hidden boxes still scroll, and focus would scroll the chips away. */}
        <div className="overflow-clip" style={{ height: fieldH || undefined, transition: reduced || !fieldH ? "none" : `height 320ms ${EASE}` }}>
          <div ref={chipsRef} className="relative flex flex-wrap items-center gap-1.5 py-[5px] pl-[5px] pr-8">
            {selected.map((o) => (
              <span
                key={o.value}
                data-chip={o.value}
                className="relative z-[1] inline-flex h-7 max-w-full shrink-0 items-center rounded-full bg-background text-[13px] shadow-[inset_0_0_0_1px_var(--border)]"
              >
                {hasLead(o) && (
                  <span className="ml-1 flex">
                    <Lead option={o} size={20} />
                  </span>
                )}
                <span data-chip-label="" className="max-w-[12rem] truncate py-1" style={{ marginLeft: hasLead(o) ? 6 : 10, marginRight: 2 }}>
                  {o.label}
                </span>
                <button
                  type="button"
                  data-chip-remove=""
                  tabIndex={-1}
                  aria-label={`Remove ${o.label}`}
                  disabled={disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => remove(o)}
                  className="relative mr-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default"
                >
                  <Cross />
                </button>
              </span>
            ))}
            <button
              {...triggerProps}
              onClick={(e) => {
                // The field's own press handles the mouse; this is Enter and Space.
                if (e.detail === 0) toggle();
              }}
              // With chips it lies behind them across the whole field, so it never needs a line of its own.
              className={`cursor-pointer text-left text-[14px] outline-none disabled:cursor-default ${selected.length ? "absolute inset-0" : "flex h-7 min-w-[7rem] flex-1 items-center pl-1.5"}`}
            >
              {!selected.length && <span className="min-w-0 flex-1 truncate text-muted-foreground">{placeholder}</span>}
            </button>
            {/* In the first line's corner, so it never wraps onto a line of its own. */}
            <Chevron up={expanded} reduced={reduced} className="pointer-events-none absolute right-3 top-[12px] size-3.5" />
            <div ref={chipGhosts} aria-hidden="true" className="pointer-events-none absolute inset-0" />
          </div>
        </div>
      </div>
    );
  } else {
    const leadSize = pill ? 18 : 22;
    field = (
      <button
        {...triggerProps}
        onClick={toggle}
        className={`relative flex w-full min-w-0 cursor-pointer items-center whitespace-nowrap text-left transition-[background-color,border-color] duration-200 disabled:cursor-default disabled:opacity-60 ${
          pill
            ? `h-7 rounded-full px-2.5 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent ${FOCUS} ${expanded ? "bg-accent" : ""}`
            : "h-[38px] rounded-[19px] border bg-background pl-3 pr-2.5 text-[14px] outline-none"
        }`}
        style={pill ? undefined : { borderColor: ringStyle }}
      >
        {!multiple && <LeadSlot option={single} size={leadSize} reduced={reduced} />}
        <span className={`min-w-0 flex-1 overflow-hidden ${selected.length ? "text-foreground" : "text-muted-foreground"}`}>
          <TextMorph>{summary}</TextMorph>
        </span>
        {/* Room for the clear button, which can't live inside this one. */}
        {clearable && !multiple && <span aria-hidden="true" className="shrink-0" style={{ width: single ? 22 : 0, transition: reduced ? "none" : `width 320ms ${EASE}` }} />}
        <Chevron up={expanded} reduced={reduced} className={pill ? "ml-1.5 size-3" : "ml-2 size-3.5"} />
      </button>
    );
  }

  /* ── The panel ── */

  const maxList = Math.max(120, Math.min(MAX_LIST, fit.room - SEARCH_H - (multiple ? FOOTER_H : 0) - 10));
  let navIndex = 0;
  let lastGroup: string | undefined;
  const rows: React.ReactNode[] = [];
  const pinnedFirst = !q && pinned.length > 0;
  const hasGroups = shown.some((o) => o.group);
  shown.forEach((o, index) => {
    const isPinned = pinnedFirst && index < pinned.length;
    if (isPinned && index === 0 && hasGroups)
      rows.push(
        <div key="#selected" data-row="#selected" role="presentation" className="px-2 pb-1 pt-1 text-[11.5px] font-medium text-muted-foreground">
          Selected
        </div>,
      );
    if (o.group && o.group !== lastGroup && !isPinned)
      rows.push(
        <div key={`#${o.group}`} data-row={`#${o.group}`} role="presentation" className="px-2 pb-1 pt-2.5 text-[11.5px] font-medium text-muted-foreground first:pt-1">
          {o.group}
        </div>,
      );
    if (!isPinned) lastGroup = o.group;
    const on = picked.has(o.value);
    const i = o.disabled ? -1 : navIndex++;
    rows.push(
      <div
        key={o.value}
        data-row={o.value}
        data-nav={i === -1 ? undefined : i}
        id={i === -1 ? undefined : `${uid}-o${i}`}
        role="option"
        aria-selected={on}
        aria-disabled={o.disabled || undefined}
        onPointerMove={() => {
          if (!o.disabled && activeKey !== o.value) setActiveKey(o.value);
        }}
        onClick={(e) => pick(o, e.currentTarget)}
        className={`relative flex min-h-9 items-center gap-2.5 rounded-[10px] px-2 py-1.5 ${o.disabled ? "cursor-default opacity-45" : "cursor-pointer"}`}
      >
        {multiple && <Box on={on} reduced={reduced} />}
        {hasLead(o) && <Lead option={o} size={22} />}
        <span className="min-w-0 flex-1">
          <span data-label="" className="block truncate text-[13px] leading-tight">
            <Highlight text={o.label} query={query} />
          </span>
          {o.description && <span className="mt-0.5 block truncate text-[12px] leading-tight text-muted-foreground">{o.description}</span>}
        </span>
        {!multiple && <Check drawn={on && expanded} reduced={reduced} />}
      </div>,
    );
  });
  if (canCreate) {
    const i = navIndex++;
    rows.push(
      <div
        key={CREATE_KEY}
        data-row={CREATE_KEY}
        data-nav={i}
        id={`${uid}-o${i}`}
        role="option"
        aria-selected={false}
        onPointerMove={() => activeKey !== CREATE_KEY && setActiveKey(CREATE_KEY)}
        onClick={() => void create()}
        className={`relative flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-[13px] ${creating === "error" ? "text-red-600 dark:text-red-400" : ""}`}
      >
        <span className="relative flex size-[22px] shrink-0 items-center justify-center rounded-full text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]">
          <span className="absolute inset-0 flex items-center justify-center" style={{ opacity: creating === "pending" ? 0 : 1, transition: `opacity 200ms ${EASE}` }}>
            <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
              <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <span
            className={`size-3 rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-none ${creating === "pending" ? "animate-spin" : ""}`}
            style={{ opacity: creating === "pending" ? 1 : 0, transition: `opacity 200ms ${EASE}` }}
          />
        </span>
        <span data-label="" className="min-w-0 truncate">
          <TextMorph>{creating === "pending" ? `Creating “${q}”` : createLabel(q)}</TextMorph>
        </span>
      </div>,
    );
  }
  if (firstLoad)
    rows.push(
      <div key="!loading" data-row="!loading" role="presentation" className="flex min-h-9 items-center gap-2.5 px-2 text-[13px] text-muted-foreground">
        <span className="size-3 rounded-full border-[1.5px] border-current border-t-transparent motion-safe:animate-spin" />
        Searching
      </div>,
    );
  else if (failed)
    rows.push(
      <div key="!error" data-row="!error" role="presentation" className="flex min-h-10 items-center gap-2 px-2 text-[13px] text-red-600 dark:text-red-400">
        <AlertIcon />
        <span className="min-w-0 flex-1 truncate">{failed}</span>
        <StatusButton
          variant="ghost"
          size="sm"
          status={loading ? "pending" : "idle"}
          labels={{ idle: "Retry", pending: "Retrying" }}
          onClick={() => {
            setFailed(null);
            setRetry((r) => r + 1);
          }}
        />
      </div>,
    );
  else if (!shown.length && !canCreate)
    rows.push(
      <div key="!empty" data-row="!empty" role="presentation" className="flex min-h-9 items-center px-2 text-[13px] text-muted-foreground">
        {emptyMessage(q)}
      </div>,
    );
  if (more)
    rows.push(
      <div key="!more" data-row="!more" role="presentation" className="px-2 pb-1.5 pt-2 text-[12px] text-muted-foreground">
        Showing {shown.length} of {pool.length}. Keep typing to narrow it down.
      </div>,
    );

  const panel = mounted
    ? createPortal(
        <div
          ref={surfaceRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
          onMouseDown={(e) => {
            // Presses in the panel keep focus in the search field.
            // (The scroller itself is only the target when its scrollbar is pressed.)
            if (!(e.target as HTMLElement).matches("input, [data-scroll-bar]")) e.preventDefault();
          }}
          className={`fixed z-[60] flex overflow-hidden rounded-[14px] border border-border bg-popover text-popover-foreground ${fit.up ? "flex-col-reverse" : "flex-col"}`}
          style={{
            ...fit.theme,
            left: fit.x,
            [fit.up ? "bottom" : "top"]: fit.y,
            width: fit.w,
            clipPath: expanded ? "inset(0px 0px 0px 0px round 14px)" : fit.up ? "inset(100% 0px 0px 0px round 14px)" : "inset(0px 0px 100% 0px round 14px)",
            opacity: expanded ? 1 : 0,
            transition: reduced
              ? "none"
              : phase === "closing"
                ? `clip-path 220ms ${EASE}, opacity 180ms ${EASE} 40ms`
                : `clip-path 360ms ${EASE}, opacity 200ms ${EASE}`,
          }}
        >
          <div className={`relative flex shrink-0 items-center gap-2 px-3 ${fit.up ? "border-t" : "border-b"} border-border`} style={{ height: SEARCH_H - 1 }}>
            <SearchIcon />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded={expanded}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active ? `${uid}-o${activeIndex}` : undefined}
              aria-label={`Search ${label.toLowerCase()}`}
              aria-busy={loading || undefined}
              value={query}
              placeholder={searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                if (!async && !reduced) rowSnap.current = snapshot(listRef.current, "data-row");
                setQuery(e.target.value);
                if (creating === "error") setCreating("idle");
                setNotice(null);
              }}
              onKeyDown={onInputKey}
              className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground [@media(pointer:coarse)]:text-[16px]"
            />
            {/* A hairline that runs along the edge while the server is asked. */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 h-px overflow-hidden ${fit.up ? "top-[-1px]" : "bottom-[-1px]"}`}
              style={{ opacity: loading ? 1 : 0, transition: `opacity ${loading ? 200 : 400}ms ${EASE} ${loading ? 150 : 0}ms` }}
            >
              <span className={`absolute inset-y-0 left-0 w-2/5 bg-primary/70 ${loading && !reduced ? "animate-[ui-scan_1.1s_cubic-bezier(0.45,0,0.55,1)_infinite]" : ""}`} />
            </span>
          </div>

          <div data-scroll-bar="" className="overflow-y-auto overscroll-contain p-1" style={{ height: listH ? Math.min(listH + 8, maxList) : undefined, transition: sized && !reduced ? `height 280ms ${EASE}` : "none" }}>
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={label}
              aria-multiselectable={multiple || undefined}
              className="relative"
              style={{ opacity: stale ? 0.55 : 1, transition: `opacity ${stale ? 240 : 160}ms ${EASE} ${stale ? 140 : 0}ms` }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 rounded-[10px] bg-accent"
                style={{
                  height: mark.h,
                  transform: `translateY(${mark.y}px)`,
                  opacity: mark.on ? 1 : 0,
                  transition: reduced ? "none" : `${mark.slide ? `transform 220ms ${EASE}, height 220ms ${EASE}, ` : ""}opacity 160ms ${EASE}`,
                }}
              />
              {rows}
              <div ref={rowGhosts} aria-hidden="true" className="pointer-events-none absolute inset-0" />
            </div>
          </div>

          {multiple && (
            <div className={`flex shrink-0 items-center justify-between gap-3 px-3 text-[12px] text-muted-foreground ${fit.up ? "border-b" : "border-t"} border-border`} style={{ height: FOOTER_H }}>
              <span className={`min-w-0 truncate tabular-nums ${notice ? "text-amber-700 dark:text-amber-400" : ""}`}>
                {notice ? (
                  <span key={notice} className="inline-block animate-[ui-fade-in_320ms_cubic-bezier(0.16,1,0.3,1)_both]">
                    {notice}
                  </span>
                ) : (
                  <span className="inline-flex items-baseline">
                    <NumberRoll value={selected.length} duration={600} />
                    {max !== undefined && <span className="ml-1">of {max}</span>}
                    <span className="ml-1">selected</span>
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <span
                  className="grid"
                  style={{ gridTemplateColumns: selected.length ? "1fr" : "0fr", opacity: selected.length ? 1 : 0, transition: reduced ? "none" : `grid-template-columns 320ms ${EASE}, opacity 200ms ${EASE}` }}
                >
                  <span className="min-w-0 overflow-hidden">
                    <button
                      type="button"
                      tabIndex={selected.length ? 0 : -1}
                      onClick={clear}
                      className={`inline-flex h-6 cursor-pointer items-center rounded-full px-2 font-medium transition-colors hover:bg-accent hover:text-foreground ${FOCUS}`}
                    >
                      Clear
                    </button>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => close()}
                  className={`inline-flex h-6 cursor-pointer items-center rounded-full px-2 font-medium text-foreground transition-colors hover:bg-accent ${FOCUS}`}
                >
                  Done
                </button>
              </span>
            </div>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={anchorRef} className={`relative ${pill ? "inline-flex max-w-full" : "w-full"} ${className}`}>
      {field}
      {clearable && !multiple && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          tabIndex={single ? 0 : -1}
          disabled={disabled || !single}
          onClick={() => {
            commit(NONE);
            setAnnounce("Cleared");
            triggerRef.current?.focus({ preventScroll: true });
          }}
          className={`absolute top-1/2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${FOCUS} ${pill ? "right-6" : "right-8"}`}
          style={{
            opacity: single ? 1 : 0,
            filter: single ? "none" : "blur(3px)",
            pointerEvents: single ? undefined : "none",
            transition: reduced ? "none" : `opacity 240ms ${EASE}, filter 240ms ${EASE}`,
          }}
        >
          <Cross />
        </button>
      )}
      {panel}
      {name && (selected.length ? selected.map((o) => <input key={o.value} type="hidden" name={name} value={o.value} />) : <input type="hidden" name={name} value="" />)}
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
