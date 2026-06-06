#!/usr/bin/env python3.12
"""
File Share to SharePoint Migration Mapping Tool
Backend API Entry Point.
"""

import sys
import logging
import uvicorn

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
    """Check if Python version meets requirements."""
    if sys.version_info < (3, 10):
        print("Error: Python 3.10 or higher is required.")
        print(f"Current version: {sys.version}")
        return False
    return True

def main() -> None:
    """Main application entry point."""
    if not check_python_version():
        sys.exit(1)

    setup_logging()
    logger = logging.getLogger(__name__)
    logger.info("Starting SPMM FastAPI Backend Server")

    try:
        # Run the FastAPI server on port 8000
        uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True, reload_dirs=["."])
    except Exception as e:
        logger.error(f"Server error: {str(e)}", exc_info=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
