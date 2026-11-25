"use client";

import * as React from "react";
import { NumberRoll } from "./number-roll";

/* ─────────────────────────────────────────────────────────
 * STATS BAND: the numbers arrive when you do
 *
 *   waiting   before it's on screen, quiet zeros
 *   arriving  the hairlines between stats draw themselves,
 *             then each figure rolls up from zero, one after
 *             another, as its label rises in
 *   done      the real numbers, rolling again only if they
 *             change
 *
 * Screen readers get the real figures straight away.
 * ───────────────────────────────────────────────────────── */

export interface Stat {
  value: number;
  label: string;
  /** Intl.NumberFormat options, e.g. { notation: "compact" }. */
  format?: Intl.NumberFormatOptions;
  prefix?: string;
  suffix?: string;
}

export interface StatsBandProps extends React.HTMLAttributes<HTMLDListElement> {
  stats: Stat[];
  /** Time between one stat starting and the next (ms). */
  stagger?: number;
  /** Classes for the figures. */
  numberClassName?: string;
}

const EASE = "cubic-bezier(0.16,1,0.3,1)";

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

export function StatsBand({
  stats,
  stagger = 140,
  numberClassName = "text-[28px] @[28rem]:text-[34px] @[36rem]:text-[30px] @[48rem]:text-[36px] @[56rem]:text-[40px] font-medium leading-[1.15] tracking-[-0.04em] text-foreground",
  className = "",
  ...props
}: StatsBandProps) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLDListElement>(null);
  const [seen, setSeen] = React.useState(false);
  const [revealed, setRevealed] = React.useState(0);

  // Start once, the first time most of the band is on screen.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setSeen(true);
        observer.disconnect();
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Then reveal the stats one after another: the lines draw first, the numbers follow.
  React.useEffect(() => {
    if (!seen || reduced) return;
    const timers = stats.map((_, i) => window.setTimeout(() => setRevealed((r) => Math.max(r, i + 1)), 240 + i * stagger));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [seen, reduced, stats, stagger]);

  return (
    // Laid out by its own width, not the screen's, so it reads right in a narrow column too.
    <div className="w-full">
      {/* Its natural width where the parent sizes to its content, without forcing it on narrow screens. */}
      <div aria-hidden="true" data-natural-width className="grid h-0" style={{ gridTemplateColumns: "minmax(0, 760px)" }} />
      <div className="@container w-full">
        <dl ref={ref} className={`grid grid-cols-2 @[36rem]:grid-flow-col @[36rem]:grid-cols-none @[36rem]:auto-cols-fr ${className}`} {...props}>
          {stats.map((stat, i) => {
            const shown = i < (seen && reduced ? stats.length : revealed);
            return (
              <div key={stat.label} className="relative flex min-w-0 flex-col-reverse justify-end px-4 py-4 @[28rem]:py-5 @[48rem]:px-6">
                {/* The hairline before every stat but the first, drawn from the middle out (wide screens). */}
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 hidden h-full w-px origin-center bg-border @[36rem]:block"
                    style={{ transform: seen || reduced ? "none" : "scaleY(0)", transition: reduced ? "none" : `transform 700ms ${EASE} ${i * 80}ms` }}
                  />
                )}
                <dt
                  className="mt-1 text-[13px] text-muted-foreground"
                  style={{
                    opacity: shown ? 1 : 0,
                    transform: shown ? "none" : "translateY(6px)",
                    transition: reduced ? "none" : `opacity 500ms ${EASE} 120ms, transform 600ms ${EASE} 120ms`,
                  }}
                >
                  {stat.label}
                </dt>
                <dd>
                  <span className="sr-only">
                    {stat.prefix}
                    {new Intl.NumberFormat(undefined, stat.format).format(stat.value)}
                    {stat.suffix}
                  </span>
                  <span aria-hidden="true">
                    <NumberRoll value={shown ? stat.value : 0} format={stat.format} prefix={stat.prefix} suffix={stat.suffix} duration={1200} className={numberClassName} />
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </div>
  );
}
