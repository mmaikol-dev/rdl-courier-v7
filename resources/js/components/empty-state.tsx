"use client";

import * as React from "react";
import { StatusButton, type ActionStatus } from "./status-button";
import { TextMorph } from "./text-morph";
import { EASE_OUT, EASE_SETTLE, INTERACTION_FOCUS, INTERACTION_PRESS, useInteractionReducedMotion } from "./ui-interaction-motion";
import { SCENES, TILE, VIEW, poseOffset, type EmptyStateScene, type SceneFill, type SceneShape, type SceneStroke } from "./empty-state-scenes";

export type { EmptyStateScene } from "./empty-state-scenes";

/* ─────────────────────────────────────────────────────────
 * EMPTY STATE: what a list says before there's anything in it
 *
 *   drawing   an isometric line drawing built in code on one tile,
 *             in the theme's own colours: it draws itself the first
 *             time it's seen, and when the state changes (nothing
 *             yet → no results → all done) the old object un-draws
 *             and the new one rises from the same tile
 *   action    the main action is a Status button, and the drawing
 *             acts it out: the first sheet lands in the tray, the
 *             plug goes into its socket, the lens sweeps the cards;
 *             if it throws, the piece springs back with a shake and
 *             the reason folds in under the buttons
 *   text      the title morphs letter by letter, the description
 *             cross-fades, and the height eases between them
 * ───────────────────────────────────────────────────────── */

export interface EmptyStateAction {
  label: string;
  /** Runs the action. Return a promise to show it running, then done; throw to say why it failed. */
  onAction?: () => unknown;
  /** Labels while it runs, once it worked and after it failed (Working, Done, Try again). */
  pendingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  /** Shown before the label while idle. */
  icon?: React.ReactNode;
}

export interface EmptyStateSecondaryAction {
  label: string;
  onAction?: () => void;
  /** A link instead of a button. */
  href?: string;
}

export interface EmptyStateProps {
  /** Which drawing: nothing yet (inbox), no results (search), all done, can't connect (offline) or no data (chart). */
  scene?: EmptyStateScene;
  /** Your own art in place of the drawing. */
  illustration?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** The main action, run as a Status button; or your own button. */
  action?: EmptyStateAction | React.ReactNode;
  /** A quieter second action, such as Clear filters or Learn more. */
  secondaryAction?: EmptyStateSecondaryAction;
  /** Anything under the text, such as suggested searches. */
  children?: React.ReactNode;
  className?: string;
}

const FILL: Record<SceneFill, string> = {
  top: "color-mix(in oklab, var(--foreground) 3%, var(--background))",
  left: "color-mix(in oklab, var(--foreground) 7%, var(--background))",
  right: "color-mix(in oklab, var(--foreground) 12%, var(--background))",
  hole: "color-mix(in oklab, var(--foreground) 16%, var(--background))",
  glass: "color-mix(in oklab, var(--primary) 7%, var(--background))",
  accent: "color-mix(in oklab, var(--primary) 16%, var(--background))",
  "accent-side": "color-mix(in oklab, var(--primary) 32%, var(--background))",
  none: "none",
};
const STROKE: Record<SceneStroke, string> = {
  line: "color-mix(in oklab, var(--foreground) 46%, var(--background))",
  faint: "color-mix(in oklab, var(--foreground) 20%, var(--background))",
  accent: "var(--primary)",
};

// Slightly longer than the path, so a drawn line never shows a hairline gap where it closes.
const DASH = 1.02;
const DRAW_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

const isAction = (action: unknown): action is EmptyStateAction =>
  Boolean(action) && typeof action === "object" && !React.isValidElement(action) && "label" in (action as object);

/** Lines draw themselves back to front, then their faces fill; ghosts fade in. */
function drawIn(root: Element, delay = 0) {
  root.querySelectorAll<SVGPathElement>("[data-shape]").forEach((el, i) => {
    const at = delay + Math.min(i * 34, 560);
    if (el.dataset.dashed) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: at, easing: EASE_OUT, fill: "backwards" });
      return;
    }
    el.animate(
      [
        { strokeDashoffset: DASH, fillOpacity: 0 },
        { strokeDashoffset: 0, fillOpacity: 0, offset: 0.62 },
        { strokeDashoffset: 0, fillOpacity: 1 },
      ],
      { duration: 640, delay: at, easing: DRAW_EASE, fill: "backwards" },
    );
  });
}

