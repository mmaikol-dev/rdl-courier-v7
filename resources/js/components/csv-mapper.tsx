"use client";

import * as React from "react";
import { PillSelect, type PillOption } from "./pill-select";
import { Unlink } from "lucide-react";

/* ─────────────────────────────────────────────────────────
 * CSV MAPPER: your file's columns against your fields
 *
 *   threads   on a wide card each match is a hairline thread
 *             from the file's column to your field, drawn in
 *             when it's made
 *   drag      carry a column (or its dot) onto a field to match
 *             them; the thread follows the pointer. Or click a
 *             column, then a field
 *   select    every field also has a plain select, the whole
 *             mapping on a narrow card and for the keyboard
 * ───────────────────────────────────────────────────────── */

export interface MapperField {
  key: string;
  label: string;
  required?: boolean;
}

export interface CsvMapperProps {
  headers: string[];
  /** A few values from each column. */
  samples: string[][];
  fields: MapperField[];
  mapping: Record<string, number | null>;
  onChange: (mapping: Record<string, number | null>) => void;
  reduced: boolean;
}

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(24, (x2 - x1) / 2);
  return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

function Thread({ d, reduced, lit }: { d: string; reduced: boolean; lit: boolean }) {
  const ref = React.useRef<SVGPathElement>(null);
  React.useLayoutEffect(() => {
    if (!reduced) ref.current?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 520, easing: EASE, fill: "backwards" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <path
      ref={ref}
      d={d}
      fill="none"
      stroke="var(--primary)"
      strokeWidth={lit ? 1.5 : 1}
      strokeOpacity={lit ? 0.9 : 0.5}
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={0}
      style={{ transition: reduced ? "none" : "stroke-opacity 200ms, stroke-width 200ms" }}
    />
  );
}

export function CsvMapper({ headers, samples, fields, mapping, onChange, reduced }: CsvMapperProps) {
  const id = React.useId();
  const boxRef = React.useRef<HTMLDivElement>(null);
  const tempRef = React.useRef<SVGPathElement>(null);
  const [wide, setWide] = React.useState(false);
  const [lines, setLines] = React.useState<{ key: string; col: number; d: string }[]>([]);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [carrying, setCarrying] = React.useState<number | null>(null);
  const [hover, setHover] = React.useState<string | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });

  const assign = (key: string, col: number | null) => {
    const next: Record<string, number | null> = { ...mapping };
    if (col !== null) for (const k of Object.keys(next)) if (next[k] === col) next[k] = null;
    next[key] = col;
    onChange(next);
  };
  const owner = (col: number) => fields.find((f) => mapping[f.key] === col);

  // Where each thread runs: from a column's dot to its field's dot.
  const measure = React.useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const w = box.offsetWidth;
    const isWide = w >= 520;
    setWide((v) => (v === isWide ? v : isWide));
    setSize((s) => (s.w === w && s.h === box.offsetHeight ? s : { w, h: box.offsetHeight }));
    if (!isWide) return setLines((l) => (l.length ? [] : l));
    const r = box.getBoundingClientRect();
    const next: { key: string; col: number; d: string }[] = [];
    for (const f of fields) {
      const col = mapping[f.key];
      if (col === null || col === undefined) continue;
      const a = box.querySelector<HTMLElement>(`[data-col-dot="${col}"]`)?.getBoundingClientRect();
      const b = box.querySelector<HTMLElement>(`[data-field-dot="${CSS.escape(f.key)}"]`)?.getBoundingClientRect();
      if (!a || !b) continue;
      next.push({ key: f.key, col, d: curve(a.left + a.width / 2 - r.left, a.top + a.height / 2 - r.top, b.left + b.width / 2 - r.left, b.top + b.height / 2 - r.top) });
    }
    setLines((l) => (l.length === next.length && l.every((x, i) => x.d === next[i].d && x.key === next[i].key) ? l : next));
  }, [fields, mapping]);

  React.useLayoutEffect(() => {
    measure();
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [measure]);

  // Carrying a column: a loose thread follows the pointer, written straight to the path.
  const carry = (col: number, e: React.PointerEvent) => {
    if (!wide || e.button !== 0) return;
    const box = boxRef.current;
    const dot = box?.querySelector<HTMLElement>(`[data-col-dot="${col}"]`);
    if (!box || !dot) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      if (!started) {
        started = true;
        setCarrying(col);
      }
      const r = box.getBoundingClientRect();
      const a = dot.getBoundingClientRect();
      tempRef.current?.setAttribute("d", curve(a.left + a.width / 2 - r.left, a.top + a.height / 2 - r.top, ev.clientX - r.left, ev.clientY - r.top));
      const over = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-field]");
      setHover((h) => (h === (over?.dataset.field ?? null) ? h : (over?.dataset.field ?? null)));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!started) return;
      const over = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-field]");
      if (over?.dataset.field) assign(over.dataset.field, col);
      setCarrying(null);
      setHover(null);
      tempRef.current?.setAttribute("d", "");
      // The click that ends a carry shouldn't also pick the column.
      window.addEventListener("click", (c) => c.stopPropagation(), { capture: true, once: true });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  React.useEffect(() => {
    if (picked === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicked(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked]);

  const lit = hover ?? (picked !== null ? owner(picked)?.key ?? null : null);
  const options = React.useMemo<PillOption[]>(
    () => [
      { value: "", label: "Don’t import" },
      ...headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}`, description: samples[i]?.filter(Boolean).slice(0, 2).join(" · ") || "Empty" })),
    ],
    [headers, samples],
  );

  return (
    <div ref={boxRef} className={`relative ${wide ? "grid grid-cols-[minmax(0,1fr)_48px_minmax(0,1.1fr)]" : ""}`}>
      {wide && (
        <>
          <ol aria-label="Columns in your file" className="space-y-1.5">
            {headers.map((h, i) => {
              const used = owner(i);
              const on = picked === i || carrying === i;
              return (
                <li key={i}>
                  <button
                    type="button"
                    data-col={i}
                    aria-pressed={picked === i}
                    onPointerDown={(e) => carry(i, e)}
                    onClick={() => setPicked((p) => (p === i ? null : i))}
                    className={`relative flex w-full cursor-grab items-center gap-2 rounded-md py-1.5 pr-5 pl-2.5 text-left transition-[background-color,box-shadow] active:cursor-grabbing ${FOCUS} ${
                      on ? "bg-accent shadow-[inset_0_0_0_1px_var(--ring)]" : "shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent/60"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-mono text-xs ${used ? "text-foreground" : "text-muted-foreground"}`}>{h || `Column ${i + 1}`}</span>
                      <span className="block truncate text-xs text-muted-foreground">{samples[i]?.filter(Boolean).slice(0, 2).join(" · ") || "Empty"}</span>
                    </span>
                    <span
                      data-col-dot={i}
                      aria-hidden="true"
                      className={`absolute top-1/2 -right-[5px] size-2.5 -translate-y-1/2 rounded-full transition-colors duration-300 ${used ? "bg-primary" : "bg-background shadow-[inset_0_0_0_1px_var(--muted-foreground)]"}`}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
          <span aria-hidden="true" />
        </>
      )}

      <ol aria-label="Your fields" className="space-y-1.5">
        {fields.map((f) => {
          const col = mapping[f.key];
          const target = picked !== null || carrying !== null;
          const isLit = lit === f.key;
          return (
            <li
              key={f.key}
              data-field={f.key}
              onClick={(e) => {
                if (picked === null || (e.target as HTMLElement).closest('[aria-haspopup="listbox"], [role="listbox"]')) return;
                assign(f.key, picked);
                setPicked(null);
              }}
              className={`relative flex items-center gap-2 rounded-md py-1.5 pr-1.5 pl-3 transition-[background-color,box-shadow] duration-200 ${
                isLit ? "bg-accent shadow-[inset_0_0_0_1px_var(--ring)]" : target ? "cursor-pointer shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent/60" : "shadow-[inset_0_0_0_1px_var(--border)]"
              }`}
            >
              {wide && (
                <span
                  data-field-dot={f.key}
                  aria-hidden="true"
                  className={`absolute top-1/2 -left-[5px] size-2.5 -translate-y-1/2 rounded-full transition-colors duration-300 ${col !== null && col !== undefined ? "bg-primary" : "bg-background shadow-[inset_0_0_0_1px_var(--muted-foreground)]"}`}
                />
              )}
              <span className="min-w-0 flex-1">
                <span id={`${id}-${f.key}`} className="block truncate text-sm font-medium">
                  {f.label}
                  {f.required && <span className="text-muted-foreground"> *</span>}
                </span>
                {!wide && <span className="block truncate text-xs text-muted-foreground">{col !== null && col !== undefined ? samples[col]?.filter(Boolean).slice(0, 2).join(" · ") || "Empty" : f.required ? "Needed to import" : "Not imported"}</span>}
              </span>
              <span className="flex w-[45%] max-w-[11rem] shrink-0 items-center gap-1">
                <PillSelect
                  block
                  mono
                  align="end"
                  width={250}
                  label={`Column for ${f.label}`}
                  options={options}
                  value={col === null || col === undefined ? "" : String(col)}
                  onValueChange={(v) => assign(f.key, v === "" ? null : Number(v))}
                  muted={col === null || col === undefined}
                />
                {col !== null && col !== undefined && (
                  <button
                    type="button"
                    aria-label={`Unmatch ${f.label} from ${headers[col] || `Column ${col + 1}`}`}
                    title="Unmatch column"
                    onClick={(event) => {
                      event.stopPropagation();
                      assign(f.key, null);
                    }}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Unlink className="size-4" aria-hidden="true" />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {wide && (
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible" width={size.w} height={size.h}>
          {lines.map((l) => (
            <Thread key={`${l.key}:${l.col}`} d={l.d} reduced={reduced} lit={lit === l.key} />
          ))}
          <path ref={tempRef} d="" fill="none" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="3 3" style={{ opacity: carrying !== null ? 0.9 : 0 }} />
        </svg>
      )}
      <p className="sr-only" aria-live="polite">
        {picked !== null ? `${headers[picked] || `Column ${picked + 1}`} picked. Choose the field it fills.` : ""}
      </p>
    </div>
  );
}
