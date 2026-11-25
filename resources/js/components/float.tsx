"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  EASE_OUT,
  INTERACTION_FOCUS,
  MATERIAL_LIFT,
  createSpring,
  rubberBand,
  softenVelocity,
  useInteractionActivity,
  useInteractionReducedMotion,
  type Spring,
} from "./ui-interaction-motion";
import { playSound } from "./ui-sounds";

/* ─────────────────────────────────────────────────────────
 * FLOAT: velocity-snapping, edge-tucking workspace PiP
 *
 *   throw    grab anywhere on the surface and flick: release
 *            velocity projects the landing corner and feeds
 *            directly into createSpring with subtle banking tilt,
 *            so the card carries its momentum into the corner
 *
 *   tuck     push or flick past the left or right wall and it
 *            tucks off-screen into a slim hairline tab pinned to
 *            the wall that stays alive (`edgePeek`: ticking clock,
 *            speaking dot, progress). Pull the tab inward or tap
 *            it to spring straight back out.
 *
 *   infra    one-line wrapper `<Float edgePeek={...}>{children}</Float>`,
 *            supports both `viewport` (fixed overlay) and `container`
 *            (bounded canvas/pane), optional localStorage persistence,
 *            resize-safe clamping and full arrow-key corner switching.
 * ───────────────────────────────────────────────────────── */

export type FloatCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type FloatEdge = "left" | "right";

export interface FloatProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Floating card content (call widget, mini player, timer, agent status, support chat). */
  children: React.ReactNode;
  /** Live content shown inside the slim edge tab while tucked against the left or right wall. */
  edgePeek?: React.ReactNode;
  /** Controlled docked corner. */
  corner?: FloatCorner;
  /** Initial corner when uncontrolled (default "bottom-right"). */
  defaultCorner?: FloatCorner;
  onCornerChange?: (corner: FloatCorner) => void;
  /** Controlled edge-tucked state. */
  tucked?: boolean;
  /** Initial tucked state when uncontrolled (default false). */
  defaultTucked?: boolean;
  onTuckedChange?: (tucked: boolean, edge: FloatEdge) => void;
  /** Allow flicking or pushing past the left/right walls to tuck into the live edge tab (default true). */
  tuckable?: boolean;
  /** Subtle live 8×8 Bayer optical pulse along the edge tab's wall seam when active (default true). */
  live?: boolean;
  /** "viewport" docks fixed to the browser window; "container" bounds inside a relative parent (default "viewport"). */
  scope?: "viewport" | "container";
  /** Safe inset from edges in CSS px (default 16). */
  margin?: number;
  /** Optional localStorage key to persist the user's corner and tucked state across reloads. */
  storageKey?: string;
  /** Accessible name describing the floating panel (e.g. "Active huddle"). */
  label?: string;
  /** Opt-in quiet Web Audio landing knocks and tuck ticks (from ui-sounds.ts). */
  sound?: boolean;
}

type Sample = { x: number; y: number; t: number };

const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, summary, [role="button"], [role="slider"], [contenteditable="true"], [data-float-no-drag]';

const BAYER8: Float32Array = (() => {
  const m = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ];
  const out = new Float32Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      out[(y << 3) | x] = (m[y][x] + 0.5) / 64;
    }
  }
  return out;
})();

const IS_LE = (() => {
  const b = new ArrayBuffer(4);
  new Uint32Array(b)[0] = 0x0a0b0c0d;
  return new Uint8Array(b)[0] === 0x0d;
})();

