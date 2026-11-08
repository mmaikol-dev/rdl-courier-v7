"use client";

import * as React from "react";
import { Copy, Plus, RotateCw, Trash2 } from "lucide-react";
import { ConfirmAction } from "./confirm-action";
import { NumberRoll } from "./number-roll";
import { formatDate, RelativeTime, toTime, type DateLike } from "./relative-time";
import { StatusButton, type ActionStatus } from "./status-button";
import { useRowMotion } from "./use-row-motion";

/* ─────────────────────────────────────────────────────────
 * API KEYS: the settings screen, done properly
 *
 *   create    "Create key" opens a row at the top of the list
 *             (the rows below glide down): a name, the scopes,
 *             Create. That same row becomes the new key
 *   reveal    the secret rises in under it character by
 *             character, with Copy and Done; it is never kept
 *             anywhere but on screen
 *   seal      Done folds the secret away: its prefix and last
 *             four characters fly up into the key's chip as the
 *             rest blurs out, so "sk_live_••••4f2a" is visibly
 *             what's left of the key you just saw
 *   roll      the old key's chip lifts away, the new secret
 *             rises in where it was, and the old key (if your
 *             server keeps it alive) counts down to its expiry
 *             in the row below
 *   revoke    the bin's own circle stretches into "Revoke";
 *             a check draws, then the row folds away and the
 *             rest glide up
 *
 * Keys are plain records; every change is one async function
 * that returns what your server stored.
 * ───────────────────────────────────────────────────────── */

export type { DateLike };

export interface ApiKey {
  id: string;
  name: string;
  /** The part of the key you show before the dots, e.g. "sk_live_". */
  prefix?: string;
  /** The last characters of the key, e.g. "4f2a". */
  last4?: string;
  scopes?: string[];
  createdAt?: DateLike;
  lastUsedAt?: DateLike | null;
  /** A rolled key keeps working until then; it counts down in its row. */
  expiresAt?: DateLike | null;
}

export interface ApiKeyScope {
  value: string;
  label: string;
}

export interface ApiKeyCreated {
  key: ApiKey;
  /** The whole secret, shown once. */
  secret: string;
}

export interface ApiKeyRolled extends ApiKeyCreated {
  /** The old key as your server now keeps it (with expiresAt), if it still works for a while. */
  previous?: ApiKey | null;
}

export interface ApiKeysProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> {
  value?: ApiKey[];
  defaultValue?: ApiKey[];
  onValueChange?: (keys: ApiKey[]) => void;
  /** Creates the key. Return it with its secret; throw to keep the form and say why. */
  onCreate?: (input: { name: string; scopes: string[] }) => Promise<ApiKeyCreated>;
  /** Replaces a key with a new secret. Without it there is no Roll button. */
  onRoll?: (key: ApiKey) => Promise<ApiKeyRolled>;
  /** Revokes a key. Without it there is no Revoke button. */
  onRevoke?: (key: ApiKey) => Promise<unknown> | unknown;
  /** What a key may do. Without it the form doesn't ask. */
  scopes?: ApiKeyScope[];
  /** Scopes a new key starts with; all of them by default. */
  defaultScopes?: string[];
  title?: string;
  description?: string;
  /** The name field's placeholder. */
  placeholder?: string;
}

type Draft = { rk: string; name: string; scopes: string[]; status: ActionStatus; error: string | null };
type Reveal = { id: string; secret: string; sealing: boolean };
type Actions = {
  setDraft: (patch: Partial<Draft>) => void;
  submit: () => void;
  cancel: () => void;
  seal: (id: string) => void;
  roll: (key: ApiKey) => Promise<void>;
  revoke: (key: ApiKey) => Promise<void>;
};

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const NONE: ApiKey[] = [];
const DAY = 86_400_000;

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

