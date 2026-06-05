# Contributing to SPMM

## Code Standards

- Follow PEP 8
- Type hints on all functions
- Docstrings for classes and public methods
- Keep functions under ~50 lines

## Testing

Run the full test suite before submitting changes:

```bash
python3 -m pytest -v
```

New features should include tests. The `tests/` directory uses pytest fixtures from `tests/conftest.py`. Phase integration tests (`test_phase*.py`) can also be run via pytest:

```bash
python3 -m pytest test_phase5.py -v
```

## Architecture

See [CLAUDE.md](CLAUDE.md) for a full breakdown of the module structure and data flow.

## Future Enhancements

Candidate features for future versions:

- Direct SharePoint connection to browse existing libraries
- Automatic folder structure analysis and mapping suggestions
- Batch operations across multiple file shares
- Import existing mappings from CSV
- Undo/redo functionality
- Search/filter within the folder tree
- PyInstaller packaging for standalone Windows `.exe`
