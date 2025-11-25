"""
GUI Destination Tree Module

This module provides the Destination Tree visualization component,
showing the SharePoint structure (Site -> Library -> Folders).
"""

import tkinter as tk
from tkinter import ttk
from typing import List, Dict, Optional, Callable
from mapping_manager import FolderMapping, SharePointDestination
from file_scanner import format_size
import os


class DestinationTree(ttk.Frame):
    """
    Tree view visualizing the SharePoint destination structure.
    """

    def __init__(self, parent, on_select_callback: Optional[Callable] = None):
        """
        Initialize the destination tree.

        Args:
            parent: Parent widget
            on_select_callback: Callback when a destination node is selected.
                                Args: (mapping_list_for_node)
        """
        super().__init__(parent)
        self.on_select_callback = on_select_callback
        self.mappings: List[FolderMapping] = []

        # Map tree item IDs to list of mappings contained in that node (recursively)
        self.item_to_mappings: Dict[str, List[FolderMapping]] = {}
        # Map tree item IDs to specific node data (type, name, etc)
        self.item_data: Dict[str, dict] = {}
        # Map unique destination keys to tree item IDs for reverse lookup
        self.dest_key_to_item: Dict[str, str] = {}

        self._create_widgets()

    def _create_widgets(self) -> None:
        """Create panel widgets."""
        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(side=tk.TOP, fill=tk.X, pady=(0, 5))

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

        # Tree view
        tree_frame = ttk.Frame(self)
        tree_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        vsb = ttk.Scrollbar(tree_frame, orient="vertical")
        hsb = ttk.Scrollbar(tree_frame, orient="horizontal")

        self.tree = ttk.Treeview(
            tree_frame,
            columns=('Count', 'Size'),
            show='tree headings',
            yscrollcommand=vsb.set,
            xscrollcommand=hsb.set
        )

        vsb.config(command=self.tree.yview)
        hsb.config(command=self.tree.xview)

        self.tree.grid(row=0, column=0, sticky='nsew')
        vsb.grid(row=0, column=1, sticky='ns')
        hsb.grid(row=1, column=0, sticky='ew')

        tree_frame.grid_rowconfigure(0, weight=1)
        tree_frame.grid_columnconfigure(0, weight=1)

        # Columns
        self.tree.heading('#0', text='SharePoint Structure', anchor=tk.W)
        self.tree.heading('Count', text='Folders')
        self.tree.heading('Size', text='Total Size')

        self.tree.column('#0', width=300, minwidth=200)
        self.tree.column('Count', width=80, minwidth=60)
        self.tree.column('Size', width=100, minwidth=80)

        # Tags
        self.tree.tag_configure('site', foreground='#0066CC', font=('Segoe UI', 9, 'bold'))
        self.tree.tag_configure('library', foreground='#006600', font=('Segoe UI', 9, 'bold'))
        self.tree.tag_configure('folder', foreground='black')

        # Bind events
        self.tree.bind('<<TreeviewSelect>>', self._on_select)

    def update_from_mappings(self, mappings: List[FolderMapping]) -> None:
        """
        Rebuild the tree based on current mappings.
        """
        self.mappings = mappings
        self.tree.detach(*self.tree.get_children())
        for item in self.tree.get_children():
            self.tree.delete(item)

        self.item_to_mappings = {}
        self.item_data = {}
        self.dest_key_to_item = {}

        if not mappings:
            return

        # Structure: Site -> Library -> Subfolder(s) -> Mapped Folders (as leaves)
        # But wait, the user wants "End Structure".
        # So we show Sites, Libraries, and any Subfolders defined in Destinations.
        # AND we should show the Source Folders that end up there as children.

        hierarchy = {}

        for mapping in mappings:
            dest = mapping.destination
            site = dest.site_url
            lib = dest.library_name
            # Split subfolder path if it exists
            subs = dest.subfolder.split('/') if dest.subfolder else []

            if site not in hierarchy:
                hierarchy[site] = {}
            if lib not in hierarchy[site]:
                hierarchy[site][lib] = {'mappings': [], 'subs': {}}

            current = hierarchy[site][lib]
            for sub in subs:
                if sub not in current['subs']:
                    current['subs'][sub] = {'mappings': [], 'subs': {}}
                current = current['subs'][sub]

            # Add mapping to the leaf destination node
            current['mappings'].append(mapping)

        # Build Tree
        for site_url in sorted(hierarchy.keys()):
            site_data = hierarchy[site_url]
            site_mappings = self._collect_mappings_recursive(site_data)
            site_size = sum(m.total_size_bytes for m in site_mappings)

            site_name = self._extract_site_name(site_url)
            site_id = self.tree.insert(
                '',
                'end',
                text=f"🌐 {site_name}",
                values=(len(site_mappings), format_size(site_size)),
                tags=('site',),
                open=True
            )
            self.item_to_mappings[site_id] = site_mappings
            self.dest_key_to_item[site_url] = site_id
            self.item_data[site_id] = {'type': 'site', 'url': site_url}

            for lib_name in sorted(site_data.keys()):
                lib_data = site_data[lib_name]
                lib_mappings = self._collect_mappings_recursive(lib_data)
                lib_size = sum(m.total_size_bytes for m in lib_mappings)

                lib_id = self.tree.insert(
                    site_id,
                    'end',
                    text=f"📚 {lib_name}",
                    values=(len(lib_mappings), format_size(lib_size)),
                    tags=('library',),
                    open=True
                )
                self.item_to_mappings[lib_id] = lib_mappings
                key = f"{site_url}/{lib_name}"
                self.dest_key_to_item[key] = lib_id
                self.item_data[lib_id] = {'type': 'library', 'url': site_url, 'lib': lib_name}

                self._build_subfolders(lib_id, lib_data, key)

    def _build_subfolders(self, parent_id: str, data: dict, parent_key: str) -> None:
        """Recursively build subfolders and mapped items."""
        # 1. Process Destination Subfolders (virtual folders from configuration)
        for sub_name in sorted(data.get('subs', {}).keys()):
            sub_data = data['subs'][sub_name]
            sub_mappings = self._collect_mappings_recursive(sub_data)
            sub_size = sum(m.total_size_bytes for m in sub_mappings)

            node_id = self.tree.insert(
                parent_id,
                'end',
                text=f"📂 {sub_name}",
                values=(len(sub_mappings), format_size(sub_size)),
                tags=('folder',),
                open=True
            )
            self.item_to_mappings[node_id] = sub_mappings
            current_key = f"{parent_key}/{sub_name}"
            self.dest_key_to_item[current_key] = node_id
            self.item_data[node_id] = {'type': 'subfolder', 'key': current_key}

            self._build_subfolders(node_id, sub_data, current_key)

        # 2. Add actual mapped folders (Sources) as leaves
        for mapping in sorted(data.get('mappings', []), key=lambda m: os.path.basename(m.source_path)):
            folder_name = os.path.basename(mapping.source_path)
            node_id = self.tree.insert(
                parent_id,
                'end',
                text=f"📄 {folder_name}",
                values=(1, format_size(mapping.total_size_bytes)),
                tags=('folder',)
            )
            self.item_to_mappings[node_id] = [mapping]
            self.item_data[node_id] = {'type': 'mapping', 'path': mapping.source_path}

    def _collect_mappings_recursive(self, data: dict) -> List[FolderMapping]:
        """Collect all mappings in this node and subnodes."""
        mappings = list(data.get('mappings', []))
        for sub in data.get('subs', {}).values():
            mappings.extend(self._collect_mappings_recursive(sub))
        return mappings

    def _extract_site_name(self, url: str) -> str:
        """Extract friendly site name."""
        if '/sites/' in url:
            return url.split('/sites/')[-1].split('/')[0]
        elif '/teams/' in url:
            return url.split('/teams/')[-1].split('/')[0]
        else:
            return url.split('://')[-1].split('/')[0]

    def _on_select(self, event) -> None:
        """Handle selection."""
        selection = self.tree.selection()
        if not selection:
            return

        item_id = selection[0]
        mappings = self.item_to_mappings.get(item_id, [])
        data = self.item_data.get(item_id, {})

        if self.on_select_callback:
            self.on_select_callback(mappings, data)

    def _expand_all(self) -> None:
        def expand(item):
            self.tree.item(item, open=True)
            for child in self.tree.get_children(item):
                expand(child)
        for item in self.tree.get_children():
            expand(item)

    def _collapse_all(self) -> None:
        for item in self.tree.get_children():
            self.tree.item(item, open=False)
