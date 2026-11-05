# Migration Mapper

A technician-deployed Electron desktop app that lets end users visually map
local/network folder structures to SharePoint Online destinations across
multiple sessions. The output is an SPMT-compatible CSV plus a human-readable
HTML summary that the technician retrieves and executes — the user never
touches SPMT directly.

## Stack

Electron · React + TypeScript · Tailwind CSS · @dnd-kit/core · Zustand ·
Vite (+ vite-plugin-electron) · Vitest · electron-builder

## Development

```bash
npm install
npm run dev        # Vite dev server + Electron with hot reload
npm test           # Vitest unit tests (mapping engine, validation, CSV, scanner…)
npm run build      # type-check + production bundles (dist/ + dist-electron/)
npm run dist       # build + package Windows installer/portable (release/)
```

Node 20+ required. `npm run dev`/`dist` need the Electron binary; if it was
skipped at install time (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`), reinstall
`electron` with network access.

## Layout

```
electron/            main process: window, IPC, scan worker, persistence, export
  main.ts            BrowserWindow + all IPC handlers
  preload.ts         contextBridge API (the renderer's only OS surface)
  scanDir.ts         core directory walk (testable, shared with the worker)
  scanWorker.ts      worker_threads wrapper with throttled progress
  store.ts           atomic JSON read/write (temp file + rename)
src/
  shared/            pure logic — no Node/DOM imports, fully unit-tested
    types.ts         data model (FolderNode, SharePointSite, ExplicitMapping…)
    classify.ts      ineligible file/folder detection + hidden/system filtering
    mappingEngine.ts the 7 mapping rules; inherited mappings always derived
    spFolders.ts     immutable SP folder tree ops (add/rename/delete/remap)
    sitePreview.ts   merged live preview of a site's structure under Documents/
    migrationPlan.ts which folders become CSV rows (SPMT copies recursively)
    review.ts        export gating (hard blocks, acknowledgments)
    csv.ts           SPMT CSV generation
    htmlReport.ts    self-contained HTML summary
  store/             Zustand store + derived-state hooks (2s debounced autosave)
  components/        screens and panels (mapping view, review, tech settings)
tests/               Vitest suites for everything in src/shared and scanDir
```

## Key behaviours

- **Inherited mappings are never stored.** Only explicit mappings persist;
  inheritance is recalculated on every change and on session load, so stale
  chains are impossible (plan rules 1–5).
- **Live destination preview.** Each site card shows the resulting structure
  under `Documents/` as mappings change: mapped local folders appear as ⬅
  chips on the folder receiving their contents, and inherited children render
  nested in place as read-only "new" rows. Same-named folders merge the way
  SharePoint merges them; skipped folders drop out exactly as they do from
  the CSV (`src/shared/sitePreview.ts`).
- **Session** auto-saves to `%APPDATA%/MigrationMapper/session.json`
  (2s debounce, atomic write; pending changes are flushed synchronously when
  the window closes). Relaunching shows a resume banner with **Start Fresh**.
- **Directory roots** can't overlap: loading a folder that is already loaded,
  or that contains / sits inside a loaded root, is refused (it would put the
  same folders in the CSV twice). A running scan can be cancelled.
- **Technician config** lives in `tech-config.json` next to the installed
  executable (falling back to `resources/`, then userData; project root in
  dev). Saves go to the first writable location; loads use the most recently
  written candidate, so a read-only pre-baked file doesn't shadow later
  saves. Settings screen is optionally PIN-protected.
- **Validation**: destination depth warn/block (default 2/3, measured relative
  to `Documents/`), worst-case URL length warn/block (default 256/400 using
  the longest filename captured at scan time), ineligible file/folder name
  detection at scan time. Depth blocks and invalid mapped folder names are
  hard blocks; everything else is acknowledge-to-proceed.
- **Exports** are written to `%APPDATA%/MigrationMapper/exports/<timestamp>/`
  (or the configured override): `migration-mapping.csv` (SPMT rows chosen
  by the migration plan, below; no header row, matching SPMT's bulk-upload
  format; UNC/local source paths preserved verbatim) and
  `migration-summary.html`. Exporting
  does not clear the session.

## Design decisions

- **Slug generation**: auto-generated from the site name (`Contoso HR` →
  `ContosoHR`) with a manually editable slug field in the Add Site modal.
- **CSV rows follow SPMT's recursive copy** (`src/shared/migrationPlan.ts`).
  SPMT migrates a source folder together with all of its subfolders, so a
  row is written for the highest folder whose whole subtree lands in one
  place, and nothing beneath it gets its own row. Where a subtree diverges
  (a subfolder is skipped or mapped elsewhere), the folder gets no row and
  its children are planned individually — so every file is migrated once,
  Skip is honoured, and re-mapped subfolders go only to their own
  destination. The one case SPMT can't express is a diverging folder's
  *own* files: those are listed on the review screen and in the HTML
  summary as "not included in the CSV" and must be acknowledged (or the
  folder skipped) before export.
- **Skip** excludes the files directly in a folder; its subfolders still
  migrate unless they are skipped too.
- **Distribution**: `electron-builder` produces an unsigned NSIS installer and
  portable exe; a GitHub Actions workflow builds artifacts on demand. Code
  signing can be layered in later.
