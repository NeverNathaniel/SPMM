/**
 * Preload bridge — the only surface the renderer can reach the OS through.
 * Built as CommonJS so it works with the default sandboxed renderer.
 */

import { contextBridge, ipcRenderer } from 'electron';

const api = {
  pickDirectory: (): Promise<string[]> => ipcRenderer.invoke('pick-directory'),
  scanDirectory: (rootPath: string) => ipcRenderer.invoke('scan-directory', rootPath),
  cancelScan: () => ipcRenderer.invoke('cancel-scan'),
  onScanProgress: (cb: (p: { rootPath: string; folderCount: number; currentPath: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: { rootPath: string; folderCount: number; currentPath: string }) => cb(p);
    ipcRenderer.on('scan-progress', listener);
    return () => ipcRenderer.removeListener('scan-progress', listener);
  },
  loadSession: () => ipcRenderer.invoke('load-session'),
  saveSession: (state: unknown) => ipcRenderer.invoke('save-session', state),
  // Synchronous by design: called from beforeunload, where async IPC would be
  // cut off mid-flight. Used only for the final flush of unsaved changes.
  saveSessionSync: (state: unknown) => ipcRenderer.sendSync('save-session-sync', state),
  clearSession: () => ipcRenderer.invoke('clear-session'),
  getTechConfig: () => ipcRenderer.invoke('get-tech-config'),
  hasSettingsPin: () => ipcRenderer.invoke('has-settings-pin'),
  verifySettingsPin: (pin: string) => ipcRenderer.invoke('verify-settings-pin', pin),
  saveTechConfig: (cfg: unknown, pinUpdate?: string) =>
    ipcRenderer.invoke('save-tech-config', cfg, pinUpdate),
  exportFiles: (payload: { csv: string; html: string; exportPathOverride?: string }) =>
    ipcRenderer.invoke('export-files', payload),
  showInFolder: (target: string) => ipcRenderer.invoke('show-in-folder', target),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  copyToClipboard: (text: string) => ipcRenderer.invoke('copy-to-clipboard', text),
};

export type ElectronApi = typeof api;

contextBridge.exposeInMainWorld('spmm', api);
