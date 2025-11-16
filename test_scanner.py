#!/usr/bin/env python3
"""Quick test script for the file scanner."""

from file_scanner import FileScanner, format_size
import sys

def main():
    """Test the scanner with test_share folder."""
    scanner = FileScanner()
    test_path = '/home/user/SPMM/test_share'

    print(f"Scanning: {test_path}")
    print("-" * 60)

    try:
        results = scanner.scan_folder(test_path)

        print(f"\nFound {len(results)} folders:")
        print("-" * 60)

        for folder in results:
            indent = "  " * folder.depth
            print(f"{indent}{folder.name}")
            print(f"{indent}  Path: {folder.path}")
            print(f"{indent}  Files: {folder.file_count}")
            print(f"{indent}  Size: {format_size(folder.total_size)}")
            print(f"{indent}  Modified: {folder.last_modified}")
            print()

        print("-" * 60)
        print("Scanner test completed successfully!")
        return 0

    except Exception as e:
        print(f"Error: {str(e)}")
        return 1

if __name__ == '__main__':
    sys.exit(main())
