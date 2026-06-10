# Migration Mapper - Development Workflow

## Project Overview
Create a standalone, technician-deployed desktop application that allows end
users to visually map file share folders to SharePoint Online libraries. The
tool scans file shares, displays the structure, and lets users drag-and-drop
or manually map folders to destination SharePoint sites. Output is an
SPMT-compatible CSV mapping file plus a human-readable HTML summary that the
technician retrieves and executes — the user never touches SPMT directly.

The application lives in `desktop/` and runs entirely offline on the user's
machine. No servers, no network services, no live SharePoint connection —
destinations are entered manually.

## Technology Stack
- **Shell**: Electron (main process + preload bridge + renderer)
- **Renderer**: React 18, TypeScript, Tailwind CSS, @dnd-kit/core (drag and
  drop), Zustand (state)
- **Build/Test**: Vite + vite-plugin-electron, Vitest, electron-builder
- **File Operations**: Node `fs` in the main process only, behind IPC; the
  scan runs in a `worker_threads` worker
- **Data Export**: SPMT CSV + self-contained HTML summary
- **Runtime requirements**: Node 20+ to develop; the packaged app has no
  prerequisites

## Core Requirements

### 1. Source File Share Scanner
- Scan local or network file shares (UNC paths supported)
- Recursive directory walk in a worker thread with throttled progress
  reporting over IPC
- Display folder hierarchy in a tree view with per-folder metadata:
  - File count (direct children)
  - Longest filename (captured at scan time for worst-case URL validation)
  - Ineligible file/folder name detection (invalid characters, reserved
    names, leading/trailing dots and spaces, temp/lock files)
  - Hidden/system entries filtered out
- Multiple scanned roots can be loaded side by side (configurable
  accumulate vs clear-on-load behavior)

### 2. Destination SharePoint Structure
- Manual entry of SharePoint sites: display name + `/sites/` slug
  (auto-generated from the name, manually editable)
- Tenant domain comes from the technician config; sites can be pre-seeded
  and quick-add presets offered
- Each site has an implicit `Documents/` root; users create folders beneath
  it (depth-limited at creation time)
- Site cards show a **live destination structure preview**: the resulting
  folder tree under `Documents/` as mappings are added, changed, or removed.
  Mapped local folders appear as ⬅ source chips on the folder that receives
  their contents, and their inherited children render nested in place as
  read-only "new" rows (created by migration, not by the user). Same-named
  folders merge exactly as SharePoint would merge them; skipped folders drop
  out of the preview just as they drop out of the CSV.

### 3. Mapping Interface (two-panel drag and drop)
- **Left panel**: scanned local directory trees
- **Right panel**: SharePoint destination site cards
- Mapping methods:
  - Drag a local folder onto `Documents/` or any folder in a site card
  - "Remap to…" context menu opens a modal destination picker
- The seven mapping rules:
  1. Explicit mapping always wins
  2. Unmapped descendants of a mapped folder inherit proportionally
  3. An explicit child breaks the inheritance chain for its subtree
  4. Remap replaces (with confirmation)
  5. Unmap cascades — inherited mappings are **derived, never persisted**,
     so removing an explicit mapping removes everything that descended from
     it while preserving explicitly-mapped branches
  6. Files follow folders — no file-level mappings
  7. UNC and local source paths are written to the CSV exactly as scanned
- Visual indicators:
  - Folder rows show file count, ineligible-file badge, destination color
    dot (split indicator when descendants diverge), inline destination label
  - Site cards reflect incoming structure live (see requirement 2)
- Inheritance is recalculated from explicit mappings on every change and on
  session load, so stale chains are impossible

### 4. Validation
- Destination depth: warn at 2, block at 3 (relative to `Documents/`,
  configurable); blocked folders cannot receive mappings or subfolders
- Worst-case URL length using the longest filename captured at scan time:
  warn at 256, block at 400 (configurable)
- Ineligible file and folder names flagged at scan time
- Hard blocks (depth, invalid mapped folder names) prevent export;
  everything else is acknowledge-to-proceed on the review screen

### 5. Export Functionality
- SPMT-compatible CSV with columns:
  - Source, SourceDocLib, SourceSubFolder, TargetWeb, TargetDocLib,
    TargetSubFolder
- One row per resolved mapping (explicit and inherited — SPMT needs every
  path spelled out); skipped folders omitted
- No formula-prefix escaping: the CSV is consumed by SPMT, not spreadsheet
  software; mangling a path would break the migration
- Self-contained HTML summary report (totals, per-site breakdown,
  acknowledged warnings, operator note)
- Exports written to `%APPDATA%/MigrationMapper/exports/<timestamp>/` or a
  configured override; exporting does not clear the session

### 6. Session Persistence & Technician Config
- Session auto-saves to `%APPDATA%/MigrationMapper/session.json` (2s
  debounce, atomic write: temp file + rename)
- Relaunching shows a resume banner with **Start Fresh**
- Only explicit mappings, scanned roots, and skip/acknowledge lists are
  persisted — inherited state is always derived
- `tech-config.json` ships next to the installed executable (falling back to
  `resources/`, then userData; project root in dev): tenant domain,
  pre-seeded sites, thresholds, export path override, optional settings PIN

## Development Phases