/** The reverse, front to back and quicker: lines retract and faces empty. */
function drawOut(root: Element) {
  const shapes = [...root.querySelectorAll<SVGPathElement>("[data-shape]")].reverse();
  shapes.forEach((el, i) => {
    const delay = Math.min(i * 14, 200);
    if (el.dataset.dashed) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay, easing: EASE_OUT, fill: "forwards" });
      return;
    }
    el.animate(
      [
        { strokeDashoffset: 0, fillOpacity: 1 },
        { strokeDashoffset: 0, fillOpacity: 0, offset: 0.35 },
        { strokeDashoffset: -DASH, fillOpacity: 0 },
      ],
      { duration: 340, delay, easing: DRAW_EASE, fill: "forwards" },
    );
  });
}

function Shape({ shape, clipId }: { shape: SceneShape; clipId?: string }) {
  const el = (
    <path
      data-shape=""
      data-dashed={shape.dashed ? "" : undefined}
      d={shape.d}
      fillRule={shape.ring ? "evenodd" : undefined}
      pathLength={shape.dashed ? undefined : 1}
      strokeDasharray={shape.dashed ? "2 2.5" : `${DASH} ${DASH}`}
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeWidth={shape.stroke === "accent" && shape.fill === "none" ? 1.5 : 1}
      style={{ fill: FILL[shape.fill], stroke: STROKE[shape.stroke] }}
    />
  );
  return clipId ? <g clipPath={`url(#${clipId})`}>{el}</g> : el;
}

function Shapes({ shapes, id }: { shapes: SceneShape[]; id: string }) {
  const clips = [...new Set(shapes.flatMap((s) => (s.clip ? [s.clip] : [])))];
  return (
    <>
      {clips.length > 0 && (
        <defs>
          {clips.map((d, i) => (
            <clipPath key={d} id={`${id}-${i}`}>
              <path d={d} />
            </clipPath>
          ))}
        </defs>
      )}
      {shapes.map((shape, i) => (
        <Shape key={i} shape={shape} clipId={shape.clip ? `${id}-${clips.indexOf(shape.clip)}` : undefined} />
      ))}
    </>
  );
}

/** Plays its drawing in once `seen` (the first time on screen, or at once for a scene that replaces another). */
function useDrawIn(seen: boolean, reduced: boolean, delay: number) {
  const ref = React.useRef<SVGGElement>(null);
  const drawn = React.useRef(false);
  React.useLayoutEffect(() => {
    if (!seen || drawn.current) return;
    drawn.current = true;
    if (!reduced && ref.current) drawIn(ref.current, delay);
  }, [seen, reduced, delay]);
  return ref;
}

const Tile = React.memo(function Tile({ seen, reduced, id }: { seen: boolean; reduced: boolean; id: string }) {
  const ref = useDrawIn(seen, reduced, 0);
  return (
    <g ref={ref}>
      <Shapes shapes={TILE} id={id} />
    </g>
  );
});

interface LayerProps {
  scene: EmptyStateScene;
  leaving: boolean;
  seen: boolean;
  reduced: boolean;
  status: ActionStatus;
  /** The first scene waits for the tile; later ones wait for the old one to start leaving. */
  delay: number;
  id: string;
  heroRef?: React.Ref<SVGGElement>;
}

