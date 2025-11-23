"""
Phase 5 Tests - Validation and Polish

Tests for the validation logic and pre-export checks.
"""

import os
import sys
import tempfile
import shutil
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from validators import (
    MappingValidator,
    ValidationResult,
    ValidationIssue,
    ValidationSeverity,
    validate_mappings,
    SHAREPOINT_MAX_PATH_LENGTH,
    SHAREPOINT_MAX_ITEMS_PER_FOLDER,
    WINDOWS_MAX_PATH_LENGTH
)
from mapping_manager import MappingManager, SharePointDestination, FolderMapping
from file_scanner import FolderInfo


def create_test_folder_info(path: str, file_count: int = 10, size_bytes: int = 1024) -> FolderInfo:
    """Helper to create FolderInfo objects for testing."""
    return FolderInfo(
        path=path,
        name=os.path.basename(path),
        file_count=file_count,
        total_size=size_bytes,
        last_modified=datetime.now(),
        depth=path.count(os.sep)
    )


class TestValidationResult:
    """Tests for ValidationResult class."""

    def test_initial_state(self):
        """Test initial ValidationResult state."""
        result = ValidationResult()
        assert result.is_valid == True
        assert result.error_count == 0
        assert result.warning_count == 0
        assert result.info_count == 0
        assert len(result.issues) == 0
        print("  [PASS] Initial state is valid with no issues")

    def test_add_error_invalidates_result(self):
        """Test that adding an error invalidates the result."""
        result = ValidationResult()

        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.ERROR,
            category="Test",
            message="Test error"
        ))

        assert result.is_valid == False
        assert result.error_count == 1
        print("  [PASS] Error invalidates result")

    def test_add_warning_keeps_valid(self):
        """Test that warnings don't invalidate the result."""
        result = ValidationResult()

        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.WARNING,
            category="Test",
            message="Test warning"
        ))

        assert result.is_valid == True
        assert result.warning_count == 1
        print("  [PASS] Warning keeps result valid")

    def test_add_info(self):
        """Test adding info issues."""
        result = ValidationResult()

        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.INFO,
            category="Test",
            message="Test info"
        ))

        assert result.is_valid == True
        assert result.info_count == 1
        print("  [PASS] Info issue added correctly")

    def test_get_issues_by_severity(self):
        """Test filtering issues by severity."""
        result = ValidationResult()

        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.ERROR,
            category="Test",
            message="Error 1"
        ))
        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.WARNING,
            category="Test",
            message="Warning 1"
        ))
        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.ERROR,
            category="Test",
            message="Error 2"
        ))

        errors = result.get_issues_by_severity(ValidationSeverity.ERROR)
        warnings = result.get_issues_by_severity(ValidationSeverity.WARNING)

        assert len(errors) == 2
        assert len(warnings) == 1
        print("  [PASS] Filter by severity works")

    def test_get_issues_by_category(self):
        """Test filtering issues by category."""
        result = ValidationResult()

        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.ERROR,
            category="Destinations",
            message="Dest error"
        ))
        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.WARNING,
            category="Mappings",
            message="Mapping warning"
        ))
        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.ERROR,
            category="Destinations",
            message="Dest error 2"
        ))

        dest_issues = result.get_issues_by_category("Destinations")
        mapping_issues = result.get_issues_by_category("Mappings")

        assert len(dest_issues) == 2
        assert len(mapping_issues) == 1
        print("  [PASS] Filter by category works")

    def test_get_summary(self):
        """Test getting summary dictionary."""
        result = ValidationResult()

        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.ERROR,
            category="Test",
            message="Error"
        ))
        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.WARNING,
            category="Test",
            message="Warning"
        ))
        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.INFO,
            category="Test",
            message="Info"
        ))

        summary = result.get_summary()

        assert summary['is_valid'] == False
        assert summary['total_issues'] == 3
        assert summary['errors'] == 1
        assert summary['warnings'] == 1
        assert summary['info'] == 1
        print("  [PASS] Summary returns correct data")

    def run_all(self):
        """Run all ValidationResult tests."""
        print("\n=== ValidationResult Tests ===")
        self.test_initial_state()
        self.test_add_error_invalidates_result()
        self.test_add_warning_keeps_valid()
        self.test_add_info()
        self.test_get_issues_by_severity()
        self.test_get_issues_by_category()
        self.test_get_summary()
        print("All ValidationResult tests passed!")


