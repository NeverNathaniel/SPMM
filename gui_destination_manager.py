"""
GUI Destination Manager Module

This module provides UI components for managing SharePoint destinations.
"""

import tkinter as tk
from tkinter import ttk, messagebox
from typing import Optional, List, Callable, TYPE_CHECKING
from mapping_manager import SharePointDestination
import re

if TYPE_CHECKING:
    from mapping_manager import MappingManager


class DestinationManagerDialog(tk.Toplevel):
    """Dialog for managing SharePoint destinations."""

    def __init__(
        self,
        parent,
        destinations: List[SharePointDestination],
        callback: Optional[Callable] = None,
        mapping_manager: Optional['MappingManager'] = None
    ):
        """
        Initialize the destination manager dialog.

        Args:
            parent: Parent window
            destinations: List of existing destinations
            callback: Optional callback when destinations change
            mapping_manager: Optional MappingManager to update mappings on destination edit
        """
        super().__init__(parent)
        self.title("Manage SharePoint Destinations")
        self.geometry("700x500")
        self.transient(parent)

        self.destinations = destinations
        self.callback = callback
        self.mapping_manager = mapping_manager
        self.result = None

        self._create_widgets()
        self._populate_list()

        # Center on parent
        self.grab_set()

    def _create_widgets(self) -> None:
        """Create dialog widgets."""
        # Main container
        main_frame = ttk.Frame(self, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Title
        ttk.Label(
            main_frame,
            text="SharePoint Destinations",
            font=('Arial', 12, 'bold')
        ).pack(pady=(0, 10))

        # List frame
        list_frame = ttk.Frame(main_frame)
        list_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        # Scrollbar
        scrollbar = ttk.Scrollbar(list_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # Listbox for destinations
        self.dest_listbox = tk.Listbox(
            list_frame,
            yscrollcommand=scrollbar.set,
            height=10
        )
        self.dest_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.dest_listbox.yview)

        # Bind double-click to edit
        self.dest_listbox.bind('<Double-Button-1>', lambda e: self._edit_destination())

        # Buttons frame
        btn_frame = ttk.Frame(main_frame)
        btn_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Button(btn_frame, text="Add New", command=self._add_destination).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="Edit", command=self._edit_destination).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="Remove", command=self._remove_destination).pack(side=tk.LEFT, padx=2)

        # Close button
        ttk.Button(main_frame, text="Close", command=self.destroy).pack(pady=5)

    def _populate_list(self) -> None:
        """Populate the destinations list."""
        self.dest_listbox.delete(0, tk.END)
        for dest in self.destinations:
            display_text = f"{dest.site_url} / {dest.library_name}"
            if dest.subfolder:
                display_text += f" / {dest.subfolder}"
            self.dest_listbox.insert(tk.END, display_text)

    def _add_destination(self) -> None:
        """Add a new destination."""
        dialog = AddDestinationDialog(self)
        self.wait_window(dialog)

        if dialog.result:
            # Check for duplicates
            for existing in self.destinations:
                if (existing.site_url == dialog.result.site_url and
                    existing.library_name == dialog.result.library_name and
                    existing.subfolder == dialog.result.subfolder):
                    messagebox.showwarning(
                        "Duplicate",
                        "This destination already exists."
                    )
                    return

            self.destinations.append(dialog.result)
            self._populate_list()
            if self.callback:
                self.callback()

    def _edit_destination(self) -> None:
        """Edit selected destination."""
        selection = self.dest_listbox.curselection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a destination to edit.")
            return

        index = selection[0]
        old_dest = self.destinations[index]

        dialog = AddDestinationDialog(self, old_dest)
        self.wait_window(dialog)

        if dialog.result:
            new_dest = dialog.result
            self.destinations[index] = new_dest

            # Update any existing mappings that reference the old destination
            if self.mapping_manager:
                updated_count = 0
                for mapping in self.mapping_manager.mappings.values():
                    if mapping.destination == old_dest:
                        mapping.destination = new_dest
                        updated_count += 1
                if updated_count > 0:
                    # Log or notify that mappings were updated
                    pass

            self._populate_list()
            if self.callback:
                self.callback()

    def _remove_destination(self) -> None:
        """Remove selected destination."""
        selection = self.dest_listbox.curselection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a destination to remove.")
            return

        index = selection[0]
        dest = self.destinations[index]

        # Confirm
        if messagebox.askyesno(
            "Confirm Remove",
            f"Remove destination:\n{dest.get_full_destination()}?"
        ):
            del self.destinations[index]
            self._populate_list()
            if self.callback:
                self.callback()


