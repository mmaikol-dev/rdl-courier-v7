"use client";

import * as React from "react";

/* ─────────────────────────────────────────────────────────
 * FLOATING: what every popover, menu and tooltip shares
 *
 *   place     beside an anchor on a side, lined up start, centre
 *             or end; flips to the other side when it doesn't fit
 *             and shifts to stay `padding` inside the viewport;
 *             follows scroll and resize
 *   presence  mounts on open, shows a frame later (so the entry
 *             transitions run), hides, then unmounts after `exit`
 *   dismiss   Escape and a press outside both close it
 *   theme     the portal carries the anchor's theme tokens, so a
 *             light specimen on a dark page stays light
 * ───────────────────────────────────────────────────────── */

export type Side = "top" | "bottom" | "left" | "right";
export type Align = "start" | "center" | "end";

const TOKENS = ["--background", "--foreground", "--popover", "--popover-foreground", "--border", "--accent", "--accent-foreground", "--primary", "--primary-foreground", "--muted", "--muted-foreground", "--ring", "--card"];

/** The anchor's theme tokens as inline styles for something portalled out of its tree. */
export function themeVars(anchor: Element | null): React.CSSProperties {
  if (!anchor) return {};
  const style = getComputedStyle(anchor);
  const vars: Record<string, string> = {};
  for (const t of TOKENS) {
    const v = style.getPropertyValue(t);
    if (v) vars[t] = v;
  }
  return vars as React.CSSProperties;
}

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

export interface Placement {
  x: number;
  y: number;
  side: Side;
  /** Where the surface grows from, for transform-origin. */
  origin: string;
  ready: boolean;
}

/** Positions `floating` (position: fixed) next to `anchor` while `open`. Pass a point instead of an anchor for context menus. */
export function useFloating({
  open,
  anchor,
  point,
  floating,
  side = "bottom",
  align = "center",
  offset = 8,
  padding = 8,
}: {
  open: boolean;
  anchor?: React.RefObject<Element | null>;
  point?: { x: number; y: number } | null;
  floating: React.RefObject<HTMLElement | null>;
  side?: Side;
  align?: Align;
  offset?: number;
  padding?: number;
}): Placement {
  const [place, setPlace] = React.useState<Placement>({ x: -9999, y: -9999, side, origin: "center", ready: false });

  React.useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const measure = () => {
      const el = floating.current;
      if (!el) return;
      const a = point
        ? { left: point.x, right: point.x, top: point.y, bottom: point.y, width: 0, height: 0 }
        : anchor?.current?.getBoundingClientRect();
      if (!a) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const room: Record<Side, number> = { top: a.top - padding, bottom: vh - a.bottom - padding, left: a.left - padding, right: vw - a.right - padding };
      const need = side === "top" || side === "bottom" ? h + offset : w + offset;
      const s = room[side] < need && room[OPPOSITE[side]] > room[side] ? OPPOSITE[side] : side;
      let x: number;
      let y: number;
      if (s === "top" || s === "bottom") {
        y = s === "bottom" ? a.bottom + offset : a.top - offset - h;
        x = align === "start" ? a.left : align === "end" ? a.right - w : a.left + a.width / 2 - w / 2;
        if (point) x = a.left;
      } else {
        x = s === "right" ? a.right + offset : a.left - offset - w;
        y = align === "start" ? a.top : align === "end" ? a.bottom - h : a.top + a.height / 2 - h / 2;
      }
      x = Math.max(padding, Math.min(vw - padding - w, x));
      y = Math.max(padding, Math.min(vh - padding - h, y));
      // Grow from the point on the anchor's edge nearest the surface.
      const ox = s === "left" ? "100%" : s === "right" ? "0%" : `${Math.max(0, Math.min(w, a.left + a.width / 2 - x))}px`;
      const oy = s === "top" ? "100%" : s === "bottom" ? "0%" : `${Math.max(0, Math.min(h, a.top + a.height / 2 - y))}px`;
      const next = { x: Math.round(x), y: Math.round(y), side: s, origin: `${ox} ${oy}`, ready: true };
      setPlace((p) => (p.x === next.x && p.y === next.y && p.side === next.side && p.origin === next.origin && p.ready ? p : next));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const ro = new ResizeObserver(schedule);
    if (floating.current) ro.observe(floating.current);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [open, anchor, point, floating, side, align, offset, padding]);

  return open ? place : { ...place, ready: false };
}

/** Mount → show next frame → hide → unmount after `exit` ms. */
export function usePresence(open: boolean, exit = 160) {
  const [mounted, setMounted] = React.useState(open);
  const [shown, setShown] = React.useState(false);
  if (open && !mounted) setMounted(true);
  React.useEffect(() => {
    if (open) {
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    const timer = window.setTimeout(() => {
      setMounted(false);
      setShown(false);
    }, exit);
    return () => window.clearTimeout(timer);
  }, [open, exit]);
  return { mounted: mounted || open, shown: open && shown };
}

/** Escape and presses outside `refs` call onDismiss while `open`. */
export function useDismiss(open: boolean, onDismiss: (reason: "escape" | "outside") => void, refs: React.RefObject<Element | null>[]) {
  const latest = React.useRef({ onDismiss, refs });
  React.useEffect(() => {
    latest.current = { onDismiss, refs };
  });
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      latest.current.onDismiss("escape");
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (latest.current.refs.some((r) => r.current?.contains(target))) return;
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("[data-hairline-floating]")) return;
      latest.current.onDismiss("outside");
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);
}

/** The entry pose for a surface on `side`: it comes 6px from the anchor, 0.96 and blurred. */
export function enterStyle(shown: boolean, side: Side, reduced: boolean, ease = "cubic-bezier(0.16,1,0.3,1)"): React.CSSProperties {
  const d = 6;
  const shift = side === "top" ? `0 ${d}px` : side === "bottom" ? `0 -${d}px` : side === "left" ? `${d}px 0` : `-${d}px 0`;
  return {
    opacity: shown ? 1 : 0,
    translate: shown || reduced ? "0 0" : shift,
    scale: shown || reduced ? "1" : "0.96",
    filter: shown || reduced ? "blur(0px)" : "blur(4px)",
    transition: reduced
      ? "opacity 120ms ease-out"
      : shown
        ? `opacity 220ms ${ease}, translate 320ms ${ease}, scale 320ms ${ease}, filter 220ms ${ease}`
        : `opacity 140ms ${ease}, translate 180ms ${ease}, scale 180ms ${ease}, filter 140ms ${ease}`,
  };
}
