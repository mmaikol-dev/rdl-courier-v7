"use client";

import * as React from "react";
import { ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { NumberRoll } from "./number-roll";
import { PillSelect, type PillOption } from "./pill-select";
import { StatusButton, type ActionStatus } from "./status-button";
import { TextMorph } from "./text-morph";
import { useRowMotion } from "./use-row-motion";

/* ─────────────────────────────────────────────────────────
 * DATA TABLE: rows that travel
 *
 *   sort      click a header and every row glides to its new
 *             rank, top first; rows that didn't move stay put;
 *             the arrow flips with a slight overshoot
 *   live      new data re-sorts itself: a row whose amount
 *             grows glides past the ones above it, new rows
 *             fade in as the rows below make room
 *   search    rows that stop matching fold away, the rest close
 *             up, and "248 payments" rolls down to the count
 *   select    tick a row and the toolbar becomes the selection
 *             ("3 selected · Export · Delete"); Shift ticks a
 *             range one row after another
 *   remove    rows fold out and the toolbar holds "3 deleted ·
 *             Undo" over a draining hairline before it commits
 *   detail    a row opens into its detail by measured height
 *   edit      double-click a cell (or Enter on it) to edit in
 *             place; it saves with a check, or shakes back
 *   pages     the next page slides in from the side you went;
 *             "11–20 of 248" rolls
 *
 * Narrow containers get one card per row instead of columns.
 * ───────────────────────────────────────────────────────── */

export type DataTableValue = string | number | Date | null | undefined;

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** What the column sorts, searches and edits by. Defaults to row[key]. */
  value?: (row: T) => DataTableValue;
  /** What the cell shows. Defaults to the value as text. */
  cell?: (row: T) => React.ReactNode;
  align?: "left" | "right";
  /** A grid track, e.g. "minmax(0,1.6fr)" or "120px". */
  width?: string;
  sortable?: boolean;
  /** Search looks in this column. */
  searchable?: boolean;
  /** Double-click or Enter edits it in place (needs onEdit). */
  editable?: boolean;
  /** Its place in the card a narrow container shows instead of columns. */
  card?: "title" | "subtitle" | "trailing" | "hidden";
}

export interface DataTableAction<T> {
  id: string;
  label: string;
  /** Labels while it runs and once it's done, e.g. ["Exporting", "Exported"]. */
  progress?: [string, string];
  tone?: "default" | "destructive";
  /** The rows leave at once and the toolbar offers Undo; run() is called when the chance to undo is over. */
  removes?: boolean;
  run: (rows: T[]) => Promise<void> | void;
}

export type DataTableSort = { key: string; dir: "asc" | "desc" };

export interface DataTableProps<T> extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Defaults to row.id. */
  getRowId?: (row: T) => string;
  /** How a row is named when announced; defaults to its first column. */
  rowLabel?: (row: T) => string;
  /** What a row is called: ["payment", "payments"]. */
  noun?: [string, string];
  sort?: DataTableSort | null;
  defaultSort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  /** Shows the search field; it looks in columns marked searchable (or all, if none are). */
  searchable?: boolean;
  searchPlaceholder?: string;
  selectable?: boolean;
  selected?: string[];
  defaultSelected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** What the toolbar offers for the selected rows. */
  actions?: DataTableAction<T>[];
  /** How long Undo is offered after a removing action, ms. */
  undoFor?: number;
  /** Saves an edited cell. Throw to put the old value back. */
  onEdit?: (row: T, key: string, value: string) => Promise<void> | void;
  /** Rows open into this. */
  renderDetail?: (row: T) => React.ReactNode;
  pageSize?: number;
  label?: string;
}

type Undo<T> = { key: number; ids: string[]; rows: T[]; action: DataTableAction<T> };
type Cursor = { id: string; col: number };

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const THROW = "cubic-bezier(0.34,1.36,0.64,1)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const CELL_FOCUS = "outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ring)]";
const NO_IDS: string[] = [];

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);

const swap = (on: boolean, reduced: boolean, from = 8): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? "none" : `translateY(${from}px)`,
  filter: on ? "none" : "blur(4px)",
  transition: reduced ? "none" : `opacity 240ms ${EASE}, transform 420ms ${EASE}, filter 240ms ${EASE}`,
  pointerEvents: on ? undefined : "none",
});

const compare = (a: DataTableValue, b: DataTableValue) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
};

