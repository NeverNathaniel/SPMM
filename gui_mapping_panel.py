"""
GUI Mapping Panel Module

This module provides the UI components for displaying and managing
folder-to-SharePoint mappings.
"""

import tkinter as tk
from tkinter import ttk, messagebox
from typing import List, Optional, Callable
from mapping_manager import FolderMapping, SharePointDestination
from file_scanner import format_size


class MappingPanel(ttk.Frame):
    """Panel for displaying current mappings."""

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

        # Tree view for mappings
        tree_frame = ttk.Frame(self)
        tree_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        # Scrollbars
        vsb = ttk.Scrollbar(tree_frame, orient="vertical")
        hsb = ttk.Scrollbar(tree_frame, orient="horizontal")

        self.tree = ttk.Treeview(
            tree_frame,
            columns=('Source', 'Destination', 'Files', 'Size'),
            show='headings',
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
        self.tree.heading('Source', text='Source Path')
        self.tree.heading('Destination', text='SharePoint Destination')
        self.tree.heading('Files', text='Files')
        self.tree.heading('Size', text='Size')

        self.tree.column('Source', width=300, minwidth=150)
        self.tree.column('Destination', width=300, minwidth=150)
        self.tree.column('Files', width=80, minwidth=60)
        self.tree.column('Size', width=100, minwidth=80)

        # Context menu
        self.context_menu = tk.Menu(self, tearoff=0)
        self.context_menu.add_command(label="Delete Mapping", command=self._delete_selected)

        self.tree.bind("<Button-3>", self._show_context_menu)

    def _show_context_menu(self, event) -> None:
        """Show context menu on right-click."""
        # Select item under cursor
        item = self.tree.identify_row(event.y)
        if item:
            self.tree.selection_set(item)
            self.context_menu.post(event.x_root, event.y_root)

    def update_mappings(self, mappings: List[FolderMapping]) -> None:
        """
        Update the displayed mappings.

        Args:
            mappings: List of FolderMapping objects
        """
        self.mappings = mappings

        # Clear existing
        for item in self.tree.get_children():
            self.tree.delete(item)

        # Add mappings
        for mapping in mappings:
            dest_str = mapping.destination.get_full_destination()
            size_str = format_size(mapping.total_size_bytes)

            self.tree.insert(
                '',
                'end',
                values=(
                    mapping.source_path,
                    dest_str,
                    mapping.file_count,
                    size_str
                )
            )

        # Update count
        self.count_label.config(text=f"({len(mappings)} mappings)")

    def _delete_selected(self) -> None:
        """Delete selected mapping."""
        selection = self.tree.selection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a mapping to delete.")
            return

        # Get selected item index
        item = selection[0]
        index = self.tree.index(item)

        if index < len(self.mappings):
            mapping = self.mappings[index]

            # Confirm
            if messagebox.askyesno(
                "Confirm Delete",
                f"Delete mapping:\n{mapping.source_path}\n→\n{mapping.destination.get_full_destination()}?"
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
