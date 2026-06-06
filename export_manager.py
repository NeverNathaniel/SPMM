"""
Export Manager Module

This module handles CSV export and report generation for mappings.
"""

import csv
import os
from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path
import logging
import html

from mapping_manager import FolderMapping, MappingManager
from file_scanner import FolderInfo, format_size

logger = logging.getLogger(__name__)

# Characters that trigger formula evaluation in Excel / LibreOffice / Google Sheets
# when they appear as the first character of a cell. See CWE-1236 (CSV injection).
_CSV_FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r')


def _csv_safe(value):
    """Neutralise CSV/formula-injection in a single cell value.

    If a string begins with a formula-trigger character, prefix it with a
    single quote so spreadsheet software treats it as literal text. Non-string
    values are returned unchanged.
    """
    if isinstance(value, str) and value and value[0] in _CSV_FORMULA_PREFIXES:
        return "'" + value
    return value


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
                        'SourcePath': _csv_safe(data['source_path']),
                        'DestinationSiteURL': _csv_safe(data['destination_site_url']),
                        'DestinationLibrary': _csv_safe(data['destination_library']),
                        'DestinationFolder': _csv_safe(data['destination_subfolder']),
                        'FileCount': data['file_count'],
                        'TotalSizeGB': data['total_size_gb'],
                        'LastModified': _csv_safe(data['last_modified']),
                        'Notes': _csv_safe(data['notes'])
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

    def generate_html_report(
        self,
        mapping_manager: MappingManager,
        all_folders: List[FolderInfo],
        filtered_folders: List[FolderInfo],
        archived_folders: List[FolderInfo],
        output_path: str,
        scan_path: str = ""
    ) -> bool:
        """
        Generate a professionally styled HTML executive report.

        Args:
            mapping_manager: MappingManager instance
            all_folders: All scanned folders
            filtered_folders: Filtered folders
            archived_folders: Archived folders
            output_path: Path to output HTML file
            scan_path: Root scan path

        Returns:
            True if successful, False otherwise
        """
        try:
            stats = mapping_manager.get_statistics()
            mapped_paths = set(mapping_manager.mappings.keys())
            unmapped = [f for f in filtered_folders if f.path not in mapped_paths]

            # Build source tree structure
            source_tree_html = self._build_folder_tree_html(all_folders, mapping_manager)

            # Build destination tree structure
            dest_tree_html = self._build_destination_tree_html(mapping_manager)

            # Build mapping diagram
            mapping_diagram_html = self._build_mapping_diagram_html(mapping_manager, all_folders)

            # Build mapping table
            mapping_table_html = self._build_mapping_table_html(mapping_manager, filtered_folders)

            html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SharePoint Migration Report</title>
    <style>
        :root {{
            --primary-color: #0078d4;
            --secondary-color: #106ebe;
            --success-color: #107c10;
            --warning-color: #ff8c00;
            --error-color: #d13438;
            --bg-color: #f5f5f5;
            --card-bg: #ffffff;
            --text-color: #323130;
            --border-color: #e1e1e1;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            line-height: 1.6;
            padding: 20px;
        }}

        .container {{
            max-width: 1400px;
            margin: 0 auto;
        }}

        header {{
            background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
            color: white;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}

        header h1 {{
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 10px;
        }}

        header .subtitle {{
            opacity: 0.9;
            font-size: 14px;
        }}

        .card {{
            background: var(--card-bg);
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.08);
            border: 1px solid var(--border-color);
        }}

        .card h2 {{
            font-size: 18px;
            font-weight: 600;
            color: var(--primary-color);
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 2px solid var(--border-color);
        }}

        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }}

        .stat-box {{
            background: var(--bg-color);
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border-left: 4px solid var(--primary-color);
        }}

        .stat-box.success {{
            border-left-color: var(--success-color);
        }}

        .stat-box.warning {{
            border-left-color: var(--warning-color);
        }}

        .stat-value {{
            font-size: 32px;
            font-weight: 700;
            color: var(--text-color);
        }}

        .stat-label {{
            font-size: 13px;
            color: #666;
            margin-top: 4px;
        }}

        .tree-container {{
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
            background: #fafafa;
            padding: 16px;
            border-radius: 6px;
            overflow-x: auto;
            max-height: 400px;
            overflow-y: auto;
        }}

        .tree-item {{
            padding: 2px 0;
            cursor: pointer;
            white-space: nowrap;
        }}

        .tree-item:hover {{
            background: #e8f4fc;
        }}

        .tree-item.mapped {{
            color: var(--success-color);
        }}

        .tree-item.partial {{
            color: var(--warning-color);
        }}

        .tree-item.unmapped {{
            color: #666;
        }}

        .folder-icon {{
            margin-right: 6px;
        }}

        .diagram-container {{
            display: flex;
            gap: 40px;
            align-items: flex-start;
            justify-content: center;
            flex-wrap: wrap;
            padding: 20px;
            background: #fafafa;
            border-radius: 8px;
            overflow-x: auto;
        }}

        .diagram-side {{
            flex: 1;
            min-width: 300px;
            max-width: 500px;
        }}

        .diagram-side h3 {{
            text-align: center;
            margin-bottom: 16px;
            color: var(--primary-color);
            font-size: 16px;
        }}

        .mapping-lines {{
            flex: 0 0 100px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }}

        .mapping-arrow {{
            color: var(--primary-color);
            font-size: 24px;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }}

        th {{
            background: var(--primary-color);
            color: white;
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
            position: sticky;
            top: 0;
        }}

        td {{
            padding: 10px 16px;
            border-bottom: 1px solid var(--border-color);
        }}

        tr:hover {{
            background: #f8f8f8;
        }}

        tr.unmapped {{
            background: #fff8e6;
        }}

        .status-badge {{
            display: inline-block;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
        }}

        .status-mapped {{
            background: #dff6dd;
            color: var(--success-color);
        }}

        .status-unmapped {{
            background: #fed9cc;
            color: var(--error-color);
        }}

        .table-container {{
            max-height: 500px;
            overflow-y: auto;
            border: 1px solid var(--border-color);
            border-radius: 6px;
        }}

        .dest-node {{
            background: var(--primary-color);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            margin: 4px 0;
            font-size: 12px;
        }}

        .dest-node.site {{
            background: #0078d4;
        }}

        .dest-node.library {{
            background: #106ebe;
            margin-left: 20px;
        }}

        .dest-node.folder {{
            background: #2b88d8;
            margin-left: 40px;
        }}

        .collapsible {{
            cursor: pointer;
            user-select: none;
        }}

        .collapsible::before {{
            content: '▼ ';
            font-size: 10px;
        }}

        .collapsible.collapsed::before {{
            content: '▶ ';
        }}

        .collapsible-content {{
            display: block;
        }}

        .collapsible.collapsed + .collapsible-content {{
            display: none;
        }}

        footer {{
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 12px;
        }}

        @media print {{
            body {{
                background: white;
                padding: 0;
            }}
            .card {{
                box-shadow: none;
                border: 1px solid #ddd;
                page-break-inside: avoid;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📊 SharePoint Migration Mapping Report</h1>
            <div class="subtitle">Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</div>
            {f'<div class="subtitle">Source: {html.escape(scan_path)}</div>' if scan_path else ''}
        </header>

        <!-- Overview Section -->
        <div class="card">
            <h2>📋 Executive Overview</h2>
            <div class="stats-grid">
                <div class="stat-box">
                    <div class="stat-value">{len(all_folders)}</div>
                    <div class="stat-label">Total Folders Scanned</div>
                </div>
                <div class="stat-box success">
                    <div class="stat-value">{stats['total_mappings']}</div>
                    <div class="stat-label">Folders Mapped</div>
                </div>
                <div class="stat-box warning">
                    <div class="stat-value">{len(unmapped)}</div>
                    <div class="stat-label">Folders Unmapped</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">{stats['total_destinations']}</div>
                    <div class="stat-label">Destinations</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">{stats['total_files']:,}</div>
                    <div class="stat-label">Total Files</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">{stats['total_size_gb']:.2f} GB</div>
                    <div class="stat-label">Total Size</div>
                </div>
            </div>
        </div>

        <!-- Source Folder Tree -->
        <div class="card">
            <h2>📁 Source Folder Structure</h2>
            <div class="tree-container">
{source_tree_html}
            </div>
        </div>

        <!-- Destination Structure -->
        <div class="card">
            <h2>☁️ Destination Structure</h2>
            <div class="tree-container">
{dest_tree_html}
            </div>
        </div>

        <!-- Mapping Diagram -->
        <div class="card">
            <h2>🔗 Mapping Visualization</h2>
            <div class="diagram-container">
{mapping_diagram_html}
            </div>
        </div>

        <!-- Mapping Table -->
        <div class="card">
            <h2>📊 Complete Mapping Table</h2>
            <div class="table-container">
{mapping_table_html}
            </div>
        </div>

        <footer>
            <p>Generated by SharePoint Migration Mapping Tool (SPMM)</p>
        </footer>
    </div>

    <script>
        // Interactive collapsible sections
        document.querySelectorAll('.collapsible').forEach(function(elem) {{
            elem.addEventListener('click', function() {{
                this.classList.toggle('collapsed');
            }});
        }});
    </script>
</body>
</html>'''

            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(html_content)

            logger.info(f"Generated HTML report: {output_path}")
            return True

        except Exception as e:
            logger.error(f"HTML report generation failed: {str(e)}")
            return False

    def _build_folder_tree_html(
        self,
        folders: List[FolderInfo],
        mapping_manager: MappingManager
    ) -> str:
        """Build HTML tree structure for source folders."""
        if not folders:
            return '<div class="tree-item">No folders scanned</div>'

        # Build path hierarchy
        path_to_folder = {f.path: f for f in folders}
        root_folders = [f for f in folders if not f.parent_path or f.parent_path not in path_to_folder]

        def render_folder(folder: FolderInfo, indent: int = 0) -> str:
            is_mapped = mapping_manager.is_mapped(folder.path)
            has_mapped_children = any(
                mapping_manager.is_mapped(f.path)
                for f in folders
                if f.path.startswith(folder.path + os.sep)
            )

            if is_mapped:
                status_class = 'mapped'
                icon = '📗'
            elif has_mapped_children:
                status_class = 'partial'
                icon = '📙'
            else:
                status_class = 'unmapped'
                icon = '📁'

            prefix = '│   ' * indent
            result = f'<div class="tree-item {status_class}">{prefix}{icon} {html.escape(folder.name)}</div>\n'

            # Find children
            children = [f for f in folders if f.parent_path == folder.path]
            for child in sorted(children, key=lambda x: x.name):
                result += render_folder(child, indent + 1)

            return result

        html_output = ''
        for folder in sorted(root_folders, key=lambda x: x.name):
            html_output += render_folder(folder)

        return html_output

    def _build_destination_tree_html(self, mapping_manager: MappingManager) -> str:
        """Build HTML tree structure for destinations."""
        if not mapping_manager.destinations:
            return '<div class="tree-item">No destinations configured</div>'

        # Group by site
        sites: Dict[str, Dict] = {}
        for dest in mapping_manager.destinations:
            site_url = dest.site_url
            if site_url not in sites:
                sites[site_url] = {'libraries': {}}

            lib = dest.library_name
            if lib not in sites[site_url]['libraries']:
                sites[site_url]['libraries'][lib] = {'subfolders': set()}

            if dest.subfolder:
                sites[site_url]['libraries'][lib]['subfolders'].add(dest.subfolder)

        html_output = ''
        for site_url, site_data in sorted(sites.items()):
            # Extract site name
            site_name = site_url.split('/sites/')[-1].split('/')[0] if '/sites/' in site_url else site_url
            html_output += f'<div class="dest-node site">🌐 {html.escape(site_name)}</div>\n'

            for lib_name, lib_data in sorted(site_data['libraries'].items()):
                mappings_count = len([
                    m for m in mapping_manager.mappings.values()
                    if m.destination.site_url == site_url and m.destination.library_name == lib_name
                ])
                html_output += f'<div class="dest-node library">📚 {html.escape(lib_name)} ({mappings_count} mappings)</div>\n'

                for subfolder in sorted(lib_data['subfolders']):
                    html_output += f'<div class="dest-node folder">📂 {html.escape(subfolder)}</div>\n'

        return html_output

    def _build_mapping_diagram_html(
        self,
        mapping_manager: MappingManager,
        all_folders: List[FolderInfo]
    ) -> str:
        """Build HTML mapping diagram showing source to destination links."""
        if not mapping_manager.mappings:
            return '<div style="text-align:center;color:#666;">No mappings to display</div>'

        # Group mappings by destination
        dest_groups: Dict[str, List[FolderMapping]] = {}
        for mapping in mapping_manager.mappings.values():
            dest_key = mapping.destination.get_full_destination()
            if dest_key not in dest_groups:
                dest_groups[dest_key] = []
            dest_groups[dest_key].append(mapping)

        html_output = '''
        <div class="diagram-side">
            <h3>Source Folders</h3>
'''
        # List source folders with colors matching their destination
        colors = ['#0078d4', '#107c10', '#5c2d91', '#008272', '#b4009e']
        dest_colors = {}
        for i, dest_key in enumerate(dest_groups.keys()):
            dest_colors[dest_key] = colors[i % len(colors)]

        for dest_key, mappings in dest_groups.items():
            color = dest_colors[dest_key]
            for mapping in sorted(mappings, key=lambda m: m.source_path):
                folder_name = os.path.basename(mapping.source_path) or mapping.source_path
                html_output += f'<div style="padding:6px 12px;margin:2px 0;background:{color}20;border-left:4px solid {color};border-radius:4px;font-size:12px;">{html.escape(folder_name)}</div>\n'

        html_output += '''
        </div>
        <div class="mapping-lines">
            <div class="mapping-arrow">→</div>
            <div style="font-size:11px;color:#666;">Mapped to</div>
            <div class="mapping-arrow">→</div>
        </div>
        <div class="diagram-side">
            <h3>Destinations</h3>
'''
        for dest_key, mappings in dest_groups.items():
            color = dest_colors[dest_key]
            count = len(mappings)
            # Shorten display
            parts = dest_key.split('/')
            short_dest = '/'.join(parts[-3:]) if len(parts) > 3 else dest_key
            html_output += f'<div style="padding:8px 12px;margin:4px 0;background:{color};color:white;border-radius:4px;font-size:12px;">{html.escape(short_dest)}<br><small>{count} folder(s)</small></div>\n'

        html_output += '</div>'
        return html_output

    def _build_mapping_table_html(
        self,
        mapping_manager: MappingManager,
        filtered_folders: List[FolderInfo]
    ) -> str:
        """Build HTML table of all folders and their mappings."""
        html_output = '''<table>
            <thead>
                <tr>
                    <th>Source Folder</th>
                    <th>Status</th>
                    <th>Destination</th>
                    <th>Files</th>
                    <th>Size</th>
                </tr>
            </thead>
            <tbody>
'''
        for folder in sorted(filtered_folders, key=lambda f: f.path):
            mapping = mapping_manager.get_mapping(folder.path)
            if mapping:
                status = '<span class="status-badge status-mapped">Mapped</span>'
                dest = html.escape(mapping.destination.get_full_destination())
                row_class = ''
            else:
                status = '<span class="status-badge status-unmapped">Unmapped</span>'
                dest = '—'
                row_class = ' class="unmapped"'

            html_output += f'''                <tr{row_class}>
                    <td title="{html.escape(folder.path)}">{html.escape(folder.name)}</td>
                    <td>{status}</td>
                    <td>{dest}</td>
                    <td>{folder.file_count:,}</td>
                    <td>{format_size(folder.total_size)}</td>
                </tr>
'''

        html_output += '''            </tbody>
        </table>'''
        return html_output
