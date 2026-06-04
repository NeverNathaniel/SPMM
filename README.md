# File Share to SharePoint Migration Mapping Tool (SPMM)

A standalone GUI application for visually mapping file share folders to SharePoint libraries, generating CSV mapping files for use with PowerShell migration scripts.

## Features

- **File Share Scanner**: Scan local or network file shares (UNC paths supported)
- **Visual Mapping Interface**: 3-pane layout for source folders, destinations, and mappings
- **Filtering Rules**: Date-based filtering, pattern exclusion, size/count thresholds
- **Pre-Export Validation**: Checks for SharePoint limits, path lengths, and potential issues
- **Multiple Export Formats**: CSV for migration scripts, summary reports, unmapped lists
- **Project Persistence**: Save/load project files to resume work

## Quick Start

### Requirements
- Python 3.10 or higher
- Tkinter (included with standard Python installs)
- A display (or virtual display via Xvfb for headless environments)

### Installation
```bash
pip install -r requirements.txt
```

### Running the Application
```bash
python3 main.py
```

On Linux/headless environments, start a virtual display first:
```bash
Xvfb :99 -screen 0 1024x768x24 &
DISPLAY=:99 python3 main.py
```

## User Guide

### 1. Scan a File Share

1. Enter a folder path in the path field or click **Browse**
2. Click **Scan** to scan the folder structure
3. The folder tree will populate with metadata (file count, size, last modified)

### 2. Add SharePoint Destinations

1. Go to **Mapping > Manage Destinations**
2. Click **Add New** to add a destination
3. Enter:
   - SharePoint Site URL (e.g., `https://contoso.sharepoint.com/sites/HR`)
   - Library Name (e.g., `Documents`)
   - Subfolder (optional, e.g., `Archive/2024`)

### 3. Map Folders to Destinations

- **Method 1**: Select a folder in the tree, right-click, choose **Map to Destination**
- **Method 2**: Select folder, go to **Mapping > Map Selected Folder**

Mapped folders will be highlighted in green.

### 4. Apply Filters (Optional)

1. Go to **Filters > Configure Filters**
2. Configure options:
   - **Date Threshold**: Archive folders not modified in X days
   - **Pattern Exclusion**: Exclude folders matching patterns (e.g., `temp`, `*cache*`)
   - **Size Filters**: Skip folders below/above size thresholds
   - **File Count**: Skip empty folders or folders with few files

3. Set an archive destination via **Filters > Set Archive Destination**
4. Apply filters via **Filters > Apply Filters to Scan**

### 5. Validate and Export

1. Go to **Export > Validate Mappings** to check for issues
2. Review any errors or warnings in the validation report
3. Go to **Export > Export to CSV** to generate the migration file

## CSV Export Format

The exported CSV contains these columns:

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

The tool validates against:

- **SharePoint Limits**:
  - Path length (400 character limit)
  - Items per folder (5000 item view threshold)
  - File size limits (250 GB max)

- **Windows Limits**:
  - MAX_PATH (260 characters)

- **Configuration Issues**:
  - Missing destinations
  - Invalid URL formats
  - Unmapped folders
  - Folder name collisions at destination

## Project Files

Save your work as a `.spmm` project file via **File > Save Project**.

Project files store:
- Scan path
- All destinations
- All mappings
- Filter configuration
- Archive destination

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Enter | Confirm/Apply in dialogs |
| Escape | Cancel/Close dialogs |
| Right-click | Context menu on folders |

## Testing

Run all tests with pytest:
```bash
python3 -m pytest -v
```

Or run individual test files directly:
```bash
python3 -m pytest tests/test_scanner.py -v
python3 -m pytest test_phase5.py -v
```

## Project Structure

```
SPMM/
├── main.py                      # Application entry point
├── file_scanner.py              # File share scanning logic
├── mapping_manager.py           # Mapping data structures
├── filter_engine.py             # Filtering logic and rules
├── export_manager.py            # CSV and report export
├── project_manager.py           # Project save/load
├── validators.py                # Pre-export validation logic
├── gui_main_window.py           # Main window GUI
├── gui_destination_manager.py   # Destination management dialogs
├── gui_destination_tree.py      # Read-only destination structure visualization
├── gui_mapping_panel.py         # Mapping display and stats panels
├── gui_filters.py               # Filter configuration UI
├── gui_validation_report.py     # Validation results UI
├── test_*.py                    # Test scripts
├── test_share/                  # Test folder structure
├── requirements.txt             # Dependencies
├── DEVELOPMENT_WORKFLOW.md      # Development instructions
└── README.md                    # This file
```

## Troubleshooting

### "Permission denied" errors during scan
- Ensure you have read access to the file share
- Try running as administrator for network shares

### Slow scanning of large shares
- Scanning shows progress dialog with cancel option
- Results are cached - subsequent views are faster
- Consider filtering to reduce the working set

### Path length warnings
- SharePoint has a 400 character path limit
- Consider shorter library/folder names
- Nested subfolders add to path length

## Version History

- **1.0.0** - Initial release (All phases complete)
  - File share scanning with metadata
  - Visual mapping interface
  - Filtering and archiving rules
  - CSV export with validation
  - Project save/load functionality
  - Pre-export validation checks

## License

This project is provided as-is for internal use.
