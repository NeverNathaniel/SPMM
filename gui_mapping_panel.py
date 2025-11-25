"""
GUI Mapping Panel Module

This module provides the UI components for displaying and managing
folder-to-SharePoint mappings in a hierarchical tree format.
"""

import tkinter as tk
from tkinter import ttk, messagebox
from typing import List, Optional, Callable, Dict
from mapping_manager import FolderMapping, SharePointDestination
from file_scanner import format_size
import os


class MappingPanel(ttk.Frame):
    """Panel for displaying current mappings in a tree format: Site → Library → Folder."""

    def __init__(self, parent, on_delete_callback: Optional[Callable] = None,
                 on_select_callback: Optional[Callable] = None):
        """
        Initialize the mapping panel.

        Args:
            parent: Parent widget
            on_delete_callback: Callback when mapping is deleted
            on_select_callback: Callback when a mapping is selected (source_path)
        """
        super().__init__(parent)
        self.on_delete_callback = on_delete_callback
        self.on_select_callback = on_select_callback
        self.mappings: List[FolderMapping] = []
        self.item_to_mapping: Dict[str, FolderMapping] = {}  # Tree item ID to mapping
        self.source_path_to_item: Dict[str, str] = {}  # Source path to tree item ID

        self._create_widgets()

    def _create_widgets(self) -> None:
        """Create panel widgets."""
        # Title
        title_frame = ttk.Frame(self)
        title_frame.pack(side=tk.TOP, fill=tk.X, pady=(5, 5))

        ttk.Label(
            title_frame,
            text="Current Mappings",
            font=('Segoe UI', 10, 'bold')
        ).pack(side=tk.LEFT)

        self.count_label = ttk.Label(
            title_frame,
            text="(0 mappings)",
            foreground='gray'
        )
        self.count_label.pack(side=tk.LEFT, padx=(5, 0))

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(side=tk.TOP, fill=tk.X, pady=(0, 5))

        ttk.Button(
            toolbar,
            text="Delete Selected",
            command=self._delete_selected
        ).pack(side=tk.LEFT, padx=2)

        ttk.Button(
            toolbar,
            text="Clear All",
            command=self._clear_all
        ).pack(side=tk.LEFT, padx=2)

        ttk.Button(
            toolbar,
            text="Expand All",
            command=self._expand_all
        ).pack(side=tk.LEFT, padx=2)

        ttk.Button(
            toolbar,
            text="Collapse All",
            command=self._collapse_all
        ).pack(side=tk.LEFT, padx=2)

        # Tree view for mappings (hierarchical)
        tree_frame = ttk.Frame(self)
        tree_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        # Scrollbars
        vsb = ttk.Scrollbar(tree_frame, orient="vertical")
        hsb = ttk.Scrollbar(tree_frame, orient="horizontal")

        self.tree = ttk.Treeview(
            tree_frame,
            columns=('Files', 'Size'),
            show='tree headings',
            yscrollcommand=vsb.set,
            xscrollcommand=hsb.set
        )

        vsb.config(command=self.tree.yview)
        hsb.config(command=self.tree.xview)

        # Grid layout
        self.tree.grid(row=0, column=0, sticky='nsew')
        vsb.grid(row=0, column=1, sticky='ns')
        hsb.grid(row=1, column=0, sticky='ew')

        tree_frame.grid_rowconfigure(0, weight=1)
        tree_frame.grid_columnconfigure(0, weight=1)

        # Configure columns
        self.tree.heading('#0', text='Destination', anchor=tk.W)
        self.tree.heading('Files', text='Files')
        self.tree.heading('Size', text='Size')

        self.tree.column('#0', width=350, minwidth=200)
        self.tree.column('Files', width=70, minwidth=50)
        self.tree.column('Size', width=90, minwidth=70)

        # Configure tags for visual distinction
        self.tree.tag_configure('site', font=('Arial', 9, 'bold'), foreground='#0066CC')
        self.tree.tag_configure('library', font=('Arial', 9), foreground='#006600')
        self.tree.tag_configure('folder', foreground='black')

        # Context menu
        self.context_menu = tk.Menu(self, tearoff=0)
        self.context_menu.add_command(label="Delete Mapping", command=self._delete_selected)

        self.tree.bind("<Button-3>", self._show_context_menu)
        self.tree.bind("<Double-Button-1>", self._on_double_click)
        self.tree.bind("<<TreeviewSelect>>", self._on_select)

    def _show_context_menu(self, event) -> None:
        """Show context menu on right-click."""
        item = self.tree.identify_row(event.y)
        if item:
            self.tree.selection_set(item)
            # Only show context menu for folder items (mappings)
            if item in self.item_to_mapping:
                self.context_menu.post(event.x_root, event.y_root)

    def _on_double_click(self, event) -> None:
        """Handle double-click to expand/collapse nodes."""
        item = self.tree.identify_row(event.y)
        if item and self.tree.get_children(item):  # Has children
            if self.tree.item(item, 'open'):
                self.tree.item(item, open=False)
            else:
                self.tree.item(item, open=True)

    def _on_select(self, event) -> None:
        """Handle selection - notify callback if it's a mapping."""
        selection = self.tree.selection()
        if selection and self.on_select_callback:
            item = selection[0]
            if item in self.item_to_mapping:
                mapping = self.item_to_mapping[item]
                self.on_select_callback(mapping.source_path)

    def _extract_site_name(self, url: str) -> str:
        """Extract a friendly site name from SharePoint URL."""
        # https://contoso.sharepoint.com/sites/HR -> HR
        # https://contoso.sharepoint.com/teams/Finance -> Finance
        if '/sites/' in url:
            return url.split('/sites/')[-1].split('/')[0]
        elif '/teams/' in url:
            return url.split('/teams/')[-1].split('/')[0]
        else:
            # Fallback: use the domain
            return url.replace('https://', '').replace('http://', '').split('/')[0]

    def update_mappings(self, mappings: List[FolderMapping]) -> None:
        """
        Update the displayed mappings in hierarchical tree format.
        Structure: Site → Library → Subfolder (if any) → Folder Name

        Args:
            mappings: List of FolderMapping objects
        """
        self.mappings = mappings
        self.item_to_mapping = {}
        self.source_path_to_item = {}

        # Clear existing
        for item in self.tree.get_children():
            self.tree.delete(item)

        # Build hierarchical structure: site_url -> library -> subfolder -> mappings
        hierarchy: Dict[str, Dict[str, Dict[str, List[FolderMapping]]]] = {}

        for mapping in mappings:
            site_url = mapping.destination.site_url
            library = mapping.destination.library_name
            subfolder = mapping.destination.subfolder or ""

            if site_url not in hierarchy:
                hierarchy[site_url] = {}
            if library not in hierarchy[site_url]:
                hierarchy[site_url][library] = {}
            if subfolder not in hierarchy[site_url][library]:
                hierarchy[site_url][library][subfolder] = []
            hierarchy[site_url][library][subfolder].append(mapping)

        # Build tree
        for site_url in sorted(hierarchy.keys()):
            site_name = self._extract_site_name(site_url)

            # Calculate site totals
            site_files = 0
            site_size = 0
            for lib in hierarchy[site_url].values():
                for sub in lib.values():
                    for m in sub:
                        site_files += m.file_count
                        site_size += m.total_size_bytes

            # Insert site node
            site_item = self.tree.insert(
                '',
                'end',
                text=f"🌐 {site_name}",
                values=(site_files, format_size(site_size)),
                tags=('site',),
                open=True
            )

            for library in sorted(hierarchy[site_url].keys()):
                # Calculate library totals
                lib_files = 0
                lib_size = 0
                for sub in hierarchy[site_url][library].values():
                    for m in sub:
                        lib_files += m.file_count
                        lib_size += m.total_size_bytes

                # Insert library node
                lib_item = self.tree.insert(
                    site_item,
                    'end',
                    text=f"📚 {library}",
                    values=(lib_files, format_size(lib_size)),
                    tags=('library',),
                    open=True
                )

                for subfolder in sorted(hierarchy[site_url][library].keys()):
                    folder_mappings = hierarchy[site_url][library][subfolder]

                    # If there's a subfolder, create intermediate node
                    if subfolder:
                        sub_files = sum(m.file_count for m in folder_mappings)
                        sub_size = sum(m.total_size_bytes for m in folder_mappings)

                        sub_item = self.tree.insert(
                            lib_item,
                            'end',
                            text=f"📂 {subfolder}",
                            values=(sub_files, format_size(sub_size)),
                            tags=('library',),
                            open=True
                        )
                        parent_for_folders = sub_item
                    else:
                        parent_for_folders = lib_item

                    # Insert mapped folders
                    for mapping in sorted(folder_mappings, key=lambda m: m.source_path):
                        # Just show folder name
                        folder_name = os.path.basename(mapping.source_path) or mapping.source_path

                        folder_item = self.tree.insert(
                            parent_for_folders,
                            'end',
                            text=f"📄 {folder_name}",
                            values=(mapping.file_count, format_size(mapping.total_size_bytes)),
                            tags=('folder',)
                        )

                        # Store mapping reference
                        self.item_to_mapping[folder_item] = mapping
                        self.source_path_to_item[mapping.source_path] = folder_item

        # Update count
        site_count = len(hierarchy)
        self.count_label.config(
            text=f"({len(mappings)} folders to {site_count} site{'s' if site_count != 1 else ''})"
        )

    def select_by_source_path(self, source_path: str) -> bool:
        """
        Select the tree item for a given source path.

        Args:
            source_path: The source folder path to select

        Returns:
            True if found and selected, False otherwise
        """
        if source_path in self.source_path_to_item:
            item = self.source_path_to_item[source_path]
            # Expand parents to make visible
            parent = self.tree.parent(item)
            while parent:
                self.tree.item(parent, open=True)
                parent = self.tree.parent(parent)
            # Select and scroll to item
            self.tree.selection_set(item)
            self.tree.see(item)
            return True
        return False

    def get_selected_mapping(self) -> Optional[FolderMapping]:
        """Get the currently selected mapping, if any."""
        selection = self.tree.selection()
        if selection:
            item = selection[0]
            return self.item_to_mapping.get(item)
        return None

    def _expand_all(self) -> None:
        """Expand all nodes."""
        def expand_recursive(item):
            self.tree.item(item, open=True)
            for child in self.tree.get_children(item):
                expand_recursive(child)

        for item in self.tree.get_children():
            expand_recursive(item)

    def _collapse_all(self) -> None:
        """Collapse all nodes."""
        for item in self.tree.get_children():
            self.tree.item(item, open=False)

    def _delete_selected(self) -> None:
        """Delete selected mapping."""
        selection = self.tree.selection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a mapping to delete.")
            return

        item = selection[0]

        # Only allow deleting actual mappings (folder items)
        if item not in self.item_to_mapping:
            messagebox.showinfo(
                "Select Mapping",
                "Please select a mapped folder (not a site or library) to delete."
            )
            return

        mapping = self.item_to_mapping[item]
        folder_name = os.path.basename(mapping.source_path) or mapping.source_path

        if messagebox.askyesno(
            "Confirm Delete",
            f"Delete mapping for '{folder_name}'?\n\n"
            f"Source: {mapping.source_path}\n"
            f"Destination: {mapping.destination.get_full_destination()}"
        ):
            if self.on_delete_callback:
                self.on_delete_callback(mapping.source_path)

    def _clear_all(self) -> None:
        """Clear all mappings."""
        if not self.mappings:
            return

        if messagebox.askyesno(
            "Confirm Clear All",
            f"Delete all {len(self.mappings)} mappings?"
        ):
            if self.on_delete_callback:
                mappings_to_delete = list(self.mappings)
                for mapping in mappings_to_delete:
                    self.on_delete_callback(mapping.source_path)

    def get_mapping_count(self) -> int:
        """Get count of current mappings."""
        return len(self.mappings)


class MappingStatsPanel(ttk.Frame):
    """Panel for displaying mapping statistics."""

    def __init__(self, parent):
        """Initialize the stats panel."""
        super().__init__(parent, relief=tk.RIDGE, borderwidth=2, padding="10")
        self._create_widgets()

    def _create_widgets(self) -> None:
        """Create panel widgets."""
        ttk.Label(
            self,
            text="Mapping Statistics",
            font=('Arial', 10, 'bold')
        ).grid(row=0, column=0, columnspan=2, pady=(0, 10), sticky=tk.W)

        # Stats labels
        ttk.Label(self, text="Total Mappings:").grid(row=1, column=0, sticky=tk.W, pady=2)
        self.total_mappings_var = tk.StringVar(value="0")
        ttk.Label(self, textvariable=self.total_mappings_var, font=('Arial', 9, 'bold')).grid(
            row=1, column=1, sticky=tk.E, pady=2
        )

        ttk.Label(self, text="Total Destinations:").grid(row=2, column=0, sticky=tk.W, pady=2)
        self.total_destinations_var = tk.StringVar(value="0")
        ttk.Label(self, textvariable=self.total_destinations_var, font=('Arial', 9, 'bold')).grid(
            row=2, column=1, sticky=tk.E, pady=2
        )

        ttk.Label(self, text="Total Files:").grid(row=3, column=0, sticky=tk.W, pady=2)
        self.total_files_var = tk.StringVar(value="0")
        ttk.Label(self, textvariable=self.total_files_var, font=('Arial', 9, 'bold')).grid(
            row=3, column=1, sticky=tk.E, pady=2
        )

        ttk.Label(self, text="Total Size:").grid(row=4, column=0, sticky=tk.W, pady=2)
        self.total_size_var = tk.StringVar(value="0.00 GB")
        ttk.Label(self, textvariable=self.total_size_var, font=('Arial', 9, 'bold')).grid(
            row=4, column=1, sticky=tk.E, pady=2
        )

    def update_stats(self, stats: dict) -> None:
        """Update displayed statistics."""
        self.total_mappings_var.set(str(stats.get('total_mappings', 0)))
        self.total_destinations_var.set(str(stats.get('total_destinations', 0)))
        self.total_files_var.set(f"{stats.get('total_files', 0):,}")
        self.total_size_var.set(f"{stats.get('total_size_gb', 0):.2f} GB")
