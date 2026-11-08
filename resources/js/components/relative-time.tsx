"use client";

import * as React from "react";
import { NumberRoll } from "./number-roll";
import { TextMorph } from "./text-morph";

/* ─────────────────────────────────────────────────────────
 * RELATIVE TIME: "2 min ago" that keeps itself true
 *
 *   tick      it re-renders only when the words would change:
 *             on the next minute under an hour, the next hour
 *             under a day; nothing runs between
 *   roll      the number rolls up ("2 min" → "3 min") and the
 *             unit morphs when it changes ("59 min" → "1 h")
 *   date      past a week it settles on the date ("12 Sep")
 *
 * Until it's mounted it renders the date, so the server and the
 * first paint agree; the hover title is always the full time.
 * ───────────────────────────────────────────────────────── */

export type DateLike = Date | string | number;

export interface RelativeTimeProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  date: DateLike;
  /** Said before the time, e.g. "Last used". */
  prefix?: string;
  /** Under a minute. */
  justNow?: string;
  locales?: string | string[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const toTime = (d: DateLike) => (d instanceof Date ? d.getTime() : typeof d === "number" ? d : new Date(d).getTime());

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Sep", with the year when it isn't this one; pass locales to use the browser's own format. */
export function formatDate(d: DateLike, locales?: string | string[]) {
  const t = new Date(toTime(d));
  const sameYear = t.getFullYear() === new Date().getFullYear();
  if (locales) return t.toLocaleDateString(locales, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  return `${t.getDate()} ${MONTHS[t.getMonth()]}${sameYear ? "" : ` ${t.getFullYear()}`}`;
}

type Parts = { n: number | null; unit: string; next: number };

function parts(at: number, now: number, justNow: string, locales?: string | string[]): Parts {
  const ago = Math.max(0, now - at);
  if (ago < MINUTE) return { n: null, unit: justNow, next: MINUTE - ago };
  if (ago < HOUR) return { n: Math.floor(ago / MINUTE), unit: "min ago", next: MINUTE - (ago % MINUTE) };
  if (ago < DAY) {
    const h = Math.floor(ago / HOUR);
    return { n: h, unit: h === 1 ? "hour ago" : "hours ago", next: HOUR - (ago % HOUR) };
  }
  if (ago < 7 * DAY) {
    const d = Math.floor(ago / DAY);
    return { n: d, unit: d === 1 ? "day ago" : "days ago", next: DAY - (ago % DAY) };
  }
  return { n: null, unit: formatDate(at, locales), next: 0 };
}

const subscribeMounted = () => () => {};

export function RelativeTime({ date, prefix, justNow = "just now", locales, className = "", ...props }: RelativeTimeProps) {
  const at = toTime(date);
  const mounted = React.useSyncExternalStore(subscribeMounted, () => true, () => false);
  const [now, setNow] = React.useState(() => Date.now());
  const p = parts(at, mounted ? now : at + 8 * DAY, justNow, locales);

  // One timer, set for the moment the words change.
  React.useEffect(() => {
    if (!mounted || !p.next) return;
    const timer = window.setTimeout(() => setNow(Date.now()), p.next + 50);
    return () => window.clearTimeout(timer);
  }, [mounted, p.next, now]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, [at]);

  const iso = new Date(at).toISOString();
  return (
    <time
      dateTime={iso}
      title={new Date(at).toLocaleString(locales ?? "en-GB", { dateStyle: "medium", timeStyle: "short" })}
      className={`inline-flex items-baseline whitespace-nowrap tabular-nums ${className}`}
      {...props}
    >
      {prefix && <span>{prefix}&nbsp;</span>}
      {/* Remounted once on the client, so the first real words appear without a morph. */}
      <Words key={mounted ? "client" : "server"} n={p.n} unit={p.unit} />
    </time>
  );
}

function Words({ n, unit }: { n: number | null; unit: string }) {
  return (
    <>
      <span
        aria-hidden={n === null || undefined}
        className="inline-grid transition-[grid-template-columns] duration-[380ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ gridTemplateColumns: n === null ? "0fr" : "1fr" }}
      >
        <span className="min-w-0 [clip-path:inset(-4px_0)]">
          <span className="inline-flex items-baseline pr-[0.25em]">
            <NumberRoll value={n ?? 1} direction="up" />
          </span>
        </span>
      </span>
      <TextMorph>{unit}</TextMorph>
    </>
  );
}