### Phase 1: Electron Shell & Scanner
**Files:**
- `electron/main.ts` - application window + all IPC handlers
- `electron/preload.ts` - contextBridge API (the renderer's only OS surface)
- `electron/scanDir.ts` - core directory walk (testable, shared with worker)
- `electron/scanWorker.ts` - worker_threads wrapper with throttled progress
- `src/shared/types.ts` - shared data model
- `src/shared/classify.ts` - ineligible name detection

**Verification:**
- Can scan a local test folder and a UNC path
- Progress reporting updates during large scans
- Ineligible names and longest filenames captured correctly

### Phase 2: Mapping Engine (pure logic)
**Files:**
- `src/shared/mappingEngine.ts` - the seven rules; inherited always derived
- `src/shared/spFolders.ts` - immutable SP folder tree ops
  (add/rename/delete/remap-after-rename)
- `src/shared/slug.ts` - site slug + destination URL helpers

**Verification:**
- Unit tests cover all seven rules, depth/path-length statuses, and folder
  tree operations

### Phase 3: Mapping UI
**Files:**
- `src/store/useAppStore.ts` - Zustand store + debounced autosave
- `src/store/useResolved.tsx` - memoised derived state (resolution is
  O(folders); computed once per change, shared via context)
- `src/components/LocalPanel.tsx` - local directory trees (draggables)
- `src/components/SharePointPanel.tsx` - site cards, drop targets, and the
  live destination structure preview
- `src/shared/sitePreview.ts` - pure merge of existing SP folders with
  folders created by migration (drives the preview)
- `src/components/AddSiteModal.tsx`, `DestinationPicker.tsx`,
  `ConfirmDialog.tsx`, `ContextMenu.tsx`, `Toasts.tsx`, `StatusBar.tsx`

**Verification:**
- Drag-and-drop creates mappings; remap asks for confirmation
- Site cards update live as mappings are added, changed, and removed
- Depth-blocked rows reject drops with a clear message

### Phase 4: Validation, Review & Export
**Files:**
- `src/shared/review.ts` - export gating (hard blocks, acknowledgments)
- `src/shared/csv.ts` - SPMT CSV generation
- `src/shared/htmlReport.ts` - self-contained HTML summary
- `src/components/ReviewScreen.tsx` - review & export screen

**Verification:**
- Hard blocks prevent export; warnings are acknowledgeable
- CSV format matches the SPMT specification; skipped folders omitted
- HTML summary opens standalone and reflects the session

### Phase 5: Persistence, Settings & Packaging
**Files:**
- `electron/store.ts` - atomic JSON read/write
- `src/components/TechSettings.tsx` - PIN-protected technician settings
- `electron-builder` configuration + GitHub Actions on-demand build

**Verification:**
- Session resume restores the full mapping state with inheritance recomputed
- tech-config.json discovered in deployment, resources, and dev locations
- `npm run dist` produces the Windows installer and portable executable

## Testing Requirements

### Unit Tests (`desktop/tests/`, Vitest)
- `scanDir.test.ts` - directory walk, filtering, metadata capture
- `classify.test.ts` - ineligible name detection
- `mappingEngine.test.ts` - the seven rules, validation statuses
- `spFolders.test.ts` - SP folder tree operations
- `sitePreview.test.ts` - live destination structure preview merge
- `review.test.ts` - export gating
- `csv.test.ts` - SPMT CSV generation
- `htmlReport.test.ts` - HTML summary

All tests are headless — no Electron binary or display required.

### Manual Testing Checklist
- [ ] Scan a network share with a UNC path
- [ ] Scan a local folder with deep structure
- [ ] Map folders to multiple destinations and verify the card previews
- [ ] Verify inherited children appear nested in the destination card and
      disappear on unmap
- [ ] Depth and path-length blocks trigger at the configured thresholds
- [ ] Export CSV and verify SPMT accepts it
- [ ] Close and relaunch; resume the session; Start Fresh re-seeds sites
- [ ] Install via the NSIS installer and run the portable build
- [ ] UI stays responsive with large trees

## Code Quality Standards

### TypeScript Style
- Strict TypeScript throughout; no `any` in shared logic
- Pure logic lives in `src/shared/` with **no Node or DOM imports** so it is
  unit-testable and usable from both processes
- The renderer touches the OS only through the preload bridge
- Module-level doc comments describe responsibilities and invariants

### Error Handling
- Graceful handling of permission errors and unreadable directories
- Scan failures surface as toasts, never crashes
- Atomic session writes prevent corruption on crash
- User-friendly messages for every blocked action (depth, invalid names,
  in-use folders)

### Performance
- Scanning in a worker thread keeps the window responsive
- Progress updates throttled over IPC
- Mapping resolution computed once per change and shared (O(folders), not
  per-row)
- Memory-efficient tree structures for large shares

## Deployment
- `npm run dist` packages a Windows NSIS installer and a portable executable
  via electron-builder (unsigned; code signing can be layered in later)
- A GitHub Actions workflow builds artifacts on demand
- Technicians place `tech-config.json` next to the installed executable to
  configure tenant domain, pre-seeded sites, and thresholds
- Version numbering tracked in `desktop/package.json`

## Sample Test Data Structure
Create test folder structure for development:
```
test_share/
├── Department_Finance/
│   ├── Reports_2020/
│   ├── Reports_2021/
│   └── Current/
├── Department_HR/
│   ├── Policies/
│   └── Forms/
├── Old_Archive/
│   └── 2015_Data/
└── Shared_Resources/
    ├── Templates/
    └── Guidelines/
```

## Success Criteria
- Successfully scans file shares with 10,000+ items while staying responsive
- Maps folders to destinations in under 5 clicks
- Destination cards always show the structure the migration will produce
- Exports a valid SPMT-compatible CSV
- Runs fully offline as an installed desktop application — no runtime
  prerequisites on the user's machine
- Session save/resume works reliably across relaunches
- User can complete the mapping workflow in under 30 minutes for a
  medium-complexity share

## Future Enhancements (Not for Initial Version)
- Direct SharePoint connection to browse existing libraries
- Automatic folder structure analysis and suggestions
- Batch operations across multiple file shares
- Import existing mappings from CSV
- Undo/redo functionality
- Search/filter in folder tree
