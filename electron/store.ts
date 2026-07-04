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

/**
 * Like readJson, but a file that exists yet fails to parse is preserved as
 * `<file>.corrupt-<timestamp>` instead of being silently discarded (and later
 * overwritten by the next save).
 */
export function readJsonWithRecovery<T>(filePath: string): { data: T | null; corruptBackup?: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { data: null }; // missing file — nothing to recover
  }
  try {
    return { data: JSON.parse(raw) as T };
  } catch {
    const backup = `${filePath}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try {
      fs.renameSync(filePath, backup);
      return { data: null, corruptBackup: backup };
    } catch {
      return { data: null };
    }
  }
}

export function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

/**
 * Async variant for the debounced auto-save — keeps the main process
 * responsive. `isCurrent` is re-checked before the final rename so a write
 * that was superseded mid-flight (e.g. by the synchronous close-time flush)
 * can abort instead of clobbering newer data.
 */
export async function writeJsonAtomicAsync(
  filePath: string,
  data: unknown,
  isCurrent: () => boolean = () => true
): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  if (!isCurrent()) {
    await fs.promises.unlink(tmp).catch(() => {});
    return;
  }
  await fs.promises.rename(tmp, filePath);
}
