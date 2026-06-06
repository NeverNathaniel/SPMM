"""
SPMM REST API

Exposes the core Python backend (scanner, mappings, filters, export,
project persistence, validation) as a FastAPI application.
"""

import os
import logging
import tempfile
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from file_scanner import FileScanner, FolderInfo, format_size
from mapping_manager import MappingManager, SharePointDestination, FolderMapping
from filter_engine import FilterEngine, FilterConfig, create_default_config
from export_manager import ExportManager
from project_manager import ProjectManager
from validators import validate_mappings

logger = logging.getLogger(__name__)

app = FastAPI(title="SPMM API", description="File Share to SharePoint Migration Mapper API")

# CORS — restrict to the Vite dev server origin only.
# allow_credentials is intentionally False; there are no cookies/sessions.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Shared application state
# ---------------------------------------------------------------------------
scanner = FileScanner()
mapping_manager = MappingManager()
filter_engine = FilterEngine(create_default_config())
export_manager = ExportManager()
project_manager = ProjectManager()

# Keep a reference to the most recent scan results for export/validation
_last_scan_folders: List[FolderInfo] = []
_last_scan_path: str = ""


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class ScanRequest(BaseModel):
    path: str
    max_depth: Optional[int] = None


class DestinationRequest(BaseModel):
    site_url: str
    library_name: str
    subfolder: Optional[str] = None


class MappingRequest(BaseModel):
    source_path: str
    destination: DestinationRequest
    file_count: int = 0
    total_size_bytes: int = 0
    last_modified: Optional[str] = None
    notes: str = ""


class FilterConfigRequest(BaseModel):
    date_threshold_enabled: bool = False
    date_threshold_days: int = 365
    archive_old_files: bool = False
    exclude_patterns_enabled: bool = False
    exclude_patterns: List[str] = []
    min_size_enabled: bool = False
    min_size_bytes: int = 0
    max_size_enabled: bool = False
    max_size_bytes: int = 0
    min_file_count_enabled: bool = False
    min_file_count: int = 1
    skip_empty_folders: bool = True


class ProjectSaveRequest(BaseModel):
    file_path: str


class ProjectLoadRequest(BaseModel):
    file_path: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _serialize_folder(f: FolderInfo) -> dict:
    """Safely serialise a FolderInfo to JSON-compatible dict."""
    return {
        "path": f.path,
        "name": f.name,
        "file_count": f.file_count,
        "total_size": f.total_size,
        "last_modified": f.last_modified.isoformat() if f.last_modified else None,
        "depth": f.depth,
        "parent_path": f.parent_path,
    }


# ---------------------------------------------------------------------------
# Browse / Scan
# ---------------------------------------------------------------------------
@app.get("/api/browse")
def browse_folder(path: str = "/"):
    """List subdirectories for the folder-picker UI.

    Browsing arbitrary absolute paths is intentional — this powers a local
    folder picker so the operator can locate the file share to scan. Exposure
    is constrained by (a) uvicorn binding to 127.0.0.1 only and (b) CORS being
    restricted to the Vite dev origin, so other web origins cannot read the
    responses. Do not expose this server beyond loopback without adding auth.
    """
    try:
        expanded_path = os.path.expanduser(path)
        if not os.path.isabs(expanded_path):
            expanded_path = os.path.abspath(expanded_path)

        if not os.path.exists(expanded_path) or not os.path.isdir(expanded_path):
            raise HTTPException(status_code=400, detail="Path is not a valid directory")

        directories = []
        parent = os.path.dirname(expanded_path)

        if expanded_path != parent:
            directories.append({"name": "..", "path": parent})

        try:
            for entry in os.scandir(expanded_path):
                if entry.is_dir() and not entry.name.startswith("."):
                    directories.append({"name": entry.name, "path": entry.path})
        except PermissionError:
            pass  # partial listing is still useful

        directories.sort(key=lambda x: (x["name"] != "..", x["name"].lower()))

        return {"current_path": expanded_path, "directories": directories}
    except HTTPException:
        raise
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    except Exception:
        # Log the full error server-side; return a generic message so raw OS
        # error text / absolute paths are not reflected to the client.
        logger.exception("Failed to browse path: %s", path)
        raise HTTPException(status_code=500, detail="Unable to browse path")


@app.post("/api/scan")
def scan_folder(req: ScanRequest):
    global _last_scan_folders, _last_scan_path
    try:
        folders = scanner.scan_folder(req.path, req.max_depth)
        _last_scan_folders = folders
        _last_scan_path = req.path
        return {"status": "success", "folders": [_serialize_folder(f) for f in folders]}
    except (FileNotFoundError, NotADirectoryError) as e:
        # Path errors are user-actionable and reference the path they supplied.
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Failed to scan path: %s", req.path)
        raise HTTPException(status_code=400, detail="Unable to scan the requested path")


# ---------------------------------------------------------------------------
# Destinations
# ---------------------------------------------------------------------------
@app.get("/api/destinations")
def get_destinations():
    return [d.to_dict() for d in mapping_manager.destinations]


@app.post("/api/destinations")
def add_destination(req: DestinationRequest):
    dest = mapping_manager.add_destination(req.site_url, req.library_name, req.subfolder)
    return dest.to_dict()