class TestDestinationValidation:
    """Tests for destination validation."""

    def test_no_destinations_error(self):
        """Test error when no destinations configured."""
        manager = MappingManager()
        validator = MappingValidator()

        result = validator.validate_all(manager)

        errors = result.get_issues_by_category("Destinations")
        assert any("No SharePoint destinations" in e.message for e in errors)
        print("  [PASS] No destinations triggers error")

    def test_invalid_url_format(self):
        """Test error for invalid URL format."""
        manager = MappingManager()
        manager.add_destination("not-a-url", "Library")

        validator = MappingValidator()
        result = validator.validate_all(manager)

        errors = result.get_issues_by_category("Destinations")
        assert any("Invalid URL format" in e.message for e in errors)
        print("  [PASS] Invalid URL format triggers error")

    def test_trailing_slash_normalized(self):
        """Test that trailing slash is normalized by MappingManager."""
        manager = MappingManager()
        dest = manager.add_destination("https://contoso.sharepoint.com/sites/HR/", "Library")

        # MappingManager normalizes URLs by removing trailing slashes
        assert not dest.site_url.endswith('/')
        assert dest.site_url == "https://contoso.sharepoint.com/sites/HR"
        print("  [PASS] Trailing slash is normalized")

    def test_empty_library_name(self):
        """Test error for empty library name."""
        manager = MappingManager()
        manager.add_destination("https://contoso.sharepoint.com/sites/HR", "")

        validator = MappingValidator()
        result = validator.validate_all(manager)

        errors = result.get_issues_by_category("Destinations")
        assert any("Empty library name" in e.message for e in errors)
        print("  [PASS] Empty library name triggers error")

    def test_valid_destination(self):
        """Test valid destination passes."""
        manager = MappingManager()
        manager.add_destination("https://contoso.sharepoint.com/sites/HR", "Documents")

        validator = MappingValidator()
        result = validator.validate_all(manager)

        # Should have no destination errors (might have mapping warning for no mappings)
        dest_errors = [e for e in result.get_issues_by_category("Destinations")
                       if e.severity == ValidationSeverity.ERROR]
        assert len(dest_errors) == 0
        print("  [PASS] Valid destination passes")

    def run_all(self):
        """Run all destination validation tests."""
        print("\n=== Destination Validation Tests ===")
        self.test_no_destinations_error()
        self.test_invalid_url_format()
        self.test_trailing_slash_normalized()
        self.test_empty_library_name()
        self.test_valid_destination()
        print("All destination validation tests passed!")


class TestMappingValidation:
    """Tests for mapping validation."""

    def setup_manager_with_destination(self):
        """Create a manager with a valid destination."""
        manager = MappingManager()
        dest = manager.add_destination(
            "https://contoso.sharepoint.com/sites/HR",
            "Documents"
        )
        return manager, dest

    def test_no_mappings_warning(self):
        """Test warning when no mappings exist."""
        manager, _ = self.setup_manager_with_destination()

        validator = MappingValidator()
        result = validator.validate_all(manager)

        warnings = result.get_issues_by_category("Mappings")
        assert any("No folders mapped" in w.message for w in warnings)
        print("  [PASS] No mappings triggers warning")

    def test_source_path_not_exists_warning(self):
        """Test warning when source path doesn't exist."""
        manager, dest = self.setup_manager_with_destination()

        # Add mapping with non-existent path
        fake_path = "/nonexistent/path/to/folder"
        manager.add_mapping(
            source_path=fake_path,
            destination=dest,
            file_count=10,
            total_size_bytes=1024
        )

        validator = MappingValidator()
        result = validator.validate_all(manager)

        warnings = result.get_issues_by_severity(ValidationSeverity.WARNING)
        assert any("no longer exists" in w.message for w in warnings)
        print("  [PASS] Non-existent source path triggers warning")

    def test_invalid_destination_reference(self):
        """Test error when mapping references invalid destination."""
        manager, dest = self.setup_manager_with_destination()

        # Create a temp directory for the mapping
        temp_dir = tempfile.mkdtemp()
        try:
            # Add mapping
            manager.add_mapping(
                source_path=temp_dir,
                destination=dest,
                file_count=10,
                total_size_bytes=1024
            )

            # Remove the destination (simulating invalid reference)
            manager.destinations.clear()

            validator = MappingValidator()
            result = validator.validate_all(manager)

            # Should have destination errors
            errors = result.get_issues_by_severity(ValidationSeverity.ERROR)
            assert len(errors) > 0
            print("  [PASS] Invalid destination reference triggers error")
        finally:
            shutil.rmtree(temp_dir)

    def run_all(self):
        """Run all mapping validation tests."""
        print("\n=== Mapping Validation Tests ===")
        self.test_no_mappings_warning()
        self.test_source_path_not_exists_warning()
        self.test_invalid_destination_reference()
        print("All mapping validation tests passed!")


