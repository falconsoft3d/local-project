"use client";

import { useState } from "react";
import { v4 as uuid } from "uuid";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/useT";
import { hoursBetween } from "@/lib/calendar";
import { defaultScheduleSettings } from "@/lib/normalize";
import { scheduleProject } from "@/lib/cpm";
import type { Holiday, ID, Project, WorkCalendar } from "@/lib/types";
import Modal from "../Modal";

/** Easter Sunday (Gregorian, anonymous algorithm). */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Spanish national holidays (fixed dates + Good Friday). Regional/local ones are added by hand. */
function spanishHolidays(year: number): Holiday[] {
  const fixed: [string, string][] = [
    ["01-01", "Año Nuevo"],
    ["01-06", "Epifanía del Señor"],
    ["05-01", "Fiesta del Trabajo"],
    ["08-15", "Asunción de la Virgen"],
    ["10-12", "Fiesta Nacional de España"],
    ["11-01", "Todos los Santos"],
    ["12-06", "Día de la Constitución"],
    ["12-08", "Inmaculada Concepción"],
    ["12-25", "Navidad"],
  ];
  const gf = easter(year);
  gf.setUTCDate(gf.getUTCDate() - 2);
  const goodFriday = gf.toISOString().slice(0, 10);
  return [
    ...fixed.map(([md, name]) => ({ id: uuid(), from: `${year}-${md}`, name })),
    { id: uuid(), from: goodFriday, name: "Viernes Santo" },
  ].sort((x, y) => x.from.localeCompare(y.from));
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
/** Display order Monday → Sunday. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function CalendarModal({
  projectId,
  project,
  onClose,
}: {
  projectId: ID;
  project: Project;
  onClose: () => void;
}) {
  const t = useT();
  const changeProject = useStore((s) => s.changeProject);
  const projects = useStore((s) => s.projects);
  const settings = defaultScheduleSettings(project.schedule);
  const cal = settings.calendar;
  const [year, setYear] = useState(() => {
    const ref = settings.startDate ?? new Date().toISOString();
    return Number(ref.slice(0, 4));
  });

  function setCalendar(patch: Partial<WorkCalendar>, key: string) {
    changeProject(
      projectId,
      (p) => {
        const s = defaultScheduleSettings(p.schedule);
        const next = { ...p, schedule: { ...s, calendar: { ...s.calendar, ...patch } } };
        return s.autoSchedule ? scheduleProject(next) : next;
      },
      `calendar:${key}`,
    );
  }

  function setHoliday(id: ID, patch: Partial<Holiday>) {
    setCalendar({ holidays: cal.holidays.map((h) => (h.id === id ? { ...h, ...patch } : h)) }, `hol:${id}`);
  }

  const others = projects.filter((p) => p.id !== projectId && p.schedule?.calendar);
  const sorted = [...cal.holidays].sort((a, b) => a.from.localeCompare(b.from));

  return (
    <Modal title={t("calendarTitle")} onClose={onClose} width="max-w-2xl">
      <div className="flex max-h-[78vh] flex-col gap-5 overflow-auto pr-1 text-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{t("calendarCode")}</span>
            <input
              value={cal.name}
              onChange={(e) => setCalendar({ name: e.target.value }, "name")}
              placeholder="Valencia L-V"
              className="rounded-md border border-neutral-300 px-2 py-1.5 outline-none focus:border-green-500"
            />
          </label>
          {others.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{t("copyCalendarFrom")}</span>
              <select
                value=""
                onChange={(e) => {
                  const src = others.find((p) => p.id === e.target.value)?.schedule?.calendar;
                  if (src && confirm(t("copyCalendarConfirm"))) {
                    setCalendar(
                      { ...src, holidays: src.holidays.map((h) => ({ ...h, id: uuid() })), workDays: [...src.workDays] },
                      "copy",
                    );
                  }
                }}
                className="rounded-md border border-neutral-300 px-2 py-1.5 outline-none focus:border-green-500"
              >
                <option value="">—</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.schedule!.calendar.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{t("workingDays")}</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {DISPLAY_ORDER.map((d) => (
              <label
                key={d}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                  cal.workDays[d] ? "border-green-500 bg-green-50 text-green-800" : "border-neutral-200 text-neutral-500"
                }`}
              >
                <input
                  type="checkbox"
                  checked={cal.workDays[d]}
                  onChange={(e) => {
                    const next = [...cal.workDays];
                    next[d] = e.target.checked;
                    if (!next.some(Boolean)) return;
                    setCalendar({ workDays: next }, "days");
                  }}
                />
                {t(`weekday_${DAY_KEYS[d]}`)}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{t("dayStart")}</span>
            <input
              type="time"
              value={cal.dayStart}
              onChange={(e) => setCalendar({ dayStart: e.target.value || "08:00" }, "start")}
              className="rounded-md border border-neutral-300 px-2 py-1.5 outline-none focus:border-green-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{t("dayEnd")}</span>
            <input
              type="time"
              value={cal.dayEnd}
              onChange={(e) => setCalendar({ dayEnd: e.target.value || "17:00" }, "end")}
              className="rounded-md border border-neutral-300 px-2 py-1.5 outline-none focus:border-green-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{t("hoursPerDay")}</span>
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={cal.hoursPerDay}
              onChange={(e) => setCalendar({ hoursPerDay: Math.max(0.5, Number(e.target.value) || 8) }, "hours")}
              className="rounded-md border border-neutral-300 px-2 py-1.5 outline-none focus:border-green-500"
            />
            <span className="text-[11px] text-neutral-400">
              {t("hoursPerDayHint", { span: hoursBetween(cal.dayStart, cal.dayEnd) })}
            </span>
          </label>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              {t("holidays")}
            </span>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
              className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-green-500"
            />
            <button
              onClick={() => {
                const existing = new Set(cal.holidays.map((h) => h.from));
                const add = spanishHolidays(year).filter((h) => !existing.has(h.from));
                setCalendar({ holidays: [...cal.holidays, ...add] }, "es-holidays");
              }}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
            >
              {t("addSpanishHolidays")}
            </button>
            <button
              onClick={() =>
                setCalendar(
                  { holidays: [...cal.holidays, { id: uuid(), from: `${year}-01-01`, name: "" }] },
                  `add:${uuid()}`,
                )
              }
              className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
            >
              + {t("addHoliday")}
            </button>
          </div>
          {sorted.length === 0 ? (
            <p className="py-3 text-center text-xs text-neutral-400">{t("noHolidays")}</p>
          ) : (
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-neutral-200 text-[11px] text-neutral-500">
                <tr>
                  <th className="py-1 pr-2 font-medium">{t("from")}</th>
                  <th className="py-1 pr-2 font-medium">{t("to")}</th>
                  <th className="py-1 pr-2 font-medium">{t("reason")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((h) => (
                  <tr key={h.id} className="border-b border-neutral-100">
                    <td className="py-1 pr-2">
                      <input
                        type="date"
                        value={h.from}
                        onChange={(e) => e.target.value && setHoliday(h.id, { from: e.target.value })}
                        className="rounded border border-neutral-200 px-1 py-0.5 outline-none focus:border-green-500"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="date"
                        value={h.to ?? ""}
                        min={h.from}
                        onChange={(e) => setHoliday(h.id, { to: e.target.value || undefined })}
                        className="rounded border border-neutral-200 px-1 py-0.5 outline-none focus:border-green-500"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        value={h.name ?? ""}
                        onChange={(e) => setHoliday(h.id, { name: e.target.value })}
                        className="w-full rounded border border-neutral-200 px-1 py-0.5 outline-none focus:border-green-500"
                      />
                    </td>
                    <td className="py-1 text-right">
                      <button
                        onClick={() =>
                          setCalendar({ holidays: cal.holidays.filter((x) => x.id !== h.id) }, `del:${h.id}`)
                        }
                        className="rounded px-1.5 text-red-500 hover:bg-red-50"
                        aria-label={t("delete")}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
          {settings.autoSchedule ? t("calendarAutoNote") : t("calendarManualNote")}
        </p>
      </div>
    </Modal>
  );
}
