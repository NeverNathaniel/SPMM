# Migration Mapper (desktop)

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
- **Session** auto-saves to `%APPDATA%/MigrationMapper/session.json`
  (2s debounce, atomic write). Relaunching shows a resume banner with
  **Start Fresh**.
- **Technician config** is read from `tech-config.json` next to the installed
  executable (falling back to `resources/`, then userData; project root in
  dev). Settings screen is optionally PIN-protected.
- **Validation**: destination depth warn/block (default 2/3, measured relative
  to `Documents/`), worst-case URL length warn/block (default 256/400 using
  the longest filename captured at scan time), ineligible file/folder name
  detection at scan time. Depth blocks and invalid mapped folder names are
  hard blocks; everything else is acknowledge-to-proceed.
- **Exports** are written to `%APPDATA%/MigrationMapper/exports/<timestamp>/`
  (or the configured override): `migration-mapping.csv` (one SPMT row per
  resolved mapping, explicit + inherited; skipped folders omitted; UNC/local
  source paths preserved verbatim) and `migration-summary.html`. Exporting
  does not clear the session.

## Decisions taken on the plan's open items

- **Slug generation**: auto-generated from the site name (`Contoso HR` →
  `ContosoHR`) with a manually editable slug field in the Add Site modal.
- **Inherited rows in CSV**: one row per resolved folder (explicit and
  inherited). Verify against your SPMT version before mass migration.
- **Distribution**: `electron-builder` produces an unsigned NSIS installer and
  portable exe; a GitHub Actions workflow builds artifacts on demand. Code
  signing can be layered in later.
