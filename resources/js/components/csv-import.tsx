"use client";

import * as React from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { CsvMapper } from "./csv-mapper";
import { autoMatch, parseCsv, toCsv } from "./csv-parse";
import { NumberRoll } from "./number-roll";
import { StatusButton } from "./status-button";
import { TextMorph } from "./text-morph";

/* ─────────────────────────────────────────────────────────
 * CSV IMPORT: Contacts → Import, done properly
 *
 *   drop      drop a file (the target lifts to meet it) or
 *             choose one; it's read in slices with the row
 *             count rolling, so a big file never freezes the page
 *   match     the file's columns line up against your fields;
 *             the ones that match by name are threaded together
 *             already. Carry a column onto a field to change it,
 *             or use the field's select
 *   review    "2,996 ready · 4 need a look": the rows with
 *             problems open with their bad cells as fields;
 *             fix one and it ticks and folds away, the counts
 *             rolling. Or skip what's left
 *   import    rows go to onImport in batches; the bar fills and
 *             "1,250 of 2,996" rolls; Cancel stops after the
 *             batch in flight
 *   done      a ring and a check draw; anything skipped or
 *             refused downloads as a CSV with the reason per row
 *
 * The file never leaves the browser until onImport sends your
 * rows, already shaped as { [field]: value }.
 * ───────────────────────────────────────────────────────── */

export interface CsvField {
  key: string;
  label: string;
  required?: boolean;
  /** Other names the column might have in a file, e.g. ["e-mail", "email address"]. */
  match?: string[];
  /** Return why a value won't do. */
  validate?: (value: string, row: Record<string, string>) => string | null | undefined | void;
}

export interface CsvImportResult {
  /** Rows in this batch your server refused, by their index in the batch. */
  failed?: { index: number; reason: string }[];
}

export interface CsvImportHandle {
  /** Reads text as if it were a dropped file. */
  load: (text: string, name?: string) => void;
}

export interface CsvRequiredGroup {
  keys: string[];
  label: string;
}

export interface CsvImportProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  fields: CsvField[];
  /** Saves one batch of rows. Throw to mark the whole batch as not imported. */
  onImport: (rows: Record<string, string>[], options: { signal: AbortSignal; start: number }) => Promise<CsvImportResult | void>;
  /** Runs once with all valid rows before importing; return false to cancel. */
  onBeforeImport?: (rows: Record<string, string>[]) => boolean | Promise<boolean>;
  /** At least one mapped, non-empty field in each group is required. */
  requiredGroups?: CsvRequiredGroup[];
  /** Map headerless rows to fields by their positional column index. */
  positionalMapping?: Record<string, number>;
  /** Rows per onImport call. */
  batchSize?: number;
  maxRows?: number;
  /** What a row is: { one: "contact", many: "contacts" }. */
  noun?: { one: string; many: string };
  /** A link to a template file to fill in. */
  templateHref?: string;
  title?: string;
  description?: string;
  onDone?: (summary: { imported: number; skipped: number; cancelled: boolean }) => void;
  ref?: React.Ref<CsvImportHandle>;
}

type Step = "drop" | "map" | "review" | "import" | "done";
type Skipped = { row: Record<string, string>; reason: string };

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const THROW = "cubic-bezier(0.34,1.36,0.64,1)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const ORDER: Step[] = ["drop", "map", "review", "import", "done"];
const SHOWN = 40;
const NO_REQUIRED_GROUPS: CsvRequiredGroup[] = [];

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const count = (n: number) => n.toLocaleString("en-GB");

