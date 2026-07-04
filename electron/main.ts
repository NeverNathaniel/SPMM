/**
 * Electron main process.
 *
 * Owns everything that touches the OS: folder picker, directory scanning
 * (worker thread), session persistence (%APPDATA%\MigrationMapper), the
 * technician config, and export file writing.
 */

import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { readJson, readJsonWithRecovery, writeJsonAtomic, writeJsonAtomicAsync } from './store';
import type {
  DirectoryRoot,
  ExportResult,
  ScanResult,
  SessionState,
  TechConfig,
} from '../src/shared/types';
import { detectPathType } from '../src/shared/mappingEngine';
import { sanitizeTechConfig } from '../src/shared/techConfig';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.setName('MigrationMapper');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;
let activeScan: Worker | null = null;

// Two instances would clobber each other's session.json — refuse the second
// and surface the first instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// Paths

function sessionFile(): string {
  return path.join(app.getPath('userData'), 'session.json');
}

/**
 * Deployment SEEDS a technician can pre-bake: next to the executable (for the
 * portable build electron-builder sets PORTABLE_EXECUTABLE_DIR — the exe path
 * itself points into a temp extraction dir), or in resources/. In dev, the
 * project root. Settings saved in-app go to userData (see savedTechConfigFile)
 * so a read-only install directory can't silently revert them.
 */
function techConfigSeedCandidates(): string[] {
  if (isDev || !app.isPackaged) {
    return [path.join(process.cwd(), 'tech-config.json')];
  }
  const candidates: string[] = [];
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    candidates.push(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'tech-config.json'));
  }
  candidates.push(
    path.join(path.dirname(app.getPath('exe')), 'tech-config.json'),
    path.join(process.resourcesPath, 'tech-config.json')
  );
  return candidates;
}

function savedTechConfigFile(): string {
  if (isDev || !app.isPackaged) return path.join(process.cwd(), 'tech-config.json');
  return path.join(app.getPath('userData'), 'tech-config.json');
}

/** Layered load: defaults < deployment seed < in-app saved settings. */
function loadTechConfig(): TechConfig {
  const seed = techConfigSeedCandidates()
    .map((candidate) => readJson<unknown>(candidate))
    .find((cfg) => cfg !== null);
  const saved = readJson<unknown>(savedTechConfigFile());
  return sanitizeTechConfig(seed ?? {}, saved ?? {});
}

