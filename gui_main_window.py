"""
GUI Main Window Module

This module provides the main window interface for the File Share to
SharePoint Migration Mapping Tool.
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
from typing import Optional, List
from datetime import datetime

from file_scanner import FileScanner, FolderInfo, format_size
from mapping_manager import MappingManager, SharePointDestination
from gui_destination_manager import DestinationManagerDialog, QuickMapDialog
from gui_mapping_panel import MappingPanel, MappingStatsPanel
from filter_engine import FilterEngine, FilterConfig, create_default_config
from gui_filters import FilterConfigDialog


class MainWindow:
    """Main application window."""

    def __init__(self, root: tk.Tk):
        """
        Initialize the main window.

        Args:
            root: Tkinter root window
        """
        self.root = root
        self.root.title("File Share to SharePoint Migration Mapper")
        self.root.geometry("1200x700")

        # Initialize components
        self.scanner = FileScanner()
        self.mapping_manager = MappingManager()
        self.filter_engine = FilterEngine(create_default_config())
        self.current_scan_results: List[FolderInfo] = []
        self.filtered_results: List[FolderInfo] = []
        self.archived_results: List[FolderInfo] = []
        self.path_to_folder_info = {}  # Map paths to FolderInfo objects
        self.mapping_panel = None
        self.stats_panel = None
        self.archive_destination: Optional[SharePointDestination] = None

        # Setup UI
        self._create_menu()
        self._create_toolbar()
        self._create_main_content()
        self._create_statusbar()

    def _create_menu(self) -> None:
        """Create the menu bar."""
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)

        # File menu
        file_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="File", menu=file_menu)
        file_menu.add_command(label="New Project", command=self._new_project)
        file_menu.add_command(label="Open Project...", command=self._open_project)
        file_menu.add_command(label="Save Project...", command=self._save_project)
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.root.quit)

        # Scan menu
        scan_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Scan", menu=scan_menu)
        scan_menu.add_command(label="Scan Folder...", command=self._scan_folder)
        scan_menu.add_command(label="Clear Cache", command=self._clear_cache)

        # Mapping menu
        mapping_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Mapping", menu=mapping_menu)
        mapping_menu.add_command(label="Manage Destinations...", command=self._manage_destinations)
        mapping_menu.add_command(label="Map Selected Folder...", command=self._map_selected_folder)
        mapping_menu.add_separator()
        mapping_menu.add_command(label="Clear All Mappings", command=self._clear_all_mappings)

        # Filters menu
        filters_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Filters", menu=filters_menu)
        filters_menu.add_command(label="Configure Filters...", command=self._configure_filters)
        filters_menu.add_command(label="Set Archive Destination...", command=self._set_archive_destination)
        filters_menu.add_separator()
        filters_menu.add_command(label="Apply Filters to Scan", command=self._apply_filters)
        filters_menu.add_command(label="View Archived Folders", command=self._view_archived)

        # Help menu
        help_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Help", menu=help_menu)
        help_menu.add_command(label="About", command=self._show_about)

    def _create_toolbar(self) -> None:
        """Create the toolbar."""
        toolbar = ttk.Frame(self.root, padding="5")
        toolbar.pack(side=tk.TOP, fill=tk.X)

        # Scan button
        scan_btn = ttk.Button(
            toolbar,
            text="Scan Folder",
            command=self._scan_folder
        )
        scan_btn.pack(side=tk.LEFT, padx=2)

        # Refresh button
        refresh_btn = ttk.Button(
            toolbar,
            text="Refresh",
            command=self._refresh_view
        )
        refresh_btn.pack(side=tk.LEFT, padx=2)

        # Separator
        ttk.Separator(toolbar, orient=tk.VERTICAL).pack(
            side=tk.LEFT, fill=tk.Y, padx=5
        )

        # Mapping buttons
        ttk.Button(
            toolbar,
            text="Destinations",
            command=self._manage_destinations
        ).pack(side=tk.LEFT, padx=2)

        ttk.Button(
            toolbar,
            text="Map Folder",
            command=self._map_selected_folder
        ).pack(side=tk.LEFT, padx=2)

        # Separator
        ttk.Separator(toolbar, orient=tk.VERTICAL).pack(
            side=tk.LEFT, fill=tk.Y, padx=5
        )

        # Path label and entry
        ttk.Label(toolbar, text="Scan Path:").pack(side=tk.LEFT, padx=2)
        self.path_var = tk.StringVar()
        path_entry = ttk.Entry(toolbar, textvariable=self.path_var, width=40)
        path_entry.pack(side=tk.LEFT, padx=2, fill=tk.X, expand=True)

        # Browse button
        browse_btn = ttk.Button(
            toolbar,
            text="Browse...",
            command=self._browse_folder
        )
        browse_btn.pack(side=tk.LEFT, padx=2)

    def _create_main_content(self) -> None:
        """Create the main content area."""
        # Main container
        main_container = ttk.Frame(self.root)
        main_container.pack(side=tk.TOP, fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Create paned window for resizable sections (3 panes)
        paned = ttk.PanedWindow(main_container, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True)

        # Left pane - Folder tree
        left_frame = ttk.Frame(paned)
        paned.add(left_frame, weight=2)

        ttk.Label(left_frame, text="Source Folders", font=('Arial', 10, 'bold')).pack(
            side=tk.TOP, pady=5
        )

        # Create treeview for folders
        tree_frame = ttk.Frame(left_frame)
        tree_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        # Scrollbars
        vsb = ttk.Scrollbar(tree_frame, orient="vertical")
        hsb = ttk.Scrollbar(tree_frame, orient="horizontal")

        self.tree = ttk.Treeview(
            tree_frame,
            columns=('Files', 'Size', 'Modified', 'Status'),
            yscrollcommand=vsb.set,
            xscrollcommand=hsb.set
        )

        vsb.config(command=self.tree.yview)
        hsb.config(command=self.tree.xview)

        # Grid layout for treeview and scrollbars
        self.tree.grid(row=0, column=0, sticky='nsew')
        vsb.grid(row=0, column=1, sticky='ns')
        hsb.grid(row=1, column=0, sticky='ew')

        tree_frame.grid_rowconfigure(0, weight=1)
        tree_frame.grid_columnconfigure(0, weight=1)

        # Configure columns
        self.tree.heading('#0', text='Folder Name')
        self.tree.heading('Files', text='Files')
        self.tree.heading('Size', text='Size')
        self.tree.heading('Modified', text='Last Modified')
        self.tree.heading('Status', text='Status')

        self.tree.column('#0', width=300, minwidth=200)
        self.tree.column('Files', width=80, minwidth=60)
        self.tree.column('Size', width=100, minwidth=80)
        self.tree.column('Modified', width=150, minwidth=120)
        self.tree.column('Status', width=100, minwidth=80)

        # Right pane - Stats and Details panel
        right_frame = ttk.Frame(paned)
        paned.add(right_frame, weight=1)

        # Stats panel
        self.stats_panel = MappingStatsPanel(right_frame)
        self.stats_panel.pack(side=tk.TOP, fill=tk.X, padx=5, pady=5)

        # Separator
        ttk.Separator(right_frame, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=5)

        ttk.Label(right_frame, text="Folder Details", font=('Arial', 10, 'bold')).pack(
            side=tk.TOP, pady=5
        )

        # Details text widget
        details_frame = ttk.Frame(right_frame)
        details_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        details_vsb = ttk.Scrollbar(details_frame, orient="vertical")
        self.details_text = tk.Text(
            details_frame,
            wrap=tk.WORD,
            width=40,
            height=20,
            yscrollcommand=details_vsb.set
        )
        details_vsb.config(command=self.details_text.yview)

        self.details_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        details_vsb.pack(side=tk.RIGHT, fill=tk.Y)

        # Bind selection event
        self.tree.bind('<<TreeviewSelect>>', self._on_folder_select)

        # Context menu for tree
        self.tree_context_menu = tk.Menu(self.tree, tearoff=0)
        self.tree_context_menu.add_command(label="Map to Destination...", command=self._map_selected_folder)
        self.tree_context_menu.add_command(label="Remove Mapping", command=self._remove_mapping_for_selected)
        self.tree.bind("<Button-3>", self._show_tree_context_menu)

        # Middle pane - Mappings panel
        middle_frame = ttk.Frame(paned)
        paned.add(middle_frame, weight=2)

        self.mapping_panel = MappingPanel(middle_frame, on_delete_callback=self._on_mapping_deleted)
        self.mapping_panel.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

    def _create_statusbar(self) -> None:
        """Create the status bar."""
        self.statusbar = ttk.Label(
            self.root,
            text="Ready",
            relief=tk.SUNKEN,
            anchor=tk.W
        )
        self.statusbar.pack(side=tk.BOTTOM, fill=tk.X)

    def _browse_folder(self) -> None:
        """Open folder browser dialog."""
        folder = filedialog.askdirectory(
            title="Select Folder to Scan",
            initialdir=self.path_var.get() or "/"
        )
        if folder:
            self.path_var.set(folder)

    def _scan_folder(self) -> None:
        """Initiate folder scan."""
        path = self.path_var.get()
        if not path:
            messagebox.showwarning(
                "No Path",
                "Please enter or select a folder path to scan."
            )
            return

        # Clear current tree
        for item in self.tree.get_children():
            self.tree.delete(item)

        self.statusbar.config(text="Scanning...")
        self.root.update_idletasks()

        # Run scan in separate thread
        thread = threading.Thread(target=self._run_scan, args=(path,))
        thread.daemon = True
        thread.start()

    def _run_scan(self, path: str) -> None:
        """
        Run scan in background thread.

        Args:
            path: Path to scan
        """
        try:
            def progress_callback(current_path: str, count: int):
                self.root.after(
                    0,
                    lambda: self.statusbar.config(
                        text=f"Scanning... ({count} folders found)"
                    )
                )

            results = self.scanner.scan_folder(path, progress_callback=progress_callback)
            self.current_scan_results = results

            # Update UI in main thread
            self.root.after(0, lambda: self._populate_tree(results))
            self.root.after(
                0,
                lambda: self.statusbar.config(
                    text=f"Scan complete. Found {len(results)} folders."
                )
            )

        except Exception as e:
            self.root.after(
                0,
                lambda: messagebox.showerror("Scan Error", str(e))
            )
            self.root.after(0, lambda: self.statusbar.config(text="Scan failed"))

    def _populate_tree(self, folders: List[FolderInfo]) -> None:
        """
        Populate tree view with scan results.

        Args:
            folders: List of FolderInfo objects
        """
        # Clear existing items
        for item in self.tree.get_children():
            self.tree.delete(item)

        if not folders:
            return

        # Build tree structure
        # Map paths to tree item IDs and FolderInfo
        path_to_item = {}
        self.path_to_folder_info = {}

        for folder in folders:
            # Store folder info
            self.path_to_folder_info[folder.path] = folder

            # Determine parent
            parent = ''
            if folder.parent_path and folder.parent_path in path_to_item:
                parent = path_to_item[folder.parent_path]

            # Format values
            size_str = format_size(folder.total_size)
            modified_str = folder.last_modified.strftime('%Y-%m-%d %H:%M')
            status = 'Mapped' if self.mapping_manager.is_mapped(folder.path) else 'Unmapped'

            # Insert item
            item_id = self.tree.insert(
                parent,
                'end',
                text=folder.name,
                values=(folder.file_count, size_str, modified_str, status),
                tags=(status.lower(),)
            )

            path_to_item[folder.path] = item_id

        # Configure tags for visual feedback
        self.tree.tag_configure('mapped', foreground='green')
        self.tree.tag_configure('unmapped', foreground='black')

        # Update stats
        self._update_stats()

    def _on_folder_select(self, event) -> None:
        """
        Handle folder selection in tree.

        Args:
            event: Tkinter event
        """
        folder_info = self._get_selected_folder()
        if folder_info:
            self._display_folder_details(folder_info)

    def _get_selected_folder(self) -> Optional[FolderInfo]:
        """
        Get the FolderInfo for currently selected tree item.

        Returns:
            FolderInfo object or None
        """
        selection = self.tree.selection()
        if not selection:
            return None

        item_id = selection[0]
        folder_name = self.tree.item(item_id, 'text')

        # Find in path_to_folder_info dictionary
        for path, folder in self.path_to_folder_info.items():
            if folder.name == folder_name:
                return folder

        return None

    def _display_folder_details(self, folder: FolderInfo) -> None:
        """
        Display folder details in details panel.

        Args:
            folder: FolderInfo object
        """
        self.details_text.delete('1.0', tk.END)

        details = f"""Path: {folder.path}