function Face({ out, enter, dir, reduced, onGone, children }: { out: boolean; enter: boolean; dir: number; reduced: boolean; onGone: () => void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.getAnimations().forEach((a) => a.cancel());
    if (reduced) return;
    if (out) {
      const a = el.animate([{ opacity: 1, transform: "none", filter: "blur(0px)" }, { opacity: 0, transform: `translateX(${-dir * 28}px)`, filter: "blur(4px)" }], { duration: 240, easing: EASE, fill: "forwards" });
      a.onfinish = onGone;
      return;
    }
    if (enter) el.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)`, filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "blur(0px)" }], { duration: 440, delay: 80, easing: EASE, fill: "backwards" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out]);
  return (
    <div ref={ref} inert={out} aria-hidden={out || undefined} className={out ? "pointer-events-none absolute inset-x-0 top-0" : ""}>
      {children}
    </div>
  );
}

/** Steps slide in from the side you went; the card eases to the new height. */
function Slides({ step, dir, reduced, render }: { step: Step; dir: number; reduced: boolean; render: (s: Step) => React.ReactNode }) {
  const [faces, setFaces] = React.useState<{ s: Step; out: boolean; dir: number; enter: boolean }[]>([{ s: step, out: false, dir, enter: false }]);
  const [seen, setSeen] = React.useState(step);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const height = React.useRef(0);
  // Clipped only while a step slides; at rest a menu can open past its edge.
  const [moving, setMoving] = React.useState(false);
  React.useEffect(() => {
    if (!moving) return;
    const timer = window.setTimeout(() => setMoving(false), 560);
    return () => window.clearTimeout(timer);
  }, [moving, step]);
  if (seen !== step) {
    setSeen(step);
    if (!reduced) setMoving(true);
    setFaces((f) => [...f.filter((x) => x.out && x.s !== step && x.s !== seen), ...(reduced ? [] : [{ s: seen, out: true, dir, enter: false }]), { s: step, out: false, dir, enter: true }]);
  }
  React.useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    height.current = el.offsetHeight;
    const observer = new ResizeObserver(() => (height.current = el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  React.useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || reduced) return;
    const to = el.offsetHeight;
    if (Math.abs(to - height.current) > 0.5) el.animate([{ height: `${height.current}px` }, { height: `${to}px` }], { duration: 460, easing: EASE });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  return (
    <div ref={boxRef} className="relative [overflow-clip-margin:8px]" style={{ overflowY: moving ? "clip" : "visible" }}>
      {faces.map((f) => (
        <Face key={f.s} out={f.out} enter={f.enter} dir={f.dir} reduced={reduced} onGone={() => setFaces((all) => all.filter((x) => !(x.s === f.s && x.out)))}>
          {render(f.s)}
        </Face>
      ))}
    </div>
  );
}

function Fold({ open, reduced, children }: { open: boolean; reduced: boolean; children: React.ReactNode }) {
  const [kept, setKept] = React.useState(children);
  if (open && kept !== children) {
    setKept(children);
  }
  return (
    <div className="grid" inert={!open} aria-hidden={!open || undefined} style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transition: reduced ? "none" : `grid-template-rows 420ms ${EASE}, opacity ${open ? 300 : 160}ms ${EASE}` }}>
      <div className="min-h-0 min-w-0 overflow-clip [overflow-clip-margin:6px]">{open ? children : kept}</div>
    </div>
  );
}

function Drawn({ reduced, className = "size-12", tone = "text-success" }: { reduced: boolean; className?: string; tone?: string }) {
  const ring = React.useRef<SVGCircleElement>(null);
  const tick = React.useRef<SVGPathElement>(null);
  React.useLayoutEffect(() => {
    if (reduced) return;
    ring.current?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 640, delay: 120, easing: EASE, fill: "backwards" });
    tick.current?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 420, delay: 560, easing: EASE, fill: "backwards" });
  }, [reduced]);
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={`${className} ${tone}`}>
      <circle cx="24" cy="24" r="22.5" stroke="var(--border)" strokeWidth="1" />
      <circle ref={ring} cx="24" cy="24" r="22.5" stroke="currentColor" strokeWidth="1.25" pathLength={1} strokeDasharray={1} strokeDashoffset={0} transform="rotate(-90 24 24)" />
      <path ref={tick} d="M16.5 24.5 21.5 29.5 31.5 18.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={0} />
    </svg>
  );
}

function Switch({ on, onToggle, label, reduced }: { on: boolean; onToggle: () => void; label: string; reduced: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className={`inline-flex cursor-pointer items-center gap-2.5 rounded-full py-1 pr-2 pl-1 text-left text-sm transition-colors hover:bg-accent/60 ${FOCUS}`}>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-[background-color,box-shadow] duration-300 ${on ? "bg-primary" : "bg-muted shadow-[inset_0_0_0_1px_var(--border)]"}`}>
        <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-[0_0_0_1px_var(--border)]" style={{ transform: on ? "translateX(16px)" : "none", transition: reduced ? "none" : `transform 420ms ${THROW}` }} />
      </span>
      {label}
    </button>
  );
}

