/**
 * Store-level tests: the state mutations that feed the SPMT plan run against
 * a mocked preload bridge (window.spmm) in plain Node.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanResult, SessionState } from '../src/shared/types';
import { DEFAULT_TECH_CONFIG } from '../src/shared/types';
import { folder, root } from './helpers';

type Bridge = Record<string, (...args: never[]) => unknown>;

function makeBridge(overrides: Partial<Bridge> = {}) {
  const bridge = {
    pickDirectory: vi.fn(async () => [] as string[]),
    scanDirectory: vi.fn(async (): Promise<ScanResult> => ({ ok: false, error: 'no mock' })),
    cancelScan: vi.fn(async () => {}),
    onScanProgress: vi.fn(() => () => {}),
    loadSession: vi.fn(async () => null as SessionState | null),
    saveSession: vi.fn(async () => ({ ok: true })),
    saveSessionSync: vi.fn(() => ({ ok: true })),
    clearSession: vi.fn(async () => {}),
    getTechConfig: vi.fn(async () => ({ ...DEFAULT_TECH_CONFIG, tenantDomain: 'fabrikam.sharepoint.com' })),
    hasSettingsPin: vi.fn(async () => false),
    verifySettingsPin: vi.fn(async () => false),
    saveTechConfig: vi.fn(async () => ({ ok: true })),
    exportFiles: vi.fn(async () => ({ ok: true })),
    showInFolder: vi.fn(async () => {}),
    openExternal: vi.fn(async () => {}),
    copyToClipboard: vi.fn(async () => {}),
    ...overrides,
  };
  (globalThis as { window?: unknown }).window = { spmm: bridge };
  return bridge;
}

// Import after the window shim exists so hasElectron() sees the bridge.
const { useAppStore } = await import('../src/store/useAppStore');

function resetStore() {
  useAppStore.setState({
    roots: [],
    sharePointSites: [],
    explicitMappings: [],
    skippedFolders: [],
    acknowledgedFolders: [],
    techConfig: { ...DEFAULT_TECH_CONFIG, tenantDomain: 'fabrikam.sharepoint.com' },
    initialized: true,
    screen: 'map',
    expanded: {},
    scanning: null,
    saveStatus: 'saved',
    lastSavedAt: null,
    resumeBanner: null,
    toasts: [],
    pendingRemap: null,
    destinationPickerFor: null,
  });
}

function scanResultFor(path: string): ScanResult {
  return { ok: true, root: root(path, folder(path, [folder(`${path}\\Sub`)])) };
}

beforeEach(() => {
  makeBridge();
  resetStore();
});

describe('addSite', () => {
  it('rejects duplicate slugs case-insensitively and reports failure', () => {
    expect(useAppStore.getState().addSite('Contoso HR')).toBe(true);
    expect(useAppStore.getState().addSite('contoso hr')).toBe(false);
    expect(useAppStore.getState().sharePointSites).toHaveLength(1);
  });

  it('rejects names that produce no slug', () => {
    expect(useAppStore.getState().addSite('日本語')).toBe(false);
    expect(useAppStore.getState().sharePointSites).toHaveLength(0);
  });
});

describe('addDirectory', () => {
  it('adds every picked directory (clear-on-load clears once, not per pick)', async () => {
    makeBridge({
      pickDirectory: vi.fn(async () => ['C:\\A', 'C:\\B']),
      scanDirectory: vi.fn(async (p: string) => scanResultFor(p)),
    });
    useAppStore.setState({
      roots: [root('C:\\Old', folder('C:\\Old'))],
      techConfig: { ...useAppStore.getState().techConfig, sessionBehavior: 'clear-on-load' },
    });

    await useAppStore.getState().addDirectory();
    const paths = useAppStore.getState().roots.map((r) => r.path);
    expect(paths).toEqual(['C:\\A', 'C:\\B']); // pre-fix this kept only C:\B
  });

  it('refuses overlapping roots', async () => {
    makeBridge({
      pickDirectory: vi.fn(async () => ['C:\\Share\\HR']),
      scanDirectory: vi.fn(async (p: string) => scanResultFor(p)),
    });
    useAppStore.setState({ roots: [root('C:\\Share', folder('C:\\Share'))] });

    await useAppStore.getState().addDirectory();
    expect(useAppStore.getState().roots.map((r) => r.path)).toEqual(['C:\\Share']);
    expect(useAppStore.getState().toasts.some((t) => t.message.includes('overlaps'))).toBe(true);
  });

  it('surfaces a cancelled scan as info, not an error', async () => {
    makeBridge({
      pickDirectory: vi.fn(async () => ['C:\\A']),
      scanDirectory: vi.fn(async (): Promise<ScanResult> => ({ ok: false, error: 'Scan cancelled' })),
    });
    await useAppStore.getState().addDirectory();
    expect(useAppStore.getState().roots).toEqual([]);
    const toasts = useAppStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'info' && t.message === 'Scan cancelled')).toBe(true);
    expect(toasts.some((t) => t.kind === 'error')).toBe(false);
  });
});

describe('rescanRoot', () => {
  it('replaces the tree in place and prunes mappings for vanished folders', async () => {
    const oldTree = folder('C:\\A', [folder('C:\\A\\Gone'), folder('C:\\A\\Sub')]);
    const r = root('C:\\A', oldTree);
    useAppStore.setState({
      roots: [r],
      explicitMappings: [
        { localPath: 'C:\\A\\Gone', localFolderId: 'g', spSiteId: 's', spFolderPath: '' },
        { localPath: 'C:\\A\\Sub', localFolderId: 's2', spSiteId: 's', spFolderPath: 'Kept' },
      ],
      acknowledgedFolders: ['C:\\A\\Gone'],
    });
    makeBridge({ scanDirectory: vi.fn(async (p: string) => scanResultFor(p)) });

    await useAppStore.getState().rescanRoot(r.id);
    const s = useAppStore.getState();
    expect(s.roots).toHaveLength(1);
    expect(s.roots[0].id).toBe(r.id); // identity preserved
    expect(s.explicitMappings.map((m) => m.localPath)).toEqual(['C:\\A\\Sub']);
    expect(s.acknowledgedFolders).toEqual([]);
  });
});

describe('acknowledgment invalidation', () => {
  it('remapping a folder drops every overlapping ack — descendants AND ancestors', () => {
    // Ancestors too: a remap below can create a brand-new split-file warning
    // on an ancestor, which a stale ancestor ack would silently satisfy.
    useAppStore.setState({
      acknowledgedFolders: [
        'path:C:\\A\\Sub',
        'split:C:\\A\\Sub\\Deep',
        'inelig:C:\\A\\Other',
        'split:C:\\A',
      ],
    });
    useAppStore.getState().requestMap('C:\\A\\Sub', 'id', 'site', 'Dest');
    expect(useAppStore.getState().acknowledgedFolders).toEqual(['inelig:C:\\A\\Other']);
  });

  it('unmap drops stale acks too', () => {
    useAppStore.setState({
      explicitMappings: [{ localPath: 'C:\\A\\Sub', localFolderId: 'i', spSiteId: 's', spFolderPath: '' }],
      acknowledgedFolders: ['path:C:\\A\\Sub', 'inelig:C:\\A\\Sub\\Deep'],
    });
    useAppStore.getState().unmap('C:\\A\\Sub');
    expect(useAppStore.getState().acknowledgedFolders).toEqual([]);
  });

  it('toggleSkip invalidates overlapping acks (skips create split warnings on ancestors)', () => {
    useAppStore.setState({
      acknowledgedFolders: ['path:C:\\A', 'split:C:\\A', 'inelig:C:\\B'],
    });
    useAppStore.getState().toggleSkip('C:\\A\\Sub');
    expect(useAppStore.getState().acknowledgedFolders).toEqual(['inelig:C:\\B']);
    expect(useAppStore.getState().skippedFolders).toEqual(['C:\\A\\Sub']);
  });

  it('toggleAcknowledged stores namespaced keys per warning kind', () => {
    useAppStore.getState().toggleAcknowledged('split', 'C:\\A');
    expect(useAppStore.getState().acknowledgedFolders).toEqual(['split:C:\\A']);
    useAppStore.getState().toggleAcknowledged('path', 'C:\\A');
    expect(useAppStore.getState().acknowledgedFolders).toEqual(['split:C:\\A', 'path:C:\\A']);
    useAppStore.getState().toggleAcknowledged('split', 'C:\\A');
    expect(useAppStore.getState().acknowledgedFolders).toEqual(['path:C:\\A']);
  });

  it('confirming a remap replaces the mapping and drops the subtree acks', () => {
    useAppStore.setState({
      explicitMappings: [{ localPath: 'C:\\A', localFolderId: 'i', spSiteId: 's1', spFolderPath: 'Old' }],
      sharePointSites: [],
      acknowledgedFolders: ['C:\\A\\Sub'],
    });
    useAppStore.getState().requestMap('C:\\A', 'i', 's2', 'New');
    expect(useAppStore.getState().pendingRemap).not.toBeNull();
    useAppStore.getState().confirmPendingRemap();
    const s = useAppStore.getState();
    expect(s.explicitMappings).toEqual([
      { localPath: 'C:\\A', localFolderId: 'i', spSiteId: 's2', spFolderPath: 'New' },
    ]);
    expect(s.acknowledgedFolders).toEqual([]);
  });
});

describe('flushSessionSync', () => {
  it('writes synchronously when there are unsaved changes', () => {
    const bridge = makeBridge();
    useAppStore.setState({ saveStatus: 'dirty' });
    useAppStore.getState().flushSessionSync();
    expect(bridge.saveSessionSync).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().saveStatus).toBe('saved');
  });

  it('does nothing when already saved', () => {
    const bridge = makeBridge();
    useAppStore.setState({ saveStatus: 'saved' });
    useAppStore.getState().flushSessionSync();
    expect(bridge.saveSessionSync).not.toHaveBeenCalled();
  });
});

describe('createSpFolder', () => {
  it('rejects "Forms" at the Documents root but allows it nested', () => {
    useAppStore.getState().addSite('HR');
    const siteId = useAppStore.getState().sharePointSites[0].id;
    useAppStore.getState().createSpFolder(siteId, '', 'Forms');
    expect(useAppStore.getState().sharePointSites[0].folders).toHaveLength(0);

    useAppStore.getState().createSpFolder(siteId, '', 'Payroll');
    useAppStore.getState().createSpFolder(siteId, 'Payroll', 'Forms');
    const payroll = useAppStore.getState().sharePointSites[0].folders.find((f) => f.name === 'Payroll')!;
    expect(payroll.children.map((f) => f.name)).toEqual(['Forms']);
  });
});