@app.delete("/api/destinations")
def remove_destination(req: DestinationRequest):
    # Normalise site_url the same way add_destination does (rstrip '/'),
    # otherwise a trailing slash would prevent the value-equality match.
    dest = SharePointDestination(req.site_url.rstrip("/"), req.library_name, req.subfolder)
    success = mapping_manager.remove_destination(dest)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Could not remove destination (might be in use or not found)",
        )
    return {"status": "success"}


# ---------------------------------------------------------------------------
# Mappings
# ---------------------------------------------------------------------------
@app.get("/api/mappings")
def get_mappings():
    return [m.to_dict() for m in mapping_manager.get_all_mappings()]


@app.post("/api/mappings")
def add_mapping(req: MappingRequest):
    dest = mapping_manager.add_destination(
        req.destination.site_url, req.destination.library_name, req.destination.subfolder
    )
    mapping = mapping_manager.add_mapping(
        source_path=req.source_path,
        destination=dest,
        file_count=req.file_count,
        total_size_bytes=req.total_size_bytes,
        last_modified=req.last_modified,
        notes=req.notes,
    )
    return mapping.to_dict()


@app.delete("/api/mappings")
def remove_mapping(source_path: str = Body(..., embed=True)):
    success = mapping_manager.remove_mapping(source_path)
    if not success:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return {"status": "success"}


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------
@app.get("/api/filters")
def get_filters():
    cfg = filter_engine.config
    return {
        "date_threshold_enabled": cfg.date_threshold_enabled,
        "date_threshold_days": cfg.date_threshold_days,
        "archive_old_files": cfg.archive_old_files,
        "exclude_patterns_enabled": cfg.exclude_patterns_enabled,
        "exclude_patterns": cfg.exclude_patterns or [],
        "min_size_enabled": cfg.min_size_enabled,
        "min_size_bytes": cfg.min_size_bytes,
        "max_size_enabled": cfg.max_size_enabled,
        "max_size_bytes": cfg.max_size_bytes,
        "min_file_count_enabled": cfg.min_file_count_enabled,
        "min_file_count": cfg.min_file_count,
        "skip_empty_folders": cfg.skip_empty_folders,
    }


@app.put("/api/filters")
def update_filters(req: FilterConfigRequest):
    new_config = FilterConfig(
        date_threshold_enabled=req.date_threshold_enabled,
        date_threshold_days=req.date_threshold_days,
        archive_old_files=req.archive_old_files,
        exclude_patterns_enabled=req.exclude_patterns_enabled,
        exclude_patterns=req.exclude_patterns,
        min_size_enabled=req.min_size_enabled,
        min_size_bytes=req.min_size_bytes,
        max_size_enabled=req.max_size_enabled,
        max_size_bytes=req.max_size_bytes,
        min_file_count_enabled=req.min_file_count_enabled,
        min_file_count=req.min_file_count,
        skip_empty_folders=req.skip_empty_folders,
    )
    filter_engine.update_config(new_config)
    return {"status": "success"}


# ---------------------------------------------------------------------------
# Statistics & Validation
# ---------------------------------------------------------------------------
@app.get("/api/statistics")
def get_statistics():
    return mapping_manager.get_statistics()


@app.get("/api/validate")
def validate():
    result = validate_mappings(mapping_manager, _last_scan_folders or None, _last_scan_folders or None)
    return {
        "is_valid": result.is_valid,          # bool attribute, NOT a method
        "issues": [i.to_dict() for i in result.issues],
        "summary": result.get_summary(),
    }


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------
@app.post("/api/export/csv")
def export_csv():
    """Export current mappings to a CSV file and return it for download."""
    mappings = mapping_manager.get_all_mappings()
    if not mappings:
        raise HTTPException(status_code=400, detail="No mappings to export")

    fd, tmp_path = tempfile.mkstemp(suffix=".csv")
    os.close(fd)

    success = export_manager.export_to_csv(mappings, tmp_path)
    if not success:
        raise HTTPException(status_code=500, detail="Export failed")

    return FileResponse(
        tmp_path,
        media_type="text/csv",
        filename="spmm_mappings.csv",
    )


# ---------------------------------------------------------------------------
# Project Save / Load
# ---------------------------------------------------------------------------
@app.post("/api/project/save")
def save_project(req: ProjectSaveRequest):
    success = project_manager.save_project(
        file_path=req.file_path,
        mapping_manager=mapping_manager,
        filter_config=filter_engine.config,
        scan_path=_last_scan_path or None,
    )
    if not success:
        raise HTTPException(status_code=500, detail="Project save failed")
    return {"status": "success", "path": req.file_path}


@app.post("/api/project/load")
def load_project(req: ProjectLoadRequest):
    data = project_manager.load_project(req.file_path)
    if data is None:
        raise HTTPException(status_code=400, detail="Failed to load project file")

    project_manager.apply_project_data(data, mapping_manager)

    if data.get("filter_config"):
        filter_engine.update_config(data["filter_config"])

    global _last_scan_path
    _last_scan_path = data.get("scan_path", "")

    return {
        "status": "success",
        "scan_path": _last_scan_path,
        "destinations": len(mapping_manager.destinations),
        "mappings": len(mapping_manager.mappings),
    }
