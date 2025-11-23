"""
Validators Module

This module handles pre-export validation checks for the migration mapping tool.
It validates mappings, destinations, and source folders for potential issues.
"""

from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import os
import logging

from mapping_manager import MappingManager, FolderMapping, SharePointDestination
from file_scanner import FolderInfo

logger = logging.getLogger(__name__)


class ValidationSeverity(Enum):
    """Severity levels for validation issues."""
    ERROR = "error"      # Blocking issue - should not export
    WARNING = "warning"  # Non-blocking but needs attention
    INFO = "info"        # Informational only


@dataclass
class ValidationIssue:
    """Represents a single validation issue."""
    severity: ValidationSeverity
    category: str
    message: str
    source_path: Optional[str] = None
    details: Optional[str] = None

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            'severity': self.severity.value,
            'category': self.category,
            'message': self.message,
            'source_path': self.source_path,
            'details': self.details
        }


@dataclass
class ValidationResult:
    """Contains all validation results."""
    issues: List[ValidationIssue] = field(default_factory=list)
    is_valid: bool = True
    error_count: int = 0
    warning_count: int = 0
    info_count: int = 0

    def add_issue(self, issue: ValidationIssue) -> None:
        """Add an issue to the results."""
        self.issues.append(issue)

        if issue.severity == ValidationSeverity.ERROR:
            self.error_count += 1
            self.is_valid = False
        elif issue.severity == ValidationSeverity.WARNING:
            self.warning_count += 1
        else:
            self.info_count += 1

    def get_issues_by_severity(self, severity: ValidationSeverity) -> List[ValidationIssue]:
        """Get issues filtered by severity."""
        return [i for i in self.issues if i.severity == severity]

    def get_issues_by_category(self, category: str) -> List[ValidationIssue]:
        """Get issues filtered by category."""
        return [i for i in self.issues if i.category == category]

    def get_summary(self) -> Dict:
        """Get a summary of validation results."""
        return {
            'is_valid': self.is_valid,
            'total_issues': len(self.issues),
            'errors': self.error_count,
            'warnings': self.warning_count,
            'info': self.info_count
        }


# SharePoint limits
SHAREPOINT_MAX_PATH_LENGTH = 400
SHAREPOINT_MAX_ITEMS_PER_FOLDER = 5000
SHAREPOINT_MAX_FILE_SIZE_GB = 250
WINDOWS_MAX_PATH_LENGTH = 260


