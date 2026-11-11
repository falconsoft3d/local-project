import { v4 as uuid } from "uuid";
import { Cal, dayNum, isoOf, spanishHolidays, todayISO } from "./calendar";
import { scheduleProject } from "./cpm";
import { normalizeProject } from "./normalize";
import {
  createBaseline,
  earnedValueAt,
  recordSnapshot,
  rescheduleRemaining,
  updateAsScheduled,
} from "./tracking";
import type { AssignmentInfo, EvSnapshot, Link, Project, Resource, Task } from "./types";

/** Built-in example ("Cargar ejemplo"): a 24-dwelling residential building with chapters,
 * every link type, an interruption, a deadline, a costed budget (MO / MAT / EQ / SC), a
 * baseline, progress up to a recent status date, actual costs and earned-value photos.
 * Dates are relative to today so tracking always looks current. */

type Lang = "es" | "en";
const tx = (lang: Lang, es: string, en: string) => (lang === "es" ? es : en);

const L = (predecessorId: string, type: Link["type"] = "FS", lag = 0, lagUnit: Link["lagUnit"] = "wd"): Link => ({
  predecessorId,
  type,
  lag,
  lagUnit,
});

export function buildSampleProject(lang: Lang): Project {
  const cal = new Cal();
  // Start on the Monday nine weeks ago; status date = last working day before today.
  const today = dayNum(todayISO());
  let startDay = today - 63;
  while (new Date(startDay * 86400000).getUTCDay() !== 1) startDay--;
  const startISO = isoOf(startDay);
  const statusDate = isoOf(cal.prevWork(today - 1));
  const year = Number(startISO.slice(0, 4));

  const holidays = [...spanishHolidays(year), ...spanishHolidays(year + 1)];

  const R = (
    id: string,
    code: string,
    es: string,
    en: string,
    kind: Resource["kind"],
    unit: string,
    price: number,
    maxUnits?: number,
  ): Resource => ({ id, code, name: tx(lang, es, en), kind, unit, price, maxUnits, color: "#2563eb" });

  const resources: Resource[] = [
    R("of", "MO001", "Oficial 1ª albañil", "Skilled bricklayer", "labor", "h", 22.5, 6),
    R("pe", "MO002", "Peón ordinario", "Laborer", "labor", "h", 18.9, 5),
    R("ha", "MT001", "Hormigón HA-25/B/20/IIa", "Concrete C25/30", "material", "m³", 85),
    R("ac", "MT002", "Acero corrugado B500S", "Reinforcing steel B500S", "material", "kg", 0.95),
    R("lp", "MT003", "Ladrillo cerámico perforado", "Perforated clay brick", "material", "ud", 0.32),
    R("lh", "MT004", "Ladrillo hueco doble", "Hollow clay brick", "material", "ud", 0.18),
    R("mo", "MT005", "Mortero de cemento M-7,5", "Cement mortar M-7.5", "material", "m³", 72),
    R("pi", "MT006", "Pintura plástica", "Plastic paint", "material", "l", 4.5),
    R("gr", "EQ001", "Grúa torre 40 m", "Tower crane 40 m", "equipment", "h", 45, 1),
    R("rx", "EQ002", "Retroexcavadora", "Backhoe", "equipment", "h", 55, 1),
    R("im", "SC001", "Impermeabilización de cubierta", "Roof waterproofing", "subcontract", "m²", 18),
    R("fo", "SC002", "Instalación de fontanería por vivienda", "Plumbing per dwelling", "subcontract", "ud", 2900),
    R("el", "SC003", "Instalación eléctrica por vivienda", "Electrical per dwelling", "subcontract", "ud", 3400),
    R("so", "SC004", "Solado de gres", "Ceramic flooring", "subcontract", "m²", 21),
  ];

  const ch = (id: string, code: string, es: string, en: string): Task => ({
    id,
    code,
    name: tx(lang, es, en),
    start: startISO,
    duration: 1,
    progress: 0,
    parentId: null,
    resourceIds: [],
    predecessors: [],
  });

  const item = (
    id: string,
    parentId: string,
    code: string,
    es: string,
    en: string,
    duration: number,
    preds: Link[],
    unit: string,
    quantity: number,
    breakdown: Record<string, number>,
    extra: Partial<Task> = {},
  ): Task => {
    const resourceAssignments: Record<string, AssignmentInfo> = {};
    for (const [rid, q] of Object.entries(breakdown)) {
      resourceAssignments[rid] = { quantity: q, units: rid === "of" ? 3 : rid === "pe" ? 2 : 1 };
    }
    return {
      id,
      parentId,
      code,
      name: tx(lang, es, en),
      start: startISO,
      duration,
      progress: 0,
      unit,
      quantity,
      resourceIds: Object.keys(breakdown),
      resourceAssignments,
      predecessors: preds,
      ...extra,
    };
  };

  const deadline = isoOf(cal.nextWork(startDay + 150));
  const tasks: Task[] = [
    ch("c1", "01", "Movimiento de tierras y cimentación", "Earthworks and foundations"),
    item("t11", "c1", "01.01", "Desbroce y excavación", "Clearing and excavation", 6, [], "m³", 850, { pe: 0.12, rx: 0.05 }),
    item("t12", "c1", "01.02", "Losa de cimentación", "Foundation slab", 8, [L("t11")], "m³", 180, {
      of: 1.2,
      pe: 1.2,
      ha: 1.05,
      ac: 90,
      gr: 0.15,
    }),
    item("t13", "c1", "01.03", "Muro de sótano", "Basement wall", 10, [L("t12", "FS", 7, "ed")], "m³", 95, {
      of: 2.1,
      pe: 1.8,
      ha: 1.05,
      ac: 70,
      gr: 0.2,
    }),
    ch("c2", "02", "Estructura", "Structure"),
    item("t21", "c2", "02.01", "Forjado planta baja", "Ground floor slab", 9, [L("t13")], "m²", 620, {
      of: 0.6,
      pe: 0.6,
      ha: 0.12,
      ac: 14,
      gr: 0.05,
    }),
    item("t22", "c2", "02.02", "Forjado planta primera", "First floor slab", 9, [L("t21")], "m²", 620, {
      of: 0.6,
      pe: 0.6,
      ha: 0.12,
      ac: 14,
      gr: 0.05,
    }),
    item("t23", "c2", "02.03", "Cubierta", "Roof", 6, [L("t22")], "m²", 640, { of: 0.4, pe: 0.3, im: 1 }),
    ch("c3", "03", "Albañilería y fachada", "Masonry and facade"),
    item(
      "t31",
      "c3",
      "03.01",
      "Fachada de ladrillo cara vista",
      "Face brick facade",
      15,
      [L("t22", "SS", 5)],
      "m²",
      1200,
      { of: 0.45, pe: 0.35, lp: 55, mo: 0.03 },
      {
        interruptions: [
          {
            id: uuid(),
            from: isoOf(cal.nextWork(startDay + 84)),
            to: isoOf(cal.nextWork(startDay + 84) + 1),
            reason: tx(lang, "Revisión del andamio", "Scaffold inspection"),
          },
        ],
      },
    ),
    item("t32", "c3", "03.02", "Tabiquería interior", "Interior partitions", 12, [L("t31", "SS", 50, "pct")], "m²", 1800, {
      of: 0.35,
      pe: 0.25,
      lh: 33,
      mo: 0.02,
    }),
    ch("c4", "04", "Instalaciones y acabados", "Services and finishes"),
    item("t41", "c4", "04.01", "Fontanería", "Plumbing", 8, [L("t32")], "ud", 24, { fo: 1 }),
    item("t42", "c4", "04.02", "Electricidad", "Electrical", 7, [L("t32", "SS", 3)], "ud", 24, { el: 1 }),
    item(
      "t43",
      "c4",
      "04.03",
      "Pintura y solados",
      "Painting and flooring",
      10,
      [L("t41"), L("t42", "FF")],
      "m²",
      2600,
      { of: 0.12, pe: 0.08, pi: 0.3, so: 1 },
      { deadline },
    ),
    item("t44", "c4", "04.04", "Fin de obra", "Practical completion", 0, [L("t43"), L("t23")], "ud", 1, {}),
  ];

  let p: Project = normalizeProject({
    id: uuid(),
    name: tx(lang, "Ejemplo · Edificio de viviendas Los Olivos", "Sample · Los Olivos residential building"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resources,
    tasks,
    schedule: {
      durationType: "manual",
      scheduleFrom: "start",
      autoSchedule: false,
      startDate: startISO,
      calendar: {
        name: tx(lang, "Valencia L-V", "Valencia Mon-Fri"),
        workDays: [false, true, true, true, true, true, false],
        dayStart: "08:00",
        dayEnd: "17:00",
        hoursPerDay: 8,
        holidays,
      },
    },
  });

  // 1) Approved schedule → baseline.
  p = scheduleProject(p);
  const baseline = createBaseline(p, tx(lang, "Línea base 1", "Baseline 1"));
  p = { ...p, baselines: [baseline], schedule: { ...p.schedule!, activeBaselineId: baseline.id, statusDate } };

  // 2) What happened on site: the foundation slab took two more days.
  p = scheduleProject({ ...p, tasks: p.tasks.map((t) => (t.id === "t12" ? { ...t, duration: 10 } : t)) });

  // 3) Monthly closing at the status date.
  p = updateAsScheduled(p);
  // The task currently in progress is behind plan (realistic correction).
  const inProgress = p.tasks.filter((t) => t.progress > 0 && t.progress < 100);
  if (inProgress.length) {
    const lagging = inProgress[0].id;
    p = { ...p, tasks: p.tasks.map((t) => (t.id === lagging ? { ...t, progress: Math.max(5, t.progress - 20) } : t)) };
  }
  p = scheduleProject(rescheduleRemaining(p));
  // Certification follows physical progress a little behind.
  p = {
    ...p,
    tasks: p.tasks.map((t) =>
      t.progress >= 100 ? { ...t, certified: 100 } : t.progress > 0 ? { ...t, certified: Math.max(0, t.progress - 10) } : t,
    ),
  };

  // 4) Actual costs (supplier invoices) month by month, slightly under earned value.
  const monthEnds: string[] = [];
  for (let d = new Date(startDay * 86400000); ; ) {
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const iso = end.toISOString().slice(0, 10);
    if (iso >= statusDate) break;
    monthEnds.push(iso);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  const evStatus = earnedValueAt(p, statusDate);
  const points = [...monthEnds, statusDate];
  let acc = 0;
  const actualCosts = points.map((date, i) => {
    const target =
      i === points.length - 1 ? evStatus.ev * 0.94 : earnedValueAt(p, date).pvCurrent * 0.9;
    const amount = Math.max(0, Math.round(target - acc));
    acc += amount;
    return {
      id: uuid(),
      date,
      amount,
      description: tx(lang, `Facturas de proveedores hasta ${date.split("-").reverse().join("/")}`, `Supplier invoices to ${date}`),
    };
  });
  p = { ...p, actualCosts };

  // 5) Earned-value photos: previous month ends (approximate history) + the status date.
  const history: EvSnapshot[] = monthEnds.map((date) => {
    const v = earnedValueAt(p, date);
    const ev = Math.min(v.pvCurrent, v.pv) * 0.97;
    // Certification trails progress: scale today's certified amount to that date's progress.
    const certified = evStatus.ev > 0 ? v.certified * (ev / evStatus.ev) * 0.9 : 0;
    return { id: uuid(), date, createdAt: new Date().toISOString(), bac: v.bac, pv: v.pv, ev, ac: v.ac, certified };
  });
  p = recordSnapshot({ ...p, evSnapshots: history });
  return p;
}
