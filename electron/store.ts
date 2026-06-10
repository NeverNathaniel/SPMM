/**
 * Minimal atomic JSON persistence for the Electron main process.
 *
 * Deliberately dependency-free (the plan suggested electron-store; this is
 * the same write-temp-then-rename strategy the original SPMM project_manager
 * used, which keeps session.json safe against crashes mid-write).
 */

import fs from 'node:fs';
import path from 'node:path';

export function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}
