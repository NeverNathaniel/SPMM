"""
File Share Scanner Module

This module handles scanning of file shares (local or network UNC paths)
and collects metadata about folders for migration mapping.
"""

import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@dataclass
class FolderInfo:
    """Data class to store folder metadata."""
    path: str
    name: str
    file_count: int
    total_size: int  # in bytes
    last_modified: datetime
    depth: int
    parent_path: Optional[str] = None

    def get_size_gb(self) -> float:
        """Return size in GB."""
        return self.total_size / (1024 ** 3)

    def get_size_mb(self) -> float:
        """Return size in MB."""
        return self.total_size / (1024 ** 2)


class FileScanner:
    """Handles scanning of file shares and collecting folder metadata."""

    def __init__(self):
        """Initialize the FileScanner."""
        self.scan_cache: Dict[str, List[FolderInfo]] = {}
        self._cancel_scan = False

    def scan_folder(
        self,
        root_path: str,
        max_depth: Optional[int] = None,
        progress_callback: Optional[callable] = None
    ) -> List[FolderInfo]:
        """
        Scan a folder and return metadata for all subfolders.

        Args:
            root_path: Path to scan (local or UNC path)
            max_depth: Maximum depth to scan (None for unlimited)
            progress_callback: Optional callback function(current_path, folder_count)

        Returns:
            List of FolderInfo objects
        """
        self._cancel_scan = False

        try:
            root_path = os.path.abspath(root_path)
            if not os.path.exists(root_path):
                raise FileNotFoundError(f"Path does not exist: {root_path}")

            if not os.path.isdir(root_path):
                raise NotADirectoryError(f"Path is not a directory: {root_path}")

            logger.info(f"Starting scan of: {root_path}")
            folders = []

            # Add root folder
            root_info = self._get_folder_info(root_path, 0, None)
            folders.append(root_info)

            # Scan subdirectories
            self._scan_recursive(root_path, 0, max_depth, folders, progress_callback)

            # Cache results
            self.scan_cache[root_path] = folders

            logger.info(f"Scan complete. Found {len(folders)} folders.")
            return folders

        except Exception as e:
            logger.error(f"Error scanning {root_path}: {str(e)}")
            raise

    def _scan_recursive(
        self,
        current_path: str,
        current_depth: int,
        max_depth: Optional[int],
        folders: List[FolderInfo],
        progress_callback: Optional[callable]
    ) -> None:
        """
        Recursively scan subdirectories.

        Args:
            current_path: Current directory being scanned
            current_depth: Current depth level
            max_depth: Maximum depth to scan
            folders: List to append FolderInfo objects to
            progress_callback: Optional callback for progress updates
        """
        if self._cancel_scan:
            return

        if max_depth is not None and current_depth >= max_depth:
            return

        try:
            entries = os.listdir(current_path)
        except PermissionError:
            logger.warning(f"Permission denied: {current_path}")
            return
        except Exception as e:
            logger.warning(f"Error reading {current_path}: {str(e)}")
            return

        for entry in entries:
            if self._cancel_scan:
                return

            entry_path = os.path.join(current_path, entry)

            # Skip if not a directory
            if not os.path.isdir(entry_path):
                continue

            # Get folder info
            folder_info = self._get_folder_info(
                entry_path,
                current_depth + 1,
                current_path
            )
            folders.append(folder_info)

            # Progress callback
            if progress_callback:
                result = progress_callback(entry_path, len(folders))
                # If callback returns False, cancel the scan
                if result is False:
                    self._cancel_scan = True
                    return

            # Recurse into subdirectory
            self._scan_recursive(
                entry_path,
                current_depth + 1,
                max_depth,
                folders,
                progress_callback
            )

    def _get_folder_info(
        self,
        folder_path: str,
        depth: int,
        parent_path: Optional[str]
    ) -> FolderInfo:
        """
        Get metadata for a single folder.

        Args:
            folder_path: Path to the folder
            depth: Depth level in the tree
            parent_path: Path to parent folder

        Returns:
            FolderInfo object with metadata
        """
        file_count = 0
        total_size = 0
        last_modified = datetime.fromtimestamp(0)

        try:
            # Count files and calculate size
            for entry in os.scandir(folder_path):
                try:
                    if entry.is_file(follow_symlinks=False):
                        file_count += 1
                        stat_info = entry.stat(follow_symlinks=False)
                        total_size += stat_info.st_size

                        # Track most recent modification
                        mod_time = datetime.fromtimestamp(stat_info.st_mtime)
                        if mod_time > last_modified:
                            last_modified = mod_time

                except (PermissionError, OSError) as e:
                    logger.debug(f"Error accessing {entry.path}: {str(e)}")
                    continue

            # If no files found, use folder's own modification time
            if file_count == 0:
                try:
                    stat_info = os.stat(folder_path)
                    last_modified = datetime.fromtimestamp(stat_info.st_mtime)
                except Exception:
                    last_modified = datetime.now()

        except PermissionError:
            logger.warning(f"Permission denied accessing: {folder_path}")
        except Exception as e:
            logger.warning(f"Error getting info for {folder_path}: {str(e)}")

        return FolderInfo(
            path=folder_path,
            name=os.path.basename(folder_path) or folder_path,
            file_count=file_count,
            total_size=total_size,
            last_modified=last_modified,
            depth=depth,
            parent_path=parent_path
        )

    def cancel_scan(self) -> None:
        """Cancel an ongoing scan operation."""
        self._cancel_scan = True
        logger.info("Scan cancellation requested")

    def get_cached_scan(self, root_path: str) -> Optional[List[FolderInfo]]:
        """
        Retrieve cached scan results.

        Args:
            root_path: Path that was previously scanned

        Returns:
            List of FolderInfo objects or None if not cached
        """
        root_path = os.path.abspath(root_path)
        return self.scan_cache.get(root_path)

    def clear_cache(self) -> None:
        """Clear all cached scan results."""
        self.scan_cache.clear()
        logger.info("Scan cache cleared")


def format_size(size_bytes: int) -> str:
    """
    Format byte size to human-readable string.

    Args:
        size_bytes: Size in bytes

    Returns:
        Formatted string (e.g., "1.5 GB", "250 MB")
    """
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"