const Layer = React.memo(function Layer({ scene, leaving, seen, reduced, status, delay, id, heroRef }: LayerProps) {
  const def = React.useMemo(() => SCENES[scene](), [scene]);
  const ref = useDrawIn(seen, reduced, delay);

  React.useLayoutEffect(() => {
    if (leaving && !reduced && ref.current) drawOut(ref.current);
  }, [leaving, reduced, ref]);

  const pose = (status === "pending" && def.poses?.pending) || (status === "success" && def.poses?.success) || ([0, 0, 0] as [number, number, number]);
  const [dx, dy] = poseOffset(pose);
  const landing = status === "success";
  const base = def.shapes.filter((s) => !s.hero);
  const hero = def.shapes.filter((s) => s.hero);

  return (
    <g
      ref={ref}
      style={{
        opacity: leaving && reduced ? 0 : 1,
        transition: reduced ? "opacity 200ms linear" : undefined,
      }}
    >
      <Shapes shapes={base} id={`${id}-b`} />
      <g
        ref={heroRef}
        style={{
          transform: `translate(${dx}px, ${dy}px)`,
          transition: reduced ? "none" : `transform ${landing ? 620 : 520}ms ${landing ? EASE_SETTLE : EASE_OUT}`,
        }}
      >
        <Shapes shapes={hero} id={`${id}-h`} />
      </g>
    </g>
  );
});

