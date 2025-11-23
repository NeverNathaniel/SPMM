"""
Filter Engine Module

This module handles filtering logic for file shares, including
date-based filtering, pattern exclusions, and size/count thresholds.
"""

from typing import List, Optional, Set
from datetime import datetime, timedelta
from dataclasses import dataclass
import re
import fnmatch
import logging
import os

from file_scanner import FolderInfo

logger = logging.getLogger(__name__)


@dataclass
class FilterConfig:
    """Configuration for filtering operations."""

    # Date-based filtering
    date_threshold_enabled: bool = False
    date_threshold_days: int = 365  # Files not modified in X days
    archive_old_files: bool = False  # Route old files to archive destination

    # Pattern exclusion
    exclude_patterns_enabled: bool = False
    exclude_patterns: List[str] = None  # List of patterns to exclude (e.g., "temp", "*cache*")

    # Size-based filtering
    min_size_enabled: bool = False
    min_size_bytes: int = 0  # Minimum folder size

    max_size_enabled: bool = False
    max_size_bytes: int = 0  # Maximum folder size

    # File count filtering
    min_file_count_enabled: bool = False
    min_file_count: int = 1  # Minimum files in folder

    skip_empty_folders: bool = True  # Skip folders with no files

    def __post_init__(self):
        """Initialize default values."""
        if self.exclude_patterns is None:
            self.exclude_patterns = []


class FilterEngine:
    """Engine for applying filters to folder scans."""

    def __init__(self, config: Optional[FilterConfig] = None):
        """
        Initialize the filter engine.

        Args:
            config: FilterConfig object (or None for default config)
        """
        self.config = config or FilterConfig()
        self._excluded_count = 0
        self._archived_count = 0

    def apply_filters(self, folders: List[FolderInfo]) -> tuple[List[FolderInfo], List[FolderInfo]]:
        """
        Apply filters to a list of folders.

        Args:
            folders: List of FolderInfo objects

        Returns:
            Tuple of (filtered_folders, archived_folders)
        """
        self._excluded_count = 0
        self._archived_count = 0

        filtered = []
        archived = []
        excluded_parent_paths = set()

        for folder in folders:
            # Check if any parent path was excluded
            is_child_of_excluded = False
            for excluded_path in excluded_parent_paths:
                # Normalize paths for comparison
                folder_path_normalized = os.path.normpath(folder.path)
                excluded_path_normalized = os.path.normpath(excluded_path)

                # Check if folder is under an excluded parent
                if folder_path_normalized.startswith(excluded_path_normalized + os.sep):
                    is_child_of_excluded = True
                    break

            if is_child_of_excluded:
                self._excluded_count += 1
                logger.debug(f"Excluded by parent pattern: {folder.path}")
                continue

            # Check if excluded by pattern
            if self._is_excluded_by_pattern(folder):
                self._excluded_count += 1
                excluded_parent_paths.add(folder.path)  # Track for child exclusion
                logger.debug(f"Excluded by pattern: {folder.path}")
                continue

            # Check if below minimum file count
            if self._is_below_min_file_count(folder):
                self._excluded_count += 1
                logger.debug(f"Excluded by file count: {folder.path}")
                continue

            # Check if below minimum size
            if self._is_below_min_size(folder):
                self._excluded_count += 1
                logger.debug(f"Excluded by size: {folder.path}")
                continue

            # Check if above maximum size
            if self._is_above_max_size(folder):
                self._excluded_count += 1
                logger.debug(f"Excluded by max size: {folder.path}")
                continue

            # Check if should be archived
            if self._should_archive(folder):
                archived.append(folder)
                self._archived_count += 1
                logger.debug(f"Marked for archive: {folder.path}")
            else:
                filtered.append(folder)

        logger.info(
            f"Filtering complete: {len(filtered)} active, {len(archived)} archived, "
            f"{self._excluded_count} excluded"
        )

        return filtered, archived

    def _is_excluded_by_pattern(self, folder: FolderInfo) -> bool:
        """
        Check if folder matches exclusion pattern.

        Args:
            folder: FolderInfo object

        Returns:
            True if excluded, False otherwise
        """
        if not self.config.exclude_patterns_enabled:
            return False

        if not self.config.exclude_patterns:
            return False

        folder_name = folder.name.lower()
        folder_path = folder.path.lower()

        for pattern in self.config.exclude_patterns:
            pattern_lower = pattern.lower()

            # Use fnmatch for safe glob pattern matching (no ReDoS vulnerability)
            # fnmatch supports: * (matches everything), ? (single char), [seq], [!seq]
            try:
                # Check folder name against pattern
                if fnmatch.fnmatch(folder_name, pattern_lower):
                    return True
                # Also check if pattern appears in full path (for partial matches)
                if '*' not in pattern_lower and '?' not in pattern_lower:
                    # Plain text pattern - check substring match
                    if pattern_lower in folder_path:
                        return True
            except Exception as e:
                logger.warning(f"Error matching pattern '{pattern}': {e}")
                continue

        return False

    def _is_below_min_file_count(self, folder: FolderInfo) -> bool:
        """
        Check if folder is below minimum file count.

        Args:
            folder: FolderInfo object

        Returns:
            True if below minimum, False otherwise
        """
        if self.config.skip_empty_folders and folder.file_count == 0:
            return True

        if self.config.min_file_count_enabled:
            if folder.file_count < self.config.min_file_count:
                return True

        return False

    def _is_below_min_size(self, folder: FolderInfo) -> bool:
        """
        Check if folder is below minimum size.

        Args:
            folder: FolderInfo object

        Returns:
            True if below minimum, False otherwise
        """
        if not self.config.min_size_enabled:
            return False

        return folder.total_size < self.config.min_size_bytes

    def _is_above_max_size(self, folder: FolderInfo) -> bool:
        """
        Check if folder is above maximum size.

        Args:
            folder: FolderInfo object

        Returns:
            True if above maximum, False otherwise
        """
        if not self.config.max_size_enabled:
            return False

        return folder.total_size > self.config.max_size_bytes

    def _should_archive(self, folder: FolderInfo) -> bool:
        """
        Check if folder should be archived based on date.

        Args:
            folder: FolderInfo object

        Returns:
            True if should be archived, False otherwise
        """
        if not self.config.date_threshold_enabled:
            return False

        if not self.config.archive_old_files:
            return False

        # Calculate threshold date
        threshold_date = datetime.now() - timedelta(days=self.config.date_threshold_days)

        # Check if folder's last modified is before threshold
        return folder.last_modified < threshold_date

    def get_statistics(self) -> dict:
        """
        Get filtering statistics.

        Returns:
            Dictionary with statistics
        """
        return {
            'excluded_count': self._excluded_count,
            'archived_count': self._archived_count
        }

    def update_config(self, config: FilterConfig) -> None:
        """
        Update filter configuration.

        Args:
            config: New FilterConfig object
        """
        self.config = config
        logger.info("Filter configuration updated")


