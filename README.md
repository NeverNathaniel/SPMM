# SharePoint Migration Mapper

Visual tool for mapping file share folders to SharePoint libraries.

## Purpose
Map complex file share reorganizations to SharePoint without expensive migration tools. Creates CSV mapping files for use with PowerShell migration scripts.

## Development
See `DEVELOPMENT_WORKFLOW.md` for complete build instructions.

## Status
**Phase 3 Complete** - Filtering and rules implemented

### Phase 1 Features
- ✅ File share scanner with metadata collection
- ✅ GUI with folder tree view
- ✅ Display file count, size, and modification dates
- ✅ Mapping data structure
- ✅ Test folder structure for development

### Phase 2 Features
- ✅ Destination management UI (add/edit/remove SharePoint destinations)
- ✅ Mapping interface with 3-pane layout
- ✅ Quick map dialog for folder-to-destination mapping
- ✅ Current mappings display panel
- ✅ Mapping statistics panel
- ✅ Visual feedback (green for mapped, black for unmapped)
- ✅ Context menu for mapping operations
- ✅ Edit and delete mappings functionality

### Phase 3 Features
- ✅ Filter configuration UI with comprehensive options
- ✅ Date-based filtering (files not modified in X days)
- ✅ Auto-route old files to archive destination
- ✅ Pattern exclusion rules (wildcards supported)
- ✅ Common exclusion patterns (temp, cache, system folders)
- ✅ Size-based filtering (min/max folder size)
- ✅ File count filtering (min files, skip empty folders)
- ✅ Combined filter application
- ✅ View archived folders dialog
- ✅ Filter statistics and reporting

## Quick Start

### Requirements
- Python 3.10 or higher
- Tkinter (included with Python)

### Running the Application
```bash
python3 main.py
```

### Testing
```bash
# Test file scanner (Phase 1)
python3 test_scanner.py

# Test mapping functionality (Phase 2)
python3 test_phase2.py

# Test filtering and rules (Phase 3)
python3 test_phase3.py
```

## Project Structure
```
SPMM/
├── main.py                      # Application entry point
├── gui_main_window.py           # Main window GUI with 3-pane layout
├── gui_destination_manager.py   # Destination management dialogs
├── gui_mapping_panel.py         # Mapping display and stats panels
├── gui_filters.py               # Filter configuration UI
├── file_scanner.py              # File share scanning logic
├── mapping_manager.py           # Mapping data structures
├── filter_engine.py             # Filtering logic and rules
├── test_scanner.py              # Scanner test script
├── test_phase2.py               # Phase 2 functionality tests
├── test_phase3.py               # Phase 3 filtering tests
├── test_share/                  # Test folder structure
├── requirements.txt             # Dependencies
└── DEVELOPMENT_WORKFLOW.md      # Build instructions
```

## Next Steps
- Phase 4: Export and persistence (CSV export, JSON projects, summary reports)
- Phase 5: Validation and polish (pre-export validation, user documentation)