/** One row with problems: its bad cells as fields; once they're right it ticks and folds away. */
function ProblemRow({
  index,
  row,
  problems,
  fields,
  fixed,
  reduced,
  onEdit,
}: {
  index: number;
  row: Record<string, string>;
  problems: Record<string, string>;
  fields: CsvField[];
  fixed: boolean;
  reduced: boolean;
  onEdit: (index: number, key: string, value: string) => void;
}) {
  const keys = Object.keys(problems);
  const [shownKeys] = React.useState(keys);
  // Fixed: it says so for a moment, then folds away.
  const [gone, setGone] = React.useState(false);
  const [seenFixed, setSeenFixed] = React.useState(fixed);
  if (fixed !== seenFixed) {
    setSeenFixed(fixed);
    if (!fixed) setGone(false);
  }
  React.useEffect(() => {
    if (!fixed) return;
    const timer = window.setTimeout(() => setGone(true), 650);
    return () => window.clearTimeout(timer);
  }, [fixed]);
  const context = fields.filter((f) => !shownKeys.includes(f.key) && row[f.key]).slice(0, 2);
  return (
    <Fold open={!gone} reduced={reduced}>
      <div className="mb-2 rounded-lg px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--border)]">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">Row {count(index + 2)}</span>
          {context.length > 0 && <span className="min-w-0 truncate">· {context.map((f) => row[f.key]).join(" · ")}</span>}
          <span className={`ml-auto inline-flex shrink-0 items-center gap-1 transition-colors ${fixed ? "text-success" : "text-warning"}`}>
            <TextMorph>{fixed ? "Fixed" : keys.length === 1 ? "1 problem" : `${keys.length} problems`}</TextMorph>
          </span>
        </p>
        <div className="mt-2 grid gap-2 @md:grid-cols-2">
          {shownKeys.map((k) => {
            const f = fields.find((x) => x.key === k)!;
            const bad = problems[k];
            return (
              <label key={k} className="block min-w-0">
                <span className="block text-xs font-medium">{f.label}</span>
                <input
                  value={row[k] ?? ""}
                  onChange={(e) => onEdit(index, k, e.target.value)}
                  aria-invalid={Boolean(bad) || undefined}
                  className={`mt-1 h-8 w-full rounded-md bg-transparent px-2.5 text-base text-foreground outline-none transition-shadow [@media(pointer:fine)]:text-sm ${
                    bad ? "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-destructive)_45%,transparent)]" : "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-success)_45%,transparent)]"
                  }`}
                />
                <span className={`mt-1 block text-xs transition-colors ${bad ? "text-destructive" : "text-success"}`}>{bad ?? "Looks right"}</span>
              </label>
            );
          })}
        </div>
      </div>
    </Fold>
  );
}