class MappingValidator:
    """Validates folder mappings for potential issues."""

    def __init__(self):
        """Initialize the validator."""
        self.result = ValidationResult()

    def validate_all(
        self,
        mapping_manager: MappingManager,
        all_folders: Optional[List[FolderInfo]] = None,
        filtered_folders: Optional[List[FolderInfo]] = None
    ) -> ValidationResult:
        """
        Run all validations and return results.

        Args:
            mapping_manager: MappingManager with current mappings
            all_folders: All scanned folders (for unmapped check)
            filtered_folders: Filtered folders to validate

        Returns:
            ValidationResult with all issues
        """
        self.result = ValidationResult()

        # Run all validators
        self._validate_destinations(mapping_manager)
        self._validate_mappings(mapping_manager)
        self._validate_sharepoint_limits(mapping_manager)
        self._validate_path_lengths(mapping_manager)

        if all_folders and filtered_folders:
            self._validate_unmapped_folders(mapping_manager, all_folders, filtered_folders)

        self._validate_duplicate_mappings(mapping_manager)

        logger.info(
            f"Validation complete: {self.result.error_count} errors, "
            f"{self.result.warning_count} warnings, {self.result.info_count} info"
        )

        return self.result

    def _validate_destinations(self, mapping_manager: MappingManager) -> None:
        """Validate destination configurations."""
        if not mapping_manager.destinations:
            self.result.add_issue(ValidationIssue(
                severity=ValidationSeverity.ERROR,
                category="Destinations",
                message="No SharePoint destinations configured",
                details="Add at least one destination before exporting"
            ))
            return

        for dest in mapping_manager.destinations:
            # Check URL format
            if not dest.site_url.startswith('http'):
                self.result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    category="Destinations",
                    message=f"Invalid URL format: {dest.site_url}",
                    details="SharePoint URLs must start with http:// or https://"
                ))

            # Check for trailing slashes that might cause issues
            if dest.site_url.endswith('/'):
                self.result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    category="Destinations",
                    message=f"URL has trailing slash: {dest.site_url}",
                    details="Trailing slashes may cause path issues"
                ))

            # Check library name
            if not dest.library_name:
                self.result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    category="Destinations",
                    message=f"Empty library name for {dest.site_url}",
                    details="Library name is required"
                ))

    def _validate_mappings(self, mapping_manager: MappingManager) -> None:
        """Validate individual mappings."""
        if not mapping_manager.mappings:
            self.result.add_issue(ValidationIssue(
                severity=ValidationSeverity.WARNING,
                category="Mappings",
                message="No folders mapped",
                details="Add mappings before exporting"
            ))
            return

        for source_path, mapping in mapping_manager.mappings.items():
            # Check source path exists
            if not os.path.exists(source_path):
                self.result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    category="Mappings",
                    message=f"Source path no longer exists",
                    source_path=source_path,
                    details="The folder may have been moved or deleted"
                ))

            # Check destination reference
            if mapping.destination not in mapping_manager.destinations:
                self.result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    category="Mappings",
                    message=f"Invalid destination reference",
                    source_path=source_path,
                    details="The destination for this mapping is no longer valid"
                ))

    def _validate_sharepoint_limits(self, mapping_manager: MappingManager) -> None:
        """Validate against SharePoint limits."""
        for source_path, mapping in mapping_manager.mappings.items():
            # Check file count (5000 item limit per folder view)
            if mapping.file_count > SHAREPOINT_MAX_ITEMS_PER_FOLDER:
                self.result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    category="SharePoint Limits",
                    message=f"Folder exceeds 5000 item threshold ({mapping.file_count} items)",
                    source_path=source_path,
                    details="SharePoint list views are limited to 5000 items. "
                            "Consider splitting into subfolders."
                ))

            # Check total size
            size_gb = mapping.total_size_bytes / (1024 ** 3)
            if size_gb > SHAREPOINT_MAX_FILE_SIZE_GB:
                self.result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    category="SharePoint Limits",
                    message=f"Folder size exceeds SharePoint limit ({size_gb:.2f} GB)",
                    source_path=source_path,
                    details=f"Maximum file size is {SHAREPOINT_MAX_FILE_SIZE_GB} GB"
                ))

    def _validate_path_lengths(self, mapping_manager: MappingManager) -> None:
        """Validate path lengths against limits."""
        for source_path, mapping in mapping_manager.mappings.items():
            # Check source path length (Windows limit)
            if len(source_path) > WINDOWS_MAX_PATH_LENGTH:
                self.result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    category="Path Length",
                    message=f"Source path exceeds Windows MAX_PATH ({len(source_path)} chars)",
                    source_path=source_path,
                    details="This may cause issues on Windows systems"
                ))

            # Calculate destination path length
            dest = mapping.destination
            dest_path = f"{dest.site_url}/{dest.library_name}"
            if dest.subfolder:
                dest_path += f"/{dest.subfolder}"

            # Add estimated folder name from source
            folder_name = os.path.basename(source_path)
            full_dest_path = f"{dest_path}/{folder_name}"

            if len(full_dest_path) > SHAREPOINT_MAX_PATH_LENGTH:
                self.result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    category="Path Length",
                    message=f"Destination path exceeds SharePoint limit ({len(full_dest_path)} chars)",
                    source_path=source_path,
                    details=f"SharePoint paths are limited to {SHAREPOINT_MAX_PATH_LENGTH} characters"
                ))
            elif len(full_dest_path) > SHAREPOINT_MAX_PATH_LENGTH - 50:
                self.result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    category="Path Length",
                    message=f"Destination path is close to SharePoint limit ({len(full_dest_path)} chars)",
                    source_path=source_path,
                    details="Nested subfolders may exceed the limit"
                ))

    def _validate_unmapped_folders(
        self,
        mapping_manager: MappingManager,
        all_folders: List[FolderInfo],
        filtered_folders: List[FolderInfo]
    ) -> None:
        """Check for unmapped folders."""
        mapped_paths = set(mapping_manager.mappings.keys())
        filtered_paths = {f.path for f in filtered_folders}

        unmapped = filtered_paths - mapped_paths
        unmapped_count = len(unmapped)

        if unmapped_count > 0:
            # Add info about unmapped folders
            self.result.add_issue(ValidationIssue(
                severity=ValidationSeverity.INFO,
                category="Coverage",
                message=f"{unmapped_count} folders not mapped",
                details="Some folders in the filtered set have not been assigned destinations"
            ))

            # Warn if significant percentage unmapped
            if filtered_folders:
                unmapped_pct = (unmapped_count / len(filtered_folders)) * 100
                if unmapped_pct > 50:
                    self.result.add_issue(ValidationIssue(
                        severity=ValidationSeverity.WARNING,
                        category="Coverage",
                        message=f"{unmapped_pct:.1f}% of folders are unmapped",
                        details="Consider mapping more folders before export"
                    ))

    def _validate_duplicate_mappings(self, mapping_manager: MappingManager) -> None:
        """Check for folders mapped to same destination (potential conflicts)."""
        dest_to_folders: Dict[str, List[str]] = {}

        for source_path, mapping in mapping_manager.mappings.items():
            dest_key = mapping.destination.get_full_destination()
            if dest_key not in dest_to_folders:
                dest_to_folders[dest_key] = []
            dest_to_folders[dest_key].append(source_path)

        for dest_key, folders in dest_to_folders.items():
            if len(folders) > 1:
                # Check if folder names would conflict
                folder_names = [os.path.basename(f) for f in folders]
                unique_names = set(folder_names)

                if len(unique_names) < len(folder_names):
                    # Name collision detected
                    duplicates = [n for n in folder_names if folder_names.count(n) > 1]
                    self.result.add_issue(ValidationIssue(
                        severity=ValidationSeverity.ERROR,
                        category="Conflicts",
                        message=f"Folder name collision at destination",
                        details=f"Multiple folders named '{duplicates[0]}' mapped to {dest_key}"
                    ))


def validate_mappings(
    mapping_manager: MappingManager,
    all_folders: Optional[List[FolderInfo]] = None,
    filtered_folders: Optional[List[FolderInfo]] = None
) -> ValidationResult:
    """
    Convenience function to run all validations.

    Args:
        mapping_manager: MappingManager with current mappings
        all_folders: All scanned folders
        filtered_folders: Filtered folders

    Returns:
        ValidationResult with all issues
    """
    validator = MappingValidator()
    return validator.validate_all(mapping_manager, all_folders, filtered_folders)