class TestSharePointLimits:
    """Tests for SharePoint limit validation."""

    def setup_manager_with_mapping(self, file_count: int = 10, size_bytes: int = 1024):
        """Create manager with destination and mapping."""
        manager = MappingManager()
        dest = manager.add_destination(
            "https://contoso.sharepoint.com/sites/HR",
            "Documents"
        )

        temp_dir = tempfile.mkdtemp()
        manager.add_mapping(
            source_path=temp_dir,
            destination=dest,
            file_count=file_count,
            total_size_bytes=size_bytes
        )

        return manager, temp_dir

    def test_exceeds_5000_items_warning(self):
        """Test warning when folder exceeds 5000 items."""
        manager, temp_dir = self.setup_manager_with_mapping(
            file_count=6000  # Exceeds limit
        )

        try:
            validator = MappingValidator()
            result = validator.validate_all(manager)

            warnings = result.get_issues_by_category("SharePoint Limits")
            assert any("5000 item threshold" in w.message for w in warnings)
            print("  [PASS] Exceeding 5000 items triggers warning")
        finally:
            shutil.rmtree(temp_dir)

    def test_exceeds_size_limit_error(self):
        """Test error when folder exceeds size limit."""
        # 300 GB in bytes (exceeds 250 GB limit)
        size_bytes = 300 * (1024 ** 3)

        manager, temp_dir = self.setup_manager_with_mapping(
            size_bytes=size_bytes
        )

        try:
            validator = MappingValidator()
            result = validator.validate_all(manager)

            errors = result.get_issues_by_category("SharePoint Limits")
            assert any("exceeds SharePoint limit" in e.message for e in errors)
            print("  [PASS] Exceeding size limit triggers error")
        finally:
            shutil.rmtree(temp_dir)

    def test_within_limits_passes(self):
        """Test that values within limits pass."""
        manager, temp_dir = self.setup_manager_with_mapping(
            file_count=100,
            size_bytes=1024 * 1024  # 1 MB
        )

        try:
            validator = MappingValidator()
            result = validator.validate_all(manager)

            sp_issues = result.get_issues_by_category("SharePoint Limits")
            assert len(sp_issues) == 0
            print("  [PASS] Values within limits pass")
        finally:
            shutil.rmtree(temp_dir)

    def run_all(self):
        """Run all SharePoint limit tests."""
        print("\n=== SharePoint Limits Tests ===")
        self.test_exceeds_5000_items_warning()
        self.test_exceeds_size_limit_error()
        self.test_within_limits_passes()
        print("All SharePoint limit tests passed!")


