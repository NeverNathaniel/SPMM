#!/usr/bin/env python3
"""Test script for Phase 4 - Export and Persistence."""

import sys
import os
import tempfile
from pathlib import Path

from file_scanner import FileScanner
from mapping_manager import MappingManager, SharePointDestination
from filter_engine import FilterEngine, create_default_config
from export_manager import ExportManager
from project_manager import ProjectManager
from test_helpers import create_test_share

def test_phase4():
    """Test Phase 4 functionality."""
    print("=" * 60)
    print("Phase 4 Testing - Export and Persistence")
    print("=" * 60)

    # Initialize components
    scanner = FileScanner()
    manager = MappingManager()
    filter_engine = FilterEngine(create_default_config())
    export_manager = ExportManager()
    project_manager = ProjectManager()

    # Test 1: Scan and create test data
    print("\n1. Setting Up Test Data")
    print("-" * 60)

    test_path, cleanup = create_test_share()
    folders = scanner.scan_folder(test_path)
    print(f"Scanned {len(folders)} folders")

    # Add destinations
    dest1 = manager.add_destination(
        "https://contoso.sharepoint.com/sites/HR",
        "Documents"
    )
    dest2 = manager.add_destination(
        "https://contoso.sharepoint.com/sites/Finance",
        "Shared Documents",
        "Archive"
    )
    print(f"Added {len(manager.destinations)} destinations")

    # Create mappings
    for i, folder in enumerate(folders[:5]):
        dest = dest1 if i % 2 == 0 else dest2
        manager.add_mapping(
            source_path=folder.path,
            destination=dest,
            file_count=folder.file_count,
            total_size_bytes=folder.total_size,
            last_modified=folder.last_modified.strftime('%Y-%m-%d %H:%M:%S'),
            notes=f"Test mapping {i+1}"
        )
    print(f"Created {len(manager.mappings)} mappings")
    print("✓ Test data setup complete!")

    # Test 2: Export to CSV
    print("\n2. Testing CSV Export")
    print("-" * 60)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        csv_path = f.name

    try:
        mappings = manager.get_all_mappings()
        success = export_manager.export_to_csv(mappings, csv_path)
        assert success, "CSV export should succeed"

        # Verify file exists and has content
        assert os.path.exists(csv_path), "CSV file should exist"
        with open(csv_path, 'r') as f:
            lines = f.readlines()
            assert len(lines) > 1, "CSV should have header and data"
            print(f"Exported {len(lines)-1} rows to CSV")
            print(f"Header: {lines[0].strip()}")
            print(f"First row: {lines[1].strip()[:80]}...")

        print("✓ CSV export works!")
    finally:
        os.unlink(csv_path)

    # Test 3: Generate summary report
    print("\n3. Testing Summary Report Generation")
    print("-" * 60)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        report_path = f.name

    try:
        success = export_manager.generate_summary_report(
            manager,
            folders,
            folders,
            [],
            report_path
        )
        assert success, "Report generation should succeed"

        # Verify file exists and has content
        assert os.path.exists(report_path), "Report file should exist"
        with open(report_path, 'r') as f:
            content = f.read()
            assert "SCAN STATISTICS" in content, "Report should have scan stats"
            assert "MAPPING STATISTICS" in content, "Report should have mapping stats"
            assert "DESTINATIONS BREAKDOWN" in content, "Report should have destinations"
            print(f"Report size: {len(content)} characters")
            print(f"Preview:\n{content[:200]}...")

        print("✓ Summary report works!")
    finally:
        os.unlink(report_path)

    # Test 4: Export unmapped list
    print("\n4. Testing Unmapped List Export")
    print("-" * 60)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        unmapped_path = f.name

    try:
        success = export_manager.generate_unmapped_list(
            folders,
            manager,
            unmapped_path
        )
        assert success, "Unmapped list generation should succeed"

        # Verify file exists
        assert os.path.exists(unmapped_path), "Unmapped file should exist"
        with open(unmapped_path, 'r') as f:
            content = f.read()
            assert "Unmapped Folders" in content, "Should have header"
            print(f"Unmapped list size: {len(content)} characters")

        print("✓ Unmapped list works!")
    finally:
        os.unlink(unmapped_path)

    # Test 5: Export CSV template
    print("\n5. Testing CSV Template Export")
    print("-" * 60)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        template_path = f.name

    try:
        success = export_manager.export_csv_template(template_path)
        assert success, "Template export should succeed"

        # Verify file exists and has example
        assert os.path.exists(template_path), "Template file should exist"
        with open(template_path, 'r') as f:
            lines = f.readlines()
            assert len(lines) == 2, "Template should have header and example"
            print(f"Template header: {lines[0].strip()}")
            print(f"Example row: {lines[1].strip()}")

        print("✓ CSV template works!")
    finally:
        os.unlink(template_path)

    # Test 6: Save project
    print("\n6. Testing Project Save")
    print("-" * 60)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.spmm', delete=False) as f:
        project_path = f.name

    try:
        success = project_manager.save_project(
            project_path,
            manager,
            filter_engine.config,
            test_path,
            dest2  # Archive destination
        )
        assert success, "Project save should succeed"

        # Verify file exists and is valid JSON
        assert os.path.exists(project_path), "Project file should exist"
        with open(project_path, 'r') as f:
            import json
            project_data = json.load(f)
            assert 'version' in project_data, "Should have version"
            assert 'destinations' in project_data, "Should have destinations"
            assert 'mappings' in project_data, "Should have mappings"
            assert len(project_data['destinations']) == 2, "Should have 2 destinations"
            assert len(project_data['mappings']) == len(manager.mappings), "Should have all mappings"
            print(f"Project version: {project_data['version']}")
            print(f"Destinations: {len(project_data['destinations'])}")
            print(f"Mappings: {len(project_data['mappings'])}")

        print("✓ Project save works!")

        # Test 7: Load project
        print("\n7. Testing Project Load")
        print("-" * 60)

        # Create new manager to load into
        new_manager = MappingManager()

        loaded_data = project_manager.load_project(project_path)
        assert loaded_data is not None, "Project load should succeed"
        assert 'destinations' in loaded_data, "Should have destinations"
        assert 'mappings' in loaded_data, "Should have mappings"
        assert 'filter_config' in loaded_data, "Should have filter config"

        print(f"Loaded destinations: {len(loaded_data['destinations'])}")
        print(f"Loaded mappings: {len(loaded_data['mappings'])}")
        print(f"Scan path: {loaded_data.get('scan_path')}")

        # Apply loaded data
        success = project_manager.apply_project_data(loaded_data, new_manager)
        assert success, "Should apply project data"
        assert len(new_manager.destinations) == len(manager.destinations), "Destinations should match"
        assert len(new_manager.mappings) == len(manager.mappings), "Mappings should match"

        print("✓ Project load works!")

    finally:
        os.unlink(project_path)

    # Test 8: Round-trip test (save and load)
    print("\n8. Testing Round-Trip Save/Load")
    print("-" * 60)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.spmm', delete=False) as f:
        roundtrip_path = f.name

    try:
        # Save
        project_manager.save_project(
            roundtrip_path,
            manager,
            filter_engine.config,
            test_path
        )

        # Load into new manager
        roundtrip_manager = MappingManager()
        loaded = project_manager.load_project(roundtrip_path)
        project_manager.apply_project_data(loaded, roundtrip_manager)

        # Verify data matches
        assert len(roundtrip_manager.destinations) == len(manager.destinations), "Destinations should match after roundtrip"
        assert len(roundtrip_manager.mappings) == len(manager.mappings), "Mappings should match after roundtrip"

        # Verify specific mapping
        original_mapping = list(manager.mappings.values())[0]
        roundtrip_mapping = roundtrip_manager.get_mapping(original_mapping.source_path)
        assert roundtrip_mapping is not None, "Should find mapping"
        assert roundtrip_mapping.source_path == original_mapping.source_path, "Source paths should match"
        assert roundtrip_mapping.file_count == original_mapping.file_count, "File counts should match"

        print(f"Original mappings: {len(manager.mappings)}")
        print(f"Roundtrip mappings: {len(roundtrip_manager.mappings)}")
        print("✓ Round-trip save/load works!")

    finally:
        os.unlink(roundtrip_path)

    print("\n" + "=" * 60)
    print("Phase 4 Testing Complete - All Tests Passed!")
    print("=" * 60)


if __name__ == '__main__':
    try:
        sys.exit(test_phase4())
    except AssertionError as e:
        print(f"\n❌ Test failed: {str(e)}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