/** A checkbox that draws: the check (or the dash, for some) strokes itself in. */
function Box({ state, reduced, delay = 0 }: { state: "on" | "off" | "some"; reduced: boolean; delay?: number }) {
  const t = (on: boolean) => (reduced ? "none" : `stroke-dashoffset ${on ? 300 : 120}ms ${EASE} ${on ? delay + 60 : 0}ms`);
  return (
    <span
      aria-hidden="true"
      className="relative flex size-4 items-center justify-center rounded-[5px] transition-[background-color,box-shadow] duration-200"
      style={{
        background: state === "off" ? "var(--background)" : "var(--primary)",
        boxShadow: state === "off" ? "inset 0 0 0 1px color-mix(in oklab, var(--foreground) 28%, transparent)" : "none",
        transitionDelay: state === "off" ? "0ms" : `${delay}ms`,
      }}
    >
      <svg viewBox="0 0 16 16" className="absolute size-3 text-primary-foreground" fill="none">
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} style={{ strokeDashoffset: state === "on" ? 0 : 1, transition: t(state === "on") }} />
        <path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" pathLength={1} strokeDasharray={1} style={{ strokeDashoffset: state === "some" ? 0 : 1, transition: t(state === "some") }} />
      </svg>
    </span>
  );
}

const cellValue = <T,>(c: DataTableColumn<T>, row: T): DataTableValue => (c.value ? c.value(row) : ((row as Record<string, unknown>)[c.key] as DataTableValue));
const cellText = <T,>(c: DataTableColumn<T>, row: T): React.ReactNode => (c.cell ? c.cell(row) : String(cellValue(c, row) ?? ""));

type RowActions<T> = {
  toggle: (id: string, range: boolean) => void;
  toggleOpen: (id: string, row: T) => void;
  cursor: (c: Cursor) => void;
  edit: (e: { id: string; key: string }) => void;
  finish: (row: T, key: string, value: string | null) => void;
  detail: (row: T) => React.ReactNode;
};

type RowProps<T> = {
  row: T;
  id: string;
  index: number;
  columns: DataTableColumn<T>[];
  tracks: string;
  selectable: boolean;
  canEdit: boolean;
  hasDetail: boolean;
  isSelected: boolean;
  isOpen: boolean;
  /** When its tick draws, in a range selection. */
  delay: number;
  /** The focused cell in this row (-1: the row itself), or null. */
  focusCol: number | null;
  rowTab: 0 | -1;
  editingKey: string | null;
  drafts: ReadonlyMap<string, { value: string; status: "pending" | "done" }>;
  reduced: boolean;
  name: string;
  actions: React.RefObject<RowActions<T>>;
};

