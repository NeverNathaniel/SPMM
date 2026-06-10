# File Share to SharePoint Migration Mapping Tool (SPMM)

> **🖥️ Desktop app:** the current direction of this project is the
> technician-deployable **Migration Mapper** Electron app in
> [`desktop/`](desktop/README.md) — drag-and-drop folder mapping, depth and
> path-length validation, ineligible-file detection, and SPMT-compatible CSV +
> HTML summary export. The FastAPI/React web prototype below remains as the
> original proof of concept.

A web application for visually mapping file share folders to SharePoint libraries using an interactive mindmap interface, generating CSV mapping files for use with PowerShell migration scripts.

## Features

- **File Share Scanner**: Scan local or network file shares (UNC paths supported)
- **Mindmap Mapping Interface**: Drag-and-connect nodes in a React Flow canvas
- **Folder Browser**: Navigate your filesystem from within the web UI
- **Filtering Rules**: Date-based filtering, pattern exclusion, size/count thresholds
- **Pre-Export Validation**: Checks for SharePoint limits, path lengths, and potential issues
- **Multiple Export Formats**: CSV for migration scripts, summary reports, unmapped lists
- **Project Persistence**: Save/load project files to resume work

## Quick Start

### Requirements
- Python 3.10+
- Node.js 18+

### Installation

```bash
# Backend
pip install -r requirements.txt

# Frontend
cd frontend && npm install
```

### Running

Start both the backend API and frontend dev server:

```bash
# Terminal 1 — Backend (http://127.0.0.1:8000)
python3 main.py

# Terminal 2 — Frontend (http://localhost:5173)
cd frontend && npm run dev
```

Then open **http://localhost:5173** in your browser.

## User Guide

### 1. Scan a File Share

1. Enter a folder path in the header bar, or click the **Browse** (folder icon) button
2. Navigate your filesystem in the folder picker modal and click **Select Current Folder**
3. Click **Scan** — source folder nodes will appear on the left side of the canvas

### 2. Add SharePoint Destinations

1. Click **Add Destination** in the header
2. Enter the SharePoint site URL (e.g., `https://contoso.sharepoint.com/sites/HR`)
3. Enter the library name (e.g., `Documents`)
4. Destination nodes appear on the right side of the canvas

### 3. Map Folders to Destinations

- **Drag a connection** from the right handle of any source folder node to the left handle of a destination node
- An animated edge is created and the mapping is persisted in the backend

### 4. Validate & Export

- Click the **Shield icon** to run validation checks
- Click **Export** to download a CSV mapping file

## CSV Export Format

| Column | Description |
|--------|-------------|
| SourcePath | Full path to source folder |
| DestinationSiteURL | SharePoint site URL |
| DestinationLibrary | Target library name |
| DestinationFolder | Subfolder within library (optional) |
| FileCount | Number of files in folder |
| TotalSizeGB | Total size in gigabytes |
| LastModified | Last modification date |
| Notes | Any notes added to mapping |

## Validation Checks

- **SharePoint Limits**: Path length (400 chars), items per folder (5,000), file size (250 GB)
- **Windows Limits**: MAX_PATH (260 chars)
- **Configuration**: Missing destinations, invalid URLs, unmapped folders, name collisions

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/browse?path=~` | List directories for folder picker |
| POST | `/api/scan` | Scan a folder path |
| GET/POST/DELETE | `/api/destinations` | CRUD destinations |
| GET/POST/DELETE | `/api/mappings` | CRUD mappings |
| GET/PUT | `/api/filters` | Read/update filter config |
| GET | `/api/statistics` | Get mapping statistics |
| GET | `/api/validate` | Run validation checks |
| POST | `/api/export/csv` | Download CSV export |
| POST | `/api/project/save` | Save project to file |
| POST | `/api/project/load` | Load project from file |

## Project Structure

```
SPMM/
├── main.py                   # Backend entry point (uvicorn)
├── api.py                    # FastAPI REST endpoints
├── file_scanner.py           # File share scanning logic
├── mapping_manager.py        # Mapping data structures
├── filter_engine.py          # Filtering logic and rules
├── export_manager.py         # CSV and report export
├── project_manager.py        # Project save/load
├── validators.py             # Pre-export validation logic
├── test_helpers.py           # Shared test utilities
├── test_*.py                 # Integration test scripts
├── tests/                    # Unit tests (pytest)
├── frontend/                 # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx           # Root component with React Flow
│   │   ├── components/
│   │   │   ├── CustomNodes.jsx   # Folder & destination nodes
│   │   │   └── FolderPicker.jsx  # Directory browser modal
│   │   ├── index.css         # Global dark theme
│   │   └── main.jsx          # React entry point
│   ├── package.json
│   └── index.html
├── requirements.txt
└── README.md
```

## Testing

```bash
# Unit tests
python3 -m pytest tests/ -v

# Integration tests (all phases)
python3 test_scanner.py
python3 test_phase2.py
python3 test_phase3.py
python3 test_phase4.py
python3 -m pytest test_phase5.py -v
```

## Version History

- **2.0.0** - Web application overhaul
  - Migrated from Tkinter GUI to FastAPI + React
  - Mindmap-style mapping with React Flow
  - Folder browser with `/api/browse` endpoint
  - Dark glassmorphism theme
  - All existing features (export, validation, filters, project save/load) preserved

- **1.0.0** - Initial release (Tkinter desktop application)

## License

This project is provided as-is for internal use.
