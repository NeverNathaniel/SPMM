"""
GUI Validation Report Module

This module provides UI components for displaying validation results
before exporting migration mappings.
"""

import tkinter as tk
from tkinter import ttk, messagebox
from typing import Optional, Callable, List
from validators import ValidationResult, ValidationIssue, ValidationSeverity


class ValidationReportDialog(tk.Toplevel):
    """Dialog for displaying validation results."""

    def __init__(
        self,
        parent,
        result: ValidationResult,
        on_export: Optional[Callable] = None,
        on_cancel: Optional[Callable] = None
    ):
        """
        Initialize the validation report dialog.

        Args:
            parent: Parent window
            result: ValidationResult to display
            on_export: Callback when user chooses to export anyway
            on_cancel: Callback when user cancels
        """
        super().__init__(parent)
        self.title("Validation Report")
        self.geometry("800x600")
        self.transient(parent)
        self.resizable(True, True)

        self.result = result
        self.on_export = on_export
        self.on_cancel = on_cancel
        self.user_choice = None  # 'export', 'cancel', or None

        self._create_widgets()

        # Keyboard shortcuts
        self.bind('<Escape>', lambda e: self._cancel())
        self.bind('<Return>', lambda e: self._export() if result.is_valid else None)

        # Center on parent
        self.grab_set()

    def _create_widgets(self) -> None:
        """Create dialog widgets."""
        # Main container
        main_frame = ttk.Frame(self, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Summary header
        summary_frame = ttk.LabelFrame(main_frame, text="Summary", padding="10")
        summary_frame.pack(fill=tk.X, pady=(0, 10))

        self._create_summary(summary_frame)

        # Issues list
        issues_frame = ttk.LabelFrame(main_frame, text="Issues", padding="10")
        issues_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        self._create_issues_list(issues_frame)

        # Buttons
        btn_frame = ttk.Frame(main_frame)
        btn_frame.pack(fill=tk.X)

        self._create_buttons(btn_frame)

    def _create_summary(self, parent: ttk.Frame) -> None:
        """Create summary section."""
        summary = self.result.get_summary()

        # Status indicator
        if self.result.is_valid:
            status_text = "Ready to Export"
            status_color = "green"
        elif self.result.error_count > 0:
            status_text = "Issues Found - Review Required"
            status_color = "red"
        else:
            status_text = "Warnings Found"
            status_color = "orange"

        status_label = ttk.Label(
            parent,
            text=status_text,
            font=('Arial', 12, 'bold')
        )
        status_label.pack(anchor=tk.W)

        # Counts
        counts_frame = ttk.Frame(parent)
        counts_frame.pack(fill=tk.X, pady=(10, 0))

        # Error count
        error_frame = ttk.Frame(counts_frame)
        error_frame.pack(side=tk.LEFT, padx=(0, 20))
        ttk.Label(
            error_frame,
            text=f"Errors: {self.result.error_count}",
            foreground="red" if self.result.error_count > 0 else "gray"
        ).pack()

        # Warning count
        warning_frame = ttk.Frame(counts_frame)
        warning_frame.pack(side=tk.LEFT, padx=(0, 20))
        ttk.Label(
            warning_frame,
            text=f"Warnings: {self.result.warning_count}",
            foreground="orange" if self.result.warning_count > 0 else "gray"
        ).pack()

        # Info count
        info_frame = ttk.Frame(counts_frame)
        info_frame.pack(side=tk.LEFT)
        ttk.Label(
            info_frame,
            text=f"Info: {self.result.info_count}",
            foreground="blue" if self.result.info_count > 0 else "gray"
        ).pack()

    def _create_issues_list(self, parent: ttk.Frame) -> None:
        """Create issues list with treeview."""
        # Filter buttons
        filter_frame = ttk.Frame(parent)
        filter_frame.pack(fill=tk.X, pady=(0, 5))

        self.filter_var = tk.StringVar(value="all")

        ttk.Radiobutton(
            filter_frame, text="All", value="all",
            variable=self.filter_var, command=self._filter_issues
        ).pack(side=tk.LEFT, padx=5)

        ttk.Radiobutton(
            filter_frame, text="Errors", value="error",
            variable=self.filter_var, command=self._filter_issues
        ).pack(side=tk.LEFT, padx=5)

        ttk.Radiobutton(
            filter_frame, text="Warnings", value="warning",
            variable=self.filter_var, command=self._filter_issues
        ).pack(side=tk.LEFT, padx=5)

        ttk.Radiobutton(
            filter_frame, text="Info", value="info",
            variable=self.filter_var, command=self._filter_issues
        ).pack(side=tk.LEFT, padx=5)

        # Treeview with scrollbar
        tree_frame = ttk.Frame(parent)
        tree_frame.pack(fill=tk.BOTH, expand=True)

        self.tree = ttk.Treeview(
            tree_frame,
            columns=('severity', 'category', 'message'),
            show='headings',
            selectmode='browse'
        )

        # Configure columns
        self.tree.heading('severity', text='Severity')
        self.tree.heading('category', text='Category')
        self.tree.heading('message', text='Message')

        self.tree.column('severity', width=80, minwidth=60)
        self.tree.column('category', width=120, minwidth=80)
        self.tree.column('message', width=500, minwidth=200)

        # Scrollbars
        vsb = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        hsb = ttk.Scrollbar(tree_frame, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)

        # Grid layout
        self.tree.grid(row=0, column=0, sticky='nsew')
        vsb.grid(row=0, column=1, sticky='ns')
        hsb.grid(row=1, column=0, sticky='ew')

        tree_frame.grid_rowconfigure(0, weight=1)
        tree_frame.grid_columnconfigure(0, weight=1)

        # Configure tags for severity colors
        self.tree.tag_configure('error', foreground='red')
        self.tree.tag_configure('warning', foreground='orange')
        self.tree.tag_configure('info', foreground='blue')

        # Bind selection for details
        self.tree.bind('<<TreeviewSelect>>', self._on_select)

        # Details panel
        details_frame = ttk.LabelFrame(parent, text="Details", padding="5")
        details_frame.pack(fill=tk.X, pady=(10, 0))

        self.details_text = tk.Text(
            details_frame,
            height=4,
            wrap=tk.WORD,
            state='disabled'
        )
        self.details_text.pack(fill=tk.X)

        # Populate tree
        self._populate_tree()

    def _create_buttons(self, parent: ttk.Frame) -> None:
        """Create action buttons."""
        # Right-aligned buttons
        btn_container = ttk.Frame(parent)
        btn_container.pack(side=tk.RIGHT)

        # Cancel button
        ttk.Button(
            btn_container,
            text="Cancel",
            command=self._cancel
        ).pack(side=tk.LEFT, padx=5)

        # Export button
        export_text = "Export Anyway" if not self.result.is_valid else "Export"
        export_state = 'normal'  # Allow export even with errors (user's choice)

        self.export_btn = ttk.Button(
            btn_container,
            text=export_text,
            command=self._export,
            state=export_state
        )
        self.export_btn.pack(side=tk.LEFT, padx=5)

        if not self.result.is_valid:
            # Add warning label
            ttk.Label(
                parent,
                text="Export has errors - review issues before proceeding",
                foreground="red"
            ).pack(side=tk.LEFT)

    def _populate_tree(self, filter_severity: Optional[str] = None) -> None:
        """Populate the tree with issues."""
        # Clear existing
        for item in self.tree.get_children():
            self.tree.delete(item)

        # Add issues
        for issue in self.result.issues:
            if filter_severity and filter_severity != 'all':
                if issue.severity.value != filter_severity:
                    continue

            self.tree.insert(
                '',
                'end',
                values=(
                    issue.severity.value.upper(),
                    issue.category,
                    issue.message
                ),
                tags=(issue.severity.value,)
            )

        # Store issues for detail lookup
        self._current_issues = self.result.issues if not filter_severity or filter_severity == 'all' else \
            [i for i in self.result.issues if i.severity.value == filter_severity]

    def _filter_issues(self) -> None:
        """Filter issues by selected severity."""
        filter_value = self.filter_var.get()
        self._populate_tree(filter_value)

    def _on_select(self, event) -> None:
        """Handle tree selection to show details."""
        selection = self.tree.selection()
        if not selection:
            return

        item = selection[0]
        index = self.tree.index(item)

        if index < len(self._current_issues):
            issue = self._current_issues[index]
            self._show_details(issue)

    def _show_details(self, issue: ValidationIssue) -> None:
        """Show issue details in the details panel."""
        self.details_text.config(state='normal')
        self.details_text.delete('1.0', tk.END)

        details_text = f"Category: {issue.category}\n"
        details_text += f"Message: {issue.message}\n"

        if issue.source_path:
            details_text += f"Source: {issue.source_path}\n"

        if issue.details:
            details_text += f"\n{issue.details}"

        self.details_text.insert('1.0', details_text)
        self.details_text.config(state='disabled')

    def _export(self) -> None:
        """Handle export button click."""
        if not self.result.is_valid:
            # Confirm export with errors
            if not messagebox.askyesno(
                "Confirm Export",
                f"There are {self.result.error_count} errors.\n\n"
                "Do you want to export anyway?\n\n"
                "Note: Some mappings may not work correctly.",
                icon='warning'
            ):
                return

        self.user_choice = 'export'
        if self.on_export:
            self.on_export()
        self.destroy()

    def _cancel(self) -> None:
        """Handle cancel button click."""
        self.user_choice = 'cancel'
        if self.on_cancel:
            self.on_cancel()
        self.destroy()


class QuickValidationDialog(tk.Toplevel):
    """Simple dialog for quick validation status."""

    def __init__(self, parent, result: ValidationResult):
        """
        Initialize quick validation dialog.

        Args:
            parent: Parent window
            result: ValidationResult to display
        """
        super().__init__(parent)
        self.title("Validation")
        self.geometry("400x200")
        self.transient(parent)
        self.resizable(False, False)

        self.result = result
        self._create_widgets()

        self.bind('<Escape>', lambda e: self.destroy())
        self.bind('<Return>', lambda e: self.destroy())

        self.grab_set()

    def _create_widgets(self) -> None:
        """Create dialog widgets."""
        main_frame = ttk.Frame(self, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Status icon/text
        if self.result.is_valid and self.result.warning_count == 0:
            status_text = "All Validations Passed"
            status_color = "green"
        elif self.result.is_valid:
            status_text = f"Passed with {self.result.warning_count} Warning(s)"
            status_color = "orange"
        else:
            status_text = f"Failed - {self.result.error_count} Error(s)"
            status_color = "red"

        ttk.Label(
            main_frame,
            text=status_text,
            font=('Arial', 14, 'bold'),
            foreground=status_color
        ).pack(pady=(0, 20))

        # Summary
        summary_text = (
            f"Errors: {self.result.error_count}\n"
            f"Warnings: {self.result.warning_count}\n"
            f"Info: {self.result.info_count}"
        )
        ttk.Label(main_frame, text=summary_text, justify=tk.LEFT).pack(pady=(0, 20))

        # Close button
        ttk.Button(main_frame, text="Close", command=self.destroy).pack()


def show_validation_report(
    parent,
    result: ValidationResult,
    on_export: Optional[Callable] = None,
    on_cancel: Optional[Callable] = None
) -> Optional[str]:
    """
    Show validation report dialog and return user choice.

    Args:
        parent: Parent window
        result: ValidationResult to display
        on_export: Callback for export
        on_cancel: Callback for cancel

    Returns:
        'export', 'cancel', or None if closed
    """
    dialog = ValidationReportDialog(parent, result, on_export, on_cancel)
    parent.wait_window(dialog)
    return dialog.user_choice
