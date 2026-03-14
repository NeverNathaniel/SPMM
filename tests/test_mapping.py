
import pytest
from mapping_manager import MappingManager, SharePointDestination, FolderMapping
from validators import validate_mappings, ValidationResult

@pytest.fixture
def mapping_manager():
    return MappingManager()

@pytest.fixture
def dest1():
    return SharePointDestination(
        site_url="https://contoso.sharepoint.com/sites/HR",
        library_name="Documents"
    )

def test_add_destination(mapping_manager, dest1):
    # Fix: add_destination expects components, not the object itself
    # But if we want to add an existing object, we might need to change the manager
    # Or just use the components from dest1
    mapping_manager.add_destination(dest1.site_url, dest1.library_name, dest1.subfolder)
    assert len(mapping_manager.destinations) == 1
    assert mapping_manager.destinations[0] == dest1

def test_add_mapping(mapping_manager, dest1):
    mapping_manager.add_destination(dest1.site_url, dest1.library_name, dest1.subfolder)

    source_path = "/data/finance"
    mapping_manager.add_mapping(
        source_path=source_path,
        destination=dest1,
        file_count=100,
        total_size_bytes=1024*1024,
        last_modified="2023-01-01 12:00:00"
    )

    assert mapping_manager.is_mapped(source_path)
    assert len(mapping_manager.mappings) == 1

    mapping = mapping_manager.get_mapping(source_path)
    assert mapping.source_path == source_path
    assert mapping.destination == dest1

def test_remove_mapping(mapping_manager, dest1):
    source_path = "/data/finance"
    mapping_manager.add_mapping(source_path, dest1, 100, 1000, "2023-01-01")

    mapping_manager.remove_mapping(source_path)
    assert not mapping_manager.is_mapped(source_path)
    assert len(mapping_manager.mappings) == 0

def test_validators(mapping_manager, dest1):
    # Test path too long
    long_path = "a" * 500
    long_dest = SharePointDestination("https://site.com", "Lib", "Sub"*100)

    mapping_manager.add_mapping(long_path, long_dest, 10, 100, "2023-01-01")

    from file_scanner import FolderInfo
    from datetime import datetime

    # Mock folder info
    scan_results = [
        FolderInfo(long_path, "long", 10, 100, datetime.now(), 0)
    ]

    result = validate_mappings(mapping_manager, scan_results, scan_results)
    assert result.error_count > 0
    # Should find PathTooLong error (specifically Destination path exceeds SharePoint limit)
    # ValidationResult has a single 'issues' list and counts
    from validators import ValidationSeverity
    errors = result.get_issues_by_severity(ValidationSeverity.ERROR)
    assert any("limit" in e.message.lower() for e in errors)