/** Keeps the old content a moment so it can cross-fade out while the new one comes in, with the height eased between. */
function Swap({ swapKey, reduced, children }: { swapKey: string; reduced: boolean; children: React.ReactNode }) {
  const [shown, setShown] = React.useState({ key: swapKey, node: children });
  const [prev, setPrev] = React.useState<{ key: string; node: React.ReactNode } | null>(null);
  if (swapKey !== shown.key) {
    setPrev(shown);
    setShown({ key: swapKey, node: children });
  }
  const inner = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!prev) return;
    const timer = window.setTimeout(() => setPrev(null), 260);
    return () => window.clearTimeout(timer);
  }, [prev]);

  // The inner box is a new element for each description, so it's observed again after every swap.
  React.useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight((h) => (h === el.offsetHeight ? h : el.offsetHeight)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown.key]);

  return (
    <div
      className="relative w-full"
      style={{ height: height ?? undefined, transition: reduced || height === null ? "none" : `height 380ms ${EASE_OUT}` }}
    >
      {prev && !reduced && (
        <div
          key={prev.key}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 animate-[ui-empty-out_200ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
        >
          {prev.node}
        </div>
      )}
      <div ref={inner} key={shown.key} className={prev && !reduced ? "animate-[ui-empty-in_360ms_cubic-bezier(0.16,1,0.3,1)_80ms_backwards]" : undefined}>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ scene = "inbox", illustration, title, description, action, secondaryAction, children, className = "" }: EmptyStateProps) {
  const reduced = useInteractionReducedMotion();
  const id = React.useId().replace(/:/g, "");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const heroRef = React.useRef<SVGGElement>(null);
  const [seen, setSeen] = React.useState(false);
  const [status, setStatus] = React.useState<ActionStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [layers, setLayers] = React.useState([{ key: 0, scene, leaving: false }]);
  const [lastScene, setLastScene] = React.useState(scene);
  const [generation, setGeneration] = React.useState(0);
  const generationRef = React.useRef(generation);

  // A new scene: the old drawing starts leaving, the new one comes in over it, and the action starts over.
  if (scene !== lastScene) {
    setLastScene(scene);
    setLayers((prev) => [...prev.filter((l) => !l.leaving).map((l) => ({ ...l, leaving: true })), { key: Math.max(...prev.map((l) => l.key)) + 1, scene, leaving: false }]);
    setStatus("idle");
    setError(null);
    setGeneration((g) => g + 1);
  }

  React.useEffect(() => {
    generationRef.current = generation;
  }, [generation]);

  React.useEffect(() => {
    if (!layers.some((l) => l.leaving)) return;
    const timer = window.setTimeout(() => setLayers((prev) => prev.filter((l) => !l.leaving)), reduced ? 220 : 560);
    return () => window.clearTimeout(timer);
  }, [layers, reduced]);

  // The drawing waits until it's on screen, so it's never played out of sight.
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setSeen(true);
        observer.disconnect();
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The piece that acts the action out springs back with a shake when it fails.
  React.useEffect(() => {
    if (status !== "error" || reduced) return;
    heroRef.current?.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "translateX(0)" }],
      { duration: 380, easing: "ease-out", composite: "add" },
    );
  }, [status, reduced]);

  const act = isAction(action) ? action : null;
  const run = async () => {
    if (!act?.onAction || status === "pending") return;
    const mine = generationRef.current;
    setStatus("pending");
    setError(null);
    try {
      await act.onAction();
      if (generationRef.current === mine) setStatus("success");
    } catch (reason) {
      if (generationRef.current !== mine) return;
      setStatus("error");
      setError(reason instanceof Error ? reason.message : typeof reason === "string" ? reason : null);
    }
  };

  const descriptionKey = typeof description === "string" ? description : `${scene}:${title}`;
  const hasActions = Boolean(action || secondaryAction);
  const secondaryClass = `inline-flex h-9 cursor-pointer items-center rounded-full px-4 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground ${INTERACTION_PRESS} ${INTERACTION_FOCUS}`;

  return (
    <div ref={rootRef} className={`@container w-full ${className}`}>
      <div className="flex flex-col items-center px-6 py-10 text-center @max-[22rem]:px-4 @max-[22rem]:py-7">
        <div className="mb-5 flex h-[140px] w-[168px] items-center justify-center @max-[22rem]:mb-4 @max-[22rem]:h-[110px] @max-[22rem]:w-[132px]" aria-hidden="true">
          {illustration ?? (
            <svg
              viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
              className="size-full overflow-visible"
              style={{ opacity: seen || reduced ? 1 : 0 }}
            >
              <Tile seen={seen || reduced} reduced={reduced} id={`${id}-t`} />
              {layers.map((layer) => (
                <Layer
                  key={layer.key}
                  scene={layer.scene}
                  leaving={layer.leaving}
                  seen={seen || reduced}
                  reduced={reduced}
                  status={layer.leaving ? "idle" : status}
                  delay={layer.key === 0 ? 260 : 160}
                  id={`${id}-${layer.key}`}
                  heroRef={layer.leaving ? undefined : heroRef}
                />
              ))}
            </svg>
          )}
        </div>

        <h3 className="max-w-full text-[15px] font-medium leading-6 tracking-[-0.01em] text-foreground">
          <TextMorph>{title}</TextMorph>
        </h3>
        {description !== undefined && (
          <div className="mt-1 w-full max-w-[36ch] text-[13.5px] leading-[1.55] text-muted-foreground">
            <Swap swapKey={descriptionKey} reduced={reduced}>
              {description}
            </Swap>
          </div>
        )}
        {children && <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-2">{children}</div>}

        <div
          className="grid w-full"
          style={{ gridTemplateRows: hasActions ? "1fr" : "0fr", transition: reduced ? "none" : `grid-template-rows 380ms ${EASE_OUT}` }}
        >
          <div className="min-h-0 overflow-clip">
            <div className="flex flex-wrap items-center justify-center gap-2 pt-5">
              {act ? (
                <StatusButton
                  status={status}
                  icon={act.icon}
                  labels={{ idle: act.label, pending: act.pendingLabel ?? "Working", success: act.successLabel ?? "Done", error: act.errorLabel ?? "Try again" }}
                  onClick={run}
                />
              ) : (
                (action as React.ReactNode)
              )}
              {secondaryAction &&
                (secondaryAction.href ? (
                  <a href={secondaryAction.href} onClick={secondaryAction.onAction} className={secondaryClass}>
                    {secondaryAction.label}
                  </a>
                ) : (
                  <button type="button" onClick={secondaryAction.onAction} className={secondaryClass}>
                    {secondaryAction.label}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div
          className="grid w-full"
          style={{ gridTemplateRows: error ? "1fr" : "0fr", transition: reduced ? "none" : `grid-template-rows 320ms ${EASE_OUT}` }}
        >
          <div className="min-h-0 overflow-clip">
            <p role="alert" className="pt-3 text-[12.5px] text-red-600 dark:text-red-400">
              {error}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmptyState;
