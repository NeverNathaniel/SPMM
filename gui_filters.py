"""
GUI Filters Module

This module provides UI components for configuring filtering rules.
"""

import tkinter as tk
from tkinter import ttk, messagebox
from typing import Optional, Callable
from filter_engine import FilterConfig, COMMON_EXCLUSION_PATTERNS


class FilterConfigDialog(tk.Toplevel):
    """Dialog for configuring filters."""

    def __init__(self, parent, config: FilterConfig, callback: Optional[Callable] = None):
        """
        Initialize the filter configuration dialog.

        Args:
            parent: Parent window
            config: Current FilterConfig
            callback: Optional callback when config changes
        """
        super().__init__(parent)
        self.title("Filter Configuration")
        self.geometry("600x700")
        self.transient(parent)

        self.config = config
        self.callback = callback
        self.result = None

        self._create_widgets()
        self._load_config()

        # Keyboard shortcuts
        self.bind('<Return>', lambda e: self._apply())
        self.bind('<Escape>', lambda e: self.destroy())

        # Center on parent
        self.grab_set()

    def _create_widgets(self) -> None:
        """Create dialog widgets."""
        # Main container with scrollbar
        main_frame = ttk.Frame(self, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Canvas for scrolling
        canvas = tk.Canvas(main_frame)
        scrollbar = ttk.Scrollbar(main_frame, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)

        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )

        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # Enable mouse wheel scrolling
        def _on_mousewheel(event):
            canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

        def _on_mousewheel_linux(event):
            if event.num == 4:
                canvas.yview_scroll(-1, "units")
            elif event.num == 5:
                canvas.yview_scroll(1, "units")

        # Bind mouse wheel events
        canvas.bind_all("<MouseWheel>", _on_mousewheel)  # Windows/Mac
        canvas.bind_all("<Button-4>", _on_mousewheel_linux)  # Linux scroll up
        canvas.bind_all("<Button-5>", _on_mousewheel_linux)  # Linux scroll down

        # Store canvas reference for cleanup
        self._canvas = canvas

        current_row = 0

        # Date-based filtering section
        ttk.Label(
            scrollable_frame,
            text="Date-Based Filtering",
            font=('Arial', 10, 'bold')
        ).grid(row=current_row, column=0, columnspan=3, sticky=tk.W, pady=(0, 10))
        current_row += 1

        self.date_threshold_var = tk.BooleanVar()
        ttk.Checkbutton(
            scrollable_frame,
            text="Enable date threshold filtering",
            variable=self.date_threshold_var
        ).grid(row=current_row, column=0, columnspan=3, sticky=tk.W, pady=5)
        current_row += 1

        ttk.Label(scrollable_frame, text="Days since last modification:").grid(
            row=current_row, column=0, sticky=tk.W, padx=(20, 0)
        )
        self.date_threshold_days_var = tk.IntVar()
        ttk.Spinbox(
            scrollable_frame,
            from_=30,
            to=3650,
            textvariable=self.date_threshold_days_var,
            width=10
        ).grid(row=current_row, column=1, sticky=tk.W, padx=5)
        ttk.Label(scrollable_frame, text="(30-3650 days)").grid(
            row=current_row, column=2, sticky=tk.W
        )
        current_row += 1

        self.archive_old_var = tk.BooleanVar()
        ttk.Checkbutton(
            scrollable_frame,
            text="Auto-route old files to archive destination",
            variable=self.archive_old_var
        ).grid(row=current_row, column=0, columnspan=3, sticky=tk.W, padx=(20, 0), pady=5)
        current_row += 1

        # Separator
        ttk.Separator(scrollable_frame, orient=tk.HORIZONTAL).grid(
            row=current_row, column=0, columnspan=3, sticky='ew', pady=15
        )
        current_row += 1

        # Pattern exclusion section
        ttk.Label(
            scrollable_frame,
            text="Pattern Exclusions",
            font=('Arial', 10, 'bold')
        ).grid(row=current_row, column=0, columnspan=3, sticky=tk.W, pady=(0, 10))
        current_row += 1

        self.exclude_patterns_var = tk.BooleanVar()
        ttk.Checkbutton(
            scrollable_frame,
            text="Enable pattern exclusions",
            variable=self.exclude_patterns_var
        ).grid(row=current_row, column=0, columnspan=3, sticky=tk.W, pady=5)
        current_row += 1

        ttk.Label(scrollable_frame, text="Exclude patterns (one per line):").grid(
            row=current_row, column=0, columnspan=3, sticky=tk.W, padx=(20, 0)
        )
        current_row += 1

        # Pattern list
        pattern_frame = ttk.Frame(scrollable_frame)
        pattern_frame.grid(row=current_row, column=0, columnspan=3, sticky='ew', padx=(20, 0), pady=5)

        pattern_scroll = ttk.Scrollbar(pattern_frame)
        self.pattern_text = tk.Text(
            pattern_frame,
            height=6,
            width=50,
            yscrollcommand=pattern_scroll.set
        )
        pattern_scroll.config(command=self.pattern_text.yview)

        self.pattern_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        pattern_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        current_row += 1

        # Quick add common patterns
        ttk.Button(
            scrollable_frame,
            text="Load Common Patterns",
            command=self._load_common_patterns
        ).grid(row=current_row, column=0, sticky=tk.W, padx=(20, 0), pady=5)
        current_row += 1

        # Help text
        help_text = "Patterns support wildcards: * (any chars), ? (single char)\nExample: temp, *cache*, ~*, $*"
        ttk.Label(
            scrollable_frame,
            text=help_text,
            font=('Arial', 8),
            foreground='gray'
        ).grid(row=current_row, column=0, columnspan=3, sticky=tk.W, padx=(20, 0))
        current_row += 1

        # Separator
        ttk.Separator(scrollable_frame, orient=tk.HORIZONTAL).grid(
            row=current_row, column=0, columnspan=3, sticky='ew', pady=15
        )
        current_row += 1

        # Size filtering section
        ttk.Label(
            scrollable_frame,
            text="Size Filtering",
            font=('Arial', 10, 'bold')
        ).grid(row=current_row, column=0, columnspan=3, sticky=tk.W, pady=(0, 10))
        current_row += 1

        # Minimum size
        self.min_size_var = tk.BooleanVar()
        ttk.Checkbutton(
            scrollable_frame,
            text="Minimum folder size",
            variable=self.min_size_var
        ).grid(row=current_row, column=0, sticky=tk.W, pady=5)
        current_row += 1

        size_frame1 = ttk.Frame(scrollable_frame)
        size_frame1.grid(row=current_row, column=0, columnspan=3, sticky=tk.W, padx=(20, 0))

        self.min_size_value_var = tk.DoubleVar()
        ttk.Entry(size_frame1, textvariable=self.min_size_value_var, width=10).pack(side=tk.LEFT)
        self.min_size_unit_var = tk.StringVar(value="MB")
        ttk.Combobox(
            size_frame1,
            textvariable=self.min_size_unit_var,
            values=["KB", "MB", "GB"],
            width=5,
            state="readonly"
        ).pack(side=tk.LEFT, padx=5)

        current_row += 1

        # Maximum size
        self.max_size_var = tk.BooleanVar()
        ttk.Checkbutton(
            scrollable_frame,
            text="Maximum folder size",
            variable=self.max_size_var
        ).grid(row=current_row, column=0, sticky=tk.W, pady=5)
        current_row += 1

        size_frame2 = ttk.Frame(scrollable_frame)
        size_frame2.grid(row=current_row, column=0, columnspan=3, sticky=tk.W, padx=(20, 0))

        self.max_size_value_var = tk.DoubleVar()
        ttk.Entry(size_frame2, textvariable=self.max_size_value_var, width=10).pack(side=tk.LEFT)
        self.max_size_unit_var = tk.StringVar(value="GB")
        ttk.Combobox(
            size_frame2,
            textvariable=self.max_size_unit_var,
            values=["KB", "MB", "GB"],
            width=5,
            state="readonly"
        ).pack(side=tk.LEFT, padx=5)

        current_row += 1

        # Separator
        ttk.Separator(scrollable_frame, orient=tk.HORIZONTAL).grid(
            row=current_row, column=0, columnspan=3, sticky='ew', pady=15
        )
        current_row += 1

        # File count filtering section
        ttk.Label(
            scrollable_frame,
            text="File Count Filtering",
            font=('Arial', 10, 'bold')
        ).grid(row=current_row, column=0, columnspan=3, sticky=tk.W, pady=(0, 10))
        current_row += 1

        self.skip_empty_var = tk.BooleanVar()
        ttk.Checkbutton(
            scrollable_frame,
            text="Skip empty folders (no files)",
            variable=self.skip_empty_var
        ).grid(row=current_row, column=0, columnspan=3, sticky=tk.W, pady=5)
        current_row += 1

        self.min_file_count_var = tk.BooleanVar()
        ttk.Checkbutton(
            scrollable_frame,
            text="Minimum file count",
            variable=self.min_file_count_var
        ).grid(row=current_row, column=0, sticky=tk.W, pady=5)
        current_row += 1

        file_count_frame = ttk.Frame(scrollable_frame)
        file_count_frame.grid(row=current_row, column=0, columnspan=3, sticky=tk.W, padx=(20, 0))

        self.min_file_count_value_var = tk.IntVar()
        ttk.Spinbox(
            file_count_frame,
            from_=1,
            to=1000,
            textvariable=self.min_file_count_value_var,
            width=10
        ).pack(side=tk.LEFT)
        ttk.Label(file_count_frame, text="files").pack(side=tk.LEFT, padx=5)

        current_row += 1

        # Configure grid weights
        scrollable_frame.columnconfigure(0, weight=1)

        # Buttons frame (outside scrollable area)
        btn_frame = ttk.Frame(main_frame)
        btn_frame.pack(side=tk.BOTTOM, fill=tk.X, pady=(10, 0))

        ttk.Button(btn_frame, text="Apply", command=self._apply).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Reset to Defaults", command=self._reset_defaults).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side=tk.RIGHT, padx=5)

    def _load_config(self) -> None:
        """Load current config into UI."""
        self.date_threshold_var.set(self.config.date_threshold_enabled)
        self.date_threshold_days_var.set(self.config.date_threshold_days)
        self.archive_old_var.set(self.config.archive_old_files)

        self.exclude_patterns_var.set(self.config.exclude_patterns_enabled)
        if self.config.exclude_patterns:
            self.pattern_text.delete('1.0', tk.END)
            self.pattern_text.insert('1.0', '\n'.join(self.config.exclude_patterns))

        self.min_size_var.set(self.config.min_size_enabled)
        if self.config.min_size_bytes > 0:
            # Convert to MB for display
            self.min_size_value_var.set(round(self.config.min_size_bytes / (1024 * 1024), 2))

        self.max_size_var.set(self.config.max_size_enabled)
        if self.config.max_size_bytes > 0:
            # Convert to GB for display
            self.max_size_value_var.set(round(self.config.max_size_bytes / (1024 * 1024 * 1024), 2))

        self.skip_empty_var.set(self.config.skip_empty_folders)
        self.min_file_count_var.set(self.config.min_file_count_enabled)
        self.min_file_count_value_var.set(self.config.min_file_count)

    def _load_common_patterns(self) -> None:
        """Load common exclusion patterns."""
        self.pattern_text.delete('1.0', tk.END)
        self.pattern_text.insert('1.0', '\n'.join(COMMON_EXCLUSION_PATTERNS))

    def _convert_size_to_bytes(self, value: float, unit: str) -> int:
        """
        Convert size value to bytes.

        Args:
            value: Size value
            unit: Unit (KB, MB, GB)

        Returns:
            Size in bytes
        """
        multipliers = {
            'KB': 1024,
            'MB': 1024 * 1024,
            'GB': 1024 * 1024 * 1024
        }
        return int(value * multipliers.get(unit, 1))

    def _apply(self) -> None:
        """Apply configuration."""
        try:
            # Get patterns from text widget
            patterns_text = self.pattern_text.get('1.0', tk.END).strip()
            patterns = [p.strip() for p in patterns_text.split('\n') if p.strip()]

            # Convert sizes
            min_size_bytes = 0
            if self.min_size_var.get():
                min_size_bytes = self._convert_size_to_bytes(
                    self.min_size_value_var.get(),
                    self.min_size_unit_var.get()
                )

            max_size_bytes = 0
            if self.max_size_var.get():
                max_size_bytes = self._convert_size_to_bytes(
                    self.max_size_value_var.get(),
                    self.max_size_unit_var.get()
                )

            # Validate min/max size relationship
            if self.min_size_var.get() and self.max_size_var.get():
                if min_size_bytes > max_size_bytes:
                    messagebox.showerror(
                        "Validation Error",
                        "Minimum size cannot be greater than maximum size.\n\n"
                        f"Current values:\n"
                        f"  Minimum: {self.min_size_value_var.get()} {self.min_size_unit_var.get()}\n"
                        f"  Maximum: {self.max_size_value_var.get()} {self.max_size_unit_var.get()}"
                    )
                    return

            # Validate size values are non-negative
            if min_size_bytes < 0 or max_size_bytes < 0:
                messagebox.showerror(
                    "Validation Error",
                    "Size values cannot be negative."
                )
                return

            # Create new config
            self.result = FilterConfig(
                date_threshold_enabled=self.date_threshold_var.get(),
                date_threshold_days=self.date_threshold_days_var.get(),
                archive_old_files=self.archive_old_var.get(),
                exclude_patterns_enabled=self.exclude_patterns_var.get(),
                exclude_patterns=patterns,
                min_size_enabled=self.min_size_var.get(),
                min_size_bytes=min_size_bytes,
                max_size_enabled=self.max_size_var.get(),
                max_size_bytes=max_size_bytes,
                min_file_count_enabled=self.min_file_count_var.get(),
                min_file_count=self.min_file_count_value_var.get(),
                skip_empty_folders=self.skip_empty_var.get()
            )

            if self.callback:
                self.callback(self.result)

            self.destroy()

        except Exception as e:
            messagebox.showerror("Error", f"Failed to apply configuration:\n{str(e)}")

    def _reset_defaults(self) -> None:
        """Reset to default configuration."""
        from filter_engine import create_default_config
        self.config = create_default_config()
        self._load_config()
