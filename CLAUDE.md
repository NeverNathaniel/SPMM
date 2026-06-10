# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SPMM (File Share to SharePoint Migration Mapper) contains two applications:

1. **`desktop/` — Migration Mapper (current direction)**: a technician-deployed **Electron + React + TypeScript** desktop app for visually mapping local/network folder structures to SharePoint Online destinations, exporting an SPMT-compatible CSV and HTML summary. See `desktop/README.md` for architecture and commands.
2. **Repository root — the original web prototype**: a **FastAPI** backend (Python) and a **React + React Flow** frontend providing a mindmap-style drag-and-connect interface. The Python modules also serve as the reference implementation the desktop core logic was ported from.

## Desktop App Commands (`desktop/`)

```bash
cd desktop
npm install        # Node 20+; set ELECTRON_SKIP_BINARY_DOWNLOAD=1 in headless envs
npm test           # Vitest unit tests (mapping engine, validation, CSV, scanner)
npm run build      # tsc --noEmit + vite build (renderer, main, preload)
npm run dev        # Electron with hot reload (needs the Electron binary)
npm run dist       # Windows installer/portable via electron-builder
```

Desktop key facts:
- Pure logic lives in `desktop/src/shared/` (no Node/DOM imports) and is fully unit-tested in `desktop/tests/`.
- Inherited mappings are **derived, never persisted** — only explicit mappings are stored; recalculation happens on every change and on session load.
- Depth thresholds (warn 2 / block 3, relative to `Documents/`) and path-length thresholds (warn 256 / block 400) are configurable in `tech-config.json` and enforced in `src/shared/mappingEngine.ts` + `src/shared/review.ts`.
- The SPMT CSV deliberately does **not** apply formula-prefix escaping — it is consumed by SPMT, not Excel; mangling a path would break the migration.

## Web Prototype Commands

**Install backend dependencies:**
```bash
pip install -r requirements.txt
```

**Install frontend dependencies:**
```bash
cd frontend && npm install
```

**Run the backend API server:**
```bash
python3 main.py
# Starts at http://127.0.0.1:8000
```

**Run the frontend dev server:**
```bash
cd frontend && npm run dev
# Starts at http://localhost:5173
```

**Run all tests:**
```bash
python3 -m pytest -v
```

**Run a single test file:**
```bash
python3 -m pytest tests/test_scanner.py -v
python3 -m pytest test_phase5.py -v
```

**Run root-level integration tests:**
```bash
python3 test_scanner.py
python3 test_phase2.py
python3 test_phase3.py
python3 test_phase4.py
```

There is no linter or formatter configured. Python 3.10+ is required (enforced at runtime in `main.py`).

## Architecture

The codebase has three layers with clear boundaries — no circular imports.

### Core (backend)

| Module | Responsibility |
|---|---|
| `file_scanner.py` | Recursively scans file shares using `os.scandir()`. Returns `FolderInfo` dataclasses. Caches results; supports cancel via threading event. |
| `mapping_manager.py` | In-memory store of `SharePointDestination` and `FolderMapping` dataclasses. Single source of truth for all mapping state. |
| `filter_engine.py` | Applies `FilterConfig` rules (date cutoff, pattern exclusion, size/count thresholds) to produce active/archived/excluded folder lists. |
| `export_manager.py` | Writes CSV, summary text, and styled HTML reports from current mapping state. |
| `validators.py` | Pre-export checks (SP path length ≤400 chars, items/folder ≤5000, Windows MAX_PATH ≤260, unmapped folders, duplicate mappings). Returns `ValidationResult` with `ValidationIssue` objects at ERROR/WARNING/INFO severity. `is_valid` is a **bool attribute**, not a method. |
| `project_manager.py` | Serializes/deserializes full application state to/from JSON using atomic writes. |

### API Layer

| Module | Responsibility |
|---|---|
| `api.py` | FastAPI application exposing REST endpoints for scan, browse, destinations, mappings, filters, validation, export, and project save/load. |
| `main.py` | Entry point — launches the uvicorn server. |

### Frontend (`frontend/`)

| Path | Responsibility |
|---|---|
| `src/App.jsx` | Root component — React Flow canvas, header with scan/browse/validate/export controls. |
| `src/components/CustomNodes.jsx` | Custom React Flow node renderers for source folders and SharePoint destinations. |
| `src/components/FolderPicker.jsx` | Modal directory browser that calls `/api/browse` on the backend. |
| `src/index.css` | Global dark theme with glassmorphism, custom typography, React Flow overrides. |

### Data flow

1. `FileScanner.scan_folder()` → `List[FolderInfo]` (cached in scanner)
2. User adds destinations → `MappingManager.add_destination()`
3. User creates mappings by dragging edges in React Flow → `MappingManager.add_mapping()`
4. Optional: `FilterEngine.apply_filters()` → separates folders into active/archived/excluded
5. `validate_mappings()` → `ValidationResult`
6. `ExportManager` writes files
7. `ProjectManager.save_project()` / `load_project()` persists state to JSON

## Tests

Two parallel test suites exist:

- **`tests/`** — pytest-only, uses `conftest.py` fixtures (`test_share_path` creates a `tmp_path`-based folder tree). Contains `test_scanner.py` and `test_mapping.py`.
- **Root-level `test_phase*.py`** — standalone files (also runnable via pytest) covering phases 2–5: mapping, filtering, export/persistence, and validation respectively. These use `test_helpers.py` to create temporary test directory structures.

All tests are headless (no GUI required). The `tests/conftest.py` fixture creates:
```
tmp/test_share/
├── folder1/         # 10 .txt files
├── folder2/subfolder1/  # 5 .doc files
└── empty_folder/
```

## Key Constraints to Know

- SharePoint path limit: **400 characters**
- SharePoint items per folder limit: **5,000**
- Windows MAX_PATH: **260 characters**
- Max file size: **250 GB**
- These limits are defined and enforced in `validators.py` — update them there if SharePoint limits change.
- Project files are JSON saved with atomic writes (write to temp, then rename) to prevent corruption on crash.
- `ValidationResult.is_valid` is a **bool attribute**, not a method — do not call it with `()`.
