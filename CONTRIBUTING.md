# Contributing to SPMM

This repository contains two applications: the **Migration Mapper desktop
app** (`desktop/`, Electron + React + TypeScript — the current direction)
and the original **web prototype** (repository root, FastAPI + React). See
[CLAUDE.md](CLAUDE.md) for the module structure and data flow of both.

## Desktop app (`desktop/`)

- TypeScript throughout; pure logic lives in `desktop/src/shared/` with no
  Node or DOM imports, and is unit-tested in `desktop/tests/`.
- Run the test suite and the type-checked build before submitting changes:

```bash
cd desktop
npm test
npm run build
```

## Web prototype (repository root)

### Code Standards

- Follow PEP 8
- Type hints on all functions
- Docstrings for classes and public methods
- Keep functions under ~50 lines

### Testing

Run the full test suite before submitting changes:

```bash
python3 -m pytest -v
```

New features should include tests. The `tests/` directory uses pytest
fixtures from `tests/conftest.py`. Phase integration tests (`test_phase*.py`)
can also be run via pytest:

```bash
python3 -m pytest test_phase5.py -v
```

## Future Enhancements

Candidate features for future versions:

- Direct SharePoint connection to browse existing libraries
- Automatic folder structure analysis and mapping suggestions
- Batch operations across multiple file shares
- Import existing mappings from CSV
- Undo/redo functionality
- Search/filter within the folder tree
