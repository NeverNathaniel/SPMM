
import pytest
import os
import shutil
from pathlib import Path

@pytest.fixture
def test_share_path(tmp_path):
    """Create a temporary test share structure."""
    base = tmp_path / "test_share"
    base.mkdir()

    # Create structure
    # root
    # ├── folder1 (10 files)
    # ├── folder2
    # │   └── subfolder1 (5 files)
    # └── empty_folder

    (base / "folder1").mkdir()
    for i in range(10):
        (base / "folder1" / f"file{i}.txt").write_text(f"content {i}")

    (base / "folder2").mkdir()
    (base / "folder2" / "subfolder1").mkdir()
    for i in range(5):
        (base / "folder2" / "subfolder1" / f"file{i}.doc").write_text(f"doc content {i}")

    (base / "empty_folder").mkdir()

    return str(base)
