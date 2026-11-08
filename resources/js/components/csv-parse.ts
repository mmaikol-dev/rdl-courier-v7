export interface CsvMatchable {
  key: string;
  label: string;
  /** Other names the column might have, e.g. ["e-mail", "email address"]. */
  match?: string[];
}

const SLICE = 200_000;
const pause = () => new Promise<void>((r) => setTimeout(r, 0));

/** The separator the first line uses most, outside quotes. */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let i = 0; i < text.length && i < 10_000; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === "\n" || c === "\r")) break;
    else if (!quoted && c in counts) counts[c]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ",";
}

/** Every row as an array of fields; empty lines are dropped. */
export async function parseCsv(input: string, options: { delimiter?: string; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<string[][]> {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const d = options.delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let start = 0;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);
    if (quoted) {
      if (c === 34) {
        if (text.charCodeAt(i + 1) === 34) {
          field += text.slice(start, i + 1);
          i++;
          start = i + 1;
        } else {
          field += text.slice(start, i);
          quoted = false;
          start = i + 1;
        }
      }
    } else if (c === 34 && field === "" && start === i) {
      quoted = true;
      start = i + 1;
    } else if (text[i] === d) {
      row.push(field + text.slice(start, i));
      field = "";
      start = i + 1;
    } else if (c === 10 || c === 13) {
      row.push(field + text.slice(start, i));
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
      if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
      start = i + 1;
    }
    if (i % SLICE === 0 && i) {
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      options.onProgress?.(i / n);
      await pause();
    }
  }
  if (start < n || field || row.length) {
    row.push(field + text.slice(start, quoted ? n : n));
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  options.onProgress?.(1);
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Which column (by index) each field should take, or null. Each column is used once. */
export function autoMatch(headers: string[], fields: CsvMatchable[]): Record<string, number | null> {
  const used = new Set<number>();
  const out: Record<string, number | null> = {};
  const heads = headers.map(norm);
  for (const f of fields) {
    const names = [f.key, f.label, ...(f.match ?? [])].map(norm).filter(Boolean);
    let hit = heads.findIndex((h, i) => !used.has(i) && names.includes(h));
    if (hit === -1) hit = heads.findIndex((h, i) => !used.has(i) && h.length > 2 && names.some((x) => x.length > 2 && (h.includes(x) || x.includes(h))));
    out[f.key] = hit === -1 ? null : hit;
    if (hit !== -1) used.add(hit);
  }
  return out;
}

/** Rows back out as CSV text, quoting what needs it. */
export function toCsv(rows: string[][]): string {
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