Name: {folder.name}

Files: {folder.file_count}

Size: {format_size(folder.total_size)}
      ({folder.total_size:,} bytes)

Last Modified: {folder.last_modified.strftime('%Y-%m-%d %H:%M:%S')}

Depth Level: {folder.depth}

Status: {'Mapped' if self.mapping_manager.is_mapped(folder.path) else 'Unmapped'}
"""

        self.details_text.insert('1.0', details)

    def _refresh_view(self) -> None:
        """Refresh the current view."""
        if self.current_scan_results:
            self._populate_tree(self.current_scan_results)
            self.statusbar.config(text="View refreshed")

    def _clear_cache(self) -> None:
        """Clear the scan cache."""
        self.scanner.clear_cache()
        messagebox.showinfo("Cache Cleared", "Scan cache has been cleared.")

    def _new_project(self) -> None:
        """Create a new project."""
        # TODO: Implement in Phase 4
        messagebox.showinfo("Not Implemented", "This feature will be available in Phase 4")

    def _open_project(self) -> None:
        """Open an existing project."""
        # TODO: Implement in Phase 4
        messagebox.showinfo("Not Implemented", "This feature will be available in Phase 4")

    def _save_project(self) -> None:
        """Save current project."""
        # TODO: Implement in Phase 4
        messagebox.showinfo("Not Implemented", "This feature will be available in Phase 4")

    def _show_about(self) -> None:
        """Show about dialog."""
        messagebox.showinfo(
            "About",
            "File Share to SharePoint Migration Mapper\n\n"
            "Version 1.0.0 - Phase 3\n\n"
            "A tool for mapping file share folders to SharePoint libraries."
        )

    # Mapping methods

    def _show_tree_context_menu(self, event) -> None:
        """Show context menu on tree right-click."""
        item = self.tree.identify_row(event.y)
        if item:
            self.tree.selection_set(item)
            self.tree_context_menu.post(event.x_root, event.y_root)

    def _manage_destinations(self) -> None:
        """Open destination manager dialog."""
        dialog = DestinationManagerDialog(
            self.root,
            self.mapping_manager.destinations,
            callback=self._update_stats
        )

    def _map_selected_folder(self) -> None:
        """Map selected folder to a destination."""
        folder = self._get_selected_folder()
        if not folder:
            messagebox.showwarning(
                "No Selection",
                "Please select a folder from the source tree to map."
            )
            return

        # Check if already mapped
        if self.mapping_manager.is_mapped(folder.path):
            if not messagebox.askyesno(
                "Already Mapped",
                f"Folder {folder.name} is already mapped.\n\nRemap to a different destination?"
            ):
                return

        # Show quick map dialog
        dialog = QuickMapDialog(
            self.root,
            self.mapping_manager.destinations,
            folder.path
        )
        self.root.wait_window(dialog)

        if dialog.result:
            # Create mapping
            self.mapping_manager.add_mapping(
                source_path=folder.path,
                destination=dialog.result,
                file_count=folder.file_count,
                total_size_bytes=folder.total_size,
                last_modified=folder.last_modified.strftime('%Y-%m-%d %H:%M:%S')
            )

            # Update UI
            self._refresh_view()
            self._update_mappings_display()
            self.statusbar.config(text=f"Mapped: {folder.name}")

    def _remove_mapping_for_selected(self) -> None:
        """Remove mapping for selected folder."""
        folder = self._get_selected_folder()
        if not folder:
            return

        if not self.mapping_manager.is_mapped(folder.path):
            messagebox.showinfo("Not Mapped", f"Folder {folder.name} is not mapped.")
            return

        if messagebox.askyesno(
            "Confirm Remove",
            f"Remove mapping for {folder.name}?"
        ):
            self.mapping_manager.remove_mapping(folder.path)
            self._refresh_view()
            self._update_mappings_display()
            self.statusbar.config(text=f"Removed mapping for: {folder.name}")

    def _on_mapping_deleted(self, source_path: str) -> None:
        """
        Callback when mapping is deleted from mapping panel.

        Args:
            source_path: Source path of deleted mapping
        """
        self.mapping_manager.remove_mapping(source_path)
        self._refresh_view()
        self._update_mappings_display()

    def _clear_all_mappings(self) -> None:
        """Clear all mappings."""
        if not self.mapping_manager.mappings:
            messagebox.showinfo("No Mappings", "There are no mappings to clear.")
            return

        if messagebox.askyesno(
            "Confirm Clear All",
            f"Clear all {len(self.mapping_manager.mappings)} mappings?"
        ):
            self.mapping_manager.clear_all_mappings()
            self._refresh_view()
            self._update_mappings_display()
            self.statusbar.config(text="All mappings cleared")

    def _update_mappings_display(self) -> None:
        """Update the mappings panel display."""
        if self.mapping_panel:
            mappings = self.mapping_manager.get_all_mappings()
            self.mapping_panel.update_mappings(mappings)
        self._update_stats()

    def _update_stats(self) -> None:
        """Update statistics display."""
        if self.stats_panel:
            stats = self.mapping_manager.get_statistics()
            self.stats_panel.update_stats(stats)

    # Filter methods

    def _configure_filters(self) -> None:
        """Open filter configuration dialog."""
        dialog = FilterConfigDialog(
            self.root,
            self.filter_engine.config,
            callback=self._on_filter_config_changed
        )

    def _on_filter_config_changed(self, config: FilterConfig) -> None:
        """
        Callback when filter config changes.

        Args:
            config: New FilterConfig
        """
        self.filter_engine.update_config(config)
        self.statusbar.config(text="Filter configuration updated")

        # Ask if user wants to reapply filters
        if self.current_scan_results:
            if messagebox.askyesno(
                "Apply Filters",
                "Filter configuration updated.\n\nReapply filters to current scan?"
            ):
                self._apply_filters()

    def _set_archive_destination(self) -> None:
        """Set the archive destination for old files."""
        if not self.mapping_manager.destinations:
            messagebox.showinfo(
                "No Destinations",
                "Please add at least one SharePoint destination first."
            )
            return

        # Show destination selection dialog
        dialog = tk.Toplevel(self.root)
        dialog.title("Select Archive Destination")
        dialog.geometry("500x300")
        dialog.transient(self.root)

        ttk.Label(
            dialog,
            text="Select destination for archived (old) folders:",
            font=('Arial', 10, 'bold')
        ).pack(pady=10)

        # List of destinations
        listbox = tk.Listbox(dialog)
        listbox.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        for dest in self.mapping_manager.destinations:
            display_text = f"{dest.site_url} / {dest.library_name}"
            if dest.subfolder:
                display_text += f" / {dest.subfolder}"
            listbox.insert(tk.END, display_text)

        # Select current if set
        if self.archive_destination:
            for i, dest in enumerate(self.mapping_manager.destinations):
                if dest == self.archive_destination:
                    listbox.selection_set(i)
                    break

        def on_select():
            selection = listbox.curselection()
            if selection:
                self.archive_destination = self.mapping_manager.destinations[selection[0]]
                self.statusbar.config(
                    text=f"Archive destination set: {self.archive_destination.get_full_destination()}"
                )
                dialog.destroy()

        btn_frame = ttk.Frame(dialog)
        btn_frame.pack(pady=10)

        ttk.Button(btn_frame, text="Select", command=on_select).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Cancel", command=dialog.destroy).pack(side=tk.LEFT, padx=5)

        dialog.grab_set()

    def _apply_filters(self) -> None:
        """Apply filters to current scan results."""
        if not self.current_scan_results:
            messagebox.showinfo(
                "No Scan Results",
                "Please scan a folder first before applying filters."
            )
            return

        # Apply filters
        self.statusbar.config(text="Applying filters...")
        self.root.update_idletasks()

        self.filtered_results, self.archived_results = self.filter_engine.apply_filters(
            self.current_scan_results
        )

        # Auto-map archived folders if archive destination is set
        if self.archived_results and self.archive_destination:
            for folder in self.archived_results:
                if not self.mapping_manager.is_mapped(folder.path):
                    self.mapping_manager.add_mapping(
                        source_path=folder.path,
                        destination=self.archive_destination,
                        file_count=folder.file_count,
                        total_size_bytes=folder.total_size,
                        last_modified=folder.last_modified.strftime('%Y-%m-%d %H:%M:%S'),
                        notes="Auto-archived by date filter"
                    )

        # Update display with filtered results
        self._populate_tree(self.filtered_results)
        self._update_mappings_display()

        # Show results
        filter_stats = self.filter_engine.get_statistics()
        messagebox.showinfo(
            "Filters Applied",
            f"Filter results:\n\n"
            f"Active folders: {len(self.filtered_results)}\n"
            f"Archived folders: {filter_stats['archived_count']}\n"
            f"Excluded folders: {filter_stats['excluded_count']}\n\n"
            f"Total processed: {len(self.current_scan_results)}"
        )

        self.statusbar.config(text="Filters applied")

    def _view_archived(self) -> None:
        """View archived folders in a dialog."""
        if not self.archived_results:
            messagebox.showinfo(
                "No Archived Folders",
                "No folders have been marked for archiving.\n\n"
                "Configure date filters and apply them to see archived folders."
            )
            return

        # Create dialog
        dialog = tk.Toplevel(self.root)
        dialog.title("Archived Folders")
        dialog.geometry("700x500")
        dialog.transient(self.root)

        ttk.Label(
            dialog,
            text=f"Archived Folders ({len(self.archived_results)})",
            font=('Arial', 12, 'bold')
        ).pack(pady=10)

        # Tree view
        tree_frame = ttk.Frame(dialog)
        tree_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        scrollbar = ttk.Scrollbar(tree_frame)
        tree = ttk.Treeview(
            tree_frame,
            columns=('Path', 'Files', 'Size', 'Modified'),
            show='headings',
            yscrollcommand=scrollbar.set
        )
        scrollbar.config(command=tree.yview)

        tree.heading('Path', text='Folder Path')
        tree.heading('Files', text='Files')
        tree.heading('Size', text='Size')
        tree.heading('Modified', text='Last Modified')

        tree.column('Path', width=300)
        tree.column('Files', width=80)
        tree.column('Size', width=100)
        tree.column('Modified', width=150)

        for folder in self.archived_results:
            tree.insert(
                '',
                'end',
                values=(
                    folder.path,
                    folder.file_count,
                    format_size(folder.total_size),
                    folder.last_modified.strftime('%Y-%m-%d %H:%M')
                )
            )

        tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        ttk.Button(dialog, text="Close", command=dialog.destroy).pack(pady=10)

        dialog.grab_set()

    def run(self) -> None:
        """Start the application main loop."""
        self.root.mainloop()