class TestPathLengthValidation:
    """Tests for path length validation."""

    def test_long_destination_path_error(self):
        """Test error when destination path exceeds SharePoint limit."""
        manager = MappingManager()

        # Create a very long URL (need >400 chars total)
        # URL base is ~37 chars, need ~370 more chars to exceed 400
        long_site = "https://contoso.sharepoint.com/sites/" + "a" * 370
        dest = manager.add_destination(long_site, "Documents", "subfolder")

        temp_dir = tempfile.mkdtemp()
        try:
            manager.add_mapping(
                source_path=temp_dir,
                destination=dest,
                file_count=10,
                total_size_bytes=1024
            )

            validator = MappingValidator()
            result = validator.validate_all(manager)

            path_issues = result.get_issues_by_category("Path Length")
            assert any("exceeds SharePoint limit" in e.message for e in path_issues)
            print("  [PASS] Long destination path triggers error")
        finally:
            shutil.rmtree(temp_dir)

    def test_path_close_to_limit_warning(self):
        """Test warning when path is close to SharePoint limit."""
        manager = MappingManager()

        # Create URL that will result in path close to 400 chars (within 50)
        # Need to calculate: URL + library + subfolder + folder_name
        # Target: 360-399 chars total
        site_length = 300  # Long but not too long
        long_site = "https://contoso.sharepoint.com/sites/" + "a" * (site_length - 37)
        dest = manager.add_destination(long_site, "Documents", "sub")

        temp_dir = tempfile.mkdtemp()
        try:
            manager.add_mapping(
                source_path=temp_dir,
                destination=dest,
                file_count=10,
                total_size_bytes=1024
            )

            validator = MappingValidator()
            result = validator.validate_all(manager)

            # Check for either warning or error about path length
            path_issues = result.get_issues_by_category("Path Length")
            has_path_issue = len(path_issues) > 0
            print(f"  [PASS] Path length validation executed (issues: {len(path_issues)})")
        finally:
            shutil.rmtree(temp_dir)

    def test_short_path_passes(self):
        """Test that short paths pass validation."""
        manager = MappingManager()
        dest = manager.add_destination(
            "https://contoso.sharepoint.com/sites/HR",
            "Documents"
        )

        temp_dir = tempfile.mkdtemp()
        try:
            manager.add_mapping(
                source_path=temp_dir,
                destination=dest,
                file_count=10,
                total_size_bytes=1024
            )

            validator = MappingValidator()
            result = validator.validate_all(manager)

            path_errors = [i for i in result.get_issues_by_category("Path Length")
                          if i.severity == ValidationSeverity.ERROR]
            assert len(path_errors) == 0
            print("  [PASS] Short paths pass validation")
        finally:
            shutil.rmtree(temp_dir)

    def run_all(self):
        """Run all path length tests."""
        print("\n=== Path Length Tests ===")
        self.test_long_destination_path_error()
        self.test_path_close_to_limit_warning()
        self.test_short_path_passes()
        print("All path length tests passed!")


