/**
 * Core directory walk shared by the scan worker and tests.
 *
 * Mirrors the proven Python scanner's behaviour: scandir-style iteration,
 * never follows symlinks, swallows permission errors per entry, and filters
 * hidden/system entries so they never reach the UI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FolderNode } from '../src/shared/types';
import {
  classifyFile,
  classifyFolderName,
  isHiddenFile,
  isHiddenOrSystemDir,
} from '../src/shared/classify';

export const MAX_FILES_LISTED = 500; // cap the read-only disclosure list per folder

export function scanDir(dirPath: string, onFolder?: (currentPath: string) => void): FolderNode {
  const name = path.basename(dirPath) || dirPath;
  const node: FolderNode = {
    id: randomUUID(),
    path: dirPath,
    name,
    fileCount: 0,
    longestFilename: '',
    longestFilenameLength: 0,
    ineligibleFiles: [],
    hasIneligibleFolderName: classifyFolderName(name) !== null,
    files: [],
    filesTruncated: false,
    children: [],
  };
  onFolder?.(dirPath);

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    // Permission denied or transient I/O error — keep the node, skip contents.
    return node;
  }

  for (const entry of entries) {
    try {
      if (entry.isSymbolicLink()) continue; // avoid cycles / tree escapes
      if (entry.isDirectory()) {
        if (isHiddenOrSystemDir(entry.name)) continue;
        node.children.push(scanDir(path.join(dirPath, entry.name), onFolder));
      } else if (entry.isFile()) {
        if (isHiddenFile(entry.name)) continue;
        node.fileCount++;
        if (entry.name.length > node.longestFilenameLength) {
          node.longestFilename = entry.name;
          node.longestFilenameLength = entry.name.length;
        }
        const reason = classifyFile(entry.name);
        if (reason) node.ineligibleFiles.push({ filename: entry.name, reason });
        if (node.files.length < MAX_FILES_LISTED) {
          node.files.push(entry.name);
        } else {
          node.filesTruncated = true;
        }
      }
    } catch {
      continue; // per-entry errors never abort the scan
    }
  }

  node.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  node.files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return node;
}
