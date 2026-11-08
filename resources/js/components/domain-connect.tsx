"use client";

import * as React from "react";
import { ArrowUpRight, Clock, Copy, Globe, Trash2 } from "lucide-react";
import { ConfirmAction } from "./confirm-action";
import { NumberRoll } from "./number-roll";
import { StatusButton, type ActionStatus } from "./status-button";
import { TextMorph } from "./text-morph";

/* ─────────────────────────────────────────────────────────
 * DOMAIN CONNECT: a custom domain, from typed to live
 *
 *   add       type or paste an address (a pasted URL is cut
 *             down to its host); Connect, and the address lifts
 *             out of the field into the domain's own heading as
 *             the records it needs open beneath it
 *   records   every record has its own copy buttons; each one
 *             ticks green the moment your server sees it, and
 *             the rail above fills record by record
 *   checks    the card checks again by itself, waiting longer
 *             each time (10s, 20s, 30s, 1 min, 2 min, 5 min):
 *             "Checking again in 0:42" rolls down; Check now
 *             asks at once. It never checks while the tab is
 *             hidden
 *   live      the rail runs to its end, the status morphs to
 *             Live with a drawn check, the records fold away
 *             behind "Show records" and the address becomes a
 *             link
 *
 * Your server owns the truth: onAdd registers the domain and
 * check() reports what it sees. Works with Cloudflare for SaaS,
 * Vercel's domains API, or Resend and Postmark sending domains.
 * ───────────────────────────────────────────────────────── */

export type DnsRecordType = "CNAME" | "TXT" | "A" | "AAAA" | "MX" | "CAA";
export type DnsRecordStatus = "pending" | "verified" | "failed";
export type DomainStatus = "pending" | "issuing" | "active" | "failed";

export interface DnsRecord {
  type: DnsRecordType;
  /** The host to set it on, e.g. "app" or "_acme-challenge.app". */
  name: string;
  value: string;
  priority?: number;
  status?: DnsRecordStatus;
}

export interface DomainState {
  domain: string;
  /** pending: waiting for DNS; issuing: DNS is right, the certificate is on its way; active: live. */
  status: DomainStatus;
  records: DnsRecord[];
  /** Why it failed, or a hint while it's pending ("CNAME points at the old host"). */
  message?: string | null;
}

export interface DomainConnectProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> {
  value?: DomainState | null;
  defaultValue?: DomainState | null;
  onValueChange?: (state: DomainState | null) => void;
  /** Registers the domain and returns the records it needs. Throw to keep the field and say why. */
  onAdd: (domain: string) => Promise<DomainState>;
  /** Asks your server what it sees now. */
  check: (domain: string, options: { signal: AbortSignal }) => Promise<DomainState>;
  onRemove?: (domain: string) => Promise<unknown> | unknown;
  /** Seconds to wait before each automatic check; the last repeats. */
  schedule?: number[];
  title?: string;
  description?: string;
  placeholder?: string;
}

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const SCHEDULE = [10, 20, 30, 60, 120, 300];
const HOST = /^(?=.{1,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;
const SHAKE = [{ transform: "none" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }];

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

/** "https://App.Fernhill.co/pricing" → "app.fernhill.co". */
export const toHost = (input: string) =>
  input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

function Fold({ open, reduced, children }: { open: boolean; reduced: boolean; children: React.ReactNode }) {
  const [kept, setKept] = React.useState(children);
  if (open && kept !== children) {
    setKept(children);
  }
  return (
    <div className="grid" inert={!open} aria-hidden={!open || undefined} style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transition: reduced ? "none" : `grid-template-rows 480ms ${EASE}, opacity ${open ? 320 : 180}ms ${EASE}` }}>
      <div className="min-h-0 min-w-0 overflow-clip [overflow-clip-margin:6px]">{open ? children : kept}</div>
    </div>
  );
}

