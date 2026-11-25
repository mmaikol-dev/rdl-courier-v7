export type TimeRange =
  /** The last `duration` ms, ending now. */
  | { type: "relative"; duration: number }
  /** From `start` until now. */
  | { type: "since"; start: Date }
  | { type: "absolute"; start: Date; end: Date };

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

type Wall = { year: number; month: number; day: number; hour: number; minute: number };

/* ── Zones ─────────────────────────────────────────────── */

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone?: string) {
  const key = timeZone ?? "";
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
    formatters.set(key, f);
  }
  return f;
}
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>;

/** The wall clock at an instant in a zone. */
export function wallAt(epoch: number, timeZone?: string) {
  const p: Record<string, string> = {};
  for (const part of fmt(timeZone).formatToParts(new Date(epoch))) p[part.type] = part.value;
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, second: +p.second, weekday: WEEKDAY[p.weekday] ?? 0 };
}

/** The instant a wall-clock time happens in a zone (the earlier one when clocks go back). */
export function fromWall(w: Wall, timeZone?: string) {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  const off = (t: number) => {
    const a = wallAt(t, timeZone);
    return Date.UTC(a.year, a.month - 1, a.day, a.hour, a.minute, a.second) - Math.floor(t / 1000) * 1000;
  };
  const a = guess - off(guess - 6 * HOUR);
  const b = guess - off(guess + 6 * HOUR);
  const fits = (t: number) => {
    const x = wallAt(t, timeZone);
    return x.day === w.day && x.hour === w.hour && x.minute === w.minute;
  };
  if (fits(a) && fits(b)) return Math.min(a, b);
  if (fits(b)) return b;
  // a fits, or the time falls in a gap where clocks jump: either way, the moment the clock passes it.
  return a;
}

const addDays = (w: Wall, n: number): Wall => {
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + n));
  return { ...w, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};
const midnight = (w: Wall): Wall => ({ ...w, hour: 0, minute: 0 });

/* ── Resolving and stepping ────────────────────────────── */

export function resolveTimeRange(range: TimeRange, now = new Date()): { start: Date; end: Date } {
  if (range.type === "relative") return { start: new Date(now.getTime() - range.duration), end: now };
  if (range.type === "since") return { start: range.start, end: now };
  return { start: range.start, end: range.end };
}

export const isLive = (range: TimeRange) => range.type !== "absolute";

/** The same length of time, one window earlier (-1) or later (1). A window that would reach now becomes live again. */
export function stepTimeRange(range: TimeRange, dir: -1 | 1, now = new Date()): TimeRange {
  const { start, end } = resolveTimeRange(range, now);
  const span = end.getTime() - start.getTime();
  const nextEnd = end.getTime() + dir * span;
  if (dir === 1 && nextEnd >= now.getTime() - 30_000) return { type: "relative", duration: span };
  return { type: "absolute", start: new Date(start.getTime() + dir * span), end: new Date(nextEnd) };
}

export const sameRange = (a: TimeRange, b: TimeRange) =>
  a.type === b.type &&
  (a.type === "relative"
    ? a.duration === (b as typeof a).duration
    : a.type === "since"
      ? a.start.getTime() === (b as typeof a).start.getTime()
      : a.start.getTime() === (b as typeof a).start.getTime() && a.end.getTime() === (b as typeof a).end.getTime());

/* ── Words ─────────────────────────────────────────────── */

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "15 minutes", "4 hours", "7 days". */
export function durationWords(ms: number) {
  if (ms < HOUR || ms % HOUR) return plural(Math.round(ms / MINUTE), "minute");
  if (ms < 2 * DAY || ms % DAY) return plural(Math.round(ms / HOUR), "hour");
  if (ms % (7 * DAY) === 0 && ms / DAY >= 14) return plural(ms / (7 * DAY), "week");
  return plural(Math.round(ms / DAY), "day");
}

