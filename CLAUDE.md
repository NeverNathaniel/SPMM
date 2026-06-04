# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SPMM (File Share to SharePoint Migration Mapper) is a standalone Python/Tkinter GUI application for visually mapping file share folder structures to SharePoint libraries during migration planning. It has no web backend — all logic runs locally.

## Commands

**Install dependencies:**
```bash
pip install -r requirements.txt
```

**Run the application** (requires a display):
```bash
python3 main.py
```

**Run on headless Linux** (e.g. CI or remote):
```bash
Xvfb :99 -screen 0 1024x768x24 &
DISPLAY=:99 python3 main.py
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

**Run a single test by name:**
```bash
python3 -m pytest tests/test_mapping.py::test_add_destination -v
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
| `validators.py` | Pre-export checks (SP path length ≤400 chars, items/folder ≤5000, Windows MAX_PATH ≤260, unmapped folders, duplicate mappings). Returns `ValidationResult` with `ValidationIssue` objects at ERROR/WARNING/INFO severity. |
| `project_manager.py` | Serializes/deserializes full application state to/from JSON using atomic writes. |

### GUI

All GUI modules are thin wrappers around the core layer — they never own data.

| Module | Responsibility |
|---|---|
| `gui_main_window.py` | Main window, menu bar, scan button, folder tree, threading orchestration via `ProgressDialog`. Imports from all other modules. |
| `gui_mapping_panel.py` | Hierarchical tree view of mappings grouped as Site → Library → Folder. |
| `gui_destination_manager.py` | Dialogs for adding/editing/removing `SharePointDestination` objects. |
| `gui_destination_tree.py` | Read-only tree visualization of destination structure. |
| `gui_filters.py` | Dialog for editing `FilterConfig`. |
| `gui_validation_report.py` | Dialog showing `ValidationResult` with severity-level filtering. |

### Data flow

1. `FileScanner.scan_folder()` → `List[FolderInfo]` (cached in scanner)
2. User adds destinations → `MappingManager.add_destination()`
3. User creates mappings → `MappingManager.add_mapping()`
4. Optional: `FilterEngine.apply_filters()` → separates folders into active/archived/excluded
5. `validate_mappings()` → `ValidationResult`
6. `ExportManager` writes files
7. `ProjectManager.save_project()` / `load_project()` persists state to JSON

### Threading

Scan operations run in background threads to keep the UI responsive. The `ProgressDialog` class in `gui_main_window.py` manages thread lifecycle and provides a cancel mechanism via a threading event passed to `FileScanner`.

## Tests

Two parallel test suites exist:

- **`tests/`** — pytest-only, uses `conftest.py` fixtures (`test_share_path` creates a `tmp_path`-based folder tree). Contains `test_scanner.py` and `test_mapping.py`.
- **Root-level `test_phase*.py`** — standalone files (also runnable via pytest) covering phases 2–5: mapping, filtering, export/persistence, and validation respectively.

All tests are headless (no Tkinter required). The `tests/conftest.py` fixture creates:
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
