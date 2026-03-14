#!/usr/bin/env python3
"""Test script for Phase 2 - Mapping functionality."""

import sys
from mapping_manager import MappingManager, SharePointDestination
from file_scanner import FileScanner

def test_phase2():
    """Test Phase 2 functionality."""
    print("=" * 60)
    print("Phase 2 Testing - Mapping Functionality")
    print("=" * 60)

    # Initialize components
    manager = MappingManager()
    scanner = FileScanner()

    # Test 1: Add destinations
    print("\n1. Testing Destination Management")
    print("-" * 60)

    dest1 = manager.add_destination(
        "https://contoso.sharepoint.com/sites/HR",
        "Documents"
    )
    print(f"Added: {dest1.get_full_destination()}")

    dest2 = manager.add_destination(
        "https://contoso.sharepoint.com/sites/Finance",
        "Shared Documents",
        "Archive"
    )
    print(f"Added: {dest2.get_full_destination()}")

    dest3 = manager.add_destination(
        "https://contoso.sharepoint.com/sites/IT",
        "Documents"
    )
    print(f"Added: {dest3.get_full_destination()}")

    print(f"\nTotal destinations: {len(manager.destinations)}")
    assert len(manager.destinations) == 3, "Should have 3 destinations"
    print("✓ Destination management works!")

    # Test 2: Scan test folder
    print("\n2. Testing File Scanner Integration")
    print("-" * 60)

    test_path = '/home/user/SPMM/test_share'
    folders = scanner.scan_folder(test_path)
    print(f"Scanned: {test_path}")
    print(f"Found {len(folders)} folders")
    assert len(folders) > 0, "Should find folders"
    print("✓ Scanner works!")

    # Test 3: Create mappings
    print("\n3. Testing Mapping Creation")
    print("-" * 60)

    # Map first folder to dest1
    if len(folders) > 1:
        folder1 = folders[1]  # Skip root
        mapping1 = manager.add_mapping(
            source_path=folder1.path,
            destination=dest1,
            file_count=folder1.file_count,
            total_size_bytes=folder1.total_size,
            last_modified=folder1.last_modified.strftime('%Y-%m-%d %H:%M:%S')
        )
        print(f"Mapped: {folder1.path}")
        print(f"   To: {dest1.get_full_destination()}")

    # Map second folder to dest2
    if len(folders) > 2:
        folder2 = folders[2]
        mapping2 = manager.add_mapping(
            source_path=folder2.path,
            destination=dest2,
            file_count=folder2.file_count,
            total_size_bytes=folder2.total_size,
            last_modified=folder2.last_modified.strftime('%Y-%m-%d %H:%M:%S'),
            notes="Test mapping"
        )
        print(f"Mapped: {folder2.path}")
        print(f"   To: {dest2.get_full_destination()}")

    print(f"\nTotal mappings: {len(manager.mappings)}")
    assert len(manager.mappings) >= 2, "Should have at least 2 mappings"
    print("✓ Mapping creation works!")

    # Test 4: Verify mappings
    print("\n4. Testing Mapping Verification")
    print("-" * 60)

    if len(folders) > 1:
        folder1 = folders[1]
        assert manager.is_mapped(folder1.path), "Folder should be mapped"
        print(f"✓ {folder1.name} is correctly marked as mapped")

        mapping = manager.get_mapping(folder1.path)
        assert mapping is not None, "Should retrieve mapping"
        print(f"✓ Retrieved mapping for {folder1.name}")
        print(f"  Destination: {mapping.destination.get_full_destination()}")
        print(f"  Files: {mapping.file_count}")

    # Test 5: Get statistics
    print("\n5. Testing Statistics")
    print("-" * 60)

    stats = manager.get_statistics()
    print(f"Total mappings: {stats['total_mappings']}")
    print(f"Total destinations: {stats['total_destinations']}")
    print(f"Total files: {stats['total_files']}")
    print(f"Total size: {stats['total_size_gb']:.2f} GB")

    assert stats['total_mappings'] == len(manager.mappings)
    assert stats['total_destinations'] == len(manager.destinations)
    print("✓ Statistics calculation works!")

    # Test 6: Remove mapping
    print("\n6. Testing Mapping Removal")
    print("-" * 60)

    if len(folders) > 1:
        folder1 = folders[1]
        removed = manager.remove_mapping(folder1.path)
        assert removed, "Should remove mapping"
        assert not manager.is_mapped(folder1.path), "Should not be mapped"
        print(f"✓ Successfully removed mapping for {folder1.name}")

    # Test 7: Validation
    print("\n7. Testing Validation")
    print("-" * 60)

    issues = manager.validate_mappings()
    print(f"Validation issues: {len(issues)}")
    for issue in issues:
        print(f"  - {issue}")
    print("✓ Validation works!")

    # Test 8: Export format
    print("\n8. Testing Export Format")
    print("-" * 60)

    all_mappings = manager.get_all_mappings()
    if all_mappings:
        export_data = all_mappings[0].to_dict()
        print("Sample export data:")
        for key, value in export_data.items():
            print(f"  {key}: {value}")

        required_fields = ['source_path', 'destination_site_url',
                          'destination_library', 'file_count', 'total_size_gb']
        for field in required_fields:
            assert field in export_data, f"Missing required field: {field}"
        print("✓ Export format is correct!")

    print("\n" + "=" * 60)
    print("Phase 2 Testing Complete - All Tests Passed!")
    print("=" * 60)


if __name__ == '__main__':
    try:
        sys.exit(test_phase2())
    except AssertionError as e:
        print(f"\n❌ Test failed: {str(e)}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