# Common exclusion patterns
COMMON_EXCLUSION_PATTERNS = [
    "temp",
    "tmp",
    "*cache*",
    "*backup*",
    "*recycle*",
    "$RECYCLE.BIN",
    "System Volume Information",
    "~*",  # Temporary files
    ".*",  # Hidden files/folders (Unix)
]


def create_default_config() -> FilterConfig:
    """
    Create a default filter configuration.

    Returns:
        FilterConfig with sensible defaults
    """
    return FilterConfig(
        date_threshold_enabled=False,
        date_threshold_days=730,  # 2 years
        archive_old_files=False,
        exclude_patterns_enabled=False,
        exclude_patterns=[],
        min_size_enabled=False,
        min_size_bytes=0,
        max_size_enabled=False,
        max_size_bytes=0,
        min_file_count_enabled=False,
        min_file_count=1,
        skip_empty_folders=True
    )


def create_conservative_config() -> FilterConfig:
    """
    Create a conservative filter configuration.

    Returns:
        FilterConfig with conservative settings
    """
    return FilterConfig(
        date_threshold_enabled=True,
        date_threshold_days=1095,  # 3 years
        archive_old_files=True,
        exclude_patterns_enabled=True,
        exclude_patterns=COMMON_EXCLUSION_PATTERNS.copy(),
        min_size_enabled=False,
        min_size_bytes=0,
        max_size_enabled=False,
        max_size_bytes=0,
        min_file_count_enabled=False,
        min_file_count=0,
        skip_empty_folders=True
    )
