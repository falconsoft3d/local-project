# LoocalProject

A small project scheduling tool inspired by Microsoft Project — tasks, subtasks, milestones,
resources and an interactive Gantt chart — built with Next.js and Tailwind CSS. Projects live
wherever **you** choose: in the browser, in a file on your computer, or fetched from a URL.
There's no backend and no account.

## Features

### Task outline & scheduling

- Tasks, subtasks and milestones in a hierarchical outline (indent / outdent / reorder /
  delete), with automatic WBS numbering and summary-task rollups (dates, duration, % complete
  computed from children).
- Business-day scheduling: durations in working days, start/finish dates, and finish-to-start
  predecessors that automatically cascade downstream tasks.
- **Gantt chart** with Day / Week / Month zoom, weekend shading, a "today" marker, and
  connector lines between predecessor/successor tasks.
  - **Drag a task bar** to move its start date; **drag its right edge** to resize the
    duration — both snap to business days and re-cascade dependent tasks.
  - **Custom bar colors** per task, picked from a palette in the task table.
- **Resources**: color-coded, classified as Labor / Material / Equipment, assignable to any
  task from the task table or the Resources panel.
- **Adjust schedule**: a one-click bulk action that sets every task to a fixed number of days
  (default 8, editable) or to a duration based on how many labor resources are assigned to
  each task, chaining all tasks back-to-back automatically.

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

- Marketing shell with a top nav (**Home / Blog / Contacto**) and footer (WhatsApp and GitHub
  links) around the project list, independent of the project workspace itself.
- **Blog**, backed by Markdown files in `content/blog/*.md` (frontmatter: `title`, `date`,
  `excerpt`) — add a new post by dropping another `.md` file in that folder.
- **Contact** page.

### Other

- **English / Spanish** UI toggle, saved to `localStorage`.
- Light theme with a consistent green accent throughout (independent of the OS/browser color
  scheme).
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