/** "15m", "2h", "3d", "1h 30m". */
export function durationShort(ms: number) {
  const m = Math.round(ms / MINUTE);
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
  const d = Math.floor(m / 1440);
  const h = Math.round((m % 1440) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** What the picker's pill says. */
export function formatTimeRange(range: TimeRange, { now = new Date(), timeZone, hour12 = false, compact = false }: { now?: Date; timeZone?: string; hour12?: boolean; compact?: boolean } = {}) {
  const time = (w: { hour: number; minute: number }) => (hour12 ? `${w.hour % 12 || 12}${w.minute ? `:${pad(w.minute)}` : ""}${w.hour < 12 ? "am" : "pm"}` : `${pad(w.hour)}:${pad(w.minute)}`);
  const today = wallAt(now.getTime(), timeZone);
  const yesterday = addDays(today, -1);
  const dayName = (w: Wall & { weekday?: number }) => {
    if (w.year === today.year && w.month === today.month && w.day === today.day) return "Today";
    if (w.year === yesterday.year && w.month === yesterday.month && w.day === yesterday.day) return "Yesterday";
    const date = `${w.day} ${MONTHS[w.month - 1]}${w.year !== today.year ? ` ${w.year}` : ""}`;
    return compact ? date : `${DAYS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()]} ${date}`;
  };
  // Narrow places drop the spaces round the dash and the comma after the day.
  const dash = compact ? "–" : " – ";
  const comma = compact ? " " : ", ";
  if (range.type === "relative") return `Last ${durationWords(range.duration)}`;
  const s = wallAt(range.start.getTime(), timeZone);
  if (range.type === "since") {
    if (!s.hour && !s.minute) return dayName(s) === "Today" ? "Today so far" : `Since ${dayName(s)}`;
    return dayName(s) === "Today" ? `Since ${time(s)}` : `Since ${dayName(s)}${comma}${time(s)}`;
  }
  const e = wallAt(range.end.getTime(), timeZone);
  const sameDay = s.year === e.year && s.month === e.month && s.day === e.day;
  const nextDay = addDays(s, 1);
  // Whole days read as days: "Yesterday", "Mon 12 Oct – Wed 14 Oct".
  if (!s.hour && !s.minute && !e.hour && !e.minute) {
    if (nextDay.year === e.year && nextDay.month === e.month && nextDay.day === e.day) return dayName(s);
    return `${dayName(s)}${dash}${dayName(addDays(e, -1))}`;
  }
  if (sameDay) return `${dayName(s)}${comma}${time(s)}${dash}${time(e)}`;
  return `${dayName(s)} ${time(s)}${dash}${dayName(e)} ${time(e)}`;
}

/* ── Typed ranges ──────────────────────────────────────── */

const UNIT: Record<string, number> = {
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: MINUTE, min: MINUTE, mins: MINUTE, minute: MINUTE, minutes: MINUTE,
  h: HOUR, hr: HOUR, hrs: HOUR, hour: HOUR, hours: HOUR,
  d: DAY, day: DAY, days: DAY,
  w: 7 * DAY, wk: 7 * DAY, week: 7 * DAY, weeks: 7 * DAY,
};
const DAY_WORDS: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const MONTH_WORDS: Record<string, number> = Object.fromEntries(
  ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].flatMap((m, i) => [
    [m, i + 1],
    [m.slice(0, 3), i + 1],
  ]).concat([["sept", 9]]),
);

function readTime(t: string): { hour: number; minute: number } | null {
  if (t === "noon" || t === "midday") return { hour: 12, minute: 0 };
  if (t === "midnight") return { hour: 0, minute: 0 };
  const m = t.match(/^(\d{1,2})(?:[:.h](\d{2}))?\s?(am|pm)?$/);
  if (!m) return null;
  let hour = +m[1];
  const minute = m[2] ? +m[2] : 0;
  if (m[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (m[3] === "pm" ? 12 : 0);
  } else if (!m[2] && hour > 24) return null;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** A date word or numbers, relative to today. */
function readDate(t: string, today: Wall & { weekday: number }): Wall | null {
  if (!t || t === "today") return midnight(today);
  if (t === "yesterday") return midnight(addDays(today, -1));
  if (t in DAY_WORDS) {
    const back = (today.weekday - DAY_WORDS[t] + 7) % 7;
    return midnight(addDays(today, -back));
  }
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3], hour: 0, minute: 0 };
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)(?: (\d{4}))?$/) ?? null;
  if (m && MONTH_WORDS[m[2]]) return { year: m[3] ? +m[3] : today.year, month: MONTH_WORDS[m[2]], day: +m[1], hour: 0, minute: 0 };
  m = t.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/);
  if (m && MONTH_WORDS[m[1]]) return { year: m[3] ? +m[3] : today.year, month: MONTH_WORDS[m[1]], day: +m[2], hour: 0, minute: 0 };
  return null;
}

const TIME_TAIL = /\s*(noon|midday|midnight|\d{1,2}(?:[:.h]\d{2})?\s?(?:am|pm)?)$/;
const ISO_MOMENT = /^\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}/;

