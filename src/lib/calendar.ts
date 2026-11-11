import type { Holiday, Interruption, WorkCalendar } from "./types";

/** Calendar arithmetic on integer day numbers (days since 1970-01-01, UTC). Using plain
 * integers keeps the CPM engine fast and free of timezone surprises.
 *
 * Convention used by the scheduler ("moments"): a moment `m` is the *beginning* of day `m`.
 * A task working days [S..F] (inclusive) starts at moment S and finishes at moment F + 1. */

export const DEFAULT_CALENDAR: WorkCalendar = {
  name: "L-V",
  workDays: [false, true, true, true, true, true, false],
  dayStart: "08:00",
  dayEnd: "17:00",
  hoursPerDay: 8,
  holidays: [],
};

export function defaultCalendar(): WorkCalendar {
  return { ...DEFAULT_CALENDAR, workDays: [...DEFAULT_CALENDAR.workDays], holidays: [] };
}

export function dayNum(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}

export function isoOf(n: number): string {
  const d = new Date(n * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday. */
export function weekdayOf(n: number): number {
  return (((n + 4) % 7) + 7) % 7;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function expandRanges(ranges: { from: string; to?: string }[]): Set<number> {
  const set = new Set<number>();
  for (const r of ranges) {
    if (!r.from) continue;
    const a = dayNum(r.from);
    const b = r.to ? Math.max(a, dayNum(r.to)) : a;
    // Guard against absurd ranges typed by mistake (e.g. year 20026).
    for (let i = a; i <= Math.min(b, a + 3660); i++) set.add(i);
  }
  return set;
}

/** Fast predicate wrapper around a WorkCalendar. */
export class Cal {
  readonly calendar: WorkCalendar;
  private readonly holidays: Set<number>;
  private readonly workDays: boolean[];

  constructor(calendar?: WorkCalendar | null) {
    this.calendar = calendar ?? DEFAULT_CALENDAR;
    this.holidays = expandRanges(this.calendar.holidays ?? []);
    const wd = this.calendar.workDays ?? DEFAULT_CALENDAR.workDays;
    // A calendar with no working day would make every walk loop forever.
    this.workDays = wd.some(Boolean) ? wd : DEFAULT_CALENDAR.workDays;
  }

  get hoursPerDay(): number {
    return this.calendar.hoursPerDay > 0 ? this.calendar.hoursPerDay : 8;
  }

  isHoliday(n: number): boolean {
    return this.holidays.has(n);
  }

  isWork(n: number): boolean {
    return this.workDays[weekdayOf(n)] && !this.holidays.has(n);
  }

  isWorkISO(iso: string): boolean {
    return this.isWork(dayNum(iso));
  }

  /** First working day ≥ n. */
  nextWork(n: number): number {
    let d = n;
    for (let i = 0; i < 4000 && !this.isWork(d); i++) d++;
    return d;
  }

  /** Last working day ≤ n. */
  prevWork(n: number): number {
    let d = n;
    for (let i = 0; i < 4000 && !this.isWork(d); i++) d--;
    return d;
  }

  snapISO(iso: string): string {
    return isoOf(this.nextWork(dayNum(iso)));
  }

  /** Working days in [a, b] inclusive. */
  countWork(a: number, b: number): number {
    if (b < a) return 0;
    let c = 0;
    for (let d = a; d <= b; d++) if (this.isWork(d)) c++;
    return c;
  }

  /** Signed working-day distance between moments a and b (b − a). Counts working days in
   * [a, b) when b ≥ a, negative count of [b, a) otherwise. */
  workDiff(a: number, b: number): number {
    if (b >= a) return this.countWork(a, b - 1);
    return -this.countWork(b, a - 1);
  }

  /** Moves a moment by `n` working days. Positive n: the moment after n working days
   * starting at m. Negative n: back over |n| working days before m. */
  shiftWork(m: number, n: number): number {
    let d = m;
    if (n > 0) {
      let c = 0;
      while (c < n) {
        if (this.isWork(d)) c++;
        d++;
        if (d - m > 40000) break;
      }
      return d;
    }
    if (n < 0) {
      let c = 0;
      while (c < -n) {
        d--;
        if (this.isWork(d)) c++;
        if (m - d > 40000) break;
      }
      return d;
    }
    return m;
  }

  /** Adds n working days to an ISO date that is a working day (n=0 → same day). */
  addWorkISO(iso: string, n: number): string {
    let d = this.nextWork(dayNum(iso));
    let c = 0;
    const step = n >= 0 ? 1 : -1;
    while (c < Math.abs(n)) {
      d += step;
      if (this.isWork(d)) c++;
    }
    return isoOf(d);
  }

  /** End (inclusive ISO) of a task of `duration` working days starting at `startISO`. */
  endISO(startISO: string, duration: number): string {
    if (duration <= 0) return startISO;
    return this.addWorkISO(startISO, duration - 1);
  }

  /** Working days between two ISO dates, inclusive of both ends. */
  workDaysInclusive(startISO: string, endISO: string): number {
    return this.countWork(dayNum(startISO), dayNum(endISO));
  }
}

/** Per-task working-day predicate: calendar (or every day for elapsed durations) minus the
 * task's interruptions. */
export class TaskCal {
  private readonly cal: Cal;
  private readonly elapsed: boolean;
  private readonly breaks: Set<number>;

  constructor(cal: Cal, elapsed?: boolean, interruptions?: Interruption[]) {
    this.cal = cal;
    this.elapsed = !!elapsed;
    this.breaks = expandRanges(interruptions ?? []);
  }

  isWork(n: number): boolean {
    if (this.breaks.has(n)) return false;
    return this.elapsed ? true : this.cal.isWork(n);
  }

  /** Snap a start moment forward onto the beginning of a working day. */
  snapStart(m: number): number {
    let d = m;
    for (let i = 0; i < 4000 && !this.isWork(d); i++) d++;
    return d;
  }

  /** Snap a finish moment backward onto the end of a working day. */
  snapFinish(m: number): number {
    let d = m;
    for (let i = 0; i < 4000 && !this.isWork(d - 1); i++) d--;
    return d;
  }

  /** Finish moment of a task starting at moment s with `dur` (working or elapsed) days. */
  finishOf(s: number, dur: number): number {
    if (dur <= 0) return s;
    let d = this.snapStart(s);
    let c = 0;
    let guard = 0;
    while (c < dur && guard++ < 40000) {
      if (this.isWork(d)) c++;
      d++;
    }
    return d;
  }

  /** Start moment of a task finishing at moment f with `dur` days. */
  startOf(f: number, dur: number): number {
    if (dur <= 0) return f;
    let d = this.snapFinish(f);
    let c = 0;
    let guard = 0;
    while (c < dur && guard++ < 40000) {
      d--;
      if (this.isWork(d)) c++;
    }
    return d;
  }

  /** Days of the task that actually work within [s, f). */
  workDaysIn(s: number, f: number): number[] {
    const out: number[] = [];
    for (let d = s; d < f && out.length < 40000; d++) if (this.isWork(d)) out.push(d);
    return out;
  }
}

export function holidayLabel(h: Holiday): string {
  return h.to && h.to !== h.from ? `${h.from} → ${h.to}` : h.from;
}

/** Hours between two "HH:mm" strings. */
export function hoursBetween(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.max(0, (bh * 60 + (bm || 0) - (ah * 60 + (am || 0))) / 60);
}
