"""
Project Manager Module

This module handles saving and loading project state to/from JSON files.
"""

import json
from typing import Optional, Dict, List
from datetime import datetime
from pathlib import Path
import logging

from mapping_manager import MappingManager, SharePointDestination, FolderMapping
from filter_engine import FilterConfig

logger = logging.getLogger(__name__)


class ProjectManager:
    """Manages project save/load operations."""

    PROJECT_VERSION = "1.0"

    def __init__(self):
        """Initialize the ProjectManager."""
        pass

    def save_project(
        self,
        file_path: str,
        mapping_manager: MappingManager,
        filter_config: FilterConfig,
        scan_path: Optional[str] = None,
        archive_destination: Optional[SharePointDestination] = None
    ) -> bool:
        """
        Save project to JSON file.

        Args:
            file_path: Path to save project file
            mapping_manager: MappingManager instance
            filter_config: FilterConfig instance
            scan_path: Optional scan path
            archive_destination: Optional archive destination

        Returns:
            True if successful, False otherwise
        """
        try:
            # Build project data
            project_data = {
                'version': self.PROJECT_VERSION,
                'created': datetime.now().isoformat(),
                'scan_path': scan_path,
                'destinations': [],
                'mappings': [],
                'filter_config': {},
                'archive_destination': None
            }

            # Save destinations
            for dest in mapping_manager.destinations:
                project_data['destinations'].append({
                    'site_url': dest.site_url,
                    'library_name': dest.library_name,
                    'subfolder': dest.subfolder
                })

            # Save mappings
            for mapping in mapping_manager.get_all_mappings():
                # Find destination index
                dest_index = -1
                for i, dest in enumerate(mapping_manager.destinations):
                    if dest == mapping.destination:
                        dest_index = i
                        break

                project_data['mappings'].append({
                    'source_path': mapping.source_path,
                    'destination_index': dest_index,
                    'file_count': mapping.file_count,
                    'total_size_bytes': mapping.total_size_bytes,
                    'last_modified': mapping.last_modified,
                    'notes': mapping.notes
                })

            # Save filter config
            project_data['filter_config'] = {
                'date_threshold_enabled': filter_config.date_threshold_enabled,
                'date_threshold_days': filter_config.date_threshold_days,
                'archive_old_files': filter_config.archive_old_files,
                'exclude_patterns_enabled': filter_config.exclude_patterns_enabled,
                'exclude_patterns': filter_config.exclude_patterns or [],
                'min_size_enabled': filter_config.min_size_enabled,
                'min_size_bytes': filter_config.min_size_bytes,
                'max_size_enabled': filter_config.max_size_enabled,
                'max_size_bytes': filter_config.max_size_bytes,
                'min_file_count_enabled': filter_config.min_file_count_enabled,
                'min_file_count': filter_config.min_file_count,
                'skip_empty_folders': filter_config.skip_empty_folders
            }

            # Save archive destination
            if archive_destination:
                for i, dest in enumerate(mapping_manager.destinations):
                    if dest == archive_destination:
                        project_data['archive_destination'] = i
                        break

            # Write to file
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(project_data, f, indent=2)

            logger.info(f"Saved project to {file_path}")
            return True

        except Exception as e:
            logger.error(f"Project save failed: {str(e)}")
            return False

    def load_project(
        self,
        file_path: str
    ) -> Optional[Dict]:
        """
        Load project from JSON file.

        Args:
            file_path: Path to project file

        Returns:
            Dictionary with project data or None if failed
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                project_data = json.load(f)

            # Validate version
            if project_data.get('version') != self.PROJECT_VERSION:
                logger.warning(f"Project version mismatch: {project_data.get('version')}")

            # Reconstruct destinations
            destinations = []
            for dest_data in project_data.get('destinations', []):
                dest = SharePointDestination(
                    site_url=dest_data['site_url'],
                    library_name=dest_data['library_name'],
                    subfolder=dest_data.get('subfolder')
                )
                destinations.append(dest)

            # Reconstruct mappings
            mappings = []
            for mapping_data in project_data.get('mappings', []):
                dest_index = mapping_data['destination_index']
                if 0 <= dest_index < len(destinations):
                    destination = destinations[dest_index]

                    mapping = FolderMapping(
                        source_path=mapping_data['source_path'],
                        destination=destination,
                        file_count=mapping_data.get('file_count', 0),
                        total_size_bytes=mapping_data.get('total_size_bytes', 0),
                        last_modified=mapping_data.get('last_modified'),
                        notes=mapping_data.get('notes', '')
                    )
                    mappings.append(mapping)

            # Reconstruct filter config
            filter_data = project_data.get('filter_config', {})
            filter_config = FilterConfig(
                date_threshold_enabled=filter_data.get('date_threshold_enabled', False),
                date_threshold_days=filter_data.get('date_threshold_days', 365),
                archive_old_files=filter_data.get('archive_old_files', False),
                exclude_patterns_enabled=filter_data.get('exclude_patterns_enabled', False),
                exclude_patterns=filter_data.get('exclude_patterns', []),
                min_size_enabled=filter_data.get('min_size_enabled', False),
                min_size_bytes=filter_data.get('min_size_bytes', 0),
                max_size_enabled=filter_data.get('max_size_enabled', False),
                max_size_bytes=filter_data.get('max_size_bytes', 0),
                min_file_count_enabled=filter_data.get('min_file_count_enabled', False),
                min_file_count=filter_data.get('min_file_count', 1),
                skip_empty_folders=filter_data.get('skip_empty_folders', True)
            )

            # Get archive destination
            archive_destination = None
            archive_index = project_data.get('archive_destination')
            if archive_index is not None and 0 <= archive_index < len(destinations):
                archive_destination = destinations[archive_index]

            result = {
                'scan_path': project_data.get('scan_path'),
                'destinations': destinations,
                'mappings': mappings,
                'filter_config': filter_config,
                'archive_destination': archive_destination,
                'created': project_data.get('created')
            }

            logger.info(f"Loaded project from {file_path}")
            return result

        except Exception as e:
            logger.error(f"Project load failed: {str(e)}")
            return None

    def apply_project_data(
        self,
        project_data: Dict,
        mapping_manager: MappingManager
    ) -> bool:
        """
        Apply loaded project data to mapping manager.

        Args:
            project_data: Project data dictionary
            mapping_manager: MappingManager to update

        Returns:
            True if successful, False otherwise
        """
        try:
            # Clear existing data
            mapping_manager.clear_all_mappings()
            mapping_manager.destinations.clear()

            # Add destinations
            for dest in project_data['destinations']:
                mapping_manager.destinations.append(dest)

            # Add mappings
            for mapping in project_data['mappings']:
                mapping_manager.mappings[mapping.source_path] = mapping

            logger.info(f"Applied project data: {len(mapping_manager.destinations)} destinations, {len(mapping_manager.mappings)} mappings")
            return True

        except Exception as e:
            logger.error(f"Failed to apply project data: {str(e)}")
            return False