function saveTechConfig(cfg: TechConfig): { ok: boolean; error?: string } {
  try {
    writeJsonAtomic(savedTechConfigFile(), cfg);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// IPC

ipcMain.handle('pick-directory', async (): Promise<string[]> => {
  if (!win) return [];
  const result = await dialog.showOpenDialog(win, {
    title: 'Add Directory',
    properties: ['openDirectory', 'multiSelections'],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('scan-directory', (_evt, rootPath: unknown): Promise<ScanResult> => {
  return new Promise((resolve) => {
    if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) {
      resolve({ ok: false, error: 'Invalid directory path' });
      return;
    }
    activeScan?.terminate();
    const worker = new Worker(path.join(__dirname, 'scanWorker.js'), {
      workerData: { rootPath },
    });
    activeScan = worker;

    let settled = false;
    const settle = (result: ScanResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        win?.webContents.send('scan-progress', {
          rootPath,
          folderCount: msg.folderCount,
          currentPath: msg.currentPath,
        });
      } else if (msg.type === 'done') {
        const root: DirectoryRoot = {
          id: crypto.randomUUID(),
          path: rootPath,
          pathType: detectPathType(rootPath),
          tree: msg.tree,
          scannedAt: new Date().toISOString(),
        };
        settle({ ok: true, root });
      } else if (msg.type === 'error') {
        settle({ ok: false, error: msg.error });
      }
    });
    worker.on('error', (err) => settle({ ok: false, error: err.message }));
    worker.on('exit', () => {
      // A terminated (cancelled or superseded) worker never sends a result —
      // settle the renderer's promise instead of leaving it pending forever.
      settle({ ok: false, error: 'Scan cancelled' });
      if (activeScan === worker) activeScan = null;
    });
  });
});

ipcMain.handle('cancel-scan', async () => {
  // Clear the reference before awaiting: a new scan can register itself
  // during terminate(), and nulling afterwards would orphan it.
  const worker = activeScan;
  activeScan = null;
  await worker?.terminate();
});

ipcMain.handle('load-session', (): SessionState | null => {
  const { data, corruptBackup } = readJsonWithRecovery<SessionState>(sessionFile());
  if (corruptBackup) {
    console.warn(`session.json was corrupt — preserved as ${corruptBackup}`);
  }
  return data;
});

// Generation counter serialising session writes: an async auto-save that is
// still in flight when a newer write starts (especially the synchronous
// close-time flush) must not land afterwards and overwrite the newer state.
let sessionSaveGen = 0;

ipcMain.handle('save-session', async (_evt, state: SessionState): Promise<{ ok: boolean; error?: string }> => {
  const gen = ++sessionSaveGen;
  try {
    await writeJsonAtomicAsync(sessionFile(), state, () => gen === sessionSaveGen);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

// Synchronous final flush from beforeunload — async IPC can't complete there.
ipcMain.on('save-session-sync', (evt, state: SessionState) => {
  ++sessionSaveGen; // abort any in-flight async save at its pre-rename check
  try {
    writeJsonAtomic(sessionFile(), state);
    evt.returnValue = { ok: true };
  } catch (err) {
    evt.returnValue = { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle('clear-session', (): void => {
  try {
    fs.rmSync(sessionFile(), { force: true });
  } catch {
    /* best effort */
  }
});

// The PIN never leaves the main process; the renderer verifies through IPC.
ipcMain.handle('get-tech-config', (): TechConfig => ({ ...loadTechConfig(), settingsPin: '' }));

ipcMain.handle('has-settings-pin', (): boolean => loadTechConfig().settingsPin !== '');

ipcMain.handle('verify-settings-pin', (_evt, pin: unknown): boolean => {
  const stored = loadTechConfig().settingsPin;
  return stored !== '' && typeof pin === 'string' && pin === stored;
});

ipcMain.handle('save-tech-config', (_evt, cfg: unknown, pinUpdate: unknown) => {
  const current = loadTechConfig();
  const next = sanitizeTechConfig(current, cfg ?? {});
  // cfg.settingsPin from the renderer is always the redacted '' — the PIN
  // only changes through an explicit pinUpdate ('' clears, string sets).
  next.settingsPin = typeof pinUpdate === 'string' ? pinUpdate.trim() : current.settingsPin;
  return saveTechConfig(next);
});

/** Export directories this process created — the only targets show-in-folder accepts. */
const exportedPaths = new Set<string>();

ipcMain.handle(
  'export-files',
  (_evt, payload: { csv: string; html: string; exportPathOverride?: string }): ExportResult => {
    try {
      if (
        typeof payload !== 'object' ||
        payload === null ||
        typeof payload.csv !== 'string' ||
        typeof payload.html !== 'string'
      ) {
        return { ok: false, error: 'Invalid export payload' };
      }
      // A bad override (hand-edited seed file) must not permanently block the
      // end user's export — fall back to the default location and say so.
      let override = payload.exportPathOverride?.trim();
      let warning: string | undefined;
      if (override && !path.isAbsolute(override)) {
        warning = `Configured export path "${override}" is not an absolute path — exported to the default location instead.`;
        override = undefined;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const baseDir = override || path.join(app.getPath('userData'), 'exports');
      const exportDir = path.join(baseDir, stamp);
      fs.mkdirSync(exportDir, { recursive: true });

      const csvPath = path.join(exportDir, 'migration-mapping.csv');
      const htmlPath = path.join(exportDir, 'migration-summary.html');
      fs.writeFileSync(csvPath, payload.csv, 'utf-8');
      fs.writeFileSync(htmlPath, payload.html, 'utf-8');

      exportedPaths.add(exportDir).add(csvPath).add(htmlPath);
      return { ok: true, exportDir, csvPath, htmlPath, warning };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
);

ipcMain.handle('show-in-folder', (_evt, target: unknown) => {
  if (typeof target === 'string' && exportedPaths.has(target)) {
    shell.showItemInFolder(target);
  }
});

ipcMain.handle('open-external', (_evt, url: unknown) => {
  if (typeof url === 'string' && (url.startsWith('mailto:') || url.startsWith('https://'))) {
    void shell.openExternal(url);
  }
});

ipcMain.handle('copy-to-clipboard', (_evt, text: unknown) => {
  if (typeof text === 'string') clipboard.writeText(text);
});

// ---------------------------------------------------------------------------
// Window

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 680,
    title: 'Migration Mapper',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // The renderer never legitimately navigates or opens windows — external
  // links go through the open-external IPC. Deny everything else (e.g. a
  // folder dragged onto the window would otherwise replace the UI).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (evt, url) => {
    if (url !== win?.webContents.getURL()) evt.preventDefault();
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    Menu.setApplicationMenu(null); // no default menu (and no devtools accelerator) in production
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void activeScan?.terminate();
  activeScan = null;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
