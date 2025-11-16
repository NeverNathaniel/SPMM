"""
Mapping Manager Module

This module handles the data structure for storing and managing
folder-to-SharePoint mappings.
"""

from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class SharePointDestination:
    """Data class for SharePoint destination information."""
    site_url: str
    library_name: str
    subfolder: Optional[str] = None  # Optional subfolder within the library

    def get_full_destination(self) -> str:
        """Get full destination string."""
        if self.subfolder:
            return f"{self.site_url}/{self.library_name}/{self.subfolder}"
        return f"{self.site_url}/{self.library_name}"

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class FolderMapping:
    """Data class for a single folder mapping."""
    source_path: str
    destination: SharePointDestination
    file_count: int = 0
    total_size_bytes: int = 0
    last_modified: Optional[str] = None
    notes: str = ""

    def to_dict(self) -> dict:
        """Convert to dictionary for export."""
        return {
            'source_path': self.source_path,
            'destination_site_url': self.destination.site_url,
            'destination_library': self.destination.library_name,
            'destination_subfolder': self.destination.subfolder or '',
            'file_count': self.file_count,
            'total_size_gb': round(self.total_size_bytes / (1024 ** 3), 2),
            'last_modified': self.last_modified or '',
            'notes': self.notes
        }


class MappingManager:
    """Manages folder-to-SharePoint mappings."""

    def __init__(self):
        """Initialize the MappingManager."""
        self.mappings: Dict[str, FolderMapping] = {}  # key: source_path
        self.destinations: List[SharePointDestination] = []

    def add_destination(
        self,
        site_url: str,
        library_name: str,
        subfolder: Optional[str] = None
    ) -> SharePointDestination:
        """
        Add a SharePoint destination.

        Args:
            site_url: SharePoint site URL
            library_name: Library name
            subfolder: Optional subfolder path

        Returns:
            SharePointDestination object
        """
        destination = SharePointDestination(
            site_url=site_url.rstrip('/'),
            library_name=library_name,
            subfolder=subfolder
        )

        # Check if already exists
        for existing in self.destinations:
            if (existing.site_url == destination.site_url and
                existing.library_name == destination.library_name and
                existing.subfolder == destination.subfolder):
                logger.info(f"Destination already exists: {destination.get_full_destination()}")
                return existing

        self.destinations.append(destination)
        logger.info(f"Added destination: {destination.get_full_destination()}")
        return destination

    def remove_destination(self, destination: SharePointDestination) -> bool:
        """
        Remove a SharePoint destination.

        Args:
            destination: SharePointDestination to remove

        Returns:
            True if removed, False if not found
        """
        # Check if destination is in use
        for mapping in self.mappings.values():
            if mapping.destination == destination:
                logger.warning(
                    f"Cannot remove destination {destination.get_full_destination()}: "
                    f"It is mapped to {mapping.source_path}"
                )
                return False

        if destination in self.destinations:
            self.destinations.remove(destination)
            logger.info(f"Removed destination: {destination.get_full_destination()}")
            return True

        return False

    def add_mapping(
        self,
        source_path: str,
        destination: SharePointDestination,
        file_count: int = 0,
        total_size_bytes: int = 0,
        last_modified: Optional[str] = None,
        notes: str = ""
    ) -> FolderMapping:
        """
        Add or update a folder mapping.

        Args:
            source_path: Source folder path
            destination: SharePointDestination object
            file_count: Number of files in folder
            total_size_bytes: Total size in bytes
            last_modified: Last modified date string
            notes: Optional notes

        Returns:
            FolderMapping object
        """
        mapping = FolderMapping(
            source_path=source_path,
            destination=destination,
            file_count=file_count,
            total_size_bytes=total_size_bytes,
            last_modified=last_modified,
            notes=notes
        )

        self.mappings[source_path] = mapping
        logger.info(
            f"Mapped: {source_path} -> {destination.get_full_destination()}"
        )
        return mapping

    def remove_mapping(self, source_path: str) -> bool:
        """
        Remove a folder mapping.

        Args:
            source_path: Source folder path

        Returns:
            True if removed, False if not found
        """
        if source_path in self.mappings:
            del self.mappings[source_path]
            logger.info(f"Removed mapping for: {source_path}")
            return True
        return False

    def get_mapping(self, source_path: str) -> Optional[FolderMapping]:
        """
        Get mapping for a source path.

        Args:
            source_path: Source folder path

        Returns:
            FolderMapping or None if not found
        """
        return self.mappings.get(source_path)

    def is_mapped(self, source_path: str) -> bool:
        """
        Check if a source path is mapped.

        Args:
            source_path: Source folder path

        Returns:
            True if mapped, False otherwise
        """
        return source_path in self.mappings

    def get_all_mappings(self) -> List[FolderMapping]:
        """
        Get all mappings.

        Returns:
            List of FolderMapping objects
        """
        return list(self.mappings.values())

    def get_mappings_for_destination(
        self,
        destination: SharePointDestination
    ) -> List[FolderMapping]:
        """
        Get all mappings for a specific destination.

        Args:
            destination: SharePointDestination to search for

        Returns:
            List of FolderMapping objects
        """
        return [
            mapping for mapping in self.mappings.values()
            if mapping.destination == destination
        ]

    def clear_all_mappings(self) -> None:
        """Clear all mappings."""
        self.mappings.clear()
        logger.info("All mappings cleared")

    def get_statistics(self) -> Dict[str, any]:
        """
        Get statistics about current mappings.

        Returns:
            Dictionary with statistics
        """
        total_files = sum(m.file_count for m in self.mappings.values())
        total_size = sum(m.total_size_bytes for m in self.mappings.values())

        return {
            'total_mappings': len(self.mappings),
            'total_destinations': len(self.destinations),
            'total_files': total_files,
            'total_size_gb': round(total_size / (1024 ** 3), 2),
        }

    def validate_mappings(self) -> List[str]:
        """
        Validate all mappings and return list of issues.

        Returns:
            List of validation issue messages
        """
        issues = []

        # Check for empty mappings
        if not self.mappings:
            issues.append("No mappings defined")

        # Check for invalid destinations
        for mapping in self.mappings.values():
            if not mapping.destination.site_url:
                issues.append(
                    f"Invalid site URL for mapping: {mapping.source_path}"
                )
            if not mapping.destination.library_name:
                issues.append(
                    f"Invalid library name for mapping: {mapping.source_path}"
                )

        return issues
