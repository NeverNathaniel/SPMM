"""
Export Manager Module

This module handles CSV export and report generation for mappings.
"""

import csv
from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path
import logging

from mapping_manager import FolderMapping, MappingManager
from file_scanner import FolderInfo, format_size

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ExportManager:
    """Manages export of mappings to CSV and report generation."""

    def __init__(self):
        """Initialize the ExportManager."""
        pass

    def export_to_csv(
        self,
        mappings: List[FolderMapping],
        output_path: str
    ) -> bool:
        """
        Export mappings to CSV file.

        Args:
            mappings: List of FolderMapping objects
            output_path: Path to output CSV file

        Returns:
            True if successful, False otherwise
        """
        try:
            # Define CSV headers
            headers = [
                'SourcePath',
                'DestinationSiteURL',
                'DestinationLibrary',
                'DestinationFolder',
                'FileCount',
                'TotalSizeGB',
                'LastModified',
                'Notes'
            ]

            with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=headers)
                writer.writeheader()

                for mapping in mappings:
                    data = mapping.to_dict()
                    row = {
                        'SourcePath': data['source_path'],
                        'DestinationSiteURL': data['destination_site_url'],
                        'DestinationLibrary': data['destination_library'],
                        'DestinationFolder': data['destination_subfolder'],
                        'FileCount': data['file_count'],
                        'TotalSizeGB': data['total_size_gb'],
                        'LastModified': data['last_modified'],
                        'Notes': data['notes']
                    }
                    writer.writerow(row)

            logger.info(f"Exported {len(mappings)} mappings to {output_path}")
            return True

        except Exception as e:
            logger.error(f"Export failed: {str(e)}")
            return False

    def generate_summary_report(
        self,
        mapping_manager: MappingManager,
        all_folders: List[FolderInfo],
        filtered_folders: List[FolderInfo],
        archived_folders: List[FolderInfo],
        output_path: str
    ) -> bool:
        """
        Generate a summary report.

        Args:
            mapping_manager: MappingManager instance
            all_folders: All scanned folders
            filtered_folders: Filtered folders
            archived_folders: Archived folders
            output_path: Path to output report file

        Returns:
            True if successful, False otherwise
        """
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                # Header
                f.write("=" * 80 + "\n")
                f.write("File Share to SharePoint Migration Mapping Report\n")
                f.write("=" * 80 + "\n")
                f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write("\n")

                # Scan Statistics
                f.write("SCAN STATISTICS\n")
                f.write("-" * 80 + "\n")
                f.write(f"Total folders scanned: {len(all_folders)}\n")
                f.write(f"Filtered folders: {len(filtered_folders)}\n")
                f.write(f"Archived folders: {len(archived_folders)}\n")
                f.write(f"Excluded folders: {len(all_folders) - len(filtered_folders) - len(archived_folders)}\n")
                f.write("\n")

                # Mapping Statistics
                stats = mapping_manager.get_statistics()
                f.write("MAPPING STATISTICS\n")
                f.write("-" * 80 + "\n")
                f.write(f"Total mappings: {stats['total_mappings']}\n")
                f.write(f"Total destinations: {stats['total_destinations']}\n")
                f.write(f"Total files to migrate: {stats['total_files']:,}\n")
                f.write(f"Total size to migrate: {stats['total_size_gb']:.2f} GB\n")
                f.write("\n")

                # Unmapped folders
                mapped_paths = set(mapping_manager.mappings.keys())
                unmapped = [
                    f for f in filtered_folders
                    if f.path not in mapped_paths
                ]

                f.write("UNMAPPED FOLDERS\n")
                f.write("-" * 80 + "\n")
                if unmapped:
                    f.write(f"Count: {len(unmapped)}\n\n")
                    for folder in unmapped[:20]:  # Show first 20
                        f.write(f"  {folder.path}\n")
                        f.write(f"    Files: {folder.file_count}, Size: {format_size(folder.total_size)}\n")
                    if len(unmapped) > 20:
                        f.write(f"\n  ... and {len(unmapped) - 20} more\n")
                else:
                    f.write("All filtered folders are mapped!\n")
                f.write("\n")

                # Destinations breakdown
                f.write("DESTINATIONS BREAKDOWN\n")
                f.write("-" * 80 + "\n")
                for dest in mapping_manager.destinations:
                    dest_mappings = mapping_manager.get_mappings_for_destination(dest)
                    total_files = sum(m.file_count for m in dest_mappings)
                    total_size = sum(m.total_size_bytes for m in dest_mappings)

                    f.write(f"\n{dest.get_full_destination()}\n")
                    f.write(f"  Mappings: {len(dest_mappings)}\n")
                    f.write(f"  Files: {total_files:,}\n")
                    f.write(f"  Size: {format_size(total_size)} ({total_size / (1024**3):.2f} GB)\n")
                f.write("\n")

                # Archive candidates (if any)
                if archived_folders:
                    f.write("ARCHIVED FOLDERS\n")
                    f.write("-" * 80 + "\n")
                    f.write(f"Count: {len(archived_folders)}\n\n")

                    total_archive_size = sum(f.total_size for f in archived_folders)
                    total_archive_files = sum(f.file_count for f in archived_folders)

                    f.write(f"Total files in archive: {total_archive_files:,}\n")
                    f.write(f"Total size in archive: {format_size(total_archive_size)} ({total_archive_size / (1024**3):.2f} GB)\n\n")

                    for folder in archived_folders[:20]:  # Show first 20
                        f.write(f"  {folder.path}\n")
                        f.write(f"    Modified: {folder.last_modified.strftime('%Y-%m-%d')}\n")
                    if len(archived_folders) > 20:
                        f.write(f"\n  ... and {len(archived_folders) - 20} more\n")
                    f.write("\n")

                # Validation warnings
                issues = mapping_manager.validate_mappings()
                if issues:
                    f.write("VALIDATION WARNINGS\n")
                    f.write("-" * 80 + "\n")
                    for issue in issues:
                        f.write(f"  ⚠ {issue}\n")
                    f.write("\n")

                # Footer
                f.write("=" * 80 + "\n")
                f.write("End of Report\n")
                f.write("=" * 80 + "\n")

            logger.info(f"Generated summary report: {output_path}")
            return True

        except Exception as e:
            logger.error(f"Report generation failed: {str(e)}")
            return False

    def generate_unmapped_list(
        self,
        all_folders: List[FolderInfo],
        mapping_manager: MappingManager,
        output_path: str
    ) -> bool:
        """
        Generate a list of unmapped folders.

        Args:
            all_folders: All folders to check
            mapping_manager: MappingManager instance
            output_path: Path to output file

        Returns:
            True if successful, False otherwise
        """
        try:
            mapped_paths = set(mapping_manager.mappings.keys())
            unmapped = [f for f in all_folders if f.path not in mapped_paths]

            with open(output_path, 'w', encoding='utf-8') as f:
                f.write("Unmapped Folders\n")
                f.write("=" * 80 + "\n")
                f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"Total unmapped: {len(unmapped)}\n\n")

                for folder in unmapped:
                    f.write(f"{folder.path}\n")
                    f.write(f"  Files: {folder.file_count}, Size: {format_size(folder.total_size)}\n")
                    f.write(f"  Modified: {folder.last_modified.strftime('%Y-%m-%d %H:%M:%S')}\n")
                    f.write("\n")

            logger.info(f"Generated unmapped list: {output_path}")
            return True

        except Exception as e:
            logger.error(f"Unmapped list generation failed: {str(e)}")
            return False

    def export_csv_template(self, output_path: str) -> bool:
        """
        Export a CSV template file.

        Args:
            output_path: Path to output template file

        Returns:
            True if successful, False otherwise
        """
        try:
            headers = [
                'SourcePath',
                'DestinationSiteURL',
                'DestinationLibrary',
                'DestinationFolder',
                'FileCount',
                'TotalSizeGB',
                'LastModified',
                'Notes'
            ]

            with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(headers)

                # Add example row
                writer.writerow([
                    'C:\\FileShare\\Department\\Finance',
                    'https://contoso.sharepoint.com/sites/Finance',
                    'Documents',
                    'Reports/FY2024',
                    '150',
                    '2.5',
                    '2024-01-15 10:30:00',
                    'Finance department files'
                ])

            logger.info(f"Generated CSV template: {output_path}")
            return True

        except Exception as e:
            logger.error(f"Template generation failed: {str(e)}")
            return False
