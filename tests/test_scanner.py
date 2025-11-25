
import pytest
from file_scanner import FileScanner, FolderInfo
import os

def test_scan_folder_structure(test_share_path):
    """Test basic folder scanning."""
    scanner = FileScanner()
    results = scanner.scan_folder(test_share_path)

    # We expect 4 folders: root, folder1, folder2, folder2/subfolder1, empty_folder
    # Wait, scan_folder includes the root.
    # Structure:
    # root
    #   - folder1
    #   - folder2
    #     - subfolder1
    #   - empty_folder
    # Total: 1 (root) + 3 (children) + 1 (grandchild) = 5 folders

    assert len(results) == 5

    # Verify root
    root_folder = results[0]
    assert root_folder.path == test_share_path
    assert root_folder.depth == 0

    # Verify folder1
    folder1 = next(f for f in results if f.name == "folder1")
    assert folder1.file_count == 10

    # Verify empty folder
    empty = next(f for f in results if f.name == "empty_folder")
    assert empty.file_count == 0

def test_scan_non_existent():
    """Test scanning a non-existent path."""
    scanner = FileScanner()
    with pytest.raises(FileNotFoundError):
        scanner.scan_folder("/path/that/does/not/exist")

def test_scan_depth_limit(test_share_path):
    """Test max depth parameter."""
    scanner = FileScanner()
    # Depth 0 (just root)
    results = scanner.scan_folder(test_share_path, max_depth=0)
    assert len(results) == 1

    # Depth 1 (root + direct children)
    results = scanner.scan_folder(test_share_path, max_depth=1)
    # Root + folder1 + folder2 + empty_folder = 4
    assert len(results) == 4
