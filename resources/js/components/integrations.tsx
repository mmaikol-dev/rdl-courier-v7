"use client";

import * as React from "react";
import { ArrowUpRight, Search, Unplug } from "lucide-react";
import { ConfirmAction } from "./confirm-action";
import { NumberRoll } from "./number-roll";
import { StatusButton, type ActionStatus } from "./status-button";
import { useRowMotion } from "./use-row-motion";

/* ─────────────────────────────────────────────────────────
 * INTEGRATIONS: Settings → Integrations, done properly
 *
 *   connect   Connect says Connecting while the provider's own
 *             window is open; when it comes back, the button
 *             folds away and the account it connected opens in
 *             its place, a check drawing beside the name
 *   scopes    what the connection may do opens under the row
 *   refused   a closed window or a refusal shakes the button,
 *             says Try again, and the reason lifts in under the
 *             description
 *   filter    category tabs (the highlight slides) and search;
 *             rows that stay glide into place, the rest fold
 *   disconnect the plug stretches into a confirm; the account
 *             folds back into Connect
 *
 * Your server does OAuth; openOAuthWindow (oauth-window.ts)
 * opens the provider's page in a small window and resolves
 * when your callback says it's done. Fits Nango, Pipedream
 * Connect or your own OAuth routes.
 * ───────────────────────────────────────────────────────── */

export { openOAuthWindow, type OAuthWindowOptions } from "./oauth-window";

export interface IntegrationAccount {
  /** "Northwind workspace", "maya@fernhill.co". */
  name: string;
  /** A second line: "#ops, #alerts" or "Connected 2 days ago". */
  detail?: string;
  image?: string;
}

export interface Integration {
  id: string;
  name: string;
  description?: string;
  /** The provider's mark, about 18px. */
  icon?: React.ReactNode;
  category?: string;
  /** Set when it's connected. */
  account?: IntegrationAccount | null;
  /** What the connection may do, shown once connected. */
  scopes?: string[];
  /** Prevents enabling an integration when its owner cannot change access. */
  connectDisabled?: boolean;
}

