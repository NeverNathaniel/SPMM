#!/usr/bin/env python3
"""
SPMM — File Share to SharePoint Migration Mapper

Main entry point for the application.
"""

import tkinter as tk
import sys
import logging

from gui_main_window import MainWindow


def setup_logging() -> None:
    """Configure application logging."""
    log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    logging.basicConfig(
        level=logging.INFO,
        format=log_format,
        handlers=[
            logging.FileHandler('spmm.log'),
            logging.StreamHandler(sys.stdout)
        ]
    )


def check_python_version() -> bool:
    """
    Check if Python version meets requirements.

    Returns:
        True if version is acceptable, False otherwise
    """
    if sys.version_info < (3, 10):
        print("Error: Python 3.10 or higher is required.")
        print(f"Current version: {sys.version}")
        return False
    return True


def main() -> None:
    """Main application entry point."""
    # Check Python version
    if not check_python_version():
        sys.exit(1)

    # Setup logging
    setup_logging()
    logger = logging.getLogger(__name__)
    logger.info("Starting File Share to SharePoint Migration Mapper")

    try:
        # Create main window
        root = tk.Tk()

        # Create and run application
        app = MainWindow(root)
        logger.info("Application initialized successfully")

        app.run()

    except Exception as e:
        logger.error(f"Application error: {str(e)}", exc_info=True)
        sys.exit(1)

    logger.info("Application closed")


if __name__ == '__main__':
    main()