class AddDestinationDialog(tk.Toplevel):
    """Dialog for adding/editing a SharePoint destination."""

    def __init__(self, parent, destination: Optional[SharePointDestination] = None):
        """
        Initialize the add destination dialog.

        Args:
            parent: Parent window
            destination: Existing destination to edit (None for new)
        """
        super().__init__(parent)
        self.title("Add Destination" if destination is None else "Edit Destination")
        self.geometry("500x250")
        self.transient(parent)
        self.resizable(False, False)

        self.result = None
        self.editing = destination

        self._create_widgets()

        if destination:
            self._load_destination(destination)

        # Keyboard shortcuts
        self.bind('<Return>', lambda e: self._ok())
        self.bind('<Escape>', lambda e: self.destroy())

        # Center on parent
        self.grab_set()

        # Focus first entry
        self.after(100, lambda: self.site_url_var.set(self.site_url_var.get()))

    def _create_widgets(self) -> None:
        """Create dialog widgets."""
        main_frame = ttk.Frame(self, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Site URL
        ttk.Label(main_frame, text="SharePoint Site URL:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.site_url_var = tk.StringVar()
        ttk.Entry(main_frame, textvariable=self.site_url_var, width=50).grid(
            row=0, column=1, pady=5, padx=(10, 0)
        )
        ttk.Label(
            main_frame,
            text="Example: https://contoso.sharepoint.com/sites/HR",
            font=('Arial', 8),
            foreground='gray'
        ).grid(row=1, column=1, sticky=tk.W, padx=(10, 0))

        # Library Name
        ttk.Label(main_frame, text="Library Name:").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.library_var = tk.StringVar()
        ttk.Entry(main_frame, textvariable=self.library_var, width=50).grid(
            row=2, column=1, pady=5, padx=(10, 0)
        )
        ttk.Label(
            main_frame,
            text="Example: Documents, Shared Documents",
            font=('Arial', 8),
            foreground='gray'
        ).grid(row=3, column=1, sticky=tk.W, padx=(10, 0))

        # Subfolder (optional)
        ttk.Label(main_frame, text="Subfolder (optional):").grid(row=4, column=0, sticky=tk.W, pady=5)
        self.subfolder_var = tk.StringVar()
        ttk.Entry(main_frame, textvariable=self.subfolder_var, width=50).grid(
            row=4, column=1, pady=5, padx=(10, 0)
        )
        ttk.Label(
            main_frame,
            text="Example: Archive, Departments/Finance",
            font=('Arial', 8),
            foreground='gray'
        ).grid(row=5, column=1, sticky=tk.W, padx=(10, 0))

        # Buttons
        btn_frame = ttk.Frame(main_frame)
        btn_frame.grid(row=6, column=0, columnspan=2, pady=20)

        ttk.Button(btn_frame, text="OK", command=self._ok).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side=tk.LEFT, padx=5)

    def _load_destination(self, dest: SharePointDestination) -> None:
        """Load destination data into fields."""
        self.site_url_var.set(dest.site_url)
        self.library_var.set(dest.library_name)
        if dest.subfolder:
            self.subfolder_var.set(dest.subfolder)

    def _validate_url(self, url: str) -> bool:
        """
        Validate SharePoint URL format.

        Args:
            url: URL to validate

        Returns:
            True if valid, False otherwise
        """
        if not url:
            return False

        # More flexible URL validation to support:
        # - Standard SharePoint (.sharepoint.com)
        # - Government cloud (.sharepoint.us, .sharepoint-mil.us)
        # - Custom domains
        pattern = r'^https?://[a-zA-Z0-9.-]+(/.*)?$'
        if not re.match(pattern, url):
            return False

        # Check for common SharePoint indicators
        url_lower = url.lower()
        if 'sharepoint' in url_lower or '/sites/' in url_lower or '/teams/' in url_lower:
            return True

        # For other URLs, just ensure it's a valid HTTP(S) URL
        return url.startswith('http://') or url.startswith('https://')

    def _validate_library_name(self, name: str) -> bool:
        """
        Validate SharePoint library name.

        Args:
            name: Library name to validate

        Returns:
            True if valid, False otherwise
        """
        if not name:
            return False

        # SharePoint invalid characters: \ / : * ? " < > | #
        invalid_chars = r'[\\/:*?"<>|#]'
        if re.search(invalid_chars, name):
            return False

        # Check length (SharePoint has 128 char limit for library names)
        if len(name) > 128:
            return False

        return True

    def _validate_subfolder_path(self, path: str) -> bool:
        """
        Validate SharePoint subfolder path (can contain / for nesting).

        Args:
            path: Subfolder path to validate (e.g., "Departments/Finance")

        Returns:
            True if valid, False otherwise
        """
        if not path:
            return True  # Empty subfolder is valid

        # Split by / and validate each segment
        segments = path.split('/')

        # SharePoint invalid characters for folder names (excluding /)
        invalid_chars = r'[\\:*?"<>|#]'

        for segment in segments:
            segment = segment.strip()
            if not segment:
                continue  # Skip empty segments (double slashes)

            if re.search(invalid_chars, segment):
                return False

            # Each segment has its own length limit
            if len(segment) > 128:
                return False

        # Total path length check
        if len(path) > 400:
            return False

        return True

    def _ok(self) -> None:
        """Handle OK button."""
        site_url = self.site_url_var.get().strip()
        library = self.library_var.get().strip()
        subfolder = self.subfolder_var.get().strip()

        # Validate
        if not site_url:
            messagebox.showerror("Validation Error", "Site URL is required.")
            return

        if not self._validate_url(site_url):
            messagebox.showerror(
                "Validation Error",
                "Invalid URL format.\n\n"
                "Expected format: https://yoursite.sharepoint.com/sites/sitename\n"
                "or other valid SharePoint URL"
            )
            return

        if not library:
            messagebox.showerror("Validation Error", "Library name is required.")
            return

        if not self._validate_library_name(library):
            messagebox.showerror(
                "Validation Error",
                "Invalid library name.\n\n"
                "Library names cannot contain: \\ / : * ? \" < > | #\n"
                "Maximum length: 128 characters"
            )
            return

        # Validate subfolder if provided (allows / for nested paths)
        if subfolder and not self._validate_subfolder_path(subfolder):
            messagebox.showerror(
                "Validation Error",
                "Invalid subfolder path.\n\n"
                "Subfolder segments cannot contain: \\ : * ? \" < > | #\n"
                "Use / to separate nested folders (e.g., Departments/Finance)\n"
                "Maximum length per segment: 128 characters"
            )
            return

        # Check total path length (SharePoint has 400 char limit for full paths)
        full_path = f"{site_url}/{library}/{subfolder}" if subfolder else f"{site_url}/{library}"
        if len(full_path) > 400:
            messagebox.showerror(
                "Validation Error",
                f"Total destination path is too long ({len(full_path)} characters).\n\n"
                "SharePoint has a 400 character limit for full paths.\n"
                "Please use shorter site URL, library name, or subfolder."
            )
            return

        # Create result
        self.result = SharePointDestination(
            site_url=site_url.rstrip('/'),
            library_name=library,
            subfolder=subfolder if subfolder else None
        )

        self.destroy()


class QuickMapDialog(tk.Toplevel):
    """Quick mapping dialog for selecting destination."""

    def __init__(self, parent, destinations: List[SharePointDestination], source_path: str):
        """
        Initialize quick map dialog.

        Args:
            parent: Parent window
            destinations: Available destinations
            source_path: Source folder path being mapped
        """
        super().__init__(parent)
        self.title("Map Folder")
        self.geometry("600x350")
        self.transient(parent)
        self.minsize(400, 250)

        self.destinations = destinations
        self.source_path = source_path
        self.result = None

        self._create_widgets()

        # Keyboard shortcuts
        self.bind('<Return>', lambda e: self._map())
        self.bind('<Escape>', lambda e: self.destroy())

        # Center on parent
        self.grab_set()

    def _create_widgets(self) -> None:
        """Create dialog widgets."""
        main_frame = ttk.Frame(self, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Source info
        ttk.Label(
            main_frame,
            text="Map Source Folder:",
            font=('Arial', 10, 'bold')
        ).pack(anchor=tk.W, pady=(0, 5))

        ttk.Label(
            main_frame,
            text=self.source_path,
            foreground='blue'
        ).pack(anchor=tk.W, pady=(0, 15))

        # Destination selection
        ttk.Label(
            main_frame,
            text="To Destination:",
            font=('Arial', 10, 'bold')
        ).pack(anchor=tk.W, pady=(0, 5))

        if not self.destinations:
            ttk.Label(
                main_frame,
                text="No destinations available. Please add destinations first.",
                foreground='red'
            ).pack(anchor=tk.W, pady=10)

            ttk.Button(main_frame, text="Close", command=self.destroy).pack(pady=10)
            return

        # List of destinations
        list_frame = ttk.Frame(main_frame)
        list_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        scrollbar = ttk.Scrollbar(list_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self.dest_listbox = tk.Listbox(
            list_frame,
            yscrollcommand=scrollbar.set,
            height=8
        )
        self.dest_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.dest_listbox.yview)

        # Double-click to map
        self.dest_listbox.bind('<Double-Button-1>', lambda e: self._map())

        # Populate
        for dest in self.destinations:
            display_text = f"{dest.site_url} / {dest.library_name}"
            if dest.subfolder:
                display_text += f" / {dest.subfolder}"
            self.dest_listbox.insert(tk.END, display_text)

        # Select first by default
        if self.destinations:
            self.dest_listbox.selection_set(0)

        # Buttons frame at bottom
        btn_frame = ttk.Frame(main_frame)
        btn_frame.pack(side=tk.BOTTOM, pady=10)

        ttk.Button(btn_frame, text="Map", command=self._map, width=10).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy, width=10).pack(side=tk.LEFT, padx=5)

    def _map(self) -> None:
        """Handle map button."""
        selection = self.dest_listbox.curselection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a destination.")
            return

        index = selection[0]
        self.result = self.destinations[index]
        self.destroy()
