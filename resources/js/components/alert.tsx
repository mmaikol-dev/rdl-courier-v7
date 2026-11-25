"use client";

import * as React from "react";
import { EASE_OUT, INTERACTION_FOCUS, INTERACTION_PRESS, interactionIcon, useInteractionReducedMotion } from "./ui-interaction-motion";

/* ─────────────────────────────────────────────────────────
 * ALERT: a message that sits in the page
 *
 *   tone     info, success, warning or danger: the tint, line and
 *            icon ease across when the tone changes (a sync that
 *            goes from "Syncing" to "Synced"), the icon swapping
 *            through a blur
 *   dismiss  the ✕ folds the alert away: it fades and lifts while
 *            its height closes, so the content below slides up
 *            instead of jumping
 *   action   an optional button on the right (or under it on
 *            narrow cards)
 * ───────────────────────────────────────────────────────── */

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface AlertProps {
  tone?: AlertTone;
  title: React.ReactNode;
  children?: React.ReactNode;
  /** A button or link at the end. */
  action?: React.ReactNode;
  /** Show a ✕; called after the alert has folded away. */
  onDismiss?: () => void;
  /** Hide it (folds away) without unmounting. */
  hidden?: boolean;
  /** Replace the tone's icon. */
  icon?: React.ReactNode;
  className?: string;
}

const TONE: Record<AlertTone, string> = {
  info: "bg-card shadow-[inset_0_0_0_1px_var(--border)] text-foreground",
  success: "bg-emerald-500/[0.06] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-emerald-500)_30%,transparent)] text-foreground",
  warning: "bg-amber-500/[0.07] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-amber-500)_35%,transparent)] text-foreground",
  danger: "bg-red-500/[0.06] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-red-500)_30%,transparent)] text-foreground",
};
const ICON_TONE: Record<AlertTone, string> = {
  info: "text-muted-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
};

const ICONS: Record<AlertTone, React.ReactNode> = {
  info: (
    <svg viewBox="0 0 16 16" fill="none" className="size-4">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.25v3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.9" fill="currentColor" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 16 16" fill="none" className="size-4">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.4 8.2 7.2 10l3.4-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 16 16" fill="none" className="size-4">
      <path d="M8 2.2 14.3 13H1.7L8 2.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.3v3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.85" fill="currentColor" />
    </svg>
  ),
  danger: (
    <svg viewBox="0 0 16 16" fill="none" className="size-4">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.75v3.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.9" fill="currentColor" />
    </svg>
  ),
};

export function Alert({ tone = "info", title, children, action, onDismiss, hidden: hiddenProp, icon, className = "" }: AlertProps) {
  const reduced = useInteractionReducedMotion();
  const [dismissed, setDismissed] = React.useState(false);
  const hidden = hiddenProp || dismissed;

  React.useEffect(() => {
    if (!dismissed) return;
    const timer = window.setTimeout(() => onDismiss?.(), reduced ? 0 : 380);
    return () => window.clearTimeout(timer);
  }, [dismissed, onDismiss, reduced]);

  return (
    <div
      className="grid w-full"
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      style={{ gridTemplateRows: hidden ? "0fr" : "1fr", transition: reduced ? "none" : `grid-template-rows 380ms ${EASE_OUT} ${hidden ? 80 : 0}ms` }}
    >
      <div className="min-h-0 overflow-hidden [clip-path:inset(-2px)]">
        <div
          role={tone === "danger" || tone === "warning" ? "alert" : "status"}
          className={`@container flex items-start gap-3 rounded-[14px] p-3.5 transition-[background-color,box-shadow] duration-300 ${TONE[tone]} ${className}`}
          style={{
            opacity: hidden ? 0 : 1,
            translate: hidden && !reduced ? "0 -6px" : "0 0",
            scale: hidden && !reduced ? "0.98" : "1",
            transition: reduced ? "none" : `opacity 220ms ${EASE_OUT}, translate 320ms ${EASE_OUT}, scale 320ms ${EASE_OUT}, background-color 300ms, box-shadow 300ms`,
          }}
        >
          <span className={`relative mt-px size-4 shrink-0 transition-colors duration-300 ${ICON_TONE[tone]}`} aria-hidden="true">
            {icon ? (
              icon
            ) : (
              (Object.keys(ICONS) as AlertTone[]).map((t) => (
                <span key={t} className="absolute inset-0" style={interactionIcon(t === tone, reduced)}>
                  {ICONS[t]}
                </span>
              ))
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 @md:flex-row @md:items-start @md:justify-between">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-[13.5px] font-medium leading-5">{title}</p>
              {children && <div className="text-[13px] leading-relaxed text-muted-foreground">{children}</div>}
            </div>
            {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
          </div>
          {onDismiss && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissed(true)}
              className={`-mr-1 -mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground cursor-pointer hover:bg-accent hover:text-foreground ${INTERACTION_PRESS} ${INTERACTION_FOCUS}`}
            >
              <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Alert;