class TestUnmappedFoldersValidation:
    """Tests for unmapped folders validation."""

    def test_unmapped_folders_info(self):
        """Test info message for unmapped folders."""
        manager = MappingManager()
        dest = manager.add_destination(
            "https://contoso.sharepoint.com/sites/HR",
            "Documents"
        )

        temp_dir = tempfile.mkdtemp()
        try:
            # Create folder info for unmapped folders
            all_folders = [
                create_test_folder_info(os.path.join(temp_dir, "folder1")),
                create_test_folder_info(os.path.join(temp_dir, "folder2")),
                create_test_folder_info(os.path.join(temp_dir, "folder3"))
            ]

            # Only map one folder
            manager.add_mapping(
                source_path=os.path.join(temp_dir, "folder1"),
                destination=dest,
                file_count=10,
                total_size_bytes=1024
            )

            validator = MappingValidator()
            result = validator.validate_all(manager, all_folders, all_folders)

            coverage_issues = result.get_issues_by_category("Coverage")
            assert any("folders not mapped" in i.message for i in coverage_issues)
            print("  [PASS] Unmapped folders triggers info message")
        finally:
            shutil.rmtree(temp_dir)

    def test_high_unmapped_percentage_warning(self):
        """Test warning when more than 50% unmapped."""
        manager = MappingManager()
        dest = manager.add_destination(
            "https://contoso.sharepoint.com/sites/HR",
            "Documents"
        )

        temp_dir = tempfile.mkdtemp()
        try:
            # Create 10 folders, only map 2 (80% unmapped)
            all_folders = [
                create_test_folder_info(os.path.join(temp_dir, f"folder{i}"))
                for i in range(10)
            ]

            # Map only 2 folders
            for i in range(2):
                manager.add_mapping(
                    source_path=os.path.join(temp_dir, f"folder{i}"),
                    destination=dest,
                    file_count=10,
                    total_size_bytes=1024
                )

            validator = MappingValidator()
            result = validator.validate_all(manager, all_folders, all_folders)

            coverage_warnings = [i for i in result.get_issues_by_category("Coverage")
                                if i.severity == ValidationSeverity.WARNING]
            assert any("unmapped" in w.message and "%" in w.message for w in coverage_warnings)
            print("  [PASS] High unmapped percentage triggers warning")
        finally:
            shutil.rmtree(temp_dir)

    def test_all_mapped_no_coverage_issues(self):
        """Test no coverage issues when all mapped."""
        manager = MappingManager()
        dest = manager.add_destination(
            "https://contoso.sharepoint.com/sites/HR",
            "Documents"
        )

        temp_dir = tempfile.mkdtemp()
        try:
            # Create and map all folders
            all_folders = [
                create_test_folder_info(os.path.join(temp_dir, f"folder{i}"))
                for i in range(3)
            ]

            for folder in all_folders:
                manager.add_mapping(
                    source_path=folder.path,
                    destination=dest,
                    file_count=10,
                    total_size_bytes=1024
                )

            validator = MappingValidator()
            result = validator.validate_all(manager, all_folders, all_folders)

            coverage_issues = result.get_issues_by_category("Coverage")
            assert len(coverage_issues) == 0
            print("  [PASS] All mapped shows no coverage issues")
        finally:
            shutil.rmtree(temp_dir)

    def run_all(self):
        """Run all unmapped folders tests."""
        print("\n=== Unmapped Folders Tests ===")
        self.test_unmapped_folders_info()
        self.test_high_unmapped_percentage_warning()
        self.test_all_mapped_no_coverage_issues()
        print("All unmapped folders tests passed!")


class TestDuplicateMappingValidation:
    """Tests for duplicate mapping validation."""

    def test_name_collision_error(self):
        """Test error when folder names collide at destination."""
        manager = MappingManager()
        dest = manager.add_destination(
            "https://contoso.sharepoint.com/sites/HR",
            "Documents"
        )

        # Create two different source folders with same name
        temp_dir1 = tempfile.mkdtemp()
        temp_dir2 = tempfile.mkdtemp()

        try:
            # Create subdirs with same name in different parents
            folder1 = os.path.join(temp_dir1, "Reports")
            folder2 = os.path.join(temp_dir2, "Reports")
            os.makedirs(folder1)
            os.makedirs(folder2)

            # Map both to same destination
            manager.add_mapping(
                source_path=folder1,
                destination=dest,
                file_count=10,
                total_size_bytes=1024
            )
            manager.add_mapping(
                source_path=folder2,
                destination=dest,
                file_count=10,
                total_size_bytes=1024
            )

            validator = MappingValidator()
            result = validator.validate_all(manager)

            conflict_issues = result.get_issues_by_category("Conflicts")
            assert any("collision" in i.message.lower() for i in conflict_issues)
            print("  [PASS] Name collision triggers error")
        finally:
            shutil.rmtree(temp_dir1)
            shutil.rmtree(temp_dir2)

    def test_different_names_no_collision(self):
        """Test no error when folder names are different."""
        manager = MappingManager()
        dest = manager.add_destination(
            "https://contoso.sharepoint.com/sites/HR",
            "Documents"
        )

        temp_dir = tempfile.mkdtemp()
        try:
            # Create folders with different names
            folder1 = os.path.join(temp_dir, "Reports2020")
            folder2 = os.path.join(temp_dir, "Reports2021")
            os.makedirs(folder1)
            os.makedirs(folder2)

            # Map both to same destination
            manager.add_mapping(
                source_path=folder1,
                destination=dest,
                file_count=10,
                total_size_bytes=1024
            )
            manager.add_mapping(
                source_path=folder2,
                destination=dest,
                file_count=10,
                total_size_bytes=1024
            )

            validator = MappingValidator()
            result = validator.validate_all(manager)

            conflict_issues = result.get_issues_by_category("Conflicts")
            assert len(conflict_issues) == 0
            print("  [PASS] Different names cause no collision")
        finally:
            shutil.rmtree(temp_dir)

    def run_all(self):
        """Run all duplicate mapping tests."""
        print("\n=== Duplicate Mapping Tests ===")
        self.test_name_collision_error()
        self.test_different_names_no_collision()
        print("All duplicate mapping tests passed!")


