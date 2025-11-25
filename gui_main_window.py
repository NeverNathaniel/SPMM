"""
GUI Main Window Module

This module provides the main window interface for the File Share to
SharePoint Migration Mapping Tool.
"""

import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
from typing import Optional, List
from datetime import datetime

from file_scanner import FileScanner, FolderInfo, format_size
from mapping_manager import MappingManager, SharePointDestination, FolderMapping
from gui_destination_manager import DestinationManagerDialog, QuickMapDialog
from gui_mapping_panel import MappingPanel, MappingStatsPanel
from gui_destination_tree import DestinationTree
from filter_engine import FilterEngine, FilterConfig, create_default_config
from gui_filters import FilterConfigDialog
from export_manager import ExportManager
from project_manager import ProjectManager
from validators import validate_mappings, ValidationResult
from gui_validation_report import ValidationReportDialog, QuickValidationDialog


class ProgressDialog(tk.Toplevel):
    """Progress dialog for scanning operations."""

    def __init__(self, parent: tk.Tk, title: str = "Scanning..."):
        """
        Initialize the progress dialog.

        Args:
            parent: Parent window
            title: Dialog title
        """
        super().__init__(parent)
        self.title(title)
        self.geometry("500x150")
        self.resizable(False, False)

        # Make modal
        self.transient(parent)
        self.grab_set()

        self.cancelled = False

        # Create UI
        frame = ttk.Frame(self, padding=20)
        frame.pack(fill=tk.BOTH, expand=True)

        # Status label
        self.status_label = ttk.Label(
            frame,
            text="Initializing scan...",
            wraplength=450
        )
        self.status_label.pack(pady=(0, 10))

        # Progress bar (indeterminate mode)
        self.progress = ttk.Progressbar(
            frame,
            mode='indeterminate',
            length=450
        )
        self.progress.pack(pady=(0, 10))
        self.progress.start(10)

        # Count label
        self.count_label = ttk.Label(
            frame,
            text="Folders found: 0"
        )
        self.count_label.pack(pady=(0, 10))

        # Cancel button
        self.cancel_btn = ttk.Button(
            frame,
            text="Cancel",
            command=self._on_cancel
        )
        self.cancel_btn.pack()

        # Center on parent
        self.update_idletasks()
        x = parent.winfo_x() + (parent.winfo_width() - self.winfo_width()) // 2
        y = parent.winfo_y() + (parent.winfo_height() - self.winfo_height()) // 2
        self.geometry(f"+{x}+{y}")

    def _on_cancel(self):
        """Handle cancel button click."""
        self.cancelled = True
        self.status_label.config(text="Cancelling scan...")
        self.cancel_btn.config(state='disabled')

    def update_progress(self, current_path: str, count: int):
        """
        Update progress information.

        Args:
            current_path: Current folder being scanned
            count: Number of folders found
        """
        # Truncate long paths
        if len(current_path) > 60:
            display_path = "..." + current_path[-57:]
        else:
            display_path = current_path

        self.status_label.config(text=f"Scanning: {display_path}")
        self.count_label.config(text=f"Folders found: {count}")
        self.update_idletasks()

    def close_dialog(self):
        """Close the progress dialog."""
        self.progress.stop()
        self.grab_release()
        self.destroy()


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
        self.export_manager = ExportManager()
        self.project_manager = ProjectManager()
        self.current_scan_results: List[FolderInfo] = []
        self.filtered_results: List[FolderInfo] = []
        self.archived_results: List[FolderInfo] = []
        self.path_to_folder_info = {}  # Map paths to FolderInfo objects
        self.item_to_folder_info = {}  # Map tree item IDs to FolderInfo
        self.path_to_tree_item = {}  # Map paths to tree item IDs
        self.children_map = {}  # Track tree relationships for status calculations
        self.folder_status_cache = {}
        self.mapping_panel = None
        self.stats_panel = None
        self.archive_destination: Optional[SharePointDestination] = None
        self.current_project_file: Optional[str] = None
        self._updating_selection = False  # Guard against cross-selection recursion

        # Configure Styles
        self._configure_styles()

        # Setup UI
        self._create_menu()
        self._create_toolbar()
        self._create_main_content()
        self._create_statusbar()

        # Force UI update to prevent layout glitches
        self.root.update_idletasks()

    def _configure_styles(self) -> None:
        """Configure ttk styles and theme."""
        style = ttk.Style()

        # Use 'clam' theme if available for a cleaner look
        if 'clam' in style.theme_names():
            style.theme_use('clam')

        # Configure fonts and padding
        default_font = ('Segoe UI', 9) if os.name == 'nt' else ('Helvetica', 10)
        bold_font = ('Segoe UI', 9, 'bold') if os.name == 'nt' else ('Helvetica', 10, 'bold')

        style.configure('.', font=default_font)
        style.configure('Treeview', rowheight=25)
        style.configure('Treeview.Heading', font=bold_font)
        style.configure('TButton', padding=5)
        style.configure('TLabel', padding=2)
        style.configure('TLabelframe', padding=5)
        style.configure('TLabelframe.Label', font=bold_font)

    def _create_menu(self) -> None:
        """Create the menu bar."""
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)

        # File menu
        file_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="File", menu=file_menu)
        file_menu.add_command(label="New Project", command=self._new_project)
        file_menu.add_command(label="Open Project...", command=self._open_project)
        file_menu.add_command(label="Save Project", command=self._save_project)
        file_menu.add_command(label="Save Project As...", command=self._save_project_as)
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

        # Export menu
        export_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Export", menu=export_menu)
        export_menu.add_command(label="Validate Mappings...", command=self._validate_mappings)
        export_menu.add_separator()
        export_menu.add_command(label="Export to CSV...", command=self._export_csv)
        export_menu.add_command(label="Generate Summary Report...", command=self._generate_report)
        export_menu.add_command(label="Generate HTML Report...", command=self._generate_html_report)
        export_menu.add_separator()
        export_menu.add_command(label="Export Unmapped List...", command=self._export_unmapped)
        export_menu.add_command(label="Export CSV Template...", command=self._export_template)

        # Help menu
        help_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Help", menu=help_menu)
        help_menu.add_command(label="About", command=self._show_about)

    def _create_toolbar(self) -> None:
        """Create the toolbar."""
        toolbar = ttk.Frame(self.root, padding="5")
        toolbar.pack(side=tk.TOP, fill=tk.X)

        # Ensure toolbar propagates geometry correctly immediately
        toolbar.pack_propagate(True)

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

        # Middle pane - Tabbed view (Mappings List | Destination Tree)
        middle_frame = ttk.Frame(paned)
        paned.add(middle_frame, weight=2)

        # Create Notebook
        self.notebook = ttk.Notebook(middle_frame)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Tab 1: Mapping List
        self.mapping_panel = MappingPanel(
            self.notebook,
            on_delete_callback=self._on_mapping_deleted,
            on_select_callback=self._on_mapping_selected
        )
        self.notebook.add(self.mapping_panel, text="Mapping List")

        # Tab 2: Destination Preview
        self.destination_tree = DestinationTree(
            self.notebook,
            on_select_callback=self._on_destination_selected
        )
        self.notebook.add(self.destination_tree, text="Destination Preview")

        # Bind tab change to refresh views if needed
        self.notebook.bind('<<NotebookTabChanged>>', self._on_tab_changed)

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

        # Create and show progress dialog
        self.progress_dialog = ProgressDialog(self.root, "Scanning Folders")

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
                # Update progress dialog
                if hasattr(self, 'progress_dialog'):
                    self.root.after(
                        0,
                        lambda p=current_path, c=count: self.progress_dialog.update_progress(p, c)
                    )
                    # Check if cancelled
                    if self.progress_dialog.cancelled:
                        return False  # Signal to stop scanning

                # Also update status bar
                self.root.after(
                    0,
                    lambda c=count: self.statusbar.config(
                        text=f"Scanning... ({c} folders found)"
                    )
                )
                return True

            results = self.scanner.scan_folder(path, progress_callback=progress_callback)
            self.current_scan_results = results

            # Close progress dialog
            if hasattr(self, 'progress_dialog'):
                self.root.after(0, lambda: self.progress_dialog.close_dialog())

            # Update UI in main thread
            self.root.after(0, lambda: self._populate_tree(results))
            self.root.after(
                0,
                lambda: self.statusbar.config(
                    text=f"Scan complete. Found {len(results)} folders."
                )
            )

        except Exception as e:
            # Close progress dialog on error
            if hasattr(self, 'progress_dialog'):
                self.root.after(0, lambda: self.progress_dialog.close_dialog())

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
        # Note: detach() clears the view but keeps items in memory.
        # Since we are rebuilding, we must use delete().
        for item in self.tree.get_children():
            self.tree.delete(item)

        if not folders:
            return

        # Build tree structure
        self.path_to_folder_info = {}
        self.item_to_folder_info = {}  # Map tree item IDs to FolderInfo
        self.path_to_tree_item = {}
        self.children_map = {}

        # Sort folders by depth so parents are processed before children
        # This ensures parent items exist in tree when inserting children
        sorted_folders = sorted(folders, key=lambda f: f.depth)

        for folder in sorted_folders:
            # Store folder info
            self.path_to_folder_info[folder.path] = folder
            self.children_map.setdefault(folder.path, [])

            # Determine parent
            parent = ''
            if folder.parent_path and folder.parent_path in self.path_to_tree_item:
                parent = self.path_to_tree_item[folder.parent_path]
                self.children_map.setdefault(folder.parent_path, []).append(folder.path)

            # Format values
            size_str = format_size(folder.total_size)
            modified_str = folder.last_modified.strftime('%Y-%m-%d %H:%M')

            # Insert item with temporary status (will be updated after all items added)
            item_id = self.tree.insert(
                parent,
                'end',
                text=folder.name,
                values=(folder.file_count, size_str, modified_str, 'Unmapped'),
                tags=('unmapped',)
            )

            self.path_to_tree_item[folder.path] = item_id
            self.item_to_folder_info[item_id] = folder  # Store item ID to folder mapping

        # Rebuild cached statuses and update the UI without re-walking the entire tree repeatedly
        self._rebuild_status_cache()
        for item_id, folder in self.item_to_folder_info.items():
            status = self.folder_status_cache.get(folder.path, 'Unmapped')
            current_values = self.tree.item(item_id, 'values')
            if current_values:
                new_values = (current_values[0], current_values[1], current_values[2], status)
                self.tree.item(item_id, values=new_values, tags=(status.lower(),))

        # Configure tags for visual feedback
        self.tree.tag_configure('mapped', foreground='green')
        self.tree.tag_configure('unmapped', foreground='black')
        self.tree.tag_configure('partial', foreground='#CC7700')  # Orange for partial

        # Update stats
        self._update_stats()

    def _rebuild_status_cache(self) -> None:
        """Recalculate mapping statuses for every folder in the tree."""
        self.folder_status_cache = {}

        def compute_status(path: str) -> str:
            if path in self.folder_status_cache:
                return self.folder_status_cache[path]

            is_mapped = self.mapping_manager.is_mapped(path)
            if is_mapped:
                status = 'Mapped'
            else:
                has_mapped_children = False
                has_partial_children = False
                for child_path in self.children_map.get(path, []):
                    child_status = compute_status(child_path)
                    if child_status == 'Mapped':
                        has_mapped_children = True
                    elif child_status == 'Partial':
                        has_partial_children = True

                if has_mapped_children or has_partial_children:
                    status = 'Partial'
                else:
                    status = 'Unmapped'

            self.folder_status_cache[path] = status
            return status

        for folder_path in self.path_to_folder_info:
            compute_status(folder_path)

    def _on_folder_select(self, event) -> None:
        """
        Handle folder selection in tree.

        Args:
            event: Tkinter event
        """
        if self._updating_selection:
            return

        folder_info = self._get_selected_folder()
        if folder_info:
            self._display_folder_details(folder_info)
            # If folder is mapped, also select it in the mapping panel
            if self.mapping_panel and self.mapping_manager.is_mapped(folder_info.path):
                self._updating_selection = True
                try:
                    self.mapping_panel.select_by_source_path(folder_info.path)
                finally:
                    self._updating_selection = False

    def _on_mapping_selected(self, source_path: str) -> None:
        """
        Handle selection of a mapping in the mapping panel.
        Selects the corresponding folder in the source tree.

        Args:
            source_path: The source path of the selected mapping
        """
        if self._updating_selection:
            return

        tree_item = self.path_to_tree_item.get(source_path)
        folder = self.path_to_folder_info.get(source_path)
        if not tree_item or not folder:
            return

        self._updating_selection = True
        try:
            # Update Source Tree
            parent = self.tree.parent(tree_item)
            while parent:
                self.tree.item(parent, open=True)
                parent = self.tree.parent(parent)

            self.tree.selection_set(tree_item)
            self.tree.see(tree_item)
            self._display_folder_details(folder)
        finally:
            self._updating_selection = False

    def _on_destination_selected(self, mappings: List[FolderMapping], node_data: dict) -> None:
        """
        Handle selection in Destination Tree.

        Args:
            mappings: List of mappings associated with the selected node
            node_data: Dict containing node info (type, url, etc.)
        """
        if self._updating_selection:
            return

        # Display details for the destination
        self._display_destination_details(node_data, mappings)

        # If it's a single mapping leaf node, highlight source
        if node_data.get('type') == 'mapping' and len(mappings) == 1:
            self._updating_selection = True
            try:
                source_path = mappings[0].source_path
                tree_item = self.path_to_tree_item.get(source_path)
                if tree_item:
                    parent = self.tree.parent(tree_item)
                    while parent:
                        self.tree.item(parent, open=True)
                        parent = self.tree.parent(parent)
                    self.tree.selection_set(tree_item)
                    self.tree.see(tree_item)
            finally:
                self._updating_selection = False

    def _display_destination_details(self, node_data: dict, mappings: List[FolderMapping]) -> None:
        """Display details about selected destination node."""
        self.details_text.delete('1.0', tk.END)

        node_type = node_data.get('type', 'Unknown')
        total_size = sum(m.total_size_bytes for m in mappings)
        file_count = sum(m.file_count for m in mappings)

        details = f"""=== DESTINATION DETAILS ===

Type: {node_type.title()}
"""
        if 'url' in node_data:
            details += f"Site: {node_data['url']}\n"
        if 'lib' in node_data:
            details += f"Library: {node_data['lib']}\n"
        if 'key' in node_data:
            details += f"Path: {node_data['key']}\n"

        details += f"""
--- Statistics ---
Total Mapped Folders: {len(mappings)}
Total Files: {file_count}
Total Size: {format_size(total_size)}
"""

        # If it's a specific mapping, show source info
        if node_type == 'mapping' and mappings:
            m = mappings[0]
            details += f"""
--- Source Info ---
Source Path: {m.source_path}
Notes: {m.notes}
"""

        self.details_text.insert('1.0', details)

    def _on_tab_changed(self, event) -> None:
        """Handle tab change to update views."""
        selected_tab = self.notebook.select()
        tab_text = self.notebook.tab(selected_tab, "text")

        if tab_text == "Destination Preview":
            # Refresh destination tree
            mappings = self.mapping_manager.get_all_mappings()
            self.destination_tree.update_from_mappings(mappings)
            self._update_stats()

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

        # Look up folder directly by tree item ID
        return self.item_to_folder_info.get(item_id)

    def _display_folder_details(self, folder: FolderInfo) -> None:
        """
        Display folder details in details panel.

        Args:
            folder: FolderInfo object
        """
        self.details_text.delete('1.0', tk.END)

        # Get status
        status = self._get_folder_status(folder)
        is_mapped = self.mapping_manager.is_mapped(folder.path)

        details = f"""=== SOURCE FOLDER ===

Path: {folder.path}

Name: {folder.name}

Files: {folder.file_count}

Size: {format_size(folder.total_size)}
      ({folder.total_size:,} bytes)

Last Modified: {folder.last_modified.strftime('%Y-%m-%d %H:%M:%S')}

Depth Level: {folder.depth}

Status: {status}
"""

        # Add mapping details if mapped
        if is_mapped:
            mapping = self.mapping_manager.get_mapping(folder.path)
            if mapping:
                dest = mapping.destination
                details += f"""
=== MAPPING DETAILS ===

Destination Site: {dest.site_url}

Library: {dest.library_name}
"""
                if dest.subfolder:
                    details += f"""
Subfolder: {dest.subfolder}
"""
                details += f"""
Full Destination: {dest.get_full_destination()}
"""
                if mapping.notes:
                    details += f"""
Notes: {mapping.notes}
"""

        self.details_text.insert('1.0', details)

    def _refresh_view(self) -> None:
        """Refresh the current view, preserving expanded state."""
        if self.current_scan_results:
            # Save expanded state before refresh
            expanded_paths = self._get_expanded_paths()

            self._populate_tree(self.current_scan_results)

            # Restore expanded state
            self._restore_expanded_paths(expanded_paths)

            self.statusbar.config(text="View refreshed")

    def _get_expanded_paths(self) -> set:
        """Get set of paths for all expanded tree items."""
        expanded = set()

        def collect_expanded(item):
            if self.tree.item(item, 'open'):
                # Get the path for this item
                if item in self.item_to_folder_info:
                    expanded.add(self.item_to_folder_info[item].path)
            for child in self.tree.get_children(item):
                collect_expanded(child)

        for item in self.tree.get_children():
            collect_expanded(item)

        return expanded

    def _restore_expanded_paths(self, expanded_paths: set) -> None:
        """Restore expanded state for items matching given paths."""
        # Build path to item mapping
        path_to_item = {}
        for item_id, folder in self.item_to_folder_info.items():
            path_to_item[folder.path] = item_id

        # Expand items that were previously expanded
        for path in expanded_paths:
            if path in path_to_item:
                self.tree.item(path_to_item[path], open=True)

    def _update_single_item_status(self, folder_path: str) -> None:
        """Update the status column for a single item without rebuilding tree."""
        # Find the item for this path
        for item_id, folder in self.item_to_folder_info.items():
            if folder.path == folder_path:
                status = self._get_folder_status(folder)
                current_values = self.tree.item(item_id, 'values')
                if current_values:
                    new_values = (current_values[0], current_values[1], current_values[2], status)
                    self.tree.item(item_id, values=new_values, tags=(status.lower().replace(' ', '_'),))
                break

        # Also update parent folders' status (for partial mapping)
        self._update_parent_statuses(folder_path)

    def _get_folder_status(self, folder: FolderInfo) -> str:
        """
        Get the mapping status for a folder.

        Returns 'Mapped', 'Unmapped', or 'Partial' based on folder and children state.
        """
        if not folder:
            return 'Unmapped'

        if folder.path not in self.folder_status_cache:
            self._rebuild_status_cache()

        return self.folder_status_cache.get(folder.path, 'Unmapped')

    def _update_parent_statuses(self, folder_path: str) -> None:
        """Update the status of all parent folders for a given path."""
        # Get the folder info to find parents
        if folder_path not in self.path_to_folder_info:
            return

        folder = self.path_to_folder_info[folder_path]
        current_path = folder.parent_path

        while current_path and current_path in self.path_to_folder_info:
            parent_folder = self.path_to_folder_info[current_path]

            # Find the tree item for this parent
            for item_id, f in self.item_to_folder_info.items():
                if f.path == current_path:
                    status = self._get_folder_status(parent_folder)
                    current_values = self.tree.item(item_id, 'values')
                    if current_values:
                        new_values = (current_values[0], current_values[1], current_values[2], status)
                        self.tree.item(item_id, values=new_values, tags=(status.lower(),))
                    break

            current_path = parent_folder.parent_path

    def _clear_cache(self) -> None:
        """Clear the scan cache."""
        self.scanner.clear_cache()
        messagebox.showinfo("Cache Cleared", "Scan cache has been cleared.")

    def _new_project(self) -> None:
        """Create a new project."""
        if self.mapping_manager.mappings or self.mapping_manager.destinations:
            if not messagebox.askyesno(
                "New Project",
                "Creating a new project will clear current data.\n\nContinue?"
            ):
                return

        # Clear all data
        self.mapping_manager.clear_all_mappings()
        self.mapping_manager.destinations.clear()
        self.current_scan_results.clear()
        self.filtered_results.clear()
        self.archived_results.clear()
        self.path_to_folder_info.clear()
        self.item_to_folder_info.clear()
        self.archive_destination = None
        self.current_project_file = None
        self.path_var.set("")

        # Reset filter config
        self.filter_engine.update_config(create_default_config())

        # Clear tree
        for item in self.tree.get_children():
            self.tree.delete(item)

        # Update displays
        self._update_mappings_display()
        self.statusbar.config(text="New project created")

    def _open_project(self) -> None:
        """Open an existing project."""
        file_path = filedialog.askopenfilename(
            title="Open Project",
            filetypes=[("SPMM Project", "*.spmm"), ("All Files", "*.*")],
            defaultextension=".spmm"
        )

        if not file_path:
            return

        project_data = self.project_manager.load_project(file_path)
        if not project_data:
            messagebox.showerror(
                "Load Failed",
                "Failed to load project file."
            )
            return

        # Apply project data
        if self.project_manager.apply_project_data(project_data, self.mapping_manager):
            # Update filter config
            self.filter_engine.update_config(project_data['filter_config'])

            # Update archive destination
            self.archive_destination = project_data.get('archive_destination')

            # Update scan path
            if project_data.get('scan_path'):
                self.path_var.set(project_data['scan_path'])

            # Update displays
            self._update_mappings_display()

            # Refresh source tree to update mapped/unmapped status
            if self.current_scan_results:
                self._refresh_view()

            self.current_project_file = file_path
            self.statusbar.config(text=f"Loaded project: {file_path}")

            messagebox.showinfo(
                "Project Loaded",
                f"Loaded {len(self.mapping_manager.mappings)} mappings from {file_path}"
            )
        else:
            messagebox.showerror(
                "Load Failed",
                "Failed to apply project data."
            )

    def _save_project(self) -> None:
        """Save current project."""
        if self.current_project_file:
            self._save_project_to_file(self.current_project_file)
        else:
            self._save_project_as()

    def _save_project_as(self) -> None:
        """Save project as new file."""
        file_path = filedialog.asksaveasfilename(
            title="Save Project As",
            filetypes=[("SPMM Project", "*.spmm"), ("All Files", "*.*")],
            defaultextension=".spmm"
        )

        if file_path:
            self._save_project_to_file(file_path)

    def _save_project_to_file(self, file_path: str) -> None:
        """Save project to specified file."""
        if self.project_manager.save_project(
            file_path,
            self.mapping_manager,
            self.filter_engine.config,
            self.path_var.get(),
            self.archive_destination
        ):
            self.current_project_file = file_path
            self.statusbar.config(text=f"Saved project: {file_path}")
            messagebox.showinfo(
                "Project Saved",
                f"Saved project to {file_path}"
            )
        else:
            messagebox.showerror(
                "Save Failed",
                "Failed to save project file."
            )

    def _show_about(self) -> None:
        """Show about dialog."""
        messagebox.showinfo(
            "About",
            "File Share to SharePoint Migration Mapper\n\n"
            "Version 1.0.0 - Phase 4\n\n"
            "A tool for mapping file share folders to SharePoint libraries."
        )

    # Export methods

    def _validate_mappings(self) -> None:
        """Run validation and show report."""
        result = validate_mappings(
            self.mapping_manager,
            self.current_scan_results,
            self.filtered_results if self.filtered_results else self.current_scan_results
        )

        # Show validation report dialog
        dialog = ValidationReportDialog(
            self.root,
            result,
            on_export=lambda: self._do_export_csv(),
            on_cancel=None
        )
        self.root.wait_window(dialog)

    def _export_csv(self) -> None:
        """Export mappings to CSV with pre-validation."""
        if not self.mapping_manager.mappings:
            messagebox.showwarning(
                "No Mappings",
                "No mappings to export. Please create mappings first."
            )
            return

        # Run validation first
        result = validate_mappings(
            self.mapping_manager,
            self.current_scan_results,
            self.filtered_results if self.filtered_results else self.current_scan_results
        )

        # Show validation report if there are issues
        if result.error_count > 0 or result.warning_count > 0:
            dialog = ValidationReportDialog(
                self.root,
                result,
                on_export=lambda: self._do_export_csv(),
                on_cancel=None
            )
            self.root.wait_window(dialog)

            # If user cancelled, don't export
            if dialog.user_choice != 'export':
                return
        else:
            # No issues, proceed directly
            self._do_export_csv()

    def _do_export_csv(self) -> None:
        """Actually perform the CSV export."""
        file_path = filedialog.asksaveasfilename(
            title="Export Mappings to CSV",
            filetypes=[("CSV Files", "*.csv"), ("All Files", "*.*")],
            defaultextension=".csv"
        )

        if not file_path:
            return

        mappings = self.mapping_manager.get_all_mappings()
        if self.export_manager.export_to_csv(mappings, file_path):
            messagebox.showinfo(
                "Export Complete",
                f"Exported {len(mappings)} mappings to:\n{file_path}"
            )
            self.statusbar.config(text=f"Exported to {file_path}")
        else:
            messagebox.showerror(
                "Export Failed",
                "Failed to export mappings to CSV."
            )

    def _generate_report(self) -> None:
        """Generate summary report."""
        file_path = filedialog.asksaveasfilename(
            title="Generate Summary Report",
            filetypes=[("Text Files", "*.txt"), ("All Files", "*.*")],
            defaultextension=".txt"
        )

        if not file_path:
            return

        if self.export_manager.generate_summary_report(
            self.mapping_manager,
            self.current_scan_results,
            self.filtered_results if self.filtered_results else self.current_scan_results,
            self.archived_results,
            file_path
        ):
            messagebox.showinfo(
                "Report Generated",
                f"Summary report saved to:\n{file_path}"
            )
            self.statusbar.config(text=f"Report saved to {file_path}")
        else:
            messagebox.showerror(
                "Report Failed",
                "Failed to generate summary report."
            )

    def _generate_html_report(self) -> None:
        """Generate professionally styled HTML executive report."""
        if not self.current_scan_results:
            messagebox.showwarning(
                "No Scan Data",
                "Please scan a folder first."
            )
            return

        file_path = filedialog.asksaveasfilename(
            title="Generate HTML Report",
            filetypes=[("HTML Files", "*.html"), ("All Files", "*.*")],
            defaultextension=".html",
            initialfile="migration_report.html"
        )

        if not file_path:
            return

        # Get scan path for report header
        scan_path = ""
        if self.current_scan_results:
            # Try to find common root from results
            paths = [f.path for f in self.current_scan_results]
            if paths:
                scan_path = os.path.commonpath(paths) if len(paths) > 1 else os.path.dirname(paths[0])

        if self.export_manager.generate_html_report(
            self.mapping_manager,
            self.current_scan_results,
            self.filtered_results if self.filtered_results else self.current_scan_results,
            self.archived_results,
            file_path,
            scan_path
        ):
            messagebox.showinfo(
                "Report Generated",
                f"HTML report saved to:\n{file_path}"
            )
            self.statusbar.config(text=f"HTML report saved to {file_path}")

            # Offer to open in browser
            if messagebox.askyesno(
                "Open Report",
                "Would you like to open the report in your browser?"
            ):
                import webbrowser
                webbrowser.open(f"file://{os.path.abspath(file_path)}")
        else:
            messagebox.showerror(
                "Report Failed",
                "Failed to generate HTML report."
            )

    def _export_unmapped(self) -> None:
        """Export unmapped folders list."""
        if not self.current_scan_results:
            messagebox.showwarning(
                "No Scan Data",
                "Please scan a folder first."
            )
            return

        file_path = filedialog.asksaveasfilename(
            title="Export Unmapped Folders",
            filetypes=[("Text Files", "*.txt"), ("All Files", "*.*")],
            defaultextension=".txt"
        )

        if not file_path:
            return

        folders_to_check = self.filtered_results if self.filtered_results else self.current_scan_results

        if self.export_manager.generate_unmapped_list(
            folders_to_check,
            self.mapping_manager,
            file_path
        ):
            messagebox.showinfo(
                "Export Complete",
                f"Unmapped folders list saved to:\n{file_path}"
            )
            self.statusbar.config(text=f"Unmapped list saved to {file_path}")
        else:
            messagebox.showerror(
                "Export Failed",
                "Failed to export unmapped folders list."
            )

    def _export_template(self) -> None:
        """Export CSV template."""
        file_path = filedialog.asksaveasfilename(
            title="Export CSV Template",
            filetypes=[("CSV Files", "*.csv"), ("All Files", "*.*")],
            defaultextension=".csv"
        )

        if not file_path:
            return

        if self.export_manager.export_csv_template(file_path):
            messagebox.showinfo(
                "Template Exported",
                f"CSV template saved to:\n{file_path}"
            )
            self.statusbar.config(text=f"Template saved to {file_path}")
        else:
            messagebox.showerror(
                "Export Failed",
                "Failed to export CSV template."
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
            callback=self._update_stats,
            mapping_manager=self.mapping_manager
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
                if self.archive_destination:
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