const masked = (k: ApiKey) => `${k.prefix ?? ""}••••${k.last4 ?? ""}`;
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Text as one inline-block per character, so characters can be found and flown; lines still break between them. */
function Chars({ text }: { text: string }) {
  return (
    <>
      {Array.from(text).map((ch, i) => (
        <span key={i} data-ch={i} className="inline-block">
          {ch}
        </span>
      ))}
    </>
  );
}

/** A block that opens and closes by height; it keeps its last children while it closes. */
function Fold({ open, reduced, children }: { open: boolean; reduced: boolean; children: React.ReactNode }) {
  return (
    <div className="grid" inert={!open} style={{ gridTemplateRows: open ? "1fr" : "0fr", transition: reduced ? "none" : `grid-template-rows 460ms ${EASE}` }}>
      <div className="min-h-0 overflow-clip">{children}</div>
    </div>
  );
}

/** "Expires in 23:59:41", rolling down a second at a time; a date when it's further off. */
function Expiry({ at }: { at: number }) {
  const [now, setNow] = React.useState<number | null>(null);
  const left = now === null ? null : at - now;
  const ticking = left !== null && left > 0 && left < 2 * DAY;

  React.useEffect(() => {
    if (now === null) {
      const timer = window.setTimeout(() => setNow(Date.now()), 0);
      return () => window.clearTimeout(timer);
    }
    if (!ticking) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000 - (Date.now() % 1000) + 10);
    return () => window.clearTimeout(timer);
  }, [now, ticking]);

  if (left === null) return null;
  if (left <= 0) return <span className="text-destructive">Expired</span>;
  if (!ticking) return <span>Expires {formatDate(at)}</span>;
  const s = Math.floor(left / 1000);
  const two = { minimumIntegerDigits: 2 };
  return (
    <span className="inline-flex items-baseline whitespace-nowrap tabular-nums text-warning">
      <span className="sr-only">Expires {new Date(at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        Expires in&nbsp;
        <NumberRoll value={Math.floor(s / 3600)} direction="down" />:
        <NumberRoll value={Math.floor(s / 60) % 60} format={two} direction="down" />:
        <NumberRoll value={s % 60} format={two} direction="down" />
      </span>
    </span>
  );
}

function ScopeChip({ scope, on, reduced, onToggle }: { scope: ApiKeyScope; on: boolean; reduced: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`inline-flex h-7 cursor-pointer items-center rounded-full px-2.5 text-xs font-medium transition-[background-color,color,box-shadow] duration-200 ${FOCUS} ${
        on ? "bg-accent text-foreground shadow-[inset_0_0_0_1px_var(--border)]" : "text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:text-foreground"
      }`}
    >
      <span className="grid" style={{ gridTemplateColumns: on ? "1fr" : "0fr", transition: reduced ? "none" : `grid-template-columns 320ms ${EASE}` }}>
        <span className="min-w-0 overflow-clip">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mr-1 size-3.5">
            <path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              style={{ strokeDashoffset: on ? 0 : 1, transition: reduced ? "none" : `stroke-dashoffset 360ms ${EASE} ${on ? 120 : 0}ms` }}
            />
          </svg>
        </span>
      </span>
      {scope.label}
    </button>
  );
}