function Check({ drawn, reduced, className = "size-3.5" }: { drawn: boolean; reduced: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        style={{ strokeDashoffset: drawn ? 0 : 1, transition: drawn && !reduced ? `stroke-dashoffset 420ms ${EASE} 120ms` : "none" }}
      />
    </svg>
  );
}

/** Layers that swap through a blur: one visible at a time. */
function Swap({ show, reduced, layers, className = "size-3.5" }: { show: string; reduced: boolean; layers: Record<string, React.ReactNode>; className?: string }) {
  return (
    <span aria-hidden="true" className={`relative grid shrink-0 place-items-center ${className}`}>
      {Object.entries(layers).map(([k, node]) => (
        <span
          key={k}
          className="absolute inset-0 grid place-items-center"
          style={{
            opacity: k === show ? 1 : 0,
            transform: k === show ? "none" : "scale(0.6)",
            filter: k === show || reduced ? "none" : "blur(3px)",
            transition: reduced ? "none" : `opacity 240ms ${EASE}, transform 360ms ${EASE}, filter 240ms ${EASE}`,
          }}
        >
          {node}
        </span>
      ))}
    </span>
  );
}

const Spinner = ({ on }: { on: boolean }) => <span className={`size-3 rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-none ${on ? "animate-spin" : ""}`} />;

/** A copy button whose icon turns into a drawn check. */
function CopyValue({ text, label, reduced }: { text: string; label: string; reduced: boolean }) {
  const [done, setDone] = React.useState(false);
  React.useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 1400);
    return () => window.clearTimeout(timer);
  }, [done]);
  return (
    <button
      type="button"
      aria-label={done ? `${label} copied` : `Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
        } catch {
          /* The value is on screen to select by hand. */
        }
      }}
      className={`grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${FOCUS} ${done ? "text-success" : ""}`}
    >
      <Swap show={done ? "done" : "copy"} reduced={reduced} layers={{ copy: <Copy className="size-3.5" strokeWidth={1.75} />, done: <Check drawn={done} reduced={reduced} /> }} />
    </button>
  );
}

function RecordRow({ r, index, reduced }: { r: DnsRecord; index: number; reduced: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const status = r.status ?? "pending";
  const was = React.useRef(status);
  // A record that just verified lights up for a moment.
  React.useEffect(() => {
    if (was.current === status) return;
    was.current = status;
    if (status === "verified" && !reduced)
      ref.current?.animate([{ backgroundColor: "color-mix(in oklab, var(--color-success) 9%, transparent)" }, { backgroundColor: "transparent" }], { duration: 1400, easing: EASE });
  }, [status, reduced]);
  React.useLayoutEffect(() => {
    if (!reduced) ref.current?.animate([{ opacity: 0, transform: "translateY(6px)", filter: "blur(3px)" }, { opacity: 1, transform: "none", filter: "blur(0px)" }], { duration: 420, delay: 180 + index * 70, easing: EASE, fill: "backwards" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const said = status === "verified" ? "Found" : status === "failed" ? "Wrong value" : "Waiting";
  return (
    <div ref={ref} role="row" className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-md px-2 py-2 @lg:grid-cols-[3.25rem_minmax(0,0.8fr)_minmax(0,1.4fr)_auto] @lg:items-center">
      <span role="cell" className="pt-0.5 font-mono text-xs font-medium text-muted-foreground @lg:pt-0">
        {r.type}
        {r.priority !== undefined && <span className="ml-1 font-normal">{r.priority}</span>}
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-1">
        <code title={r.name} className="min-w-0 truncate font-mono text-xs">{r.name}</code>
        <CopyValue text={r.name} label={`${r.type} name`} reduced={reduced} />
      </span>
      <span role="cell" className={`col-start-3 row-start-1 flex items-center gap-1.5 pt-0.5 text-xs @lg:col-start-4 @lg:pt-0 ${status === "verified" ? "text-success" : status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
        <Swap
          show={status}
          reduced={reduced}
          layers={{ pending: <Spinner on={status === "pending"} />, verified: <Check drawn={status === "verified"} reduced={reduced} />, failed: <span className="size-1.5 rounded-full bg-current" /> }}
        />
        <span className="hidden @sm:inline">
          <TextMorph>{said}</TextMorph>
        </span>
        <span className="sr-only @sm:hidden">{said}</span>
      </span>
      <span role="cell" className="col-span-2 col-start-2 flex min-w-0 items-center gap-1 @lg:col-span-1 @lg:col-start-3 @lg:row-start-1">
        <code title={r.value} className="min-w-0 truncate font-mono text-xs text-muted-foreground">{r.value}</code>
        <CopyValue text={r.value} label={`${r.type} value`} reduced={reduced} />
      </span>
    </div>
  );
}

/** "Checking again in 0:42", rolling down; "Checking" while it asks. */
function Countdown({ at, checking, reduced }: { at: number | null; checking: boolean; reduced: boolean }) {
  const [now, setNow] = React.useState(() => Date.now());
  const left = at === null ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
  React.useEffect(() => {
    if (at === null || checking) return;
    const id = requestAnimationFrame(() => setNow(Date.now()));
    return () => cancelAnimationFrame(id);
  }, [at, checking]);
  React.useEffect(() => {
    if (at === null || checking || left <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000 - (Date.now() % 1000) + 10);
    return () => window.clearTimeout(timer);
  }, [at, checking, left, now]);
  const counting = !checking && at !== null && left > 0;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
      <Swap show={checking ? "checking" : "waiting"} reduced={reduced} className="size-3" layers={{ waiting: <Clock className="size-3" strokeWidth={2} />, checking: <Spinner on={checking} /> }} />
      <TextMorph>{checking ? "Checking DNS" : "Checking again in"}</TextMorph>
      <span
        aria-hidden="true"
        className="-ml-1.5 inline-grid"
        style={{ gridTemplateColumns: counting ? "1fr" : "0fr", opacity: counting ? 1 : 0, transition: reduced ? "none" : `grid-template-columns 380ms ${EASE}, opacity 240ms ${EASE}` }}
      >
        <span className="min-w-0 [clip-path:inset(-4px_0)]">
          <span className="inline-flex items-baseline pl-1.5">
            <NumberRoll value={Math.floor(left / 60)} direction="down" />:
            <NumberRoll value={left % 60} format={{ minimumIntegerDigits: 2 }} direction="down" />
          </span>
        </span>
      </span>
    </span>
  );
}

