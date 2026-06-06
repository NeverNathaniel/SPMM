"""API-layer tests for the FastAPI backend (api.py).

Uses FastAPI's TestClient. The api module holds shared singletons
(mapping_manager, filter_engine, scan state), so each test resets them first.
"""

import pytest
from fastapi.testclient import TestClient

import api
from test_helpers import create_test_share


@pytest.fixture
def client():
    # Reset shared singletons so tests are independent of each other.
    api.mapping_manager.clear_all_mappings()
    api.mapping_manager.destinations.clear()
    api.filter_engine.update_config(api.create_default_config())
    api._last_scan_folders = []
    api._last_scan_path = ""
    return TestClient(api.app)


# --------------------------------------------------------------------------
# Validation — also a regression guard for the `is_valid` attribute bug
# (calling result.is_valid() instead of reading the attribute crashed here).
# --------------------------------------------------------------------------
def test_validate_returns_bool_and_summary(client):
    res = client.get("/api/validate")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["is_valid"], bool)
    assert isinstance(body["issues"], list)
    assert {"errors", "warnings", "info"} <= set(body["summary"].keys())
    # No destinations configured -> validator reports an error -> invalid.
    assert body["is_valid"] is False


# --------------------------------------------------------------------------
# Destinations CRUD round-trip
# --------------------------------------------------------------------------
def test_destinations_crud(client):
    payload = {
        "site_url": "https://contoso.sharepoint.com/sites/HR",
        "library_name": "Documents",
        "subfolder": None,
    }
    created = client.post("/api/destinations", json=payload)
    assert created.status_code == 200
    assert created.json()["site_url"] == payload["site_url"]

    listed = client.get("/api/destinations")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    # Delete with a trailing slash to exercise URL normalization parity.
    deleted = client.request(
        "DELETE",
        "/api/destinations",
        json={**payload, "site_url": payload["site_url"] + "/"},
    )
    assert deleted.status_code == 200
    assert client.get("/api/destinations").json() == []


# --------------------------------------------------------------------------
# Mappings CRUD round-trip
# --------------------------------------------------------------------------
def test_mappings_crud(client):
    mapping_payload = {
        "source_path": "/data/finance",
        "destination": {
            "site_url": "https://contoso.sharepoint.com/sites/Finance",
            "library_name": "Documents",
            "subfolder": None,
        },
        "file_count": 12,
        "total_size_bytes": 2048,
    }
    created = client.post("/api/mappings", json=mapping_payload)
    assert created.status_code == 200
    assert created.json()["source_path"] == "/data/finance"

    listed = client.get("/api/mappings")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    deleted = client.request("DELETE", "/api/mappings", json={"source_path": "/data/finance"})
    assert deleted.status_code == 200

    # Deleting a non-existent mapping returns 404.
    missing = client.request("DELETE", "/api/mappings", json={"source_path": "/nope"})
    assert missing.status_code == 404


# --------------------------------------------------------------------------
# Scan + Browse against a real temp tree
# --------------------------------------------------------------------------
def test_scan_serializes_folders(client):
    path, cleanup = create_test_share()
    try:
        res = client.post("/api/scan", json={"path": path})
        assert res.status_code == 200
        folders = res.json()["folders"]
        assert len(folders) > 1
        first = folders[0]
        assert set(["path", "name", "file_count", "total_size", "last_modified", "depth"]) <= set(first)
        # last_modified must be a JSON-safe ISO string, not a raw datetime.
        assert isinstance(first["last_modified"], str)
    finally:
        cleanup()


def test_browse_lists_subdirectories(client):
    path, cleanup = create_test_share()
    try:
        res = client.get("/api/browse", params={"path": path})
        assert res.status_code == 200
        names = {d["name"] for d in res.json()["directories"]}
        assert "Department_Finance" in names
        assert ".." in names  # parent entry present
    finally:
        cleanup()


def test_browse_invalid_path(client):
    res = client.get("/api/browse", params={"path": "/this/does/not/exist/spmm"})
    assert res.status_code == 400


# --------------------------------------------------------------------------
# Folder file listing (node expand view)
# --------------------------------------------------------------------------
def test_files_lists_names(client):
    path, cleanup = create_test_share()
    try:
        # Department_Finance/Reports_2020 is created with 3 files by the helper.
        res = client.get("/api/files", params={"path": f"{path}/Department_Finance/Reports_2020"})
        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 3
        assert len(body["files"]) == 3
        assert body["truncated"] is False
        assert all(isinstance(n, str) for n in body["files"])
        # sorted case-insensitively
        assert body["files"] == sorted(body["files"], key=str.lower)
    finally:
        cleanup()


def test_files_invalid_path(client):
    res = client.get("/api/files", params={"path": "/this/does/not/exist/spmm"})
    assert res.status_code == 400


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------
def test_export_csv_requires_mappings(client):
    res = client.post("/api/export/csv")
    assert res.status_code == 400


def test_export_csv_returns_file(client):
    client.post(
        "/api/mappings",
        json={
            "source_path": "/data/hr",
            "destination": {
                "site_url": "https://contoso.sharepoint.com/sites/HR",
                "library_name": "Documents",
                "subfolder": None,
            },
            "file_count": 3,
            "total_size_bytes": 100,
        },
    )
    res = client.post("/api/export/csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    body = res.text
    assert "SourcePath" in body
    assert "/data/hr" in body


# --------------------------------------------------------------------------
# Filters
# --------------------------------------------------------------------------
def test_filters_get_and_update(client):
    res = client.get("/api/filters")
    assert res.status_code == 200
    assert "skip_empty_folders" in res.json()

    update = client.put(
        "/api/filters",
        json={
            "exclude_patterns_enabled": True,
            "exclude_patterns": ["temp", "*cache*"],
            "skip_empty_folders": False,
        },
    )
    assert update.status_code == 200

    after = client.get("/api/filters").json()
    assert after["exclude_patterns_enabled"] is True
    assert after["exclude_patterns"] == ["temp", "*cache*"]
    assert after["skip_empty_folders"] is False


# --------------------------------------------------------------------------
# Statistics
# --------------------------------------------------------------------------
def test_statistics_shape(client):
    res = client.get("/api/statistics")
    assert res.status_code == 200
    assert {"total_mappings", "total_destinations", "total_files", "total_size_gb"} <= set(res.json())
