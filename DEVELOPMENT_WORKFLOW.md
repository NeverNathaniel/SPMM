# File Share to SharePoint Migration Mapping Tool - Development Workflow

## Project Overview
Create a standalone GUI application that allows users to visually map file share folders to SharePoint libraries. The tool should scan file shares, display the structure, and let users drag-and-drop or manually map folders to destination SharePoint sites/libraries. Output should be a CSV mapping file usable for migration scripts.

## Technology Stack
- **Language**: Python 3.10+
- **GUI Framework**: PyQt5 or Tkinter (Tkinter preferred for simpler deployment)
- **File Operations**: os, pathlib
- **Data Export**: csv, pandas
- **SharePoint**: No live connection needed, manual destination entry

## Core Requirements

### 1. Source File Share Scanner
- Scan local or network file shares (UNC paths supported)
- Display folder hierarchy in tree view
- Show metadata for each folder:
  - File count
  - Total size
  - Last modified date
  - Depth level
- Allow filtering by date, size thresholds
- Cache scan results to avoid re-scanning

### 2. Destination SharePoint Structure
- Manual entry of SharePoint site URLs
- Manual entry of library names
- Allow creating multiple destination libraries
- Simple list view of destinations
- Validate URL format (basic validation)

### 3. Mapping Interface
- **Left pane**: Source folder tree
- **Right pane**: Destination libraries list
- **Middle pane**: Current mappings display
- Mapping methods:
  - Select source folder, select destination, click "Map"
  - Right-click context menu on source folders
  - Bulk mapping for multiple folders to same destination
- Visual indicators:
  - Mapped folders (green icon/highlight)
  - Unmapped folders (default)
  - Folders with multiple mappings (warning icon)
- Ability to edit/delete mappings
- Preview of what will be mapped

### 4. Filtering and Rules
- Filter old files to separate archive library:
  - Set date threshold (e.g., not modified in X years)
  - Automatically route to "Archive" destination
- Exclude folders by pattern (temp, cache, etc.)
- Minimum file count threshold (skip empty folders)
- Size-based filtering

### 5. Export Functionality
- Generate CSV with columns:
  - SourcePath
  - DestinationSiteURL
  - DestinationLibrary
  - DestinationFolder (optional subfolder in library)
  - FileCount
  - TotalSizeGB
  - LastModified
  - Notes
- Save/load project files (JSON format) to resume work
- Generate summary report:
  - Total folders mapped
  - Total size to migrate
  - Unmapped folders list
  - Archive candidates

### 6. Validation
- Check for unmapped folders
- Warn on duplicate mappings
- Validate all destination URLs are properly formatted
- Flag folders exceeding SharePoint limits (5000 items, 400 char paths)
- Summary of potential issues before export

## Development Phases

### Phase 1: Basic Structure
**Files to create:**
- `main.py` - Application entry point
- `file_scanner.py` - File share scanning logic
- `gui_main_window.py` - Main window layout
- `mapping_manager.py` - Handles mapping data structure
- `requirements.txt` - Dependencies

**Deliverables:**
- Launch application
- Scan a test folder
- Display folder tree in GUI
- Basic folder metadata display

**Verification:**
- Can scan local test folder
- Tree view shows folders correctly
- Metadata displays accurately

### Phase 2: Mapping Functionality
**Files to create/update:**
- `gui_mapping_panel.py` - Mapping interface components
- `destination_manager.py` - Manage SharePoint destinations

**Deliverables:**
- Add destination libraries manually
- Select source folder and map to destination
- Display current mappings
- Edit and delete mappings

**Verification:**
- Can add multiple destinations
- Mappings save correctly
- Can modify existing mappings
- Visual feedback on mapped folders

### Phase 3: Filtering and Rules
**Files to create/update:**
- `filter_engine.py` - Filtering logic
- `gui_filters.py` - Filter configuration UI

**Deliverables:**
- Date-based filtering UI
- Pattern exclusion rules
- Size/count thresholds
- Auto-route to archive library

**Verification:**
- Filters apply correctly to scan
- Archive routing works
- Can disable/enable filters
- Filter settings persist

### Phase 4: Export and Persistence
**Files to create/update:**
- `export_manager.py` - CSV and report generation
- `project_manager.py` - Save/load project state

**Deliverables:**
- Export to CSV
- Generate summary report
- Save project as JSON
- Load existing project

**Verification:**
- CSV format matches specification
- Reports are accurate
- Save/load maintains all mappings and settings
- Can resume work on saved project

### Phase 5: Validation and Polish
**Files to create/update:**
- `validators.py` - Validation logic
- `gui_validation_report.py` - Validation results display

**Deliverables:**
- Pre-export validation checks
- Validation report window
- Warning dialogs for issues
- User documentation (README)

**Verification:**
- All validators work correctly
- Issues are clearly reported
- Can export despite warnings
- Documentation is clear

## Testing Requirements

### Unit Tests
Create `tests/` directory with:
- `test_file_scanner.py` - Test scanning logic
- `test_mapping_manager.py` - Test mapping operations
- `test_filter_engine.py` - Test filtering
- `test_export_manager.py` - Test CSV generation
- `test_validators.py` - Test validation rules

### Integration Tests
- End-to-end workflow test
- Large folder structure test (1000+ folders)
- UNC path handling test
- Edge cases (empty folders, special characters, long paths)

### Manual Testing Checklist
- [ ] Scan network share with UNC path
- [ ] Scan local folder with deep structure
- [ ] Map folders to multiple destinations
- [ ] Apply date filters
- [ ] Export CSV and verify format
- [ ] Save project and reload
- [ ] Validation catches issues
- [ ] UI is responsive with large trees
- [ ] Cross-platform compatibility (Windows primary)

## Code Quality Standards

### Python Style
- Follow PEP 8
- Type hints on all functions
- Docstrings for classes and public methods
- Maximum function length: 50 lines
- Maximum file length: 500 lines

### Error Handling
- Graceful handling of permission errors
- Network path timeout handling
- Invalid path handling
- User-friendly error messages
- Logging to file for debugging

### Performance
- Lazy loading for large folder trees
- Threading for long-running scans
- Progress indicators for operations >2 seconds
- Memory efficient for large structures

## Deployment

### Packaging
- Use PyInstaller to create standalone executable
- Single file executable for Windows
- Include README and sample CSV
- Version numbering (start at 1.0.0)

### Distribution
- Provide .exe for Windows
- Include requirements.txt for Python users
- Sample mapping CSV template
- Quick start guide

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
- Successfully scans file shares with 10,000+ items
- Maps folders to destinations in under 5 clicks
- Exports valid CSV usable by PowerShell scripts
- Runs on Windows without Python installation (after packaging)
- Save/load works reliably
- User can complete mapping workflow in under 30 minutes for medium complexity share

## Future Enhancements (Not for Initial Version)
- Direct SharePoint connection to browse existing libraries
- Automatic folder structure analysis and suggestions
- Batch operations across multiple file shares
- Import existing mappings from CSV
- Undo/redo functionality
- Search/filter in folder tree