function packRgba(r: number, g: number, b: number, a: number): number {
  const ri = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  const gi = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  const bi = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  const ai = a < 0 ? 0 : a > 255 ? 255 : a | 0;
  return IS_LE ? ((ai << 24) | (bi << 16) | (gi << 8) | ri) >>> 0 : ((ri << 24) | (gi << 16) | (bi << 8) | ai) >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => (Number.isFinite(v) ? clamp(v, 0, 1) : 0);

function cornerEdge(corner: FloatCorner): FloatEdge {
  return corner.endsWith("left") ? "left" : "right";
}

function cornerCoords(corner: FloatCorner, bw: number, bh: number, cw: number, ch: number, margin: number): { x: number; y: number } {
  const maxX = Math.max(margin, bw - cw - margin);
  const maxY = Math.max(margin, bh - ch - margin);
  const x = corner.endsWith("left") ? margin : maxX;
  const y = corner.startsWith("top") ? margin : maxY;
  return { x, y };
}

function cornerFromPoint(cx: number, cy: number, bw: number, bh: number): FloatCorner {
  const horiz = cx < bw * 0.5 ? "left" : "right";
  const vert = cy < bh * 0.5 ? "top" : "bottom";
  return `${vert}-${horiz}` as FloatCorner;
}

function readVelocity(samples: Sample[], now: number): { vx: number; vy: number } {
  if (samples.length < 2 || now - samples[samples.length - 1].t > 110) return { vx: 0, vy: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = Math.max(8, last.t - first.t);
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}

const storageListeners = new Set<() => void>();
function subscribeStorage(cb: () => void) {
  storageListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    storageListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readStorageRaw(key: string | undefined): string | null {
  if (!key || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function Float({
  children,
  edgePeek,
  corner: controlledCorner,
  defaultCorner = "bottom-right",
  onCornerChange,
  tucked: controlledTucked,
  defaultTucked = false,
  onTuckedChange,
  tuckable = true,
  live = true,
  scope = "viewport",
  margin = 16,
  storageKey,
  label = "Floating panel",
  sound = false,
  className = "",
  ...props
}: FloatProps) {
  const reduced = useInteractionReducedMotion();
  const { ref: overlayRef, active: onScreen } = useInteractionActivity<HTMLDivElement>();

  const savedRaw = React.useSyncExternalStore(
    subscribeStorage,
    () => readStorageRaw(storageKey),
    () => null,
  );
  const saved = React.useMemo(() => {
    if (!savedRaw) return null;
    try {
      return JSON.parse(savedRaw) as { corner?: FloatCorner; tucked?: boolean };
    } catch {
      return null;
    }
  }, [savedRaw]);

  const [ownCorner, setOwnCorner] = React.useState<FloatCorner | null>(null);
  const [ownTucked, setOwnTucked] = React.useState<boolean | null>(null);
  const corner: FloatCorner = controlledCorner ?? ownCorner ?? saved?.corner ?? defaultCorner;
  const tucked: boolean = controlledTucked ?? ownTucked ?? saved?.tucked ?? defaultTucked;
  const edge = cornerEdge(corner);

  const [dragging, setDragging] = React.useState(false);
  const [tuckHint, setTuckHint] = React.useState<FloatEdge | null>(null);
  const [tabY, setTabY] = React.useState<number | null>(null);
  const [liveStatus, setLiveStatus] = React.useState("");

  const cardRef = React.useRef<HTMLDivElement>(null);
  const tabRef = React.useRef<HTMLButtonElement>(null);
  const seamCanvasRef = React.useRef<HTMLCanvasElement>(null);

  const boundsRef = React.useRef({ w: 0, h: 0 });
  const cardSizeRef = React.useRef({ w: 0, h: 0 });
  const mountedPosRef = React.useRef(false);

  const springsRef = React.useRef<{ x: Spring; y: Spring; tilt: Spring } | null>(null);
  const dragRef = React.useRef<{
    active: boolean;
    started: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    samples: Sample[];
  } | null>(null);

  const tabPullRef = React.useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    pulled: boolean;
  } | null>(null);

  const setCornerState = React.useCallback(
    (next: FloatCorner) => {
      if (controlledCorner === undefined) setOwnCorner(next);
      onCornerChange?.(next);
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify({ corner: next, tucked }));
          storageListeners.forEach((fn) => fn());
        } catch {}
      }
    },
    [controlledCorner, onCornerChange, storageKey, tucked],
  );

  const setTuckedState = React.useCallback(
    (next: boolean, nextCorner: FloatCorner = corner) => {
      const nextEdge = cornerEdge(nextCorner);
      if (controlledTucked === undefined) setOwnTucked(next);
      onTuckedChange?.(next, nextEdge);
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify({ corner: nextCorner, tucked: next }));
          storageListeners.forEach((fn) => fn());
        } catch {}
      }
    },
    [controlledTucked, onTuckedChange, storageKey, corner],
  );

  // Helper: read container + card geometry
  const measure = React.useCallback(() => {
    const overlay = overlayRef.current;
    const card = cardRef.current;
    if (!overlay || !card) return false;
    const ob = overlay.getBoundingClientRect();
    const cb = card.getBoundingClientRect();
    if (ob.width <= 0 || ob.height <= 0 || cb.width <= 0 || cb.height <= 0) return false;
    boundsRef.current = { w: ob.width, h: ob.height };
    cardSizeRef.current = { w: cb.width, h: cb.height };
    return true;
  }, [overlayRef]);

  // Helper: compute target (x, y) for current corner & tucked state
  const targetForState = React.useCallback(
    (c: FloatCorner, isTucked: boolean, customY?: number | null) => {
      const { w: bw, h: bh } = boundsRef.current;
      const { w: cw, h: ch } = cardSizeRef.current;
      const base = cornerCoords(c, bw, bh, cw, ch, margin);
      if (!isTucked) return base;
      const e = cornerEdge(c);
      const offX = e === "left" ? -(cw + 24) : bw + 24;
      const y = customY !== null && customY !== undefined ? clamp(customY, margin, Math.max(margin, bh - ch - margin)) : base.y;
      return { x: offX, y };
    },
    [margin],
  );

  // Core 3-spring physics rig (posX, posY, banking tilt) writing straight to GPU transform
  React.useEffect(() => {
    const paint = () => {
      const sp = springsRef.current;
      const card = cardRef.current;
      if (!sp || !card) return;
      const x = sp.x.get();
      const y = sp.y.get();
      const deg = sp.tilt.get();
      card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${deg.toFixed(2)}deg)`;
    };

    const x = createSpring(margin, { stiffness: 255, damping: 24 }, paint, 0.25);
    const y = createSpring(margin, { stiffness: 255, damping: 24 }, paint, 0.25);
    const tilt = createSpring(0, { stiffness: 220, damping: 20 }, paint, 0.04);
    springsRef.current = { x, y, tilt };

    const syncLayout = (jumpNow: boolean) => {
      if (!measure()) return;
      if (dragRef.current?.started) return;
      const t = targetForState(corner, tucked, tabY);
      if (jumpNow || !mountedPosRef.current || reduced) {
        x.jump(t.x);
        y.jump(t.y);
        tilt.jump(0);
        mountedPosRef.current = true;
      } else {
        x.set(t.x);
        y.set(t.y);
        tilt.set(0);
      }
      if (cardRef.current) cardRef.current.style.opacity = "1";
    };

    syncLayout(true);

    const ro = new ResizeObserver(() => syncLayout(true));
    if (overlayRef.current) ro.observe(overlayRef.current);
    if (cardRef.current) ro.observe(cardRef.current);

    return () => {
      ro.disconnect();
      x.stop();
      y.stop();
      tilt.stop();
      springsRef.current = null;
    };
    // Initial mount & resize observer only; state transitions handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayRef]);

  // Animate cleanly whenever corner or tucked changes programmatically or via keyboard
  React.useEffect(() => {
    const sp = springsRef.current;
    if (!sp || !measure() || dragRef.current?.started) return;
    const t = targetForState(corner, tucked, tabY);
    if (reduced || !mountedPosRef.current) {
      sp.x.jump(t.x);
      sp.y.jump(t.y);
      sp.tilt.jump(0);
      mountedPosRef.current = true;
    } else {
      sp.x.set(t.x);
      sp.y.set(t.y);
      sp.tilt.set(0);
    }
  }, [corner, tucked, tabY, reduced, measure, targetForState]);

  // Subtle 1.5px 8×8 Bayer live optical pulse along the wall seam of the tucked edge tab (0% CPU when untucked!)
  React.useEffect(() => {
    const canvas = seamCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !tucked || !live || !onScreen || reduced) {
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const gridCanvas = document.createElement("canvas");
    const gridCtx = gridCanvas.getContext("2d");
    if (!gridCtx) return;

    let raf = 0;
    let time = 0;
    let last = 0;
    let gCols = 0;
    let gRows = 0;
    let gridImg: ImageData | null = null;
    let gridU32: Uint32Array | null = null;

    const tick = (now: number) => {
      const dt = last ? Math.min(1 / 24, (now - last) / 1000) : 1 / 60;
      last = now;
      time += dt;

      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w > 0 && h > 0) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        const pitch = 1.5;
        const cols = Math.max(1, Math.ceil(w / pitch));
        const rows = Math.max(1, Math.ceil(h / pitch));
        if (cols !== gCols || rows !== gRows || !gridImg || !gridU32) {
          gCols = cols;
          gRows = rows;
          gridCanvas.width = cols;
          gridCanvas.height = rows;
          gridImg = gridCtx.createImageData(cols, rows);
          gridU32 = new Uint32Array(gridImg.data.buffer);
        }
        const u32 = gridU32;
        u32.fill(0);
        const pulseV = 0.5 + 0.38 * Math.sin(time * 2.1);
        for (let r = 0; r < rows; r++) {
          const v = (r + 0.5) / rows;
          const bRow = (r & 7) << 3;
          const rowOff = r * cols;
          const wave = Math.exp(-((v - pulseV) ** 2) / 0.14);
          for (let c = 0; c < cols; c++) {
            const u = (c + 0.5) / cols;
            const seam = edge === "left" ? 1 - u : u;
            const d = Math.pow(seam, 1.35) * (0.28 + 0.58 * wave);
            const bayer = BAYER8[bRow | (c & 7)];
            const hit = clamp01((d - bayer + 0.05) / 0.14);
            if (hit > 0.02) {
              u32[rowOff + c] = packRgba(52, 211, 153, hit * (0.35 + wave * 0.55) * 255);
            }
          }
        }
        gridCtx.putImageData(gridImg, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(gridCanvas, 0, 0, cols * pitch, rows * pitch);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [tucked, live, onScreen, reduced, edge]);

  // Card drag & velocity-projected throw / edge-tuck handlers
  const handleCardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
    if (!measure() || !springsRef.current) return;

    dragRef.current = {
      active: true,
      started: false,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: springsRef.current.x.get(),
      originY: springsRef.current.y.get(),
      samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }],
    };
  };

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const sp = springsRef.current;
    if (!drag || !drag.active || drag.pointerId !== e.pointerId || !sp) return;

    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;

    if (!drag.started) {
      if (Math.hypot(dx, dy) < 4) return;
      drag.started = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }

    const now = performance.now();
    drag.samples.push({ x: e.clientX, y: e.clientY, t: now });
    while (drag.samples.length > 2 && now - drag.samples[0].t > 95) drag.samples.shift();

    const { w: bw, h: bh } = boundsRef.current;
    const { w: cw, h: ch } = cardSizeRef.current;
    const minX = margin;
    const maxX = Math.max(margin, bw - cw - margin);
    const minY = margin;
    const maxY = Math.max(margin, bh - ch - margin);

    const rawX = drag.originX + dx;
    const rawY = drag.originY + dy;

    let displayX = rawX;
    if (rawX < minX) displayX = minX + rubberBand(rawX - minX, 180, 0.55);
    else if (rawX > maxX) displayX = maxX + rubberBand(rawX - maxX, 180, 0.55);

    let displayY = rawY;
    if (rawY < minY) displayY = minY + rubberBand(rawY - minY, 120, 0.45);
    else if (rawY > maxY) displayY = maxY + rubberBand(rawY - maxY, 120, 0.45);

    sp.x.jump(displayX);
    sp.y.jump(displayY);

    if (!reduced) {
      const { vx } = readVelocity(drag.samples, now);
      sp.tilt.set(clamp(vx * 5.2, -6.5, 6.5));
    }

    if (tuckable) {
      const pastLeft = minX - rawX;
      const pastRight = rawX - maxX;
      if (pastLeft > 26) setTuckHint("left");
      else if (pastRight > 26) setTuckHint("right");
      else setTuckHint(null);
    }
  };

  const finishCardDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const sp = springsRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setTuckHint(null);

    if (!drag.started || !sp) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const now = performance.now();
    const { vx, vy } = readVelocity(drag.samples, now);
    const { w: bw, h: bh } = boundsRef.current;
    const { w: cw, h: ch } = cardSizeRef.current;
    const curX = sp.x.get();
    const curY = sp.y.get();
    const minX = margin;
    const maxX = Math.max(margin, bw - cw - margin);

    // Project where the throw is heading (190ms look-ahead)
    const projX = curX + vx * 190;
    const projY = curY + vy * 190;

    const rawDx = e.clientX - drag.startClientX;
    const rawX = drag.originX + rawDx;

    // Check edge-tuck trigger: pushed past wall OR flicked directly outward from near that wall
    // (never accidentally tucks a brisk cross-canvas throw meant for the opposite corner!)
    const shouldTuckLeft = tuckable && (minX - rawX > 24 || (curX <= minX + 10 && vx < -0.65));
    const shouldTuckRight = tuckable && (rawX - maxX > 24 || (curX >= maxX - 10 && vx > 0.65));

    if (shouldTuckLeft || shouldTuckRight) {
      const vert = projY + ch * 0.5 < bh * 0.5 ? "top" : "bottom";
      const nextCorner = `${vert}-${shouldTuckLeft ? "left" : "right"}` as FloatCorner;
      const clampedY = clamp(curY, margin, Math.max(margin, bh - ch - margin));
      const centeredTabY = Math.round(clampedY + Math.max(0, (ch - 44) * 0.5));
      setTabY(centeredTabY);
      setCornerState(nextCorner);
      setTuckedState(true, nextCorner);
      const target = targetForState(nextCorner, true, clampedY);
      if (reduced) {
        sp.x.jump(target.x);
        sp.y.jump(target.y);
        sp.tilt.jump(0);
      } else {
        sp.x.set(target.x);
        sp.y.set(target.y);
        sp.x.push(softenVelocity(vx * 900, target.x - curX, 11));
        sp.tilt.set(0);
      }
      if (sound) playSound("fold", 0.32);
      setLiveStatus(`${label} tucked into ${shouldTuckLeft ? "left" : "right"} edge`);
      return;
    }

    // Standard velocity-projected corner snap
    const nextCorner = cornerFromPoint(projX + cw * 0.5, projY + ch * 0.5, bw, bh);
    setTabY(null);
    setCornerState(nextCorner);
    if (tucked) setTuckedState(false, nextCorner);
    const target = targetForState(nextCorner, false);

    if (reduced) {
      sp.x.jump(target.x);
      sp.y.jump(target.y);
      sp.tilt.jump(0);
    } else {
      sp.x.set(target.x);
      sp.y.set(target.y);
      sp.x.push(softenVelocity(vx * 900, target.x - curX, 10));
      sp.y.push(softenVelocity(vy * 900, target.y - curY, 10));
      sp.tilt.set(0);
    }
    if (sound) playSound("drop", 0.34);
    setLiveStatus(`${label} moved to ${nextCorner.replace("-", " ")}`);
  };

  // Untuck helper (from clicking/pulling the live edge tab or keyboard arrow)
  const untuck = React.useCallback(
    (pushVx = 0) => {
      if (!tucked) return;
      const sp = springsRef.current;
      setTabY(null);
      setTuckedState(false, corner);
      if (sp && measure()) {
        const target = targetForState(corner, false);
        if (reduced) {
          sp.x.jump(target.x);
          sp.y.jump(target.y);
          sp.tilt.jump(0);
        } else {
          sp.x.set(target.x);
          sp.y.set(target.y);
          if (pushVx !== 0) sp.x.push(pushVx);
          sp.tilt.set(0);
        }
      }
      if (sound) playSound("unfold", 0.32);
      setLiveStatus(`${label} restored to ${corner.replace("-", " ")}`);
    },
    [tucked, corner, setTuckedState, measure, targetForState, reduced, sound, label],
  );

  // Pull-from-edge gesture on the live edge tab (tap to open, or pull inward past 14px to spring straight out!)
  const handleTabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    tabPullRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      pulled: false,
    };
  };

  const handleTabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const pull = tabPullRef.current;
    if (!pull || pull.pointerId !== e.pointerId || pull.pulled) return;
    const dx = e.clientX - pull.startClientX;
    const inward = edge === "left" ? dx : -dx;
    if (inward > 16) {
      pull.pulled = true;
      untuck((edge === "left" ? 1 : -1) * 420);
    }
  };

  const handleTabPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const pull = tabPullRef.current;
    if (!pull || pull.pointerId !== e.pointerId) return;
    tabPullRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!pull.pulled) {
      untuck((edge === "left" ? 1 : -1) * 260);
    }
  };

  // Arrow-key corner switching & edge tucking for full keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    const isTop = corner.startsWith("top");
    const isLeft = corner.endsWith("left");

    if (tucked) {
      if (e.key === "Enter" || e.key === " " || (isLeft && e.key === "ArrowRight") || (!isLeft && e.key === "ArrowLeft")) {
        e.preventDefault();
        untuck();
        window.setTimeout(() => cardRef.current?.focus(), 60);
      }
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (isLeft && tuckable) {
        setTuckedState(true, corner);
        if (sound) playSound("fold", 0.3);
        setLiveStatus(`${label} tucked into left edge`);
        window.setTimeout(() => tabRef.current?.focus(), 60);
      } else {
        const next = `${isTop ? "top" : "bottom"}-left` as FloatCorner;
        setCornerState(next);
        if (sound) playSound("drop", 0.28);
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (!isLeft && tuckable) {
        setTuckedState(true, corner);
        if (sound) playSound("fold", 0.3);
        setLiveStatus(`${label} tucked into right edge`);
        window.setTimeout(() => tabRef.current?.focus(), 60);
      } else {
        const next = `${isTop ? "top" : "bottom"}-right` as FloatCorner;
        setCornerState(next);
        if (sound) playSound("drop", 0.28);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = `top-${isLeft ? "left" : "right"}` as FloatCorner;
      setCornerState(next);
      if (sound) playSound("drop", 0.28);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = `bottom-${isLeft ? "left" : "right"}` as FloatCorner;
      setCornerState(next);
      if (sound) playSound("drop", 0.28);
    }
  };

  // Compute clean vertical positioning for the live edge tab
  const tabTopStyle: React.CSSProperties =
    tabY !== null
      ? { top: `${tabY}px` }
      : corner.startsWith("top")
        ? { top: `${margin + 12}px` }
        : { bottom: `${margin + 12}px` };

  return (
    <div
      ref={overlayRef}
      className={`${scope === "viewport" ? "fixed inset-0 z-50" : "absolute inset-0 z-20"} pointer-events-none overflow-hidden ${className}`}
      {...props}
    >
      {/* Subtle wall-dock magnetic cue while dragging past the left or right tuck threshold */}
      {tuckable && (
        <>
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-primary transition-opacity duration-150 ${
              tuckHint === "left" ? "opacity-90" : "opacity-0"
            }`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-4 right-0 w-[3px] rounded-l-full bg-primary transition-opacity duration-150 ${
              tuckHint === "right" ? "opacity-90" : "opacity-0"
            }`}
          />
        </>
      )}

      {/* Draggable velocity-snapping floating surface */}
      <div
        ref={cardRef}
        role="region"
        aria-label={`${label}. Drag to a corner, flick past an edge to tuck, or use arrow keys.`}
        aria-hidden={tucked || undefined}
        tabIndex={tucked ? -1 : 0}
        data-corner={corner}
        data-tucked={tucked ? "true" : "false"}
        data-dragging={dragging ? "true" : "false"}
        onPointerDown={handleCardPointerDown}
        onPointerMove={handleCardPointerMove}
        onPointerUp={finishCardDrag}
        onPointerCancel={finishCardDrag}
        onKeyDown={handleKeyDown}
        className={`absolute left-0 top-0 touch-none select-none rounded-[16px] ${
          tucked ? "pointer-events-none" : "pointer-events-auto"
        } ${dragging ? "cursor-grabbing" : "cursor-grab"} ${INTERACTION_FOCUS}`}
        style={{ opacity: 0, willChange: "transform" }}
      >
        {children}
      </div>

      {/* Signature Live Edge Tab pinned flush against the left or right wall while tucked */}
      {tuckable && (
        <button
          ref={tabRef}
          type="button"
          tabIndex={tucked ? 0 : -1}
          aria-hidden={!tucked || undefined}
          aria-label={`Restore ${label} from ${edge} edge`}
          data-float-tab={edge}
          onPointerDown={handleTabPointerDown}
          onPointerMove={handleTabPointerMove}
          onPointerUp={handleTabPointerUp}
          onPointerCancel={handleTabPointerUp}
          onKeyDown={handleKeyDown}
          className={`group/tab absolute flex h-11 touch-none select-none items-center gap-2 overflow-hidden border border-border bg-card text-card-foreground ${MATERIAL_LIFT} ${INTERACTION_FOCUS} ${
            edge === "left"
              ? "left-0 rounded-r-[13px] border-l-0 pl-2.5 pr-2.5"
              : "right-0 rounded-l-[13px] border-r-0 pl-2.5 pr-2.5"
          } ${tucked ? "pointer-events-auto cursor-pointer" : "pointer-events-none"}`}
          style={{
            ...tabTopStyle,
            transform: tucked
              ? "translate3d(0, 0, 0)"
              : edge === "left"
                ? "translate3d(-110%, 0, 0)"
                : "translate3d(110%, 0, 0)",
            opacity: tucked ? 1 : 0,
            transition: reduced ? "none" : `transform 320ms ${EASE_OUT}, opacity 200ms ${EASE_OUT}`,
          }}
        >
          {/* Live 8×8 Bayer optical pulse along the full wall seam (0% CPU when untucked) */}
          <canvas
            ref={seamCanvasRef}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 h-full w-3.5 ${edge === "left" ? "left-0" : "right-0"}`}
          />

          {edge === "right" && (
            <span
              aria-hidden="true"
              className="relative z-10 flex items-center text-muted-foreground transition-transform duration-150 group-hover/tab:-translate-x-0.5"
            >
              <ChevronLeft className="size-3.5" strokeWidth={2.2} />
            </span>
          )}

          <span className="relative z-10 inline-flex items-center gap-2 text-[12.5px] font-medium tabular-nums">
            {edgePeek ?? (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span>Live</span>
              </span>
            )}
          </span>

          {edge === "left" && (
            <span
              aria-hidden="true"
              className="relative z-10 flex items-center text-muted-foreground transition-transform duration-150 group-hover/tab:translate-x-0.5"
            >
              <ChevronRight className="size-3.5" strokeWidth={2.2} />
            </span>
          )}
        </button>
      )}

      <span className="sr-only" role="status" aria-live="polite">
        {liveStatus}
      </span>
    </div>
  );
}

export default Float;
