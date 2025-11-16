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
from mapping_manager import MappingManager


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
        self.current_scan_results: List[FolderInfo] = []

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

        # Path label and entry
        ttk.Label(toolbar, text="Scan Path:").pack(side=tk.LEFT, padx=2)
        self.path_var = tk.StringVar()
        path_entry = ttk.Entry(toolbar, textvariable=self.path_var, width=50)
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

        # Create paned window for resizable sections
        paned = ttk.PanedWindow(main_container, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True)

        # Left pane - Folder tree
        left_frame = ttk.Frame(paned)
        paned.add(left_frame, weight=3)

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

        # Right pane - Details panel
        right_frame = ttk.Frame(paned)
        paned.add(right_frame, weight=1)

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
        # Map paths to tree item IDs
        path_to_item = {}

        for folder in folders:
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

    def _on_folder_select(self, event) -> None:
        """
        Handle folder selection in tree.

        Args:
            event: Tkinter event
        """
        selection = self.tree.selection()
        if not selection:
            return

        # Get selected item
        item_id = selection[0]

        # Find corresponding folder info
        folder_name = self.tree.item(item_id, 'text')

        # Find in scan results (simplified - in production use path mapping)
        folder_info = None
        for folder in self.current_scan_results:
            if folder.name == folder_name:
                folder_info = folder
                break

        if folder_info:
            self._display_folder_details(folder_info)

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
            "Version 1.0.0 - Phase 1\n\n"
            "A tool for mapping file share folders to SharePoint libraries."
        )

    def run(self) -> None:
        """Start the application main loop."""
        self.root.mainloop()