const STEPS = ["DNS records", "Certificate", "Live"];

function Rail({ state, reduced }: { state: DomainState; reduced: boolean }) {
  const total = state.records.length || 1;
  const found = state.records.filter((r) => r.status === "verified").length;
  const fill = state.status === "active" ? 1 : state.status === "issuing" ? 0.5 : (found / total) * 0.5;
  const reached = (i: number) => (i === 0 ? found === total || state.status === "issuing" || state.status === "active" : state.status === "active");
  const current = state.status === "failed" ? -1 : state.status === "active" ? -1 : state.status === "issuing" ? 1 : 0;
  return (
    <div className="px-1 pt-1" aria-hidden="true">
      <div className="relative mx-[9px] h-px bg-border">
        <span
          className={`absolute inset-0 origin-left ${state.status === "failed" ? "bg-destructive" : "bg-success"}`}
          style={{ transform: `scaleX(${fill})`, transition: reduced ? "none" : `transform 760ms ${EASE}` }}
        />
        {STEPS.map((_, i) => {
          const done = reached(i);
          return (
            <span
              key={i}
              className={`absolute top-1/2 grid size-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background shadow-[inset_0_0_0_1px_var(--border)] transition-colors duration-500 ${done ? "text-success" : "text-muted-foreground"}`}
              style={{ left: `${i * 50}%` }}
            >
              {current === i && !done ? <Spinner on /> : <Check drawn={done} reduced={reduced} className="size-3" />}
            </span>
          );
        })}
      </div>
      <div className="mt-3.5 grid grid-cols-3 text-xs text-muted-foreground">
        {STEPS.map((s, i) => (
          <span key={s} className={`${i === 0 ? "text-left" : i === 1 ? "text-center" : "text-right"} ${reached(i) ? "text-foreground" : ""} transition-colors duration-500`}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DomainConnect({
  value,
  defaultValue = null,
  onValueChange,
  onAdd,
  check,
  onRemove,
  schedule = SCHEDULE,
  title = "Custom domain",
  description = "Serve your workspace from an address you own.",
  placeholder = "app.yourcompany.com",
  className = "",
  ...props
}: DomainConnectProps) {
  const reduced = useReducedMotion();
  const id = React.useId();
  const [inner, setInner] = React.useState<DomainState | null>(defaultValue);
  const state = value !== undefined ? value : inner;
  const [typed, setTyped] = React.useState("");
  const [adding, setAdding] = React.useState<ActionStatus>("idle");
  const [addError, setAddError] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [nextAt, setNextAt] = React.useState<number | null>(null);
  const [showRecords, setShowRecords] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const fieldRef = React.useRef<HTMLDivElement>(null);
  const headRef = React.useRef<HTMLParagraphElement>(null);
  const flight = React.useRef<DOMRect | null>(null);
  const attempt = React.useRef(0);
  const ctrl = React.useRef<AbortController | null>(null);
  const latest = React.useRef(state);
  React.useLayoutEffect(() => {
    latest.current = state;
  });

  const commit = (next: DomainState | null) => {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };

  const waiting = Boolean(state && (state.status === "pending" || state.status === "issuing"));

  const runCheck = React.useCallback(async () => {
    const cur = latest.current;
    if (!cur) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setChecking(true);
    setNextAt(null);
    try {
      const next = await check(cur.domain, { signal: c.signal });
      if (c.signal.aborted || latest.current?.domain !== cur.domain) return;
      const before = cur.records.filter((r) => r.status === "verified").length;
      const after = next.records.filter((r) => r.status === "verified").length;
      if (next.status !== cur.status) setAnnounce(next.status === "active" ? `${next.domain} is live.` : next.status === "issuing" ? "DNS records found. Issuing a certificate." : next.status === "failed" ? next.message ?? "The domain couldn't be connected." : "");
      else if (after > before) setAnnounce(`${after} of ${next.records.length} records found.`);
      commit(next);
      attempt.current++;
    } catch {
      if (c.signal.aborted) return;
      attempt.current++;
    } finally {
      if (!c.signal.aborted) setChecking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check, onValueChange, value]);

  // The next automatic check: further off each time, never while the tab is hidden.
  React.useEffect(() => {
    if (!waiting || checking) return;
    const wait = schedule[Math.min(attempt.current, schedule.length - 1)] * 1000;
    const at = Date.now() + wait;
    setNextAt(at);
    let onShow: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      if (!document.hidden) return runCheck();
      // Hidden tab: wait until it's looked at again.
      onShow = () => {
        document.removeEventListener("visibilitychange", onShow!);
        onShow = null;
        runCheck();
      };
      document.addEventListener("visibilitychange", onShow);
    }, wait);
    return () => {
      window.clearTimeout(timer);
      if (onShow) document.removeEventListener("visibilitychange", onShow);
    };
  }, [waiting, checking, schedule, runCheck, state?.domain, state?.status]);

  React.useEffect(() => () => ctrl.current?.abort(), []);

  // The address lifts out of the field into the heading.
  React.useLayoutEffect(() => {
    const from = flight.current;
    const head = headRef.current;
    if (!from || !head || !state || reduced) return;
    flight.current = null;
    const to = head.getBoundingClientRect();
    head.animate(
      [{ transform: `translate(${from.left - to.left}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px)` }, { transform: "none" }],
      { duration: 620, easing: EASE },
    );
  }, [state, reduced]);

  const add = async () => {
    if (adding === "pending") return;
    const host = toHost(typed);
    if (!HOST.test(host)) {
      setAddError(host ? `“${host}” isn't a domain. Try something like ${placeholder}.` : "Enter the domain you want to use.");
      if (!reduced) fieldRef.current?.animate(SHAKE, { duration: 380, easing: "ease-out" });
      inputRef.current?.focus();
      return;
    }
    if (host !== typed) setTyped(host);
    setAdding("pending");
    setAddError(null);
    try {
      const next = await onAdd(host);
      const input = inputRef.current;
      if (input) {
        const r = input.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(input).paddingLeft) || 0;
        flight.current = new DOMRect(r.left + pad, r.top, r.width, r.height);
      }
      attempt.current = 0;
      setShowRecords(false);
      commit(next);
      setAdding("idle");
      setTyped("");
      setAnnounce(`${next.domain} added. Add the records below at your DNS provider.`);
    } catch (e) {
      setAdding("error");
      setAddError(message(e, "That domain couldn't be added. Try again."));
    }
  };

  const remove = async () => {
    if (!state) return;
    await onRemove?.(state.domain);
    ctrl.current?.abort();
    setChecking(false);
    setNextAt(null);
    setAnnounce(`${state.domain} removed.`);
    window.setTimeout(() => {
      commit(null);
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    }, 500);
  };

  const live = state?.status === "active";
  const failed = state?.status === "failed";
  const found = state ? state.records.filter((r) => r.status === "verified").length : 0;
  const pill = !state
    ? ""
    : live
      ? "Live"
      : failed
        ? "Not connected"
        : state.status === "issuing"
          ? "Issuing certificate"
          : found
            ? `${found} of ${state.records.length} records found`
            : "Waiting for DNS";

  return (
    <div className={`@container w-full rounded-lg border border-border bg-background text-foreground ${className}`} {...props}>
      <div className="px-4 pt-4 @md:px-5 @md:pt-5">
        <p className="text-sm font-medium tracking-[-0.01em]">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>

      {/* The field: only while there's no domain. */}
      <Fold open={!state} reduced={reduced}>
        <form
          noValidate
          className="px-4 pt-3.5 pb-4 @md:px-5 @md:pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label htmlFor={`${id}-domain`} className="sr-only">
            Domain
          </label>
          <div className="flex flex-col gap-2 @sm:flex-row">
            <div
              ref={fieldRef}
              // Grows sideways only beside the button; stacked on a narrow card, flex-1 would override its height.
              className={`flex h-9 min-w-0 shrink-0 items-center rounded-full px-3.5 transition-shadow @sm:flex-1 duration-200 ${addError ? "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-destructive)_45%,transparent)]" : "shadow-[inset_0_0_0_1px_var(--border)] focus-within:shadow-[inset_0_0_0_1px_var(--ring)]"}`}
            >
              <Globe className="mr-2 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              <input
                ref={inputRef}
                id={`${id}-domain`}
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setAddError(null);
                  if (adding === "error") setAdding("idle");
                }}
                onBlur={() => typed && setTyped(toHost(typed))}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (!/[:/]/.test(text)) return;
                  e.preventDefault();
                  setTyped(toHost(text));
                }}
                readOnly={adding === "pending"}
                placeholder={placeholder}
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={Boolean(addError) || undefined}
                aria-describedby={addError ? `${id}-error` : undefined}
                className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 [@media(pointer:fine)]:text-sm"
              />
            </div>
            <StatusButton type="submit" status={adding} labels={{ idle: "Connect", pending: "Connecting", error: "Try again" }} />
          </div>
          <Fold open={Boolean(addError)} reduced={reduced}>
            <p id={`${id}-error`} className="px-1 pt-2 text-xs text-destructive">
              {addError}
            </p>
          </Fold>
        </form>
      </Fold>

      {/* The domain: heading, rail, records, and the next check. */}
      <Fold open={Boolean(state)} reduced={reduced}>
        {state && (
          <div className="px-4 pt-3.5 pb-4 @md:px-5 @md:pb-5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p ref={headRef} className="truncate text-base font-medium tracking-[-0.01em]">
                  {live ? (
                    <a href={`https://${state.domain}`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 underline-offset-4 hover:underline ${FOCUS}`}>
                      {state.domain}
                      <ArrowUpRight className="size-3.5 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
                    </a>
                  ) : (
                    state.domain
                  )}
                </p>
                <p className={`mt-0.5 flex items-center gap-1.5 text-xs transition-colors duration-500 ${live ? "text-success" : failed ? "text-destructive" : "text-warning"}`}>
                  <span className="relative grid size-2 place-items-center" aria-hidden="true">
                    <span className="size-1.5 rounded-full bg-current" />
                    {waiting && !reduced && <span className="absolute inset-0 rounded-full bg-current opacity-40 motion-safe:animate-[ui-ping_1.6s_ease-out_infinite]" />}
                  </span>
                  <TextMorph>{pill}</TextMorph>
                </p>
              </div>
              {onRemove && (
                <ConfirmAction icon={<Trash2 strokeWidth={1.75} />} label={`Remove ${state.domain}`} labels={{ idle: "Remove", pending: "Removing", success: "Removed", error: "Try again" }} onConfirm={remove} />
              )}
            </div>

            <div className="mt-4">
              <Rail state={state} reduced={reduced} />
            </div>

            <Fold open={!live || showRecords} reduced={reduced}>
              <div className="pt-4">
                <p className="text-xs text-muted-foreground">{live ? "These records keep it connected." : "Add these at your DNS provider. Changes can take a few minutes to show."}</p>
                <div role="table" aria-label={`DNS records for ${state.domain}`} className="mt-2 rounded-lg p-1 shadow-[inset_0_0_0_1px_var(--border)]">
                  {state.records.map((r, i) => (
                    <RecordRow key={`${r.type}-${r.name}-${r.value}`} r={r} index={i} reduced={reduced} />
                  ))}
                </div>
              </div>
            </Fold>

            <Fold open={Boolean(state.message)} reduced={reduced}>
              <p className={`pt-3 text-xs ${failed ? "text-destructive" : "text-muted-foreground"}`}>{state.message}</p>
            </Fold>

            <div className="mt-3.5 flex min-h-7 items-center justify-between gap-3 text-xs text-muted-foreground">
              {live ? (
                <button
                  type="button"
                  aria-expanded={showRecords}
                  onClick={() => setShowRecords((s) => !s)}
                  className={`-ml-2 h-7 cursor-pointer rounded-full px-2 font-medium transition-colors hover:bg-accent hover:text-foreground ${FOCUS}`}
                >
                  <TextMorph>{showRecords ? "Hide records" : "Show records"}</TextMorph>
                </button>
              ) : failed ? (
                <span className="text-destructive">Fix the records, then check again.</span>
              ) : (
                <Countdown at={nextAt} checking={checking} reduced={reduced} />
              )}
              {!live && (
                <button
                  type="button"
                  onClick={() => {
                    attempt.current = 0;
                    runCheck();
                  }}
                  aria-disabled={checking || undefined}
                  className={`h-7 shrink-0 cursor-pointer rounded-full px-3 font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,opacity] hover:bg-accent aria-disabled:cursor-default aria-disabled:opacity-50 ${FOCUS}`}
                >
                  Check now
                </button>
              )}
            </div>
          </div>
        )}
      </Fold>

      <span className="sr-only" role="status">
        {announce}
      </span>
    </div>
  );
}
