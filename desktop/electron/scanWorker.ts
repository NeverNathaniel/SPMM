/**
 * Directory scan worker (Node worker_threads).
 * Thin wrapper around scanDir that reports throttled progress to the main
 * process so large trees never freeze the UI.
 */

import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import { scanDir } from './scanDir';

let folderCount = 0;
let lastReport = 0;

const rootPath: string = workerData.rootPath;
try {
  const stat = fs.statSync(rootPath);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${rootPath}`);
  const tree = scanDir(rootPath, (currentPath) => {
    folderCount++;
    const now = Date.now();
    if (now - lastReport > 150) {
      lastReport = now;
      parentPort?.postMessage({ type: 'progress', folderCount, currentPath });
    }
  });
  parentPort?.postMessage({ type: 'done', tree, folderCount });
} catch (err) {
  parentPort?.postMessage({ type: 'error', error: (err as Error).message });
}
