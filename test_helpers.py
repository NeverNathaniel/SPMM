"""
Shared utility for root-level integration test scripts.

Creates a temporary test_share directory structure that mirrors
the one documented in DEVELOPMENT_WORKFLOW.md.
"""

import os
import tempfile
import shutil
from datetime import datetime, timedelta
from pathlib import Path


def create_test_share():
    """
    Create a temporary directory tree matching the expected test_share layout.

    Returns:
        (test_path, cleanup_fn) — call cleanup_fn() to remove the tree.
    """
    base = tempfile.mkdtemp(prefix="spmm_test_")
    root = os.path.join(base, "test_share")
    os.makedirs(root)

    # --- Build structure ---
    #  test_share/
    #  ├── Department_Finance/
    #  │   ├── Reports_2020/  (3 files, ~old)
    #  │   ├── Reports_2021/  (2 files)
    #  │   └── Current/       (5 files)
    #  ├── Department_HR/
    #  │   ├── Policies/      (4 files)
    #  │   └── Forms/         (3 files)
    #  ├── Old_Archive/
    #  │   └── 2015_Data/     (1 file, very old)
    #  └── Shared_Resources/
    #      ├── Templates/     (2 files)
    #      └── Guidelines/    (1 file)
    #  └── temp/              (excluded-by-pattern candidate)

    def _mkfiles(folder, count, prefix="file", ext=".txt", content_size=100):
        os.makedirs(folder, exist_ok=True)
        for i in range(count):
            with open(os.path.join(folder, f"{prefix}{i}{ext}"), "w") as f:
                f.write("x" * content_size)

    _mkfiles(os.path.join(root, "Department_Finance", "Reports_2020"), 3)
    _mkfiles(os.path.join(root, "Department_Finance", "Reports_2021"), 2)
    _mkfiles(os.path.join(root, "Department_Finance", "Current"), 5)

    _mkfiles(os.path.join(root, "Department_HR", "Policies"), 4, prefix="policy", ext=".docx")
    _mkfiles(os.path.join(root, "Department_HR", "Forms"), 3, prefix="form", ext=".pdf")

    _mkfiles(os.path.join(root, "Old_Archive", "2015_Data"), 1, prefix="archive", content_size=200)

    _mkfiles(os.path.join(root, "Shared_Resources", "Templates"), 2, prefix="template")
    _mkfiles(os.path.join(root, "Shared_Resources", "Guidelines"), 1, prefix="guide")

    # A folder that should be caught by pattern exclusion
    _mkfiles(os.path.join(root, "temp"), 1, prefix="scratch")

    # Touch the 2015_Data files to make them look old (for date-based archive tests)
    old_time = (datetime.now() - timedelta(days=4000)).timestamp()
    for f in Path(root, "Old_Archive", "2015_Data").iterdir():
        os.utime(str(f), (old_time, old_time))
    # Also touch the directory itself
    os.utime(os.path.join(root, "Old_Archive", "2015_Data"), (old_time, old_time))

    def cleanup():
        shutil.rmtree(base, ignore_errors=True)

    return root, cleanup