export interface IntegrationsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> {
  value?: Integration[];
  defaultValue?: Integration[];
  onValueChange?: (integrations: Integration[]) => void;
  /** Runs the provider's sign-in and returns the account it connected. Throw to say why not. */
  onConnect?: (integration: Integration) => Promise<IntegrationAccount>;
  onDisconnect?: (integration: Integration) => Promise<unknown>;
  /** A link to the integration's own settings once connected. */
  settingsHref?: (integration: Integration) => string | undefined;
  title?: string;
  description?: string;
  connectLabel?: string;
  connectingLabel?: string;
  connectedLabel?: string;
  connectedCountLabel?: string;
  disconnectLabel?: string;
  disconnectingLabel?: string;
}

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const NONE: Integration[] = [];
const ALL = "All";

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** A piece that opens sideways (0fr ↔ 1fr), staying on the baseline. */
function Side({ open, reduced, children, className = "" }: { open: boolean; reduced: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-grid ${className}`}
      inert={!open}
      aria-hidden={!open || undefined}
      style={{
        gridTemplateColumns: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        filter: open || reduced ? "none" : "blur(3px)",
        transition: reduced ? "none" : `grid-template-columns 460ms ${EASE}, opacity ${open ? 320 : 160}ms ${EASE} ${open ? 120 : 0}ms, filter 320ms ${EASE}`,
      }}
    >
      <span className="flex min-w-0 items-center justify-end [clip-path:inset(-6px_-2px)]">{children}</span>
    </span>
  );
}

function Fold({ open, reduced, children }: { open: boolean; reduced: boolean; children: React.ReactNode }) {
  // Keep the last open content so its closing animation has something to fold.
  // A ref is important here: these child elements are recreated on each render,
  // so synchronizing them with setState during render causes an update loop.
  const kept = React.useRef(children);
  if (open) kept.current = children;
  return (
    <div className="grid" inert={!open} aria-hidden={!open || undefined} style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transition: reduced ? "none" : `grid-template-rows 420ms ${EASE}, opacity ${open ? 300 : 160}ms ${EASE}` }}>
      <div className="min-h-0 min-w-0 overflow-clip">{open ? children : kept.current}</div>
    </div>
  );
}

function Avatar({ account }: { account: IntegrationAccount }) {
  if (account.image)
    return <img src={account.image} alt="" className="size-5 shrink-0 rounded-full object-cover shadow-[0_0_0_1px_var(--border)]" />;
  return (
    <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]">
      {account.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

interface RowProps {
  item: Integration;
  status: ActionStatus;
  error?: string;
  href?: string;
  canDisconnect: boolean;
  reduced: boolean;
  canConnect: boolean;
  connectLabel: string;
  connectingLabel: string;
  connectedLabel: string;
  disconnectLabel: string;
  disconnectingLabel: string;
  act: React.RefObject<{ connect: (i: Integration) => void; disconnect: (i: Integration) => Promise<void> }>;
}

const Row = React.memo(function Row({ item, status, error, href, canDisconnect, reduced, canConnect, connectLabel, connectingLabel, connectedLabel, disconnectLabel, disconnectingLabel, act }: RowProps) {
  const connected = Boolean(item.account);
  // The account stays on screen while it folds back into Connect.
  const [keptAccount, setKeptAccount] = React.useState(item.account ?? null);
  if (item.account && keptAccount !== item.account) setKeptAccount(item.account);
  const account = item.account ?? keptAccount;

  return (
    <li data-row-id={item.id} className="border-t border-border first:border-t-0">
      <div className="flex items-center gap-3 px-4 py-3 @md:px-5">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-md bg-background text-foreground shadow-[inset_0_0_0_1px_var(--border)] [&_svg]:size-[18px]">
          {item.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium tracking-[-0.01em]">
            <span className="truncate">{item.name}</span>
            {href && connected && (
              <a href={href} aria-label={`${item.name} settings`} className={`inline-flex shrink-0 items-center gap-0.5 rounded-sm text-xs font-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline ${FOCUS}`}>
                <span className="hidden @md:inline">Settings</span>
                <ArrowUpRight className="size-3" strokeWidth={2} aria-hidden="true" />
              </a>
            )}
          </p>
          <div className="relative mt-0.5 text-xs leading-relaxed text-muted-foreground">
            <p className="truncate transition-[opacity,filter] duration-200" style={{ opacity: error ? 0 : 1, filter: error && !reduced ? "blur(3px)" : "none" }}>
              {item.description}
            </p>
            <p
              aria-hidden={!error || undefined}
              className="pointer-events-none absolute inset-x-0 top-0 truncate text-destructive"
              style={{ opacity: error ? 1 : 0, transform: error || reduced ? "none" : "translateY(4px)", transition: reduced ? "none" : `opacity 260ms ${EASE} ${error ? 80 : 0}ms, transform 360ms ${EASE}` }}
            >
              {error}
            </p>
          </div>
        </div>

        {/* Connect and the connected account share the corner: one folds as the other opens. */}
        <div className="flex shrink-0 items-center">
          <Side open={!connected} reduced={reduced}>
            <StatusButton
              size="sm"
              variant="outline"
              status={status}
              disabled={!canConnect}
              labels={{ idle: canConnect ? connectLabel : "Unavailable", pending: connectingLabel, success: connectedLabel, error: "Try again" }}
              onClick={() => act.current.connect(item)}
              aria-label={canConnect ? `${connectLabel} ${item.name}` : `${item.name} cannot be enabled from this account`}
            />
          </Side>
          <Side open={connected} reduced={reduced}>
            {account && (
              <span className="flex items-center gap-1.5">
                <span className="flex max-w-[7.5rem] items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-xs shadow-[inset_0_0_0_1px_var(--border)] @sm:max-w-[11rem] @md:max-w-[14rem]">
                  <Avatar account={account} />
                  <span className="truncate font-medium">{account.name}</span>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5 shrink-0 text-success">
                    <path
                      d="M3.5 8.5 6.5 11.5 12.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={1}
                      strokeDasharray={1}
                      style={{ strokeDashoffset: connected ? 0 : 1, transition: connected && !reduced ? `stroke-dashoffset 420ms ${EASE} 380ms` : "none" }}
                    />
                  </svg>
                  <span className="sr-only">{connectedLabel.toLowerCase()}</span>
                </span>
                {canDisconnect && (
                  <ConfirmAction
                    icon={<Unplug strokeWidth={1.75} />}
                    label={`${disconnectLabel} ${item.name}`}
                    labels={{ idle: disconnectLabel, pending: disconnectingLabel, success: `${disconnectLabel}d`, error: "Try again" }}
                    onConfirm={() => act.current.disconnect(item)}
                  />
                )}
              </span>
            )}
          </Side>
        </div>
      </div>

      <Fold open={connected && Boolean(item.scopes?.length || account?.detail)} reduced={reduced}>
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pl-16 text-xs text-muted-foreground @md:px-5 @md:pl-[4.25rem]">
          {account?.detail && <span className="mr-1">{account.detail}</span>}
          {item.scopes?.map((s) => (
            <span key={s} className="rounded-full px-2 py-0.5 shadow-[inset_0_0_0_1px_var(--border)]">
              {s}
            </span>
          ))}
        </div>
      </Fold>
    </li>
  );
});

export function Integrations({
  value,
  defaultValue = NONE,
  onValueChange,
  onConnect,
  onDisconnect,
  settingsHref,
  title = "Integrations",
  description = "Connect the tools your team already uses.",
  connectLabel = "Connect",
  connectingLabel = "Connecting",
  connectedLabel = "Connected",
  connectedCountLabel = "connected",
  disconnectLabel = "Disconnect",
  disconnectingLabel = "Disconnecting",
  className = "",
  ...props
}: IntegrationsProps) {
  const reduced = useReducedMotion();
  const [inner, setInner] = React.useState(defaultValue);
  const items = value ?? inner;
  const [status, setStatus] = React.useState<Record<string, ActionStatus>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [category, setCategory] = React.useState(ALL);
  const [query, setQuery] = React.useState("");
  const [announce, setAnnounce] = React.useState("");
  const listRef = React.useRef<HTMLUListElement>(null);
  const ghostRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [bar, setBar] = React.useState({ left: 0, width: 0, ready: false });
  const latest = React.useRef(items);

  const commit = (next: Integration[]) => {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };
  const drop = <T,>(o: Record<string, T>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key)) as Record<string, T>;

  const categories = React.useMemo(() => {
    const seen = [...new Set(items.map((i) => i.category).filter(Boolean) as string[])];
    return seen.length > 1 ? [ALL, ...seen] : [];
  }, [items]);
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => (category === ALL || i.category === category) && (!q || i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)));
  const ranks = React.useMemo(() => new Map(items.map((i, n) => [i.id, n])), [items]);
  useRowMotion(listRef, { reduced, ranks, ghosts: ghostRef });
  const connectedCount = items.filter((i) => i.account).length;

  React.useLayoutEffect(() => {
    const b = tabRefs.current[category];
    if (!b) return;
    setBar((p) => (p.left === b.offsetLeft && p.width === b.offsetWidth ? p : { left: b.offsetLeft, width: b.offsetWidth, ready: p.width > 0 }));
  }, [category, categories.length]);

  const act = React.useRef<NonNullable<RowProps["act"]["current"]>>({
    connect: () => {},
    disconnect: async () => {},
  });

  React.useLayoutEffect(() => {
    latest.current = items;
    act.current = {
      // Called straight from the click, so a window opened inside onConnect isn't blocked.
      connect: (item) => {
        if (!onConnect || item.connectDisabled || status[item.id] === "pending") return;
        setStatus((s) => ({ ...s, [item.id]: "pending" }));
        setErrors((e) => drop(e, item.id));
        onConnect(item).then(
          (account) => {
            commit(latest.current.map((i) => (i.id === item.id ? { ...i, account } : i)));
            setStatus((s) => drop(s, item.id));
            setAnnounce(`${item.name} connected as ${account.name}.`);
          },
          (e) => {
            const why = message(e, `${item.name} couldn't be connected.`);
            setStatus((s) => ({ ...s, [item.id]: "error" }));
            setErrors((x) => ({ ...x, [item.id]: why }));
            setAnnounce(why);
            window.setTimeout(() => {
              setStatus((s) => (s[item.id] === "error" ? drop(s, item.id) : s));
              setErrors((x) => (x[item.id] === why ? drop(x, item.id) : x));
            }, 4200);
          },
        );
      },
      disconnect: async (item) => {
        await onDisconnect?.(item);
        setAnnounce(`${item.name} disconnected.`);
        window.setTimeout(() => commit(latest.current.map((i) => (i.id === item.id ? { ...i, account: null } : i))), 600);
      },
    };
  });

  return (
    <div className={`@container w-full rounded-lg border border-border bg-background text-foreground ${className}`} {...props}>
      <div className="px-4 pt-4 pb-3 @md:px-5 @md:pt-5">
        <p className="flex items-baseline gap-2 text-sm font-medium tracking-[-0.01em]">
          {title}
          <span className="inline-flex items-baseline text-xs font-normal text-muted-foreground tabular-nums">
            <NumberRoll value={connectedCount} />
            &nbsp;{connectedCountLabel}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>

      {(categories.length > 0 || items.length > 6) && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 @md:px-5">
          {categories.length > 0 && (
            <div role="tablist" aria-label="Categories" className="relative -mx-1 flex max-w-full items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]">
              <span
                aria-hidden="true"
                className="absolute top-0 left-0 h-7 rounded-full bg-accent shadow-[inset_0_0_0_1px_var(--border)]"
                style={{ width: bar.width, transform: `translateX(${bar.left}px)`, transition: bar.ready && !reduced ? `transform 380ms ${EASE}, width 380ms ${EASE}` : "none" }}
              />
              {categories.map((c) => (
                <button
                  key={c}
                  ref={(el) => {
                    tabRefs.current[c] = el;
                  }}
                  role="tab"
                  aria-selected={category === c}
                  tabIndex={category === c ? 0 : -1}
                  onClick={() => setCategory(c)}
                  onKeyDown={(e) => {
                    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                    if (!step) return;
                    e.preventDefault();
                    const next = categories[(categories.indexOf(c) + step + categories.length) % categories.length];
                    setCategory(next);
                    tabRefs.current[next]?.focus();
                  }}
                  className={`relative h-7 shrink-0 cursor-pointer rounded-full px-3 text-xs font-medium whitespace-nowrap transition-colors ${FOCUS} ${category === c ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <label className="ml-auto flex h-7 min-w-[9rem] flex-1 items-center gap-1.5 rounded-full px-2.5 shadow-[inset_0_0_0_1px_var(--border)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--ring)] @lg:max-w-[14rem]">
            <Search className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">Search integrations</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 [@media(pointer:fine)]:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
        </div>
      )}

      <div className="relative border-t border-border">
        <ul ref={listRef} aria-label={title} className="relative">
          {shown.map((i) => (
            <Row
              key={i.id}
              item={i}
              status={status[i.id] ?? "idle"}
              error={errors[i.id]}
              href={i.account ? settingsHref?.(i) : undefined}
              canDisconnect={Boolean(onDisconnect)}
              reduced={reduced}
              canConnect={Boolean(onConnect && !i.connectDisabled)}
              connectLabel={connectLabel}
              connectingLabel={connectingLabel}
              connectedLabel={connectedLabel}
              disconnectLabel={disconnectLabel}
              disconnectingLabel={disconnectingLabel}
              act={act}
            />
          ))}
        </ul>
        <div ref={ghostRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />
        <Fold open={!shown.length} reduced={reduced}>
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</p>
        </Fold>
      </div>

      <span className="sr-only" role="status">
        {announce}
      </span>
    </div>
  );
}
