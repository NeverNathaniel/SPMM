/** Typed access to the preload bridge. */

import type {
  ExportResult,
  ScanProgress,
  ScanResult,
  SessionState,
  TechConfig,
} from './shared/types';

export interface SpmmApi {
  pickDirectory(): Promise<string[]>;
  scanDirectory(rootPath: string): Promise<ScanResult>;
  cancelScan(): Promise<void>;
  onScanProgress(cb: (p: ScanProgress) => void): () => void;
  loadSession(): Promise<SessionState | null>;
  saveSession(state: SessionState): Promise<{ ok: boolean; error?: string }>;
  /** Synchronous save for beforeunload — async IPC can't complete there. */
  saveSessionSync(state: SessionState): { ok: boolean; error?: string };
  clearSession(): Promise<void>;
  /** settingsPin is never included — verify through verifySettingsPin. */
  getTechConfig(): Promise<TechConfig>;
  hasSettingsPin(): Promise<boolean>;
  verifySettingsPin(pin: string): Promise<boolean>;
  /**
   * pinUpdate: undefined = keep the stored PIN, '' = clear it, any other
   * string = set it. cfg.settingsPin itself is ignored by the main process.
   */
  saveTechConfig(cfg: TechConfig, pinUpdate?: string): Promise<{ ok: boolean; error?: string }>;
  exportFiles(payload: { csv: string; html: string; exportPathOverride?: string }): Promise<ExportResult>;
  showInFolder(target: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
}

declare global {
  interface Window {
    spmm?: SpmmApi;
  }
}

export function hasElectron(): boolean {
  return typeof window !== 'undefined' && !!window.spmm;
}

/** Throws a clear error when running outside Electron (plain `vite` in a browser). */
export function api(): SpmmApi {
  if (!window.spmm) {
    throw new Error('Electron bridge unavailable — run via `npm run dev` (Electron), not a plain browser tab.');
  }
  return window.spmm;
}
