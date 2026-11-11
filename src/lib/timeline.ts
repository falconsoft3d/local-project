import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isSameMonth,
  startOfWeek,
} from "date-fns";
import type { Locale } from "date-fns";
import type { Zoom } from "./types";
import { Cal, dayNum } from "./calendar";

function localISO(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export const PX_PER_DAY: Record<Zoom, number> = {
  day: 36,
  week: 18,
  month: 6,
};

export interface TimelineRange {
  start: Date;
  end: Date;
  totalDays: number;
  totalWidth: number;
  pxPerDay: number;
}

export function buildTimelineRange(rawStart: Date, rawEnd: Date, zoom: Zoom): TimelineRange {
  const padded = new Date(rawStart);
  const paddedStart = startOfWeek(addDays(padded, -4), { weekStartsOn: 1 });
  const paddedEnd = endOfWeek(addDays(rawEnd, 8), { weekStartsOn: 1 });
  const totalDays = differenceInCalendarDays(paddedEnd, paddedStart) + 1;
  const pxPerDay = PX_PER_DAY[zoom];
  return {
    start: paddedStart,
    end: paddedEnd,
    totalDays,
    totalWidth: totalDays * pxPerDay,
    pxPerDay,
  };
}

export function dateToX(range: TimelineRange, date: Date): number {
  return differenceInCalendarDays(date, range.start) * range.pxPerDay;
}

export function isoToX(range: TimelineRange, iso: string): number {
  return dateToX(range, new Date(`${iso}T00:00:00`));
}

export interface HeaderGroup {
  key: string;
  label: string;
  left: number;
  width: number;
}

export interface HeaderTick {
  key: string;
  label: string;
  left: number;
  width: number;
  isWeekend: boolean;
  isToday: boolean;
}

export function buildHeader(
  range: TimelineRange,
  zoom: Zoom,
  locale?: Locale,
  cal?: Cal
): { groups: HeaderGroup[]; ticks: HeaderTick[] } {
  const c = cal ?? new Cal();
  const days: Date[] = [];
  for (let i = 0; i < range.totalDays; i++) days.push(addDays(range.start, i));
  const today = new Date();
  const todayKey = format(today, "yyyy-MM-dd");

  const groups: HeaderGroup[] = [];
  let groupStart = 0;
  for (let i = 1; i <= days.length; i++) {
    const boundary = i === days.length || !isSameMonth(days[i], days[groupStart]);
    if (boundary) {
      const d = days[groupStart];
      groups.push({
        key: format(d, "yyyy-MM"),
        label: format(d, "MMMM yyyy", { locale }),
        left: groupStart * range.pxPerDay,
        width: (i - groupStart) * range.pxPerDay,
      });
      groupStart = i;
    }
  }

  const ticks: HeaderTick[] = [];
  if (zoom === "day") {
    days.forEach((d, i) => {
      ticks.push({
        key: format(d, "yyyy-MM-dd"),
        label: format(d, "d"),
        left: i * range.pxPerDay,
        width: range.pxPerDay,
        isWeekend: !c.isWork(dayNum(localISO(d))),
        isToday: format(d, "yyyy-MM-dd") === todayKey,
      });
    });
  } else if (zoom === "week") {
    days.forEach((d, i) => {
      if (d.getDay() === 1) {
        ticks.push({
          key: format(d, "yyyy-MM-dd"),
          label: format(d, "MMM d", { locale }),
          left: i * range.pxPerDay,
          width: range.pxPerDay * 7,
          isWeekend: false,
          isToday: false,
        });
      }
    });
  } else {
    let mStart = 0;
    for (let i = 1; i <= days.length; i++) {
      if (i === days.length || !isSameMonth(days[i], days[mStart])) {
        ticks.push({
          key: format(days[mStart], "yyyy-MM"),
          label: format(days[mStart], "MMM", { locale }),
          left: mStart * range.pxPerDay,
          width: (i - mStart) * range.pxPerDay,
          isWeekend: false,
          isToday: false,
        });
        mStart = i;
      }
    }
  }

  return { groups, ticks };
}

/** Shaded columns for non-working days (weekends and holidays of the calendar). */
export function weekendBands(range: TimelineRange, cal?: Cal): { left: number; width: number }[] {
  const c = cal ?? new Cal();
  const startNum = dayNum(localISO(range.start));
  const off = (i: number) => !c.isWork(startNum + i);
  const bands: { left: number; width: number }[] = [];
  let i = 0;
  while (i < range.totalDays) {
    if (off(i)) {
      const bandStart = i;
      while (i < range.totalDays && off(i)) i++;
      bands.push({ left: bandStart * range.pxPerDay, width: (i - bandStart) * range.pxPerDay });
    } else {
      i++;
    }
  }
  return bands;
}

export function todayX(range: TimelineRange): number {
  return dateToX(range, new Date()) + range.pxPerDay / 2;
}