function DraftFace({ draft, scopes, placeholder, reduced, act }: { draft: Draft; scopes?: ApiKeyScope[]; placeholder: string; reduced: boolean; act: React.RefObject<Actions> }) {
  const id = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const lineRef = React.useRef<HTMLParagraphElement>(null);
  const busy = draft.status === "pending";
  const line = draft.error ?? "The secret is shown once, when it's created.";

  React.useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // A new line under the form lifts in; the field shakes when the error is about it.
  React.useLayoutEffect(() => {
    if (reduced || !draft.error) return;
    lineRef.current?.animate([{ opacity: 0, transform: "translateY(4px)", filter: "blur(3px)" }, { opacity: 1, transform: "none", filter: "blur(0px)" }], { duration: 320, easing: EASE });
    if (!draft.name.trim())
      inputRef.current?.animate([{ transform: "none" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }], { duration: 380, easing: "ease-out" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.error]);

  return (
    <form
      className="px-4 py-3.5 @md:px-5"
      onSubmit={(e) => {
        e.preventDefault();
        act.current.submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.preventDefault();
          act.current.cancel();
        }
      }}
    >
      <label htmlFor={`${id}-name`} className="text-xs text-muted-foreground">
        New key
      </label>
      <input
        ref={inputRef}
        id={`${id}-name`}
        value={draft.name}
        readOnly={busy}
        onChange={(e) => act.current.setDraft({ name: e.target.value, error: null, status: "idle" })}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={Boolean(draft.error) || undefined}
        aria-describedby={`${id}-line`}
        className={`mt-1 h-9 w-full rounded-md bg-transparent px-3 text-base text-foreground outline-none transition-shadow duration-200 placeholder:text-muted-foreground/70 read-only:opacity-60 [@media(pointer:fine)]:text-sm ${
          draft.error ? "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-destructive)_45%,transparent)]" : "shadow-[inset_0_0_0_1px_var(--border)] focus:shadow-[inset_0_0_0_1px_var(--ring)]"
        }`}
      />
      {scopes && scopes.length > 0 && (
        <div role="group" aria-label="Scopes" className="mt-2.5 flex flex-wrap gap-1.5">
          {scopes.map((s) => {
            const on = draft.scopes.includes(s.value);
            return (
              <ScopeChip
                key={s.value}
                scope={s}
                on={on}
                reduced={reduced}
                onToggle={() => act.current.setDraft({ scopes: on ? draft.scopes.filter((v) => v !== s.value) : [...draft.scopes, s.value], error: null, status: "idle" })}
              />
            );
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <p ref={lineRef} id={`${id}-line`} className={`mr-auto min-w-0 text-xs ${draft.error ? "text-destructive" : "text-muted-foreground"}`}>
          {line}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => act.current.cancel()}
            disabled={busy}
            className={`h-7 cursor-pointer rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-50 ${FOCUS}`}
          >
            Cancel
          </button>
          <StatusButton type="submit" size="sm" status={draft.status} labels={{ idle: "Create key", pending: "Creating", success: "Created", error: "Try again" }} />
        </div>
      </div>
    </form>
  );
}

function SecretBlock({ secret, reduced, blockRef }: { secret: string; reduced: boolean; blockRef: React.RefObject<HTMLElement | null> }) {
  // The secret rises in a character at a time, the whole of it inside half a second.
  React.useLayoutEffect(() => {
    const el = blockRef.current;
    if (!el || reduced) return;
    const chars = el.querySelectorAll<HTMLElement>("[data-ch]");
    const step = Math.min(10, 420 / Math.max(1, chars.length));
    chars.forEach((c, i) =>
      c.animate([{ opacity: 0, filter: "blur(4px)", transform: "translateY(0.35em)" }, { opacity: 1, filter: "blur(0px)", transform: "none" }], {
        duration: 360,
        delay: 140 + i * step,
        easing: EASE,
        fill: "backwards",
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  return (
    <code
      ref={blockRef as React.RefObject<HTMLElement>}
      className="block rounded-md bg-muted px-3 py-2.5 font-mono text-xs leading-[1.6] break-all text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
    >
      <Chars text={secret} />
    </code>
  );
}

interface RowProps {
  rk: string;
  apiKey: ApiKey | null;
  draft: Draft | null;
  reveal: Reveal | null;
  scopes?: ApiKeyScope[];
  placeholder: string;
  gone: boolean;
  canRoll: boolean;
  canRevoke: boolean;
  reduced: boolean;
  act: React.RefObject<Actions>;
}

const Row = React.memo(function Row({ rk, apiKey, draft, reveal, scopes, placeholder, gone, canRoll, canRevoke, reduced, act }: RowProps) {
  const outerRef = React.useRef<HTMLLIElement>(null);
  const chipRef = React.useRef<HTMLSpanElement>(null);
  const blockRef = React.useRef<HTMLElement>(null);
  const height = React.useRef(0);
  const face = apiKey ? "key" : "draft";
  const lastFace = React.useRef(face);
  const [keptDraft, setKeptDraft] = React.useState(draft);
  if (draft && draft !== keptDraft) setKeptDraft(draft);
  // The form stays on screen, fading, in the same commit the key takes its place.
  const [faceSeen, setFaceSeen] = React.useState(face);
  const [leavingDraft, setLeavingDraft] = React.useState(false);
  if (faceSeen !== face) {
    setFaceSeen(face);
    setLeavingDraft(face === "key" && !reduced);
  }
  const shown = reveal && !reveal.sealing;
  // The secret stays in the fold while it closes, then leaves the page.
  const [kept, setKept] = React.useState<string | null>(reveal?.secret ?? null);
  if (reveal && reveal.secret !== kept) setKept(reveal.secret);
  if (!reveal && kept !== null) setKept(null);

  React.useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => (height.current = el.offsetHeight));
    height.current = el.offsetHeight;
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The form became the key: the row eases from the form's height to the key's while the form fades out over it.
  React.useLayoutEffect(() => {
    if (lastFace.current === face) return;
    lastFace.current = face;
    const el = outerRef.current;
    if (!el || reduced || face !== "key") return;
    const to = el.offsetHeight;
    if (Math.abs(to - height.current) > 0.5) el.animate([{ height: `${height.current}px` }, { height: `${to}px` }], { duration: 460, easing: EASE });
  }, [face, reduced]);

  React.useEffect(() => {
    if (!leavingDraft) return;
    const timer = window.setTimeout(() => setLeavingDraft(false), 320);
    return () => window.clearTimeout(timer);
  }, [leavingDraft]);

  // Done: the prefix and last four fly from the secret into the chip; the rest blurs out as the fold closes.
  const sealing = Boolean(reveal?.sealing);
  React.useLayoutEffect(() => {
    if (!sealing || !apiKey || !reveal) return;
    const chip = chipRef.current;
    const block = blockRef.current;
    if (!chip || !block || reduced) return;
    const from = [...block.querySelectorAll<HTMLElement>("[data-ch]")];
    const to = [...chip.querySelectorAll<HTMLElement>("[data-ch]")];
    const text = masked(apiKey);
    const secret = reveal.secret;
    const pairs = new Map<number, number>();
    const prefix = apiKey.prefix ?? "";
    if (prefix && secret.startsWith(prefix)) for (let i = 0; i < prefix.length; i++) pairs.set(i, i);
    if (apiKey.last4 && secret.endsWith(apiKey.last4)) for (let j = 0; j < apiKey.last4.length; j++) pairs.set(text.length - apiKey.last4.length + j, secret.length - apiKey.last4.length + j);
    const flown = new Set(pairs.values());
    to.forEach((c, i) => {
      const source = pairs.get(i);
      if (source === undefined || !from[source]) {
        c.animate([{ opacity: 0, filter: "blur(4px)", transform: "translateY(0.35em)" }, { opacity: 1, filter: "blur(0px)", transform: "none" }], { duration: 380, delay: 220, easing: EASE, fill: "backwards" });
        return;
      }
      const a = from[source].getBoundingClientRect();
      const b = c.getBoundingClientRect();
      // Together, so "sk_live_" and the last four travel as words.
      c.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: "none" }], { duration: 540, easing: EASE, fill: "backwards" });
    });
    from.forEach((c, i) => {
      if (flown.has(i)) c.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 600, fill: "forwards" });
      else c.animate([{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(4px)", transform: "translateY(-0.3em)" }], { duration: 220, easing: EASE, fill: "forwards" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sealing]);

  const hide = Boolean(reveal) && !sealing;
  // While the chip is hidden it keeps the old key's characters, so a roll never flashes the new ones.
  const [chipText, setChipText] = React.useState(apiKey ? masked(apiKey) : "");
  if (apiKey && !hide && chipText !== masked(apiKey)) setChipText(masked(apiKey));

  const scopeText = apiKey?.scopes?.length ? apiKey.scopes.map((v) => scopes?.find((s) => s.value === v)?.label ?? v).join(", ") : null;
  const expires = apiKey?.expiresAt ? toTime(apiKey.expiresAt) : null;

  return (
    <li ref={outerRef} data-row-id={rk} className="relative overflow-clip border-t border-border first:border-t-0">
      {apiKey ? (
        <div className="px-4 py-3 transition-opacity duration-300 @md:px-5" style={{ opacity: gone ? 0.5 : 1 }}>
          <div className="flex min-h-7 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium tracking-[-0.01em]">{apiKey.name}</p>
              <span ref={chipRef} className="relative inline-flex h-[22px] shrink-0 items-center px-1.5 font-mono text-xs text-foreground">
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-md bg-muted shadow-[inset_0_0_0_1px_var(--border)]"
                style={{ opacity: hide ? 0 : 1, transition: reduced ? "none" : `opacity ${hide ? 200 : 420}ms ${EASE} ${hide ? 0 : 160}ms` }}
              />
              <span className="sr-only">{apiKey.last4 ? `Key ending ${apiKey.last4}` : `Key prefix ${apiKey.prefix ?? "unknown"}; remaining characters hidden`}</span>
              <span
                aria-hidden="true"
                className="relative whitespace-nowrap"
                style={{ opacity: hide ? 0 : 1, filter: hide && !reduced ? "blur(3px)" : "none", transition: hide && !reduced ? `opacity 200ms ${EASE}, filter 200ms ${EASE}` : "none" }}
              >
                <Chars text={chipText} />
              </span>
            </span>
            {(canRoll || canRevoke) && (
              <div className="-mr-1 flex items-center">
                {canRoll && !expires && (
                  <ConfirmAction
                    tone="default"
                    icon={<RotateCw strokeWidth={1.75} />}
                    label={`Roll ${apiKey.name}`}
                    labels={{ idle: "Roll key", pending: "Rolling", success: "Rolled", error: "Try again" }}
                    onConfirm={() => act.current.roll(apiKey)}
                    resetAfter={1400}
                  />
                )}
                {canRevoke && (
                  <ConfirmAction
                    icon={<Trash2 strokeWidth={1.75} />}
                    label={`Revoke ${apiKey.name}`}
                    labels={{ idle: "Revoke", pending: "Revoking", success: "Revoked", error: "Try again" }}
                    onConfirm={() => act.current.revoke(apiKey)}
                  />
                )}
              </div>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
            {scopeText && (
              <>
                <span>{scopeText}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            {apiKey.createdAt != null && (
              <>
                <span>Created {formatDate(apiKey.createdAt)}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            {expires !== null ? (
              <Expiry at={expires} />
            ) : apiKey.lastUsedAt ? (
              <RelativeTime date={apiKey.lastUsedAt} prefix="Last used" />
            ) : (
              <span>Never used</span>
            )}
          </p>
          <Fold open={Boolean(shown)} reduced={reduced}>
            {kept && (
              <div className="pt-3">
                <SecretBlock key={kept} secret={kept} reduced={reduced} blockRef={blockRef} />
                <div className="mt-2.5 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                  <p className="mr-auto text-xs text-muted-foreground">Copy it now. You won&rsquo;t see it again.</p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => act.current.seal(apiKey.id)}
                      className={`h-7 cursor-pointer rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${FOCUS}`}
                    >
                      Done
                    </button>
                    <CopyButton secret={kept} autoFocus={Boolean(shown)} />
                  </div>
                </div>
              </div>
            )}
          </Fold>
        </div>
      ) : null}
      {(face === "draft" || leavingDraft) && (draft ?? keptDraft) && (
        <FaceOut leaving={face !== "draft"}>
          <DraftFace draft={(draft ?? keptDraft)!} scopes={scopes} placeholder={placeholder} reduced={reduced} act={act} />
        </FaceOut>
      )}
    </li>
  );
});

/** The form, fading out through a blur over the key that took its place. */
function FaceOut({ leaving, children }: { leaving: boolean; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (!leaving) return;
    ref.current?.animate([{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(4px)" }], { duration: 260, easing: EASE, fill: "forwards" });
  }, [leaving]);
  return (
    <div ref={ref} className={leaving ? "pointer-events-none absolute inset-x-0 top-0" : ""} inert={leaving} aria-hidden={leaving || undefined}>
      {children}
    </div>
  );
}

function CopyButton({ secret, autoFocus }: { secret: string; autoFocus: boolean }) {
  const [status, setStatus] = React.useState<ActionStatus>("idle");
  const wrap = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (autoFocus) wrap.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <span ref={wrap} className="contents">
      <StatusButton
        size="sm"
        status={status}
        icon={<Copy strokeWidth={1.75} />}
        labels={{ idle: "Copy", pending: "Copying", success: "Copied", error: "Try again" }}
        onReset={() => setStatus("idle")}
        onClick={async () => {
          setStatus("pending");
          try {
            await navigator.clipboard.writeText(secret);
            setStatus("success");
          } catch {
            setStatus("error");
          }
        }}
      />
    </span>
  );
}

export function ApiKeys({
  value,
  defaultValue = NONE,
  onValueChange,
  onCreate,
  onRoll,
  onRevoke,
  scopes,
  defaultScopes,
  title = "API keys",
  description = "Keys give your code access to this workspace. Keep them out of the browser.",
  placeholder = "e.g. Production server",
  className = "",
  ...props
}: ApiKeysProps) {
  const reduced = useReducedMotion();
  const [inner, setInner] = React.useState(defaultValue);
  const keys = value ?? inner;
  const [draft, setDraftState] = React.useState<Draft | null>(null);
  const [reveal, setReveal] = React.useState<Reveal | null>(null);
  const [alias, setAlias] = React.useState<Record<string, string>>({});
  const [gone, setGone] = React.useState<string[]>([]);
  const [announce, setAnnounce] = React.useState("");
  const listRef = React.useRef<HTMLUListElement>(null);
  const ghostRef = React.useRef<HTMLDivElement>(null);
  const createRef = React.useRef<HTMLButtonElement>(null);
  const counter = React.useRef(0);
  const latest = React.useRef({ keys, draft, alias });
  latest.current = { keys, draft, alias };

  const commit = (next: ApiKey[]) => {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };
  const rkOf = (id: string, a = alias) => a[id] ?? id;

  const rows: { rk: string; apiKey: ApiKey | null }[] = [...(draft ? [{ rk: draft.rk, apiKey: null }] : []), ...keys.map((k) => ({ rk: rkOf(k.id), apiKey: k }))];
  const ranks = React.useMemo(() => new Map(rows.map((r, i) => [r.rk, i])), [rows.map((r) => r.rk).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  useRowMotion(listRef, { reduced, ranks, ghosts: ghostRef });

  const act = React.useRef<Actions>(null!);
  act.current = {
    setDraft: (patch) => setDraftState((d) => (d ? { ...d, ...patch } : d)),
    cancel: () => {
      setDraftState(null);
      requestAnimationFrame(() => createRef.current?.focus({ preventScroll: true }));
    },
    submit: async () => {
      const d = latest.current.draft;
      if (!d || d.status === "pending" || !onCreate) return;
      const name = d.name.trim();
      if (!name) return setDraftState({ ...d, error: "Give the key a name, so you know where it's used.", status: "idle" });
      if (scopes?.length && !d.scopes.length) return setDraftState({ ...d, error: "Pick at least one scope.", status: "idle" });
      setDraftState({ ...d, status: "pending", error: null });
      try {
        const { key, secret } = await onCreate({ name, scopes: d.scopes });
        // One commit: the form's row becomes the key's row and opens on its secret.
        setAlias((a) => ({ ...a, [key.id]: d.rk }));
        commit([key, ...latest.current.keys]);
        setDraftState(null);
        setReveal({ id: key.id, secret, sealing: false });
        setAnnounce(`${key.name} created. Copy the secret now; it won't be shown again.`);
      } catch (e) {
        setDraftState((cur) => cur && { ...cur, status: "error", error: message(e, "The key couldn't be created. Try again.") });
      }
    },
    seal: (id) => {
      setReveal((r) => (r && r.id === id ? { ...r, sealing: true } : r));
      setAnnounce("Secret hidden.");
      window.setTimeout(() => setReveal((r) => (r && r.id === id && r.sealing ? null : r)), 620);
      requestAnimationFrame(() => createRef.current?.focus({ preventScroll: true }));
    },
    roll: async (key) => {
      if (!onRoll) return;
      const { key: next, secret, previous } = await onRoll(key);
      const { keys: now, alias: a } = latest.current;
      const rk = rkOf(key.id, a);
      setAlias((cur) => ({ ...cur, [next.id]: rk, ...(previous ? { [previous.id]: `${rk}~${++counter.current}` } : {}) }));
      commit(now.flatMap((k) => (k.id === key.id ? [next, ...(previous ? [previous] : [])] : [k])));
      setReveal({ id: next.id, secret, sealing: false });
      setAnnounce(`${next.name} rolled. Copy the new secret now; it won't be shown again.`);
    },
    revoke: async (key) => {
      await onRevoke?.(key);
      setGone((g) => [...g, key.id]);
      setAnnounce(`${key.name} revoked.`);
      // Long enough for the check to draw; then the row folds away.
      window.setTimeout(() => {
        commit(latest.current.keys.filter((k) => k.id !== key.id));
        setGone((g) => g.filter((id) => id !== key.id));
        setReveal((r) => (r?.id === key.id ? null : r));
      }, 700);
    },
  };

  const openDraft = () => {
    if (draft) return;
    setDraftState({ rk: `draft-${++counter.current}`, name: "", scopes: defaultScopes ?? scopes?.map((s) => s.value) ?? [], status: "idle", error: null });
  };

  return (
    <div className={`@container w-full rounded-lg border border-border bg-background text-foreground ${className}`} {...props}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3.5 @md:px-5 @md:pt-5">
        <div className="min-w-0">
          <p className="flex items-baseline gap-2 text-sm font-medium tracking-[-0.01em]">
            {title}
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              <NumberRoll value={keys.length} />
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {onCreate && <button
          ref={createRef}
          type="button"
          onClick={openDraft}
          aria-disabled={Boolean(draft) || undefined}
          className={`inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,opacity] duration-200 hover:bg-accent aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent ${FOCUS}`}
        >
          <Plus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          Create key
        </button>}
      </div>

      <div className="relative border-t border-border">
        <ul ref={listRef} aria-label={title} className="relative">
          {rows.map((r) => (
            <Row
              key={r.rk}
              rk={r.rk}
              apiKey={r.apiKey}
              draft={r.apiKey ? null : draft}
              reveal={r.apiKey && reveal?.id === r.apiKey.id ? reveal : null}
              scopes={scopes}
              placeholder={placeholder}
              gone={Boolean(r.apiKey && gone.includes(r.apiKey.id))}
              canRoll={Boolean(onRoll)}
              canRevoke={Boolean(onRevoke)}
              reduced={reduced}
              act={act}
            />
          ))}
        </ul>
        {/* Rows that went: their own elements, folding away where they stood (see use-row-motion). */}
        <div ref={ghostRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />
        <Fold open={!rows.length} reduced={reduced}>
          <p className="px-4 py-6 text-center text-sm text-muted-foreground @md:px-5">No keys yet. Create one to call the API from your server.</p>
        </Fold>
      </div>

      <span className="sr-only" role="status">
        {announce}
      </span>
    </div>
  );
}
