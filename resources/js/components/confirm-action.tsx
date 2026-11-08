"use client";

import * as React from "react";
import { StatusButton, type ActionStatus } from "./status-button";

/* ─────────────────────────────────────────────────────────
 * CONFIRM ACTION: an icon that asks before it acts
 *
 *   ask       a click and the icon's own circle stretches into
 *             a pill: the confirm button opens out to its left
 *             and the icon turns into a cross that takes it back
 *   act       the confirm button is a status button, so it says
 *             Revoking, Revoked or Try again in place
 *   leave     Escape, the cross, or a click or focus anywhere
 *             else folds it back into the icon
 *
 * Nothing opens over the row it belongs to; the question sits
 * where the icon was.
 * ───────────────────────────────────────────────────────── */

export interface ConfirmActionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onClick"> {
  icon: React.ReactNode;
  /** The icon button's accessible name, e.g. "Revoke Production key". */
  label: string;
  /** The confirm button's words per state, e.g. { idle: "Revoke", pending: "Revoking", success: "Revoked" }. */
  labels?: Partial<Record<ActionStatus, string>>;
  /** "danger" makes the confirm red. */
  tone?: "danger" | "default";
  /** Runs once on confirm. Throw (or reject) to show Try again. */
  onConfirm: () => Promise<unknown> | unknown;
  /** Back to the icon this long after success (ms); 0 keeps "done" until the row goes. */
  resetAfter?: number;
  disabled?: boolean;
}

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

function Cross() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ConfirmAction({
  icon,
  label,
  labels,
  tone = "danger",
  onConfirm,
  resetAfter = 0,
  disabled = false,
  className = "",
  ...props
}: ConfirmActionProps) {
  const reduced = useReducedMotion();
  const [asking, setAsking] = React.useState(false);
  const [status, setStatus] = React.useState<ActionStatus>("idle");
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const iconRef = React.useRef<HTMLButtonElement>(null);
  const run = React.useRef(0);
  const busy = status === "pending" || status === "success";

  const cancel = React.useCallback(
    (refocus: boolean) => {
      if (status === "pending") return;
      run.current++;
      setAsking(false);
      setStatus("idle");
      if (refocus) iconRef.current?.focus({ preventScroll: true });
    },
    [status],
  );

  // The question is open: its button takes focus once it's there to take it.
  React.useEffect(() => {
    if (asking && status === "idle") wrapRef.current?.querySelector<HTMLButtonElement>("[data-confirm]")?.focus({ preventScroll: true });
  }, [asking, status]);

  React.useEffect(() => {
    if (!asking) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) cancel(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [asking, cancel]);

  const confirm = async () => {
    if (busy) return;
    const mine = ++run.current;
    setStatus("pending");
    try {
      await onConfirm();
      if (run.current === mine) setStatus("success");
    } catch {
      if (run.current === mine) setStatus("error");
    }
  };

  const t = `${reduced ? 0 : 420}ms ${EASE}`;
  const red = tone === "danger" ? "text-destructive! hover:bg-destructive/10!" : "";

  return (
    <div
      ref={wrapRef}
      className={`relative inline-flex h-7 shrink-0 items-center rounded-full ${className}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && asking) {
          e.preventDefault();
          e.stopPropagation();
          cancel(true);
        }
      }}
      onBlur={(e) => {
        if (asking && !busy && document.hasFocus() && !wrapRef.current?.contains(e.relatedTarget as Node)) cancel(false);
      }}
      {...props}
    >
      {/* The icon's circle, stretched into the pill round the question. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: `inset 0 0 0 1px ${asking ? "var(--border)" : "transparent"}`, transition: `box-shadow ${t}` }}
      />
      <span
        className="grid"
        inert={!asking}
        style={{
          gridTemplateColumns: asking ? "1fr" : "0fr",
          opacity: asking ? 1 : 0,
          filter: asking || reduced ? "none" : "blur(3px)",
          transition: `grid-template-columns ${t}, opacity ${reduced ? 0 : asking ? 320 : 160}ms ${EASE}, filter ${t}`,
        }}
      >
        <span className="min-w-0 [clip-path:inset(-2px_0_-2px_0)]">
          <span className="flex w-max items-center pl-0.5">
            <StatusButton
              data-confirm=""
              size="sm"
              variant="ghost"
              status={status}
              labels={{ idle: "Confirm", pending: "Working", success: "Done", error: "Try again", ...labels }}
              onClick={confirm}
              onReset={resetAfter ? () => cancel(false) : undefined}
              resetAfter={resetAfter || undefined}
              className={`h-[26px]! ${status === "error" ? "" : red}`}
            />
          </span>
        </span>
      </span>
      <button
        ref={iconRef}
        type="button"
        aria-label={asking ? "Cancel" : label}
        aria-expanded={asking}
        disabled={disabled}
        onClick={() => (asking ? cancel(true) : setAsking(true))}
        className={`relative grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-40 aria-disabled:cursor-default ${FOCUS}`}
        aria-disabled={busy || undefined}
      >
        {[icon, <Cross key="x" />].map((glyph, i) => {
          const on = (i === 1) === asking;
          return (
            <span
              key={i}
              aria-hidden="true"
              className="absolute inset-0 grid place-items-center [&_svg]:size-3.5"
              style={{
                opacity: on ? 1 : 0,
                transform: on ? "none" : "scale(0.6)",
                filter: on || reduced ? "none" : "blur(3px)",
                transition: reduced ? "none" : `opacity 260ms ${EASE}, transform 380ms ${EASE}, filter 260ms ${EASE}`,
              }}
            >
              {glyph}
            </span>
          );
        })}
      </button>
    </div>
  );
}
