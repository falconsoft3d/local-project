# LoocalProject

A small project scheduling tool inspired by Microsoft Project — tasks, subtasks, milestones,
resources and an interactive Gantt chart — built with Next.js and Tailwind CSS. Projects live
wherever **you** choose: in the browser, in a file on your computer, or fetched from a URL.
There's no backend and no account.

## Features

### Task outline & scheduling (construction scheduling — "Programación de obra")

The scheduling module follows the *Programación de obra · BIM 2.0* manual: a budget's
chapters (summary tasks) and items (leaf tasks) are scheduled with a full CPM engine.

- **Outline**: chapters, items and milestones (+ Capítulo / + Partida / + Hito, indent,
  outdent, reorder, delete), editable codes (`01.02`) with WBS fallback, Undo (Ctrl+Z),
  expand / collapse all.
- **Work calendar**: working weekdays, workday start/end, hours per day and holidays or
  closures (single days or ranges), with one-click Spanish national holidays. Weekends and
  holidays are shaded in the Gantt and skipped by the engine.
- **Scheduling settings** (Programación panel): duration type — *Performance*
  (quantity ÷ performance, locked), *Date* (dates rule) or *Manual*; schedule from the project
  start (ASAP) or finish (ALAP); automatic scheduling; status date; active baseline.
- **CPM engine**: early/late dates, total and free float, critical path; links FS/SS/FF/SF
  (FC/CC/FF/CF) with lags in working days, elapsed days or % of the predecessor; links to a
  chapter apply to all its items; circular links are rejected; the eight MS Project
  constraints plus deadlines (negative float, never moves the task); elapsed durations;
  interruptions (split tasks); started tasks keep their actual start.
- **Gantt**: editable table (COD, Nombre, Duración, Inicio, Fin, Predec., Recursos, % Cert.,
  % Fís., Holgura); predecessors typed with code syntax (`02.02FC+7dt`, `03.03CC+5`,
  `04.01CC+50%`, `05.02FF`) or picked from a searchable list that disables cycle-creating
  tasks; drag/resize bars; critical path in red, *only critical* / *negative float* filters,
  baseline bars, certified fill, physical-progress strip, dotted interruption gaps, deadline
  markers, status-date and today lines; Day / Week / Month; **Excel** export with the Gantt
  painted in cells and **PDF** via the print dialog.
- **Task form**: dates, duration, elapsed flag, constraint, deadline, floats, physical
  progress, certified %, actual start/finish, remaining duration, baseline and finish
  variance, quantity / unit / price / amount, performance, colour, predecessors with
  type/lag/unit, and interruptions.
- **Resources**: Labor / Material / Equipment with price, unit and *Máx. unidades*; per-task
  quantity, price and crew; a **histogram** of hours vs capacity (optionally including other
  projects in the browser), over-allocation list, usage table and **resource leveling**
  (within float or not).
- **Tracking**: multiple baselines (one active), *Update as scheduled*, *Reschedule remaining
  work*, the **Variance** table (actual dates and progress editable), earned-value photos,
  **S-curve** (PV, EV, AC, certified, current schedule; SPI, CPI, EAC; actual cost entries)
  and a printable **tracking report** (delayed tasks with reason, critical tasks, overloaded
  resources).
- **Network diagram** with early/late boxes, float, link labels, critical path and
  dependency highlighting, plus a **checks** panel with the manual's checklists.
- **Budget mode** (*Schedule | Budget* switch): resources carry the costs and are classified as
  MO / MAT / EQ / SC (labor, materials, equipment, subcontracts); each item's price is the sum
  of its resources (yield × price), chapters are only organisational (sum of their items), with
  totals per type and a resource price list. **Reports** (PDF and Excel): the budget down to
  chapters, items or resources, and the resource quantity report grouped by MO / MAT / EQ / SC.
- **Adjust**: a quick first draft that chains every item back-to-back (fixed days or based
  on labor resources) — it replaces all links.

### Import & export

- **Local-project JSON** — the app's native format (self-describing, versioned). Export any
  project as a `.json` file, or import one back.
- **Microsoft Project XML (FIEBDC/MS Project interchange)** — full round-trip import and
  export: imports the task hierarchy, dates, durations and resource assignments; export
  patches the *original* XML file so untouched data (costs, calendars, assignments) survives
  byte-for-byte, and only what you actually edited is rewritten.
- **BC3 (FIEBDC-3)** — imports Spanish construction cost-breakdown files: chapters and work
  items become the task tree, and each item's labor/material/equipment resources are
  recognized automatically (feeding straight into the labor-based schedule adjustment above).
- Drag and drop a `.json`, `.xml` or `.bc3` file onto the home page (including directly onto
  the hero image) to import it.

### Where projects are saved

- **Browser storage** (default) — projects persist in `localStorage`, nothing leaves the
  device.
- **A local file** (Chromium-based browsers, via the File System Access API) — "Save to
  folder" links a project to a file on disk; every edit auto-saves to that file, and the
  project is *not* duplicated into browser storage. "Open from folder" opens a project
  directly from such a file.
- **A URL** — "Add from URL" fetches a `local-project` JSON, MS Project XML or BC3 file from
  any public, CORS-enabled URL and imports it; a "Refresh" action re-fetches the latest
  version. This is read-only by design — browsers can't write back to file-sharing links like
  Google Drive or Dropbox, so edits made in the app stay local until you export/save them
  elsewhere.

### Site

- **User manual** at `/manual` (linked from the home page and the top menu), in Spanish and
  English.
- **Light / dark mode** toggle (follows the system the first time), and **ES / EN** language.

- Marketing shell with a top nav (**Home / Blog / Contacto**) and footer (WhatsApp and GitHub
  links) around the project list, independent of the project workspace itself.
- **Blog**, backed by Markdown files in `content/blog/*.md` (frontmatter: `title`, `date`,
  `excerpt`) — add a new post by dropping another `.md` file in that folder.
- **Contact** page.

### Other

- **English / Spanish** UI toggle and **light / dark** theme, saved to `localStorage` and
  applied before the first paint.
- Collapsible hero image on the home page.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
content/blog/          Markdown blog posts (frontmatter: title, date, excerpt)
src/app/(site)/         Home, Blog, Contact — share the top nav/footer
src/app/project/[id]/   The project workspace (task table + Gantt)
src/components/         UI components
src/lib/                 Scheduling engine, store, import/export parsers (MS Project XML,
                          BC3, local-project JSON), i18n, blog data access
```

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Zustand (persisted to `localStorage`) ·
date-fns · gray-matter + react-markdown (blog)


# Author
Marlon Falcón Hernández
www.marlonfalon.com