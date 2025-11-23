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


class MappingPanel(ttk.Frame):
    """Panel for displaying current mappings in a tree format grouped by destination."""

    def __init__(self, parent, on_delete_callback: Optional[Callable] = None):
        """
        Initialize the mapping panel.

        Args:
            parent: Parent widget
            on_delete_callback: Callback when mapping is deleted
        """
        super().__init__(parent)
        self.on_delete_callback = on_delete_callback
        self.mappings: List[FolderMapping] = []
        self.dest_to_mappings: Dict[str, List[FolderMapping]] = {}

        self._create_widgets()

    def _create_widgets(self) -> None:
        """Create panel widgets."""
        # Title
        title_frame = ttk.Frame(self)
        title_frame.pack(side=tk.TOP, fill=tk.X, pady=(0, 5))

        ttk.Label(
            title_frame,
            text="Current Mappings",
            font=('Arial', 10, 'bold')
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
        self.tree.heading('#0', text='Destination / Source', anchor=tk.W)
        self.tree.heading('Files', text='Files')
        self.tree.heading('Size', text='Size')

        self.tree.column('#0', width=400, minwidth=200)
        self.tree.column('Files', width=80, minwidth=60)
        self.tree.column('Size', width=100, minwidth=80)

        # Configure tags for visual distinction
        self.tree.tag_configure('destination', font=('Arial', 9, 'bold'), foreground='#0066CC')
        self.tree.tag_configure('source', foreground='black')

        # Context menu
        self.context_menu = tk.Menu(self, tearoff=0)
        self.context_menu.add_command(label="Delete Mapping", command=self._delete_selected)

        self.tree.bind("<Button-3>", self._show_context_menu)
        self.tree.bind("<Double-Button-1>", self._on_double_click)

    def _show_context_menu(self, event) -> None:
        """Show context menu on right-click."""
        # Select item under cursor
        item = self.tree.identify_row(event.y)
        if item:
            self.tree.selection_set(item)
            # Only show context menu for source items (not destinations)
            if self.tree.parent(item):  # Has parent = is a source item
                self.context_menu.post(event.x_root, event.y_root)

    def _on_double_click(self, event) -> None:
        """Handle double-click to expand/collapse destination nodes."""
        item = self.tree.identify_row(event.y)
        if item and not self.tree.parent(item):  # Top-level = destination
            if self.tree.item(item, 'open'):
                self.tree.item(item, open=False)
            else:
                self.tree.item(item, open=True)

    def update_mappings(self, mappings: List[FolderMapping]) -> None:
        """
        Update the displayed mappings in tree format.

        Args:
            mappings: List of FolderMapping objects
        """
        self.mappings = mappings

        # Clear existing
        for item in self.tree.get_children():
            self.tree.delete(item)

        # Group mappings by destination
        self.dest_to_mappings = {}
        for mapping in mappings:
            dest_key = mapping.destination.get_full_destination()
            if dest_key not in self.dest_to_mappings:
                self.dest_to_mappings[dest_key] = []
            self.dest_to_mappings[dest_key].append(mapping)

        # Build tree
        for dest_key, dest_mappings in sorted(self.dest_to_mappings.items()):
            # Calculate totals for destination
            total_files = sum(m.file_count for m in dest_mappings)
            total_size = sum(m.total_size_bytes for m in dest_mappings)

            # Insert destination node
            dest_item = self.tree.insert(
                '',
                'end',
                text=f"📁 {dest_key}",
                values=(total_files, format_size(total_size)),
                tags=('destination',),
                open=True  # Expand by default
            )

            # Insert source folders under destination
            for mapping in sorted(dest_mappings, key=lambda m: m.source_path):
                size_str = format_size(mapping.total_size_bytes)
                # Show just the folder name, with full path as tooltip
                folder_name = mapping.source_path.split('/')[-1] or mapping.source_path.split('\\')[-1] or mapping.source_path

                self.tree.insert(
                    dest_item,
                    'end',
                    text=f"  📄 {folder_name}",
                    values=(mapping.file_count, size_str),
                    tags=('source',)
                )

        # Update count
        dest_count = len(self.dest_to_mappings)
        self.count_label.config(
            text=f"({len(mappings)} mappings to {dest_count} destination{'s' if dest_count != 1 else ''})"
        )

    def _expand_all(self) -> None:
        """Expand all destination nodes."""
        for item in self.tree.get_children():
            self.tree.item(item, open=True)

    def _collapse_all(self) -> None:
        """Collapse all destination nodes."""
        for item in self.tree.get_children():
            self.tree.item(item, open=False)

    def _delete_selected(self) -> None:
        """Delete selected mapping."""
        selection = self.tree.selection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a mapping to delete.")
            return

        item = selection[0]

        # Check if it's a destination (parent) or source (child)
        parent = self.tree.parent(item)
        if not parent:
            # It's a destination - offer to delete all mappings to this destination
            dest_text = self.tree.item(item, 'text').replace('📁 ', '')
            children = self.tree.get_children(item)

            if messagebox.askyesno(
                "Delete All Mappings",
                f"Delete all {len(children)} mappings to:\n{dest_text}?"
            ):
                # Get all source paths for this destination
                if dest_text in self.dest_to_mappings:
                    for mapping in self.dest_to_mappings[dest_text]:
                        if self.on_delete_callback:
                            self.on_delete_callback(mapping.source_path)
            return

        # It's a source item - find the mapping
        dest_item = parent
        dest_text = self.tree.item(dest_item, 'text').replace('📁 ', '')
        source_text = self.tree.item(item, 'text').replace('  📄 ', '')

        # Find the matching mapping
        if dest_text in self.dest_to_mappings:
            for mapping in self.dest_to_mappings[dest_text]:
                # Match by folder name (end of path)
                folder_name = mapping.source_path.split('/')[-1] or mapping.source_path.split('\\')[-1] or mapping.source_path
                if folder_name == source_text:
                    if messagebox.askyesno(
                        "Confirm Delete",
                        f"Delete mapping:\n{mapping.source_path}\n→\n{dest_text}?"
                    ):
                        if self.on_delete_callback:
                            self.on_delete_callback(mapping.source_path)
                    return

    def _clear_all(self) -> None:
        """Clear all mappings."""
        if not self.mappings:
            return

        if messagebox.askyesno(
            "Confirm Clear All",
            f"Delete all {len(self.mappings)} mappings?"
        ):
            if self.on_delete_callback:
                # Make a copy of the list to avoid modification during iteration
                mappings_to_delete = list(self.mappings)
                for mapping in mappings_to_delete:
                    self.on_delete_callback(mapping.source_path)

    def get_mapping_count(self) -> int:
        """
        Get count of current mappings.

        Returns:
            Number of mappings
        """
        return len(self.mappings)


class MappingStatsPanel(ttk.Frame):
    """Panel for displaying mapping statistics."""

    def __init__(self, parent):
        """
        Initialize the stats panel.

        Args:
            parent: Parent widget
        """
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
        """
        Update displayed statistics.

        Args:
            stats: Dictionary with statistics
        """
        self.total_mappings_var.set(str(stats.get('total_mappings', 0)))
        self.total_destinations_var.set(str(stats.get('total_destinations', 0)))
        self.total_files_var.set(f"{stats.get('total_files', 0):,}")
        self.total_size_var.set(f"{stats.get('total_size_gb', 0):.2f} GB")
