/**
 * Electron main process.
 *
 * Owns everything that touches the OS: folder picker, directory scanning
 * (worker thread), session persistence (%APPDATA%\MigrationMapper), the
 * technician config (app install directory), and export file writing.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { readJson, writeJsonAtomic } from './store';
import type {
  DirectoryRoot,
  ExportResult,
  ScanResult,
  SessionState,
  TechConfig,
} from '../src/shared/types';
import { DEFAULT_TECH_CONFIG } from '../src/shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.setName('MigrationMapper');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;
let activeScan: Worker | null = null;

// ---------------------------------------------------------------------------
// Paths

function sessionFile(): string {
  return path.join(app.getPath('userData'), 'session.json');
}

/**
 * tech-config.json lives next to the executable (install directory) so it
 * survives user-profile resets and can be pre-baked by the technician.
 * In dev it lives in the project root. Falls back to userData when the
 * install dir is not writable (e.g. Program Files without elevation).
 */
function techConfigCandidates(): string[] {
  if (isDev || !app.isPackaged) {
    return [path.join(process.cwd(), 'tech-config.json')];
  }
  return [
    path.join(path.dirname(app.getPath('exe')), 'tech-config.json'),
    path.join(process.resourcesPath, 'tech-config.json'),
    path.join(app.getPath('userData'), 'tech-config.json'),
  ];
}

function loadTechConfig(): TechConfig {
  for (const candidate of techConfigCandidates()) {
    const cfg = readJson<Partial<TechConfig>>(candidate);
    if (cfg) return { ...DEFAULT_TECH_CONFIG, ...cfg };
  }
  return { ...DEFAULT_TECH_CONFIG };
}

function saveTechConfig(cfg: TechConfig): { ok: boolean; error?: string } {
  let lastError = '';
  for (const candidate of techConfigCandidates()) {
    try {
      writeJsonAtomic(candidate, cfg);
      return { ok: true };
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  return { ok: false, error: lastError };
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

ipcMain.handle('scan-directory', (_evt, rootPath: string): Promise<ScanResult> => {
  return new Promise((resolve) => {
    activeScan?.terminate();
    const worker = new Worker(path.join(__dirname, 'scanWorker.js'), {
      workerData: { rootPath },
    });
    activeScan = worker;

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
          pathType: rootPath.startsWith('\\\\') ? 'unc' : 'local',
          tree: msg.tree,
          scannedAt: new Date().toISOString(),
        };
        resolve({ ok: true, root });
      } else if (msg.type === 'error') {
        resolve({ ok: false, error: msg.error });
      }
    });
    worker.on('error', (err) => resolve({ ok: false, error: err.message }));
    worker.on('exit', () => {
      if (activeScan === worker) activeScan = null;
    });
  });
});

ipcMain.handle('cancel-scan', async () => {
  await activeScan?.terminate();
  activeScan = null;
});

ipcMain.handle('load-session', (): SessionState | null => readJson<SessionState>(sessionFile()));

ipcMain.handle('save-session', (_evt, state: SessionState): { ok: boolean; error?: string } => {
  try {
    writeJsonAtomic(sessionFile(), state);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle('clear-session', (): void => {
  try {
    fs.rmSync(sessionFile(), { force: true });
  } catch {
    /* best effort */
  }
});

ipcMain.handle('get-tech-config', (): TechConfig => loadTechConfig());

ipcMain.handle('save-tech-config', (_evt, cfg: TechConfig) => saveTechConfig(cfg));

ipcMain.handle(
  'export-files',
  (_evt, payload: { csv: string; html: string; exportPathOverride?: string }): ExportResult => {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const baseDir =
        payload.exportPathOverride?.trim() ||
        path.join(app.getPath('userData'), 'exports');
      const exportDir = path.join(baseDir, stamp);
      fs.mkdirSync(exportDir, { recursive: true });

      const csvPath = path.join(exportDir, 'migration-mapping.csv');
      const htmlPath = path.join(exportDir, 'migration-summary.html');
      fs.writeFileSync(csvPath, payload.csv, 'utf-8');
      fs.writeFileSync(htmlPath, payload.html, 'utf-8');

      return { ok: true, exportDir, csvPath, htmlPath };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
);

ipcMain.handle('show-in-folder', (_evt, target: string) => {
  shell.showItemInFolder(target);
});

ipcMain.handle('open-external', (_evt, url: string) => {
  if (url.startsWith('mailto:') || url.startsWith('https://')) shell.openExternal(url);
});

ipcMain.handle('copy-to-clipboard', async (_evt, text: string) => {
  const { clipboard } = await import('electron');
  clipboard.writeText(text);
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

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
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

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
