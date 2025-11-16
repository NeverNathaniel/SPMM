# SharePoint Migration Mapper

Visual tool for mapping file share folders to SharePoint libraries.

## Purpose
Map complex file share reorganizations to SharePoint without expensive migration tools. Creates CSV mapping files for use with PowerShell migration scripts.

## Development
See `DEVELOPMENT_WORKFLOW.md` for complete build instructions.

## Status
**Phase 1 Complete** - Basic structure implemented

### Phase 1 Features
- ✅ File share scanner with metadata collection
- ✅ GUI with folder tree view
- ✅ Display file count, size, and modification dates
- ✅ Mapping data structure
- ✅ Test folder structure for development

## Quick Start

### Requirements
- Python 3.10 or higher
- Tkinter (included with Python)

### Running the Application
```bash
python3 main.py
```

### Testing the Scanner
```bash
python3 test_scanner.py
```

## Project Structure
```
SPMM/
├── main.py                  # Application entry point
├── gui_main_window.py       # Main window GUI
├── file_scanner.py          # File share scanning logic
├── mapping_manager.py       # Mapping data structures
├── test_scanner.py          # Scanner test script
├── test_share/              # Test folder structure
├── requirements.txt         # Dependencies
└── DEVELOPMENT_WORKFLOW.md  # Build instructions
```

## Next Steps
- Phase 2: Mapping functionality (destination management, mapping UI)
- Phase 3: Filtering and rules
- Phase 4: Export and persistence
- Phase 5: Validation and polish
