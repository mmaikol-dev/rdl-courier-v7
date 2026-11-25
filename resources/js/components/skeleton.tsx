"use client";

import * as React from "react";
import { EASE_OUT, useInteractionReducedMotion } from "./ui-interaction-motion";

/* ─────────────────────────────────────────────────────────
 * SKELETON: the shape of what's coming
 *
 *   wait     muted shapes with one soft band of light sweeping
 *            across them all together, left to right
 *   arrive   with <Skeleton.Swap loading>, the shapes fade out as
 *            the real content rises out of a 4px blur in their
 *            place, so nothing pops; the box eases to the
 *            content's height
 * ───────────────────────────────────────────────────────── */

export interface SkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** "line" is text height, "circle" a round avatar, "block" a box. */
  shape?: "line" | "circle" | "block";
  width?: number | string;
  height?: number | string;
}

export function Skeleton({ shape = "line", width, height, className = "", style, ...props }: SkeletonProps) {
  const reduced = useInteractionReducedMotion();
  const dims = shape === "circle" ? { width: width ?? 36, height: height ?? width ?? 36 } : { width: width ?? "100%", height: height ?? (shape === "line" ? 12 : 80) };
  return (
    <span
      aria-hidden="true"
      className={`relative block overflow-hidden bg-muted ${shape === "circle" ? "rounded-full" : shape === "line" ? "rounded-full" : "rounded-[12px]"} ${className}`}
      style={{ ...dims, ...style }}
      {...props}
    >
      {!reduced && (
        <span className="absolute inset-0 [animation:ui-skeleton_1.6s_cubic-bezier(0.4,0,0.2,1)_infinite] bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--background)_55%,transparent),transparent)]" />
      )}
    </span>
  );
}

export interface SkeletonSwapProps {
  loading: boolean;
  /** The skeleton shown while loading. */
  fallback: React.ReactNode;
  children: React.ReactNode;
  /** Accessible text while loading. */
  label?: string;
  className?: string;
}

/** Holds a skeleton while `loading`, then hands over to the content in one motion. */
export function SkeletonSwap({ loading, fallback, children, label = "Loading", className = "" }: SkeletonSwapProps) {
  const reduced = useInteractionReducedMotion();
  const inner = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  // True for the first frames after loading ends, so the content starts from its hidden pose.
  const [arriving, setArriving] = React.useState(false);
  const [wasLoading, setWasLoading] = React.useState(loading);
  if (wasLoading !== loading) {
    setWasLoading(loading);
    setArriving(!loading);
  }

  React.useEffect(() => {
    if (!arriving) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setArriving(false));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [arriving]);

  // The box eases between the skeleton's height and the content's.
  React.useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setHeight((h) => (h === el.offsetHeight ? h : el.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const t = (ms: number, delay = 0) => (reduced ? "none" : `${ms}ms ${EASE_OUT} ${delay}ms`);

  return (
    <div aria-busy={loading || undefined} className={`relative overflow-hidden ${className}`} style={{ height: height ?? undefined, transition: reduced ? "none" : `height 360ms ${EASE_OUT}` }}>
      {loading && (
        <span className="sr-only" role="status">
          {label}
        </span>
      )}
      <div ref={inner}>
        {loading ? (
          fallback
        ) : (
          <div
            style={{
              opacity: arriving ? 0 : 1,
              filter: arriving && !reduced ? "blur(4px)" : "blur(0px)",
              translate: arriving && !reduced ? "0 4px" : "0 0",
              transition: arriving ? "none" : `opacity ${t(300, 40)}, filter ${t(300, 40)}, translate ${t(420, 40)}`,
            }}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

export default Skeleton;