/** One row, memoised on plain values: a sort, a selection or a keystroke re-renders only the rows it changes. */
function TableRowView<T>(p: RowProps<T>) {
  const { row, id, columns, reduced, actions: a } = p;
  const editable = (c: DataTableColumn<T>) => !!(c.editable && p.canEdit);
  const title = columns.find((c) => c.card === "title") ?? columns[0];
  const subtitles = columns.filter((c) => c.card === "subtitle");
  const trailing = columns.filter((c) => c.card === "trailing");

  const cell = (col: DataTableColumn<T>) => {
    const draft = p.drafts.get(`${id}:${col.key}`);
    if (p.editingKey === col.key)
      return (
        <input
          autoFocus
          defaultValue={String(cellValue(col, row) ?? "")}
          aria-label={`${col.header} for ${p.name}`}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") a.current.finish(row, col.key, e.currentTarget.value);
            if (e.key === "Escape") a.current.finish(row, col.key, null);
          }}
          onBlur={(e) => a.current.finish(row, col.key, e.currentTarget.value)}
          className={`-mx-1.5 h-8 w-[calc(100%+12px)] min-w-0 rounded-[8px] bg-background px-1.5 text-[13px] shadow-[inset_0_0_0_1.5px_var(--ring)] outline-none [@media(pointer:coarse)]:text-[16px] ${col.align === "right" ? "text-right" : ""}`}
        />
      );
    return (
      <span className={`flex min-w-0 items-center gap-1.5 ${col.align === "right" ? "justify-end" : ""}`}>
        <span className="min-w-0 truncate">{draft ? <TextMorph animateWidth={false}>{draft.value}</TextMorph> : cellText(col, row)}</span>
        {draft && (
          <span className="relative size-3.5 shrink-0" aria-hidden="true">
            <span className="absolute inset-0 flex items-center justify-center" style={swap(draft.status === "pending", reduced, 0)}>
              <span className="size-3 rounded-full border-[1.5px] border-muted-foreground border-t-transparent motion-safe:animate-spin" />
            </span>
            <svg viewBox="0 0 16 16" className="absolute inset-0 size-3.5 text-emerald-600 dark:text-emerald-400" fill="none" style={{ opacity: draft.status === "done" ? 1 : 0, transition: `opacity 200ms ${EASE}` }}>
              <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} style={{ strokeDashoffset: draft.status === "done" ? 0 : 1, transition: reduced ? "none" : `stroke-dashoffset 380ms ${EASE} 80ms` }} />
            </svg>
          </span>
        )}
      </span>
    );
  };

  return (
    <div
      data-row-id={id}
      role="row"
      aria-rowindex={p.index}
      aria-selected={p.selectable ? p.isSelected : undefined}
      aria-expanded={p.hasDetail ? p.isOpen : undefined}
      tabIndex={p.rowTab}
      onFocus={(e) => e.target === e.currentTarget && a.current.cursor({ id, col: -1 })}
      className={`relative border-b border-border transition-colors duration-200 last:border-b-0 ${CELL_FOCUS}`}
      style={{ background: p.isSelected ? "color-mix(in oklab, var(--primary) 5%, var(--background))" : "var(--background)" }}
    >
      {/* Columns, wide */}
      <div className="grid min-h-12 items-center @max-[34rem]:hidden" style={{ gridTemplateColumns: p.tracks }}>
        {p.selectable && (
          <span role="gridcell" className="flex items-center justify-center">
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Select ${p.name}`}
              aria-pressed={p.isSelected}
              onClick={(e) => a.current.toggle(id, e.shiftKey)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] hover:bg-accent"
            >
              <Box state={p.isSelected ? "on" : "off"} reduced={reduced} delay={p.delay} />
            </button>
          </span>
        )}
        {columns.map((col, ci) => (
          <span
            key={col.key}
            role="gridcell"
            data-col-key={col.key}
            data-col-index={ci}
            tabIndex={p.focusCol === ci ? 0 : -1}
            onFocus={() => a.current.cursor({ id, col: ci })}
            onDoubleClick={() => editable(col) && a.current.edit({ id, key: col.key })}
            className={`min-w-0 rounded-[6px] px-3 py-2 text-[13px] ${col.align === "right" ? "text-right tabular-nums" : ""} ${editable(col) ? "cursor-text" : ""} ${CELL_FOCUS}`}
          >
            {cell(col)}
          </span>
        ))}
        {p.hasDetail && (
          <span role="gridcell" className="flex items-center justify-center">
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${p.isOpen ? "Close" : "Open"} ${p.name}`}
              aria-expanded={p.isOpen}
              onClick={() => a.current.toggleOpen(id, row)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronDown className="size-4" strokeWidth={1.75} style={{ transform: p.isOpen ? "rotate(180deg)" : "none", transition: reduced ? "none" : `transform 420ms ${THROW}` }} />
            </button>
          </span>
        )}
      </div>

      {/* One card, narrow */}
      <div className="hidden min-h-[60px] items-center gap-3 py-2.5 pr-3 @max-[34rem]:flex" style={{ paddingLeft: p.selectable ? 0 : 12 }}>
        {p.selectable && (
          <button type="button" tabIndex={-1} aria-label={`Select ${p.name}`} aria-pressed={p.isSelected} onClick={(e) => a.current.toggle(id, e.shiftKey)} className="flex size-10 shrink-0 cursor-pointer items-center justify-center">
            <Box state={p.isSelected ? "on" : "off"} reduced={reduced} delay={p.delay} />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          disabled={!p.hasDetail}
          onClick={() => p.hasDetail && a.current.toggleOpen(id, row)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left disabled:cursor-default"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium">{cellText(title, row)}</span>
            {subtitles.length > 0 && (
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[12px] text-muted-foreground">
                {subtitles.map((c, i) => (
                  <React.Fragment key={c.key}>
                    {i > 0 && <span aria-hidden="true">·</span>}
                    <span className="truncate">{cellText(c, row)}</span>
                  </React.Fragment>
                ))}
              </span>
            )}
          </span>
          {trailing.length > 0 && (
            <span className="flex shrink-0 flex-col items-end gap-1 text-[13px] tabular-nums">
              {trailing.map((c) => (
                <span key={c.key}>{cellText(c, row)}</span>
              ))}
            </span>
          )}
        </button>
      </div>

      {/* Detail: the row opens by its own measured height. */}
      {p.hasDetail && (
        <div className="grid transition-[grid-template-rows] duration-[420ms]" style={{ gridTemplateRows: p.isOpen ? "1fr" : "0fr", transitionTimingFunction: EASE }} inert={!p.isOpen}>
          <div className="min-h-0 overflow-hidden">
            <div className="border-t border-dashed border-border px-3 pb-4 pt-3" style={{ paddingLeft: p.selectable ? 52 : 12, opacity: p.isOpen ? 1 : 0, transition: reduced ? "none" : `opacity 300ms ${EASE} ${p.isOpen ? 120 : 0}ms` }}>
              {a.current?.detail(row)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TableRow = React.memo(TableRowView) as typeof TableRowView;

export function DataTable<T>({
  columns,
  rows,
  getRowId = (row) => String((row as { id?: unknown }).id),
  rowLabel,
  noun = ["row", "rows"],
  sort: sortProp,
  defaultSort = null,
  onSortChange,
  searchable = true,
  searchPlaceholder = "Search",
  selectable = false,
  selected: selectedProp,
  defaultSelected = NO_IDS,
  onSelectedChange,
  actions = [],
  undoFor = 5000,
  onEdit,
  renderDetail,
  pageSize = 10,
  label = "Table",
  className = "",
  ...props
}: DataTableProps<T>) {
  const reduced = useReducedMotion();
  const uid = React.useId();
  const [sortOwn, setSortOwn] = React.useState<DataTableSort | null>(defaultSort);
  const sort = sortProp === undefined ? sortOwn : sortProp;
  const [selectedOwn, setSelectedOwn] = React.useState<string[]>(defaultSelected);
  const selectedIds = selectedProp ?? selectedOwn;
  const selected = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageDir, setPageDir] = React.useState(0);
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set());
  const [undo, setUndo] = React.useState<Undo<T> | null>(null);
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditingState] = React.useState<{ id: string; key: string } | null>(null);
  // Enter and the blur that follows it both finish an edit; only the first counts.
  const editingRef = React.useRef<{ id: string; key: string } | null>(null);
  const setEditing = (e: { id: string; key: string } | null) => {
    editingRef.current = e;
    setEditingState(e);
  };
  const [drafts, setDrafts] = React.useState<ReadonlyMap<string, { value: string; status: "pending" | "done" }>>(() => new Map());
  const [actionStatus, setActionStatus] = React.useState<Record<string, ActionStatus>>({});
  const [notice, setNotice] = React.useState<{ text: string; key: number } | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const [cursor, setCursor] = React.useState<Cursor | null>(null);
  const [cascade, setCascade] = React.useState<{ ids: string[]; key: number } | null>(null);
  const [holdUndo, setHoldUndo] = React.useState(false);
  const anchor = React.useRef<string | null>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const ghostRef = React.useRef<HTMLDivElement>(null);
  const seq = React.useRef(0);

  const name = (row: T) => rowLabel?.(row) ?? String(valueOf(columns[0], row) ?? getRowId(row));
  const valueOf = cellValue;
  const count = (n: number) => `${n === 1 ? noun[0] : noun[1]}`;
  const say = (text: string) => setAnnounce((a) => (a === text ? `${text} ` : text));
  const flash = (text: string) => {
    const key = ++seq.current;
    setNotice({ text, key });
    window.setTimeout(() => setNotice((n) => (n?.key === key ? null : n)), 3600);
  };

  const setSelected = (next: string[]) => {
    if (selectedProp === undefined) setSelectedOwn(next);
    onSelectedChange?.(next);
  };

  // ── Rows in view ───────────────────────────────────────
  const searchCols = columns.some((c) => c.searchable) ? columns.filter((c) => c.searchable) : columns;
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => !hidden.has(getRowId(r)));
  const matched = q ? visible.filter((r) => searchCols.some((c) => String(valueOf(c, r) ?? "").toLowerCase().includes(q))) : visible;
  const sortCol = sort ? columns.find((c) => c.key === sort.key) : undefined;
  const sorted = sortCol ? [...matched].sort((a, b) => compare(valueOf(sortCol, a), valueOf(sortCol, b)) * (sort!.dir === "asc" ? 1 : -1)) : matched;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pageRows = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const ranks = new Map(sorted.map((r, i) => [getRowId(r), i]));
  const motion = useRowMotion(bodyRef, { reduced, resetKey: current, ranks, ghosts: ghostRef });

  // A new page slides in from the side you went toward.
  const shownPage = React.useRef(current);
  React.useLayoutEffect(() => {
    if (shownPage.current === current) return;
    const dir = Math.sign(current - shownPage.current) || pageDir;
    shownPage.current = current;
    if (reduced) return;
    bodyRef.current?.animate(
      [
        { transform: `translateX(${dir * 28}px)`, opacity: 0, filter: "blur(4px)" },
        { transform: "none", opacity: 1, filter: "blur(0px)" },
      ],
      { duration: 440, easing: EASE },
    );
  }, [current, pageDir, reduced]);

  // The list's height eases to fit, so rows folding away or arriving never make the page jump.
  React.useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const body = bodyRef.current;
    if (!wrap || !body) return;
    const fit = () => {
      const h = `${body.offsetHeight}px`;
      if (wrap.style.height === h) return;
      wrap.style.transition = wrap.dataset.ready && !reduced ? `height 420ms ${EASE}` : "none";
      wrap.style.height = h;
      wrap.dataset.ready = "1";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(body);
    return () => observer.disconnect();
  }, [reduced]);

  // ── Sorting ────────────────────────────────────────────
  const sortBy = (key: string) => {
    const col = columns.find((c) => c.key === key)!;
    const sample = rows.map((r) => valueOf(col, r)).find((v) => v != null);
    const firstDir = typeof sample === "number" || sample instanceof Date ? "desc" : "asc";
    const next: DataTableSort | null = sort?.key !== key ? { key, dir: firstDir } : { key, dir: sort.dir === "asc" ? "desc" : "asc" };
    motion.stagger();
    if (sortProp === undefined) setSortOwn(next);
    onSortChange?.(next);
    say(`Sorted by ${col.header}, ${next.dir === "asc" ? "ascending" : "descending"}.`);
  };

  // ── Selection ──────────────────────────────────────────
  const toggle = (id: string, range: boolean) => {
    const ids = sorted.map(getRowId);
    if (range && anchor.current && ids.includes(anchor.current)) {
      const a = ids.indexOf(anchor.current);
      const b = ids.indexOf(id);
      const span = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
      const on = !selected.has(id);
      const next = new Set(selected);
      span.forEach((x) => (on ? next.add(x) : next.delete(x)));
      // Ticks run down the range one after another, from the anchor.
      setCascade({ ids: a <= b ? span : [...span].reverse(), key: ++seq.current });
      setSelected([...next]);
      say(`${next.size} selected.`);
    } else {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setCascade(null);
      setSelected([...next]);
      say(`${next.size ? `${next.size} selected` : "Selection cleared"}.`);
    }
    anchor.current = id;
  };
  const allIds = sorted.map(getRowId);
  const allState: "on" | "off" | "some" = allIds.length && allIds.every((i) => selected.has(i)) ? "on" : allIds.some((i) => selected.has(i)) ? "some" : "off";
  const toggleAll = () => {
    setCascade(allState === "on" ? null : { ids: pageRows.map(getRowId), key: ++seq.current });
    setSelected(allState === "on" ? [] : allIds);
    say(allState === "on" ? "Selection cleared." : `${allIds.length} selected.`);
  };

  // ── Actions ────────────────────────────────────────────
  const run = async (action: DataTableAction<T>) => {
    const chosen = rows.filter((r) => selected.has(getRowId(r)));
    if (!chosen.length) return;
    if (action.removes) {
      const ids = chosen.map(getRowId);
      // Commit whatever was waiting before this one takes the toolbar.
      if (undo) commitUndo(undo);
      setHidden((h) => new Set([...h, ...ids]));
      setSelected([]);
      setUndo({ key: ++seq.current, ids, rows: chosen, action });
      say(`${ids.length} ${count(ids.length)} ${action.progress?.[1]?.toLowerCase() ?? "removed"}. Undo is available.`);
      return;
    }
    setActionStatus((s) => ({ ...s, [action.id]: "pending" }));
    try {
      await action.run(chosen);
      setActionStatus((s) => ({ ...s, [action.id]: "success" }));
      say(`${action.progress?.[1] ?? "Done"}: ${chosen.length} ${count(chosen.length)}.`);
    } catch {
      setActionStatus((s) => ({ ...s, [action.id]: "error" }));
      say(`${action.label} failed.`);
    }
  };

  const commitUndo = async (u: Undo<T>) => {
    setUndo((cur) => (cur?.key === u.key ? null : cur));
    try {
      await u.action.run(u.rows);
    } catch {
      setHidden((h) => {
        const n = new Set(h);
        u.ids.forEach((i) => n.delete(i));
        return n;
      });
      flash(`Couldn't ${u.action.label.toLowerCase()} ${u.ids.length} ${count(u.ids.length)}. They're back.`);
      say(`${u.action.label} failed. The rows are back.`);
    }
  };

  const takeBack = () => {
    if (!undo) return;
    setHidden((h) => {
      const n = new Set(h);
      undo.ids.forEach((i) => n.delete(i));
      return n;
    });
    setUndo(null);
    say(`Undone. ${undo.ids.length} ${count(undo.ids.length)} back.`);
  };

  // ── Editing ────────────────────────────────────────────
  const finishEdit = async (row: T, key: string, value: string | null) => {
    const id = getRowId(row);
    if (editingRef.current?.id !== id || editingRef.current.key !== key) return;
    setEditing(null);
    const cellKey = `${id}:${key}`;
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"] [data-col-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true }));
    const col = columns.find((c) => c.key === key)!;
    if (value === null || value === String(valueOf(col, row) ?? "") || !onEdit) return;
    setDrafts((d) => new Map(d).set(cellKey, { value, status: "pending" }));
    try {
      await onEdit(row, key, value);
      setDrafts((d) => new Map(d).set(cellKey, { value, status: "done" }));
      say(`Saved ${col.header.toLowerCase()}.`);
      window.setTimeout(() => setDrafts((d) => {
        const n = new Map(d);
        if (n.get(cellKey)?.status === "done") n.delete(cellKey);
        return n;
      }), 1400);
    } catch {
      setDrafts((d) => {
        const n = new Map(d);
        n.delete(cellKey);
        return n;
      });
      if (!reduced)
        gridRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"] [data-col-key="${CSS.escape(key)}"]`)?.animate(
          [{ transform: "none" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }],
          { duration: 380, easing: "ease-out" },
        );
      flash(`Couldn't save ${col.header.toLowerCase()} for ${name(row)}.`);
      say(`Couldn't save. ${col.header} is back to what it was.`);
    }
  };

  // ── Pages ──────────────────────────────────────────────
  const goPage = (dir: number) => {
    const next = Math.max(0, Math.min(pages - 1, current + dir));
    if (next === current) return;
    setPageDir(dir);
    setPage(next);
    setCursor(null);
    say(`Page ${next + 1} of ${pages}.`);
  };

  // ── Keys: rows, then cells ─────────────────────────────
  const editable = (c: DataTableColumn<T>) => !!(c.editable && onEdit);
  const focusAt = (c: Cursor) => {
    setCursor(c);
    requestAnimationFrame(() => {
      const row = gridRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(c.id)}"]`);
      const cell = c.col < 0 ? null : row?.querySelector<HTMLElement>(`[data-col-index="${c.col}"]`);
      // Narrow, the cells are a card and can't take focus: the row does.
      (cell && cell.offsetParent ? cell : row)?.focus({ preventScroll: false });
    });
  };
  const onGridKey = (e: React.KeyboardEvent) => {
    if (editing || (e.target as HTMLElement).closest("input, button")) return;
    const ids = pageRows.map(getRowId);
    const c = cursor && ids.includes(cursor.id) ? cursor : ids.length ? { id: ids[0], col: -1 } : null;
    if (!c) return;
    const i = ids.indexOf(c.id);
    const row = pageRows[i];
    const keys: Record<string, () => void> = {
      ArrowDown: () => i < ids.length - 1 && focusAt({ id: ids[i + 1], col: c.col }),
      ArrowUp: () => i > 0 && focusAt({ id: ids[i - 1], col: c.col }),
      ArrowRight: () => c.col < columns.length - 1 && focusAt({ id: c.id, col: c.col + 1 }),
      ArrowLeft: () => c.col > -1 && focusAt({ id: c.id, col: c.col - 1 }),
      Home: () => focusAt({ id: ids[0], col: c.col }),
      End: () => focusAt({ id: ids[ids.length - 1], col: c.col }),
      PageDown: () => goPage(1),
      PageUp: () => goPage(-1),
      " ": () => selectable && toggle(c.id, e.shiftKey),
      Enter: () => {
        const col = columns[c.col];
        if (col && editable(col)) setEditing({ id: c.id, key: col.key });
        else if (renderDetail) toggleOpen(c.id, row);
      },
    };
    const go = keys[e.key];
    if (!go) return;
    e.preventDefault();
    go();
  };

  const toggleOpen = (id: string, row: T) => {
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    say(`${open.has(id) ? "Closed" : "Opened"} ${name(row)}.`);
  };

  // ── Render ─────────────────────────────────────────────
  const tracks = `${selectable ? "40px " : ""}${columns.map((c) => c.width ?? "minmax(0,1fr)").join(" ")}${renderDetail ? " 40px" : ""}`;
  const mode = undo ? "undo" : selected.size ? "selection" : "search";
  const from = sorted.length ? current * pageSize + 1 : 0;
  const to = Math.min(sorted.length, current * pageSize + pageSize);
  const sortable = columns.filter((c) => c.sortable);
  const sortOptions: PillOption[] = [
    { value: "", label: "Unsorted" },
    ...sortable.flatMap((c) => [
      { value: `${c.key}:asc`, label: `${c.header}, ascending` },
      { value: `${c.key}:desc`, label: `${c.header}, descending` },
    ]),
  ];

  // What the memoised rows call, through one ref, so a row never re-renders just because these were re-created.
  const rowActions = React.useRef<RowActions<T>>({
    toggle,
    toggleOpen,
    cursor: (c) => setCursor(c),
    edit: (e) => setEditing(e),
    finish: finishEdit,
    detail: (row) => renderDetail?.(row),
  });
  React.useLayoutEffect(() => {
    rowActions.current = { toggle, toggleOpen, cursor: (c) => setCursor(c), edit: (e) => setEditing(e), finish: finishEdit, detail: (row) => renderDetail?.(row) };
  });

  return (
    <div className={`@container w-full text-foreground ${className}`} {...props}>
      {/* Toolbar: one surface that is the search, the selection or the undo. */}
      <div
        onPointerEnter={() => setHoldUndo(true)}
        onPointerLeave={() => setHoldUndo(false)}
        onFocus={() => setHoldUndo(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setHoldUndo(false)}
        className="relative h-11 overflow-hidden rounded-[14px] border border-border transition-colors duration-300"
        style={{ background: mode === "search" ? "var(--background)" : "color-mix(in oklab, var(--primary) 6%, var(--background))" }}
      >
        <div className="absolute inset-0 flex items-center gap-2 pl-3 pr-2" style={swap(mode === "search", reduced, mode === "search" ? 0 : -8)} inert={mode !== "search"}>
          {searchable ? (
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-describedby={`${uid}-count`}
                className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground [@media(pointer:coarse)]:text-[16px]"
              />
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                style={swap(!!query, reduced, 0)}
                tabIndex={query ? 0 : -1}
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </button>
            </label>
          ) : (
            <span className="flex-1" />
          )}
          {sortable.length > 0 && (
            <span className="hidden shrink-0 @max-[34rem]:flex">
              <PillSelect
                label="Sort by"
                align="end"
                width={220}
                options={sortOptions}
                value={sort ? `${sort.key}:${sort.dir}` : ""}
                onValueChange={(v) => {
                  const [key, dir] = v.split(":");
                  const next = key ? { key, dir: dir as "asc" | "desc" } : null;
                  motion.stagger();
                  if (sortProp === undefined) setSortOwn(next);
                  onSortChange?.(next);
                }}
                // Plain text: this pill is hidden on wide tables, and a morph there would still measure every letter.
                renderValue={() => (
                  <span className="inline-flex items-center text-muted-foreground">
                    {sortCol ? sortCol.header : "Sort"}
                    <ArrowUp className="ml-1 size-3" strokeWidth={2} aria-hidden="true" style={{ transform: sort?.dir === "desc" ? "rotate(180deg)" : "none", transition: reduced ? "none" : `transform 420ms ${THROW}` }} />
                  </span>
                )}
              />
            </span>
          )}
          <span id={`${uid}-count`} className="shrink-0 whitespace-nowrap pr-1 text-[12px] tabular-nums text-muted-foreground @max-[34rem]:hidden">
            <NumberRoll value={sorted.length} /> <TextMorph>{count(sorted.length)}</TextMorph>
          </span>
        </div>

        <div className="absolute inset-0 flex items-center gap-1 pl-1.5 pr-1.5" style={swap(mode === "selection", reduced, mode === "search" ? 8 : -8)} inert={mode !== "selection"}>
          <button type="button" aria-label="Clear selection" onClick={() => setSelected([])} className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground ${FOCUS}`}>
            <X className="size-4" strokeWidth={1.75} />
          </button>
          <span className="mr-auto whitespace-nowrap text-[13px] font-medium tabular-nums">
            <NumberRoll value={Math.max(1, selected.size)} /> selected
          </span>
          {actions.map((a) => (
            <StatusButton
              key={a.id}
              variant="ghost"
              size="sm"
              status={actionStatus[a.id] ?? "idle"}
              labels={{ idle: a.label, pending: a.progress?.[0] ?? a.label, success: a.progress?.[1] ?? "Done", error: "Try again" }}
              onClick={() => run(a)}
              onReset={() => setActionStatus((s) => ({ ...s, [a.id]: "idle" }))}
              className={a.tone === "destructive" && (actionStatus[a.id] ?? "idle") === "idle" ? "!text-red-600 hover:!bg-red-500/10 dark:!text-red-400" : ""}
            />
          ))}
        </div>

        <div className="absolute inset-0 flex items-center gap-2 pl-3 pr-1.5" style={swap(mode === "undo", reduced, 8)} inert={mode !== "undo"}>
          <span className="mr-auto whitespace-nowrap text-[13px] tabular-nums">
            {undo && (
              <>
                <NumberRoll value={undo.ids.length} /> {count(undo.ids.length)} {undo.action.progress?.[1]?.toLowerCase() ?? "removed"}
              </>
            )}
          </span>
          <button type="button" onClick={takeBack} className={`inline-flex h-7 cursor-pointer items-center rounded-full px-3 text-[12px] font-medium hover:bg-accent ${FOCUS}`}>
            Undo
          </button>
          {undo && (
            // The chance to undo, as a hairline that drains; hovering holds it.
            <span
              key={undo.key}
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-px origin-left bg-foreground/40"
              style={{ animation: `ui-progress ${undoFor}ms linear reverse forwards`, animationPlayState: holdUndo ? "paused" : "running" }}
              onAnimationEnd={() => commitUndo(undo)}
            />
          )}
        </div>
      </div>

      {/* Notice: one line that folds in when something went wrong. */}
      <div className="grid transition-[grid-template-rows] duration-300" style={{ gridTemplateRows: notice ? "1fr" : "0fr", transitionTimingFunction: EASE }}>
        <div className="min-w-0 overflow-hidden">
          <p className="truncate pl-1 pt-2 text-[12.5px] text-red-600 dark:text-red-400">{notice?.text ?? " "}</p>
        </div>
      </div>

      {/* Layout containment: re-laying the rows out after a sort never reaches the rest of the page. */}
      <div
        ref={gridRef}
        role="grid"
        aria-label={label}
        aria-rowcount={sorted.length + 1}
        aria-multiselectable={selectable || undefined}
        onKeyDown={onGridKey}
        className="mt-3 overflow-hidden rounded-[16px] border border-border [contain:layout_paint]"
      >
        {/* Header */}
        <div role="row" className="grid h-10 items-center border-b border-border text-[12px] text-muted-foreground @max-[34rem]:hidden" style={{ gridTemplateColumns: tracks }}>
          {selectable && (
            <span role="columnheader" className="flex items-center justify-center">
              <button type="button" aria-label={allState === "on" ? "Clear selection" : "Select all"} onClick={toggleAll} className={`flex size-8 cursor-pointer items-center justify-center rounded-[8px] hover:bg-accent ${FOCUS}`}>
                <Box state={allState} reduced={reduced} />
              </button>
            </span>
          )}
          {columns.map((col) => {
            const active = sort?.key === col.key;
            return (
              <span key={col.key} role="columnheader" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : col.sortable ? "none" : undefined} className={`min-w-0 px-1.5 ${col.align === "right" ? "text-right" : ""}`}>
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => sortBy(col.key)}
                    className={`inline-flex h-7 max-w-full cursor-pointer items-center gap-1 rounded-[8px] px-1.5 transition-colors hover:bg-accent hover:text-foreground ${active ? "text-foreground" : ""} ${col.align === "right" ? "flex-row-reverse" : ""} ${FOCUS}`}
                  >
                    <span className="truncate">{col.header}</span>
                    <ArrowUp
                      className="size-3 shrink-0"
                      strokeWidth={2}
                      aria-hidden="true"
                      style={{
                        opacity: active ? 1 : 0,
                        transform: `${active && sort!.dir === "desc" ? "rotate(180deg)" : "rotate(0deg)"} scale(${active ? 1 : 0.6})`,
                        transition: reduced ? "none" : `transform 460ms ${THROW}, opacity 200ms ${EASE}`,
                      }}
                    />
                  </button>
                ) : (
                  <span className="block truncate px-1.5">{col.header}</span>
                )}
              </span>
            );
          })}
          {renderDetail && <span role="columnheader" aria-label="Details" />}
        </div>

        {/* Body: eases to its height; the page slides in from the side you went. */}
        <div ref={wrapRef} className="overflow-clip">
          <div ref={bodyRef} className="relative">
            {pageRows.map((row, i) => {
              const id = getRowId(row);
              return (
                <TableRow
                  key={id}
                  row={row}
                  id={id}
                  index={current * pageSize + i + 2}
                  columns={columns}
                  tracks={tracks}
                  selectable={selectable}
                  canEdit={!!onEdit}
                  hasDetail={!!renderDetail}
                  isSelected={selected.has(id)}
                  isOpen={open.has(id)}
                  delay={cascade ? Math.max(0, cascade.ids.indexOf(id)) * 28 : 0}
                  focusCol={cursor?.id === id ? cursor.col : null}
                  rowTab={cursor ? (cursor.id === id && cursor.col === -1 ? 0 : -1) : i === 0 ? 0 : -1}
                  editingKey={editing?.id === id ? editing.key : null}
                  drafts={drafts}
                  reduced={reduced}
                  name={name(row)}
                  actions={rowActions}
                />
              );
            })}

            {/* Rows that went: their own elements, folding away where they stood (see use-row-motion). */}
            <div ref={ghostRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />

            {/* Nothing matches: said in the same place, the same height as a row. */}
            <div className="grid transition-[grid-template-rows,opacity] duration-300" style={{ gridTemplateRows: pageRows.length ? "0fr" : "1fr", opacity: pageRows.length ? 0 : 1, transitionTimingFunction: EASE }} aria-hidden={!!pageRows.length}>
              <div className="min-h-0 overflow-hidden">
                <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                  <TextMorph animateWidth={false}>{q ? `No ${noun[1]} match “${query.trim()}”` : `No ${noun[1]} yet`}</TextMorph>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pages */}
      {pages > 1 && (
        <div className="mt-2.5 flex items-center justify-between gap-2 px-1 text-[12px] tabular-nums text-muted-foreground">
          <span className="inline-flex items-baseline">
            <NumberRoll value={from} />–<NumberRoll value={to} />
            &nbsp;of&nbsp;
            <NumberRoll value={sorted.length} />
          </span>
          <span className="flex items-center gap-0.5">
            <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => goPage(-1)} className={`flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-40 ${FOCUS}`}>
              <ChevronLeft className="size-4" strokeWidth={1.75} />
            </button>
            <button type="button" aria-label="Next page" disabled={current >= pages - 1} onClick={() => goPage(1)} className={`flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-40 ${FOCUS}`}>
              <ChevronRight className="size-4" strokeWidth={1.75} />
            </button>
          </span>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
