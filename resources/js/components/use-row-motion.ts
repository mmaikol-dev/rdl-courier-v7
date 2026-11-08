"use client";

import * as React from "react";

/* ─────────────────────────────────────────────────────────
 * ROW MOTION: rows that keep their place on screen
 *
 *   glide     after any render (a sort, a filter, new data from
 *             the server) every row that moved glides from its
 *             old place to its new one. Glides are additive, so
 *             a change that lands mid-glide adds its own offset
 *             instead of restarting anything
 *   travel    a row that sorts onto the page slides in from the
 *             side where it ranked before; one that sorts off
 *             slides out toward its new rank
 *   enter     a row that's new to the list fades in where it
 *             lands while the rows below glide clear of it
 *   leave     a row that's gone folds away where it stood. Its
 *             copy is the row's own element, detached by React
 *             and moved into a layer React never renders into,
 *             so a leaving row costs no render at all
 *   stagger   a sort can ask for the rows to set off one after
 *             another, top first
 *
 * Positions are layout offsets (transforms ignored), kept after
 * every render and whenever the list changes size (a row
 * opening its detail), so they're never stale. Rows are found
 * by data-row-id; ranks are their places in the whole sorted
 * list, not just the page.
 * ───────────────────────────────────────────────────────── */

type Seen = { top: number; height: number; el: HTMLElement };

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const GLIDE = 480;

export function useRowMotion(
  container: React.RefObject<HTMLElement | null>,
  { reduced, resetKey, ranks, ghosts }: { reduced: boolean; resetKey?: string | number; ranks: ReadonlyMap<string, number>; ghosts: React.RefObject<HTMLElement | null> },
) {
  const seen = React.useRef(new Map<string, Seen>());
  const lastRanks = React.useRef(ranks);
  const lastKey = React.useRef(resetKey);
  const staggerNext = React.useRef(false);

  const read = React.useCallback(() => {
    const out = new Map<string, Seen>();
    container.current?.querySelectorAll<HTMLElement>("[data-row-id]").forEach((el) => out.set(el.dataset.rowId!, { top: el.offsetTop, height: el.offsetHeight, el }));
    return out;
  }, [container]);

  /** The row React just removed, back on screen where it stood, leaving: sliding toward where it went, or folding. */
  const leave = (was: Seen, dy: number) => {
    const layer = ghosts.current;
    const el = was.el;
    if (!layer || el.isConnected) return;
    // No getAnimations() here (it flushes style for the whole page): the exit below is added last and replaces any
    // glide still on the element.
    el.removeAttribute("data-row-id");
    el.removeAttribute("tabindex");
    el.setAttribute("aria-hidden", "true");
    el.inert = true;
    Object.assign(el.style, { position: "absolute", left: "0", right: "0", top: `${was.top}px`, height: `${was.height}px`, margin: "0", overflow: "hidden" });
    layer.appendChild(el);
    const a = el.animate(
      dy
        ? [
            { transform: "translateY(0px)", opacity: 1, filter: "blur(0px)" },
            { transform: `translateY(${dy}px)`, opacity: 0, filter: "blur(3px)" },
          ]
        : [
            { opacity: 1, transform: "none", filter: "blur(0px)" },
            { opacity: 0, transform: "scale(0.985)", filter: "blur(4px)" },
          ],
      { duration: dy ? 360 : 280, easing: EASE, fill: "forwards" },
    );
    a.onfinish = a.oncancel = () => el.remove();
  };

  React.useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const before = seen.current;
    const after = read();
    const prevRanks = lastRanks.current;
    seen.current = after;
    lastRanks.current = ranks;
    const stagger = staggerNext.current;
    staggerNext.current = false;
    if (lastKey.current !== resetKey) {
      // A different page: the caller slides the whole body; nothing glides and nothing folds.
      lastKey.current = resetKey;
      return;
    }
    if (reduced || !before.size) return;

    // A typical row's height. Rows that come onto or leave the page only hint at the way they went (a row and a
    // quarter at most), so the list never shows holes while they travel.
    const heights = [...after.values()].map((b) => b.height).sort((a, b) => a - b);
    const rowH = heights[Math.floor(heights.length / 2)] ?? 48;
    const clamp = (dy: number) => Math.max(-rowH * 1.25, Math.min(rowH * 1.25, dy));

    let order = 0;
    after.forEach((now, id) => {
      const row = now.el;
      const was = before.get(id);
      const delay = stagger ? Math.min(order++ * 16, 200) : 0;
      if (was) {
        const dy = was.top - now.top;
        if (Math.abs(dy) < 0.5) return;
        row.animate([{ transform: `translateY(${dy}px)`, zIndex: 1 }, { transform: "translateY(0px)", zIndex: 1 }], { duration: GLIDE, delay, easing: EASE, composite: "add", fill: "backwards" });
        return;
      }
      const from = prevRanks.get(id);
      const to = ranks.get(id);
      if (from !== undefined && to !== undefined) {
        // It ranked somewhere off the page: it comes in from that side.
        row.animate(
          [
            { transform: `translateY(${clamp((from - to) * rowH)}px)`, opacity: 0, filter: "blur(3px)" },
            { transform: "translateY(0px)", opacity: 1, filter: "blur(0px)" },
          ],
          { duration: GLIDE, delay: delay / 2, easing: EASE, fill: "backwards" },
        );
        return;
      }
      row.animate(
        [
          { opacity: 0, filter: "blur(4px)" },
          { opacity: 1, filter: "blur(0px)" },
        ],
        { duration: 420, delay: 90, easing: EASE, fill: "backwards" },
      );
    });

    // Still in the list, just not on this page: its copy slides toward where it went. Gone for good: it folds.
    before.forEach((was, id) => {
      if (after.has(id)) return;
      const from = prevRanks.get(id);
      const to = ranks.get(id);
      leave(was, from !== undefined && to !== undefined ? clamp((to - from) * rowH) || rowH : 0);
    });
  });

  // The list changed size without a render of ours (a detail opening by transition): keep the positions true.
  React.useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      seen.current = read();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [container, read]);

  return {
    /** The next change (a sort) sets the rows off one after another. */
    stagger: () => {
      staggerNext.current = true;
    },
  };
}