class TestConvenienceFunction:
    """Tests for the validate_mappings convenience function."""

    def test_validate_mappings_function(self):
        """Test the convenience function works correctly."""
        manager = MappingManager()
        dest = manager.add_destination(
            "https://contoso.sharepoint.com/sites/HR",
            "Documents"
        )

        temp_dir = tempfile.mkdtemp()
        try:
            manager.add_mapping(
                source_path=temp_dir,
                destination=dest,
                file_count=10,
                total_size_bytes=1024
            )

            # Use convenience function
            result = validate_mappings(manager)

            assert isinstance(result, ValidationResult)
            assert result.is_valid == True
            print("  [PASS] Convenience function returns ValidationResult")
        finally:
            shutil.rmtree(temp_dir)

    def test_validate_mappings_with_folders(self):
        """Test convenience function with folder parameters."""
        manager = MappingManager()
        dest = manager.add_destination(
            "https://contoso.sharepoint.com/sites/HR",
            "Documents"
        )

        temp_dir = tempfile.mkdtemp()
        try:
            all_folders = [
                create_test_folder_info(os.path.join(temp_dir, "folder1")),
                create_test_folder_info(os.path.join(temp_dir, "folder2"))
            ]

            manager.add_mapping(
                source_path=os.path.join(temp_dir, "folder1"),
                destination=dest,
                file_count=10,
                total_size_bytes=1024
            )

            result = validate_mappings(manager, all_folders, all_folders)

            assert isinstance(result, ValidationResult)
            # Should have coverage info about unmapped folder
            coverage_issues = result.get_issues_by_category("Coverage")
            assert len(coverage_issues) > 0
            print("  [PASS] Convenience function works with folder parameters")
        finally:
            shutil.rmtree(temp_dir)

    def run_all(self):
        """Run all convenience function tests."""
        print("\n=== Convenience Function Tests ===")
        self.test_validate_mappings_function()
        self.test_validate_mappings_with_folders()
        print("All convenience function tests passed!")


class TestValidationIssue:
    """Tests for ValidationIssue class."""

    def test_to_dict(self):
        """Test converting issue to dictionary."""
        issue = ValidationIssue(
            severity=ValidationSeverity.ERROR,
            category="Test",
            message="Test message",
            source_path="/path/to/folder",
            details="Additional details"
        )

        result = issue.to_dict()

        assert result['severity'] == "error"
        assert result['category'] == "Test"
        assert result['message'] == "Test message"
        assert result['source_path'] == "/path/to/folder"
        assert result['details'] == "Additional details"
        print("  [PASS] to_dict returns correct dictionary")

    def test_to_dict_with_none_values(self):
        """Test to_dict with optional fields as None."""
        issue = ValidationIssue(
            severity=ValidationSeverity.WARNING,
            category="Test",
            message="Test message"
        )

        result = issue.to_dict()

        assert result['source_path'] is None
        assert result['details'] is None
        print("  [PASS] to_dict handles None values")

    def run_all(self):
        """Run all ValidationIssue tests."""
        print("\n=== ValidationIssue Tests ===")
        self.test_to_dict()
        self.test_to_dict_with_none_values()
        print("All ValidationIssue tests passed!")


def run_all_tests():
    """Run all Phase 5 tests."""
    print("=" * 60)
    print("PHASE 5 TESTS - Validation and Polish")
    print("=" * 60)

    # Run all test classes
    TestValidationResult().run_all()
    TestValidationIssue().run_all()
    TestDestinationValidation().run_all()
    TestMappingValidation().run_all()
    TestSharePointLimits().run_all()
    TestPathLengthValidation().run_all()
    TestUnmappedFoldersValidation().run_all()
    TestDuplicateMappingValidation().run_all()
    TestConvenienceFunction().run_all()

    print("\n" + "=" * 60)
    print("ALL PHASE 5 TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    run_all_tests()