export function CsvImport({
  fields,
  onImport,
  onBeforeImport,
  requiredGroups = NO_REQUIRED_GROUPS,
  positionalMapping,
  batchSize = 250,
  maxRows = 50_000,
  noun = { one: "row", many: "rows" },
  templateHref,
  title = "Import",
  description = "Bring rows in from a spreadsheet. Nothing is saved until you import.",
  onDone,
  ref,
  className = "",
  ...props
}: CsvImportProps) {
  const reduced = useReducedMotion();
  const id = React.useId();
  const [step, setStep] = React.useState<Step>("drop");
  const [dir, setDir] = React.useState(1);
  const [fileName, setFileName] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [data, setData] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Record<string, number | null>>({});
  const [reading, setReading] = React.useState<{ name: string } | null>(null);
  const [dropError, setDropError] = React.useState<string | null>(null);
  const [over, setOver] = React.useState(false);
  const [edits, setEdits] = React.useState<Record<number, Record<string, string>>>({});
  const [fixing, setFixing] = React.useState<number[]>([]);
  const [skipBad, setSkipBad] = React.useState(true);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [confirmingImport, setConfirmingImport] = React.useState(false);
  const [result, setResult] = React.useState<{ imported: number; skipped: Skipped[]; cancelled: boolean } | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropRef = React.useRef<HTMLLabelElement>(null);
  const ctrl = React.useRef<AbortController | null>(null);
  const many = noun.many;

  const go = (next: Step) => {
    setDir(ORDER.indexOf(next) >= ORDER.indexOf(step) ? 1 : -1);
    setStep(next);
  };

  const read = async (text: string, name: string) => {
    setDropError(null);
    setReading({ name });
    try {
      const rows = await parseCsv(text);
      const [head, ...body] = rows;
      if (!head || !body.length) throw new Error("That file has no rows under its header.");
      const matched = autoMatch(head, fields);
      const hasHeader = fields.some((field) => field.required && matched[field.key] !== null) || Object.values(matched).filter((column) => column !== null).length >= 2;
      const inputRows = hasHeader ? body : [head, ...body];
      if (inputRows.length > maxRows) throw new Error(`That file has ${count(inputRows.length)} rows; up to ${count(maxRows)} can be imported at once.`);
      const width = Math.max(head.length, ...inputRows.map((row) => row.length));
      const normalizedRows = inputRows.map((row) => (row.length === width ? row : [...row, ...Array(Math.max(0, width - row.length)).fill("")].slice(0, width)));
      const nextHeaders = hasHeader ? head.map((h) => h.trim()) : Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
      const nextMapping = hasHeader
        ? matched
        : Object.fromEntries(fields.map((field) => {
            const column = positionalMapping?.[field.key];
            return [field.key, column !== undefined && column < width ? column : null];
          }));
      setHeaders(nextHeaders);
      setData(normalizedRows);
      setMapping(nextMapping);
      setEdits({});
      setFixing([]);
      setFileName(name);
      setReading(null);
      go("map");
      setAnnounce(`${name}: ${count(inputRows.length)} ${inputRows.length === 1 ? noun.one : many}, ${width} columns. Match them to your fields.`);
    } catch (e) {
      setReading(null);
      setDropError(message(e, "That file couldn't be read."));
      if (!reduced) dropRef.current?.animate([{ transform: "none" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }], { duration: 380, easing: "ease-out" });
    }
  };

  const take = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(csv|tsv|txt)$/i.test(file.name) && !/^text\//.test(file.type)) {
      setDropError(`“${file.name}” isn't a CSV file. Export your sheet as CSV first.`);
      return;
    }
    read(await file.text(), file.name);
  };

  React.useImperativeHandle(ref, () => ({ load: (text, name = "pasted.csv") => read(text, name) }));

  const rowAt = React.useCallback(
    (i: number) => {
      const out: Record<string, string> = {};
      for (const f of fields) {
        const col = mapping[f.key];
        if (col !== null && col !== undefined) {
          out[f.key] = edits[i]?.[f.key] ?? (data[i]?.[col] ?? "").trim();
        }
      }
      return out;
    },
    [fields, mapping, edits, data],
  );

  const problemsOf = React.useCallback(
    (row: Record<string, string>) => {
      const out: Record<string, string> = {};
      for (const f of fields) {
        const v = row[f.key];
        if (f.required && !v?.trim()) out[f.key] = `${f.label} is missing.`;
        else if (v && f.validate) {
          const why = f.validate(v, row);
          if (why) out[f.key] = why;
        }
      }
      for (const group of requiredGroups) {
        if (group.keys.some((key) => row[key]?.trim())) continue;
        const errorKey = group.keys.find((key) => mapping[key] !== null && mapping[key] !== undefined) ?? group.keys[0];
        if (errorKey) out[errorKey] = `${group.label} is missing.`;
      }
      return out;
    },
    [fields, mapping, requiredGroups],
  );

  // Every row is checked once per mapping; an edit re-checks only its own row.
  const checking = step === "review" || step === "import";
  const base = React.useMemo(() => {
    if (!checking) return [];
    return data.map((r) => {
      const row: Record<string, string> = {};
      for (const f of fields) {
        const col = mapping[f.key];
        row[f.key] = col === null || col === undefined ? "" : (r[col] ?? "").trim();
      }
      return problemsOf(row);
    });
  }, [checking, data, mapping, fields, problemsOf]);
  const checks = React.useMemo(() => {
    const next = base.slice();
    for (const i of Object.keys(edits)) next[Number(i)] = problemsOf(rowAt(Number(i)));
    return next;
  }, [base, edits, problemsOf, rowAt]);
  const bad = React.useMemo(() => checks.map((p, i) => (Object.keys(p).length ? i : -1)).filter((i) => i >= 0), [checks]);
  const ready = data.length - bad.length;
  const missing = [
    ...fields.filter((f) => f.required && (mapping[f.key] === null || mapping[f.key] === undefined)).map((field) => field.label),
    ...requiredGroups.filter((group) => !group.keys.some((key) => mapping[key] !== null && mapping[key] !== undefined)).map((group) => group.label),
  ];
  const matched = fields.filter((f) => mapping[f.key] !== null && mapping[f.key] !== undefined).length;
  const samples = React.useMemo(() => headers.map((_, c) => data.slice(0, 6).map((r) => r[c] ?? "")), [headers, data]);
  const listed = [...new Set([...bad.slice(0, SHOWN), ...fixing])].sort((a, b) => a - b);

  const edit = (index: number, key: string, value: string) => {
    setEdits((e) => ({ ...e, [index]: { ...e[index], [key]: value } }));
    const row = { ...rowAt(index), [key]: value };
    if (!Object.keys(problemsOf(row)).length && !fixing.includes(index)) {
      // Fixed: it stays to say so, then folds away.
      setFixing((f) => [...f, index]);
      window.setTimeout(() => setFixing((f) => f.filter((x) => x !== index)), 1400);
    }
  };

  const run = async () => {
    const indices = data.map((_, i) => i).filter((i) => !bad.includes(i));
    const rows = indices.map(rowAt);
    if (onBeforeImport) {
      setConfirmingImport(true);
      let accepted = false;
      try {
        accepted = await onBeforeImport(rows);
      } finally {
        setConfirmingImport(false);
      }
      if (!accepted) return;
    }
    const skipped: Skipped[] = bad.map((i) => ({ row: rowAt(i), reason: Object.values(checks[i]).join(" ") }));
    const c = new AbortController();
    ctrl.current = c;
    setProgress({ done: 0, total: rows.length });
    go("import");
    let imported = 0;
    for (let s = 0; s < rows.length; s += batchSize) {
      if (c.signal.aborted) break;
      const batch = rows.slice(s, s + batchSize);
      try {
        const r = await onImport(batch, { signal: c.signal, start: s });
        const failed = (r ? r.failed : undefined) ?? [];
        failed.forEach((f) => batch[f.index] && skipped.push({ row: batch[f.index], reason: f.reason }));
        imported += batch.length - failed.length;
      } catch (e) {
        if (c.signal.aborted) break;
        const why = message(e, "Your server didn't take this batch.");
        batch.forEach((row) => skipped.push({ row, reason: why }));
      }
      setProgress({ done: Math.min(rows.length, s + batch.length), total: rows.length });
    }
    const cancelled = c.signal.aborted;
    setResult({ imported, skipped, cancelled });
    go("done");
    setAnnounce(`${count(imported)} ${imported === 1 ? noun.one : many} imported${skipped.length ? `, ${count(skipped.length)} skipped` : ""}${cancelled ? ". Stopped early" : ""}.`);
    onDone?.({ imported, skipped: skipped.length, cancelled });
  };

  const reset = () => {
    setResult(null);
    setData([]);
    setHeaders([]);
    setFileName("");
    go("drop");
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  // The skipped rows, as a file to fix and import again.
  const skippedHref = React.useMemo(() => {
    if (!result?.skipped.length) return null;
    const csv = toCsv([[...fields.map((f) => f.label), "Why it was skipped"], ...result.skipped.map((s) => [...fields.map((f) => s.row[f.key] ?? ""), s.reason])]);
    return URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  }, [result, fields]);
  React.useEffect(() => () => void (skippedHref && URL.revokeObjectURL(skippedHref)), [skippedHref]);

  const header = (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]">
        <FileSpreadsheet className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{fileName}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          {count(data.length)} {data.length === 1 ? noun.one : many} · {headers.length} columns
        </span>
      </span>
    </div>
  );

  const render = (s: Step): React.ReactNode => {
    if (s === "drop")
      return (
        <div className="px-4 pb-4 @md:px-5 @md:pb-5">
          <input
            ref={inputRef}
            id={`${id}-file`}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            className="peer sr-only"
            onChange={(e) => {
              take(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <label
            ref={dropRef}
            htmlFor={`${id}-file`}
            onDragEnter={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              take(e.dataTransfer.files[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-9 text-center transition-[background-color,border-color] duration-300 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/40 ${
              over ? "border-primary bg-accent" : dropError ? "border-destructive/50" : "border-border hover:bg-accent/40"
            }`}
          >
            <span
              className="grid size-11 place-items-center rounded-md bg-background text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]"
              style={{ transform: over ? "translateY(-4px) scale(1.06)" : "none", transition: reduced ? "none" : `transform 420ms ${THROW}` }}
            >
              {reading ? <span className="size-4 animate-spin rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-none" /> : <FileSpreadsheet className="size-5" strokeWidth={1.5} aria-hidden="true" />}
            </span>
            <span className="mt-3 text-sm font-medium">
              <TextMorph>{reading ? `Reading ${reading.name}` : over ? "Drop to read it" : "Drop a CSV file here"}</TextMorph>
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              or <span className="font-medium text-foreground underline underline-offset-2">choose a file</span>
            </span>
            <span className="mt-3 text-xs text-muted-foreground">Up to {count(maxRows)} rows. Comma, semicolon or tab separated.</span>
          </label>
          <Fold open={Boolean(dropError)} reduced={reduced}>
            <p role="alert" className="pt-2.5 text-xs text-destructive">
              {dropError}
            </p>
          </Fold>
          {templateHref && (
            <a href={templateHref} download className={`mt-3 inline-flex items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline ${FOCUS}`}>
              <Download className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              Download a template
            </a>
          )}
        </div>
      );

    if (s === "map")
      return (
        <div className="px-4 pb-4 @md:px-5 @md:pb-5">
          {header}
          <div className="mt-4 mb-2.5 flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">Match your columns</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              <NumberRoll value={matched} /> of {fields.length} fields matched
            </p>
          </div>
          {requiredGroups.length > 0 && (
            <p className="mb-3 text-xs text-muted-foreground">
              Also required: match and provide at least one of {requiredGroups.map((group) => group.label).join(", ")}.
            </p>
          )}
          <CsvMapper headers={headers} samples={samples} fields={fields} mapping={mapping} onChange={setMapping} reduced={reduced} />
          <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            <p className={`mr-auto min-w-0 text-xs ${missing.length ? "text-warning" : "text-muted-foreground"}`}>
              {missing.length ? `Match ${missing.join(" and ")} to continue.` : "Carry a column onto a field, or pick it from the list."}
            </p>
            <button type="button" onClick={reset} className={`h-7 cursor-pointer rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${FOCUS}`}>
              Change file
            </button>
            <StatusButton size="sm" labels={{ idle: "Continue" }} onClick={() => !missing.length && go("review")} aria-disabled={missing.length > 0 || undefined} className={missing.length ? "pointer-events-none opacity-50" : ""} />
          </div>
        </div>
      );

    if (s === "review") {
      const blocked = !skipBad && bad.length > 0;
      return (
        <div className="px-4 pb-4 @md:px-5 @md:pb-5">
          {header}
          <div className="mt-4 flex flex-wrap gap-2 text-xs tabular-nums">
            <span className="inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-success shadow-[inset_0_0_0_1px_var(--border)]">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              <NumberRoll value={ready} />
              &nbsp;ready
            </span>
            <span
              className="inline-grid"
              style={{ gridTemplateColumns: bad.length ? "1fr" : "0fr", opacity: bad.length ? 1 : 0, transition: reduced ? "none" : `grid-template-columns 420ms ${EASE}, opacity 260ms ${EASE}` }}
            >
              <span className="min-w-0 overflow-clip">
                <span className="inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 whitespace-nowrap text-warning shadow-[inset_0_0_0_1px_var(--border)]">
                  <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                  <NumberRoll value={bad.length || 1} />
                  &nbsp;need a look
                </span>
              </span>
            </span>
          </div>

          <Fold open={listed.length > 0} reduced={reduced}>
            <div className="mt-3 max-h-[19rem] overflow-y-auto overscroll-contain pr-1">
              {listed.map((i) => (
                <ProblemRow key={i} index={i} row={rowAt(i)} problems={checks[i] ?? {}} fields={fields} fixed={!Object.keys(checks[i] ?? {}).length} reduced={reduced} onEdit={edit} />
              ))}
              {bad.length > SHOWN && <p className="py-1 text-center text-xs text-muted-foreground">and {count(bad.length - SHOWN)} more like these</p>}
            </div>
            <div className="mt-2">
              <Switch on={skipBad} onToggle={() => setSkipBad((v) => !v)} label="Skip the rows that still need a look" reduced={reduced} />
            </div>
          </Fold>
          <Fold open={!bad.length && !fixing.length} reduced={reduced}>
            <div className="mt-4 flex items-center gap-3 rounded-lg px-3 py-3 shadow-[inset_0_0_0_1px_var(--border)]">
              <Drawn reduced={reduced} className="size-7" />
              <p className="text-sm">Every row looks right.</p>
            </div>
          </Fold>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {blocked && <p className="mr-auto text-xs text-warning">Fix the rows above, or skip them.</p>}
            <button type="button" onClick={() => go("map")} className={`h-7 cursor-pointer rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${FOCUS}`}>
              Back
            </button>
            <StatusButton
              size="sm"
              labels={{ idle: confirmingImport ? "Confirming…" : `Import ${count(ready)} ${ready === 1 ? noun.one : many}` }}
              onClick={() => !blocked && ready > 0 && !confirmingImport && run()}
              aria-disabled={blocked || !ready || confirmingImport || undefined}
              className={blocked || !ready || confirmingImport ? "pointer-events-none opacity-50" : ""}
            />
          </div>
        </div>
      );
    }

    if (s === "import") {
      const share = progress.total ? progress.done / progress.total : 0;
      return (
        <div className="px-4 pb-5 @md:px-5">
          {header}
          <div
            className="mt-5 h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`Importing ${fileName}`}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <span className="block h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${share})`, transition: reduced ? "none" : `transform 360ms ${EASE}` }} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <p className="inline-flex items-baseline text-muted-foreground tabular-nums">
              <span className="font-medium text-foreground">
                <NumberRoll value={progress.done} />
              </span>
              &nbsp;of {count(progress.total)} {many}
            </p>
            <button type="button" onClick={() => ctrl.current?.abort()} className={`h-7 cursor-pointer rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${FOCUS}`}>
              Cancel
            </button>
          </div>
        </div>
      );
    }

    const r = result;
    return (
      <div className="flex flex-col items-center px-4 pt-2 pb-5 text-center @md:px-5">
        <Drawn reduced={reduced} tone={r?.imported ? "text-success" : "text-warning"} />
        <p className="mt-3 text-base font-medium tracking-[-0.01em] tabular-nums">
          {count(r?.imported ?? 0)} {r?.imported === 1 ? noun.one : many} imported
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {r?.cancelled ? "You stopped it early; the rest weren't sent." : r?.skipped.length ? `${count(r.skipped.length)} skipped. Download them with the reason for each, fix them, and import that file.` : `Everything in ${fileName} is in.`}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {skippedHref && (
            <a href={skippedHref} download={`${fileName.replace(/\.[^.]+$/, "")}-skipped.csv`} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-accent ${FOCUS}`}>
              <Download className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              Skipped rows
            </a>
          )}
          <button type="button" onClick={reset} className={`inline-flex h-8 cursor-pointer items-center rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 ${FOCUS}`}>
            Import another file
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`@container w-full rounded-lg border border-border bg-background text-foreground ${className}`} {...props}>
      <div className="px-4 pt-4 pb-3.5 @md:px-5 @md:pt-5">
        <p className="text-sm font-medium tracking-[-0.01em]">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Slides step={step} dir={dir} reduced={reduced} render={render} />
      <span className="sr-only" role="status">
        {announce}
      </span>
    </div>
  );
}