/** "yesterday 14:00", "16 oct", "9am", "2026-10-16 14:00" as a wall time. */
function readMoment(text: string, today: Wall & { weekday: number }, fallbackDate?: Wall): { wall: Wall; dated: boolean; timed: boolean } | null {
  const t = text.trim();
  if (ISO_MOMENT.test(t)) {
    const [d, tm] = t.split(/[t ]/);
    const date = readDate(d, today);
    const time = readTime(tm.slice(0, 5));
    return date && time ? { wall: { ...date, ...time }, dated: true, timed: true } : null;
  }
  const tail = t.match(TIME_TAIL);
  let datePart = t;
  let time: { hour: number; minute: number } | null = null;
  if (tail) {
    const candidate = readTime(tail[1].replace(/\s/g, ""));
    // "16 oct" ends in digits that aren't a time; only take the tail when what's left is a date (or nothing).
    const rest = t.slice(0, tail.index).trim().replace(/,$/, "");
    if (candidate && (rest === "" || readDate(rest, today))) {
      time = candidate;
      datePart = rest;
    }
  }
  const date = datePart ? readDate(datePart, today) : (fallbackDate ?? midnight(today));
  if (!date) return null;
  return { wall: { ...date, ...(time ?? { hour: 0, minute: 0 }) }, dated: Boolean(datePart), timed: Boolean(time) };
}

/** Reads a typed range, or null. */
export function parseTimeRange(input: string, { now = new Date(), timeZone }: { now?: Date; timeZone?: string } = {}): TimeRange | null {
  const t = input.toLowerCase().trim().replace(/\s+/g, " ").replace(/[–—]/g, "-");
  if (!t) return null;
  const today = wallAt(now.getTime(), timeZone);
  const at = (w: Wall) => new Date(fromWall(w, timeZone));

  // Durations: 15m, 2 hours, last 7 days.
  const dur = t.match(/^(?:last |past )?(\d+(?:\.\d+)?) ?([a-z]+)$/);
  if (dur && UNIT[dur[2]]) return { type: "relative", duration: Math.round(+dur[1] * UNIT[dur[2]]) };
  const bare = t.match(/^(?:last (minute|hour|day)|past (minute|hour|day|week))$/);
  if (bare) return { type: "relative", duration: UNIT[bare[1] ?? bare[2]] };

  if (t === "today") return { type: "since", start: at(midnight(today)) };
  if (t === "yesterday") return { type: "absolute", start: at(midnight(addDays(today, -1))), end: at(midnight(today)) };
  if (t === "this week") return { type: "since", start: at(midnight(addDays(today, -((today.weekday + 6) % 7)))) };
  if (t === "last week") {
    const monday = midnight(addDays(today, -((today.weekday + 6) % 7)));
    return { type: "absolute", start: at(addDays(monday, -7)), end: at(monday) };
  }
  if (t === "this month") return { type: "since", start: at({ ...midnight(today), day: 1 }) };
  if (t === "last month") {
    const first = { ...midnight(today), day: 1 };
    const prev = new Date(Date.UTC(first.year, first.month - 2, 1));
    return { type: "absolute", start: at({ ...first, year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1 }), end: at(first) };
  }

  // Since a moment: since 9, since monday, since 16 oct 14:00.
  const since = t.match(/^(?:since|from) (.+)$/);
  if (since && !/ (?:to|until|-) /.test(since[1]) && !/\d-\d/.test(since[1])) {
    const m = readMoment(since[1], today);
    if (!m) return null;
    const start = at(m.wall);
    return start.getTime() < now.getTime() ? { type: "since", start } : null;
  }

  // A span: "a - b", "a to b", or two times joined by a bare hyphen ("yesterday 14:00-16:00").
  const body = t.replace(/^(?:from|between) /, "");
  let span = body.split(/ (?:-|to|until|and) /);
  if (span.length !== 2) {
    const tight = body.match(/^(.*?\d{1,2}(?:[:.]\d{2})?\s?(?:am|pm)?)-(\d{1,2}(?:[:.]\d{2})?\s?(?:am|pm)?)$/);
    span = tight ? [tight[1], tight[2]] : [];
  }
  if (span.length === 2) {
    // "yesterday 14:00-16:00": the date on the left carries over to a time-only right side.
    const a = readMoment(span[0], today);
    if (!a) return null;
    const b = readMoment(span[1], today, midnight(a.wall));
    if (!b) return null;
    let start = a.wall;
    let end = b.wall;
    if (!b.timed && b.dated) end = addDays(end, 1); // "16 oct - 17 oct" includes the 17th
    if (fromWall(end, timeZone) <= fromWall(start, timeZone)) end = addDays(end, 1); // 22:00-02:00 runs past midnight
    // Times without a date that haven't happened yet today mean yesterday's.
    if (!a.dated && fromWall(start, timeZone) > now.getTime()) {
      start = addDays(start, -1);
      end = addDays(end, -1);
    }
    return { type: "absolute", start: at(start), end: at(end) };
  }

  // A single day: monday, 16 oct.
  const day = readMoment(t, today);
  if (day && day.dated && !day.timed) return { type: "absolute", start: at(day.wall), end: at(addDays(day.wall, 1)) };
  if (day && day.timed && !day.dated) return { type: "since", start: at(day.wall) };
  return null;
}
