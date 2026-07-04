/**
 * Application store (Zustand).
 *
 * Persisted slices (roots, sites, explicit mappings, skip/ack lists) are
 * auto-saved to session.json through the Electron bridge with a 2s debounce
 * (plus a synchronous flush on window close). Inherited mappings and
 * validation are always derived — never stored — so session restore can't
 * produce stale chains.
 */

import { create } from 'zustand';
import type {
  DirectoryRoot,
  ExplicitMapping,
  SessionState,
  SharePointSite,
  TechConfig,
} from '../shared/types';
import { DEFAULT_TECH_CONFIG } from '../shared/types';
import { api, hasElectron } from '../electronApi';
import { ackKey, ackPath, migrateAckList, type AckKind } from '../shared/acks';
import { nextSiteColor } from '../shared/colors';
import { slugFromSiteName } from '../shared/slug';
import {
  removeExplicitMapping,
  setExplicitMapping,
  spFolderDepth,
  depthStatus,
} from '../shared/mappingEngine';
import { pathsOverlap } from '../shared/spmtPlan';
import {
  addSpFolder,
  deleteSpFolder,
  remapAfterRename,
  renameSpFolder,
  spFolderInUse,
} from '../shared/spFolders';
import { classifyFolderName } from '../shared/classify';

export type Screen = 'map' | 'review' | 'settings';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface PendingMap {
  localPath: string;
  localFolderId: string;
  spSiteId: string;
  spFolderPath: string;
  /** set when confirming a replacement of an existing explicit mapping */
  replacesSiteName?: string;
}

interface AppStore {
  // persisted state
  roots: DirectoryRoot[];
  sharePointSites: SharePointSite[];
  explicitMappings: ExplicitMapping[];
  skippedFolders: string[];
  acknowledgedFolders: string[];

  techConfig: TechConfig;

  // UI state
  initialized: boolean;
  screen: Screen;
  expanded: Record<string, boolean>;
  scanning: { rootPath: string; folderCount: number; currentPath: string } | null;
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
  lastSavedAt: string | null;
  resumeBanner: string | null;
  toasts: Toast[];
  pendingRemap: PendingMap | null;
  destinationPickerFor: { localPath: string; localFolderId: string } | null;

  // lifecycle
  init(): Promise<void>;
  startFresh(): Promise<void>;
  /** Synchronous best-effort save for beforeunload. */
  flushSessionSync(): void;

  // directories
  addDirectory(): Promise<void>;
  rescanRoot(rootId: string): Promise<void>;
  cancelScan(): void;
  removeRoot(rootId: string): void;
  toggleExpanded(path: string): void;

  // sites & SP folders
  addSite(name: string, slug?: string): boolean;
  removeSite(siteId: string): void;
  createSpFolder(siteId: string, parentPath: string, name: string): void;
  renameSpFolderAction(siteId: string, folderPath: string, newName: string): void;
  deleteSpFolderAction(siteId: string, folderPath: string): void;

  // mapping
  requestMap(localPath: string, localFolderId: string, spSiteId: string, spFolderPath: string): void;
  confirmPendingRemap(): void;
  cancelPendingRemap(): void;
  unmap(localPath: string): void;
  openDestinationPicker(localPath: string, localFolderId: string): void;
  closeDestinationPicker(): void;

  // review
  toggleSkip(localPath: string): void;
  toggleAcknowledged(kind: AckKind, localPath: string): void;

  // misc UI
  setScreen(screen: Screen): void;
  dismissBanner(): void;
  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;
  updateTechConfig(cfg: TechConfig, pinUpdate?: string): Promise<boolean>;
}

let toastId = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Instantiate the configured pre-seeded sites (first launch / start fresh). */
function sitesFromPresets(presets: TechConfig['preSeededSites']): SharePointSite[] {
  const used: string[] = [];
  return presets.map((p, i) => {
    const color = nextSiteColor(used);
    used.push(color);
    // A non-Latin name can slugify to '' — fall back to a stable unique slug
    // rather than emitting an invalid /sites/ URL.
    const slug = (p.slug || slugFromSiteName(p.name) || `Site${i + 1}`).trim();
    return {
      id: crypto.randomUUID(),
      name: p.name,
      slug,
      color,
      folders: [],
    };
  });
}

export const useAppStore = create<AppStore>((set, get) => {
  function sessionSnapshot(): SessionState {
    const s = get();
    return {
      roots: s.roots,
      sharePointSites: s.sharePointSites,
      explicitMappings: s.explicitMappings,
      skippedFolders: s.skippedFolders,
      acknowledgedFolders: s.acknowledgedFolders,
      savedAt: new Date().toISOString(),
    };
  }

  /** Debounced (2s) session auto-save of the persisted slices. */
  function touch() {
    set({ saveStatus: 'dirty' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      const session = sessionSnapshot();
      set({ saveStatus: 'saving' });
      try {
        const res = await api().saveSession(session);
        set(res.ok ? { saveStatus: 'saved', lastSavedAt: session.savedAt } : { saveStatus: 'error' });
      } catch {
        set({ saveStatus: 'error' });
      }
    }, 2000);
  }

  /** Prune mappings/skips/acks that reference folders no longer in any tree. */
  function prunedForRoots(roots: DirectoryRoot[], s: Pick<AppStore, 'explicitMappings' | 'skippedFolders' | 'acknowledgedFolders'>) {
    const valid = new Set<string>();
    const collect = (node: { path: string; children: { path: string; children: unknown[] }[] }) => {
      valid.add(node.path);
      node.children.forEach((c) => collect(c as never));
    };
    roots.forEach((r) => collect(r.tree as never));
    return {
      explicitMappings: s.explicitMappings.filter((m) => valid.has(m.localPath)),
      skippedFolders: s.skippedFolders.filter((p) => valid.has(p)),
      acknowledgedFolders: s.acknowledgedFolders.filter((p) => valid.has(ackPath(p))),
    };
  }

  /**
   * Acknowledgments are warnings accepted for a specific plan — when a folder
   * is remapped, unmapped, or skip-toggled, every ack overlapping it (the
   * folder, its descendants, AND its ancestors — a skip/remap below can
   * create a brand-new split-file warning on an ancestor) must be dropped so
   * a stale checkbox can't keep the export unlocked.
   */
  function acksWithout(localPath: string): string[] {
    return get().acknowledgedFolders.filter((p) => !pathsOverlap(ackPath(p), localPath));
  }

  async function runScan(
    dir: string,
    apply: (root: DirectoryRoot) => void
  ): Promise<'ok' | 'cancelled' | 'error'> {
    set({ scanning: { rootPath: dir, folderCount: 0, currentPath: '' } });
    const off = api().onScanProgress((p) => {
      if (p.rootPath === dir) {
        set({ scanning: { rootPath: dir, folderCount: p.folderCount, currentPath: p.currentPath } });
      }
    });
    try {
      const result = await api().scanDirectory(dir);
      if (result.ok && result.root) {
        apply(result.root);
        touch();
        return 'ok';
      }
      if (result.error === 'Scan cancelled') {
        get().toast('info', 'Scan cancelled');
        return 'cancelled';
      }
      get().toast('error', `Scan failed: ${result.error}`);
      return 'error';
    } catch (err) {
      get().toast('error', `Scan failed: ${(err as Error).message}`);
      return 'error';
    } finally {
      off();
      // Only clear if this scan still owns the indicator.
      if (get().scanning?.rootPath === dir) set({ scanning: null });
    }
  }

  return {
    roots: [],
    sharePointSites: [],
    explicitMappings: [],
    skippedFolders: [],
    acknowledgedFolders: [],
    techConfig: { ...DEFAULT_TECH_CONFIG },

    initialized: false,
    screen: 'map',
    expanded: {},
    scanning: null,
    saveStatus: 'saved',
    lastSavedAt: null,
    resumeBanner: null,
    toasts: [],
    pendingRemap: null,
    destinationPickerFor: null,

    async init() {
      if (!hasElectron()) {
        set({ initialized: true });
        return;
      }
      try {
        const cfg = await api().getTechConfig();
        const session = await api().loadSession();

        // Pre-seeded sites load on first launch (no prior session).
        const sites: SharePointSite[] =
          session?.sharePointSites ?? (cfg.preSeededSites.length ? sitesFromPresets(cfg.preSeededSites) : []);

        // Sessions saved by older builds may contain overlapping roots
        // (parent + child scanned separately) — drop the later overlapping
        // ones, mirroring the addDirectory refusal.
        const roots: DirectoryRoot[] = [];
        for (const r of session?.roots ?? []) {
          if (roots.some((prev) => pathsOverlap(prev.path, r.path))) {
            get().toast('warning', `Dropped ${r.path} — it overlaps another loaded root`);
            continue;
          }
          roots.push(r);
        }

        // Auto-expand the first 2 levels of each restored tree.
        const expanded: Record<string, boolean> = {};
        for (const root of roots) {
          expanded[root.tree.path] = true;
          for (const child of root.tree.children) expanded[child.path] = true;
        }

        set({
          techConfig: cfg,
          roots,
          sharePointSites: sites,
          explicitMappings: session?.explicitMappings ?? [],
          skippedFolders: session?.skippedFolders ?? [],
          acknowledgedFolders: migrateAckList(session?.acknowledgedFolders ?? []),
          expanded,
          lastSavedAt: session?.savedAt ?? null,
          resumeBanner: session
            ? `Resuming previous session — last saved ${new Date(session.savedAt).toLocaleString()}`
            : null,
          initialized: true,
        });
        if (!session && sites.length) touch();
      } catch (err) {
        // A failed config/session load must not leave the app stuck on
        // "Loading…" — start with defaults and tell the user.
        set({ initialized: true });
        get().toast('error', `Could not load saved settings/session — starting fresh (${(err as Error).message})`);
      }
    },

    async startFresh() {
      await api().clearSession();
      const cfg = get().techConfig;
      set({
        roots: [],
        sharePointSites: cfg.preSeededSites.length ? sitesFromPresets(cfg.preSeededSites) : [],
        explicitMappings: [],
        skippedFolders: [],
        acknowledgedFolders: [],
        expanded: {},
        resumeBanner: null,
        screen: 'map',
      });
      touch();
    },

    flushSessionSync() {
      if (!hasElectron()) return;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (get().saveStatus === 'saved') return;
      try {
        const session = sessionSnapshot();
        const res = api().saveSessionSync(session);
        if (res.ok) set({ saveStatus: 'saved', lastSavedAt: session.savedAt });
      } catch {
        /* best effort — the window is closing */
      }
    },

    async addDirectory() {
      if (get().scanning) {
        get().toast('warning', 'A scan is already running');
        return;
      }
      const picked = await api().pickDirectory();
      if (!picked.length) return;

      // clear-on-load: defer the wipe until a scan actually succeeds, so a
      // cancelled or failed scan doesn't leave the user with nothing.
      let pendingClear =
        get().techConfig.sessionBehavior === 'clear-on-load' && get().roots.length > 0;

      for (const dir of picked) {
        const s = get();
        // Compare against what the roots will be, not the doomed ones.
        const effectiveRoots = pendingClear ? [] : s.roots;
        if (effectiveRoots.some((r) => r.path === dir)) {
          get().toast('warning', `${dir} is already loaded`);
          continue;
        }
        // Overlapping roots would cover the same folders with two migration
        // tasks (and duplicate CSV rows) — refuse them up front.
        const overlap = effectiveRoots.find((r) => pathsOverlap(r.path, dir));
        if (overlap) {
          get().toast('warning', `${dir} overlaps the already-loaded root ${overlap.path} — remove one of them first`);
          continue;
        }
        const status = await runScan(dir, (root) => {
          if (pendingClear) {
            pendingClear = false;
            set({ roots: [], explicitMappings: [], skippedFolders: [], acknowledgedFolders: [], expanded: {} });
          }
          const expanded = { ...get().expanded, [root.tree.path]: true };
          for (const child of root.tree.children) expanded[child.path] = true;
          set({ roots: [...get().roots, root], expanded });
          get().toast('success', `Scanned ${dir}`);
        });
        // Cancel means "stop", not "skip to the next picked directory".
        if (status === 'cancelled') break;
      }
    },

    async rescanRoot(rootId) {
      const s = get();
      const existing = s.roots.find((r) => r.id === rootId);
      if (!existing) return;
      if (s.scanning) {
        get().toast('warning', 'A scan is already running');
        return;
      }
      await runScan(existing.path, (root) => {
        // Keep the root's identity; mappings/skips/acks for paths that no
        // longer exist are pruned, everything else survives the rescan.
        const roots = get().roots.map((r) => (r.id === rootId ? { ...root, id: rootId } : r));
        set({ roots, ...prunedForRoots(roots, get()) });
        get().toast('success', `Rescanned ${existing.path}`);
      });
    },

    cancelScan() {
      void api().cancelScan();
    },

    removeRoot(rootId) {
      const roots = get().roots.filter((r) => r.id !== rootId);
      set({ roots, ...prunedForRoots(roots, get()) });
      touch();
    },

    toggleExpanded(path) {
      set((s) => ({ expanded: { ...s.expanded, [path]: !s.expanded[path] } }));
    },

    addSite(name, slug) {
      const s = get();
      const finalSlug = (slug || slugFromSiteName(name)).trim();
      if (!name.trim() || !finalSlug) {
        get().toast('error', 'Site name is required (and must produce a URL slug)');
        return false;
      }
      if (s.sharePointSites.some((x) => x.slug.toLowerCase() === finalSlug.toLowerCase())) {
        get().toast('error', `A site with URL /sites/${finalSlug} already exists`);
        return false;
      }
      const site: SharePointSite = {
        id: crypto.randomUUID(),
        name: name.trim(),
        slug: finalSlug,
        color: nextSiteColor(s.sharePointSites.map((x) => x.color)),
        folders: [],
      };
      set({ sharePointSites: [...s.sharePointSites, site] });
      touch();
      return true;
    },

    removeSite(siteId) {
      const s = get();
      if (s.explicitMappings.some((m) => m.spSiteId === siteId)) {
        get().toast('error', 'Cannot remove a site that still has mappings');
        return;
      }
      set({ sharePointSites: s.sharePointSites.filter((x) => x.id !== siteId) });
      touch();
    },

    createSpFolder(siteId, parentPath, name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const invalid = classifyFolderName(trimmed);
      if (invalid) {
        get().toast('error', `"${trimmed}" is not a valid SharePoint folder name`);
        return;
      }
      // "Forms" is reserved at the root of a document library.
      if (!parentPath && trimmed.toLowerCase() === 'forms') {
        get().toast('error', '"Forms" is reserved at the root of a document library');
        return;
      }
      const s = get();
      const cfg = s.techConfig;
      const newDepth = spFolderDepth(parentPath) + 1;
      if (newDepth >= cfg.depthBlockAt) {
        get().toast('error', `Cannot create folders at depth ${newDepth} — limit is ${cfg.depthBlockAt - 1}`);
        return;
      }
      set({
        sharePointSites: s.sharePointSites.map((site) => {
          if (site.id !== siteId) return site;
          const res = addSpFolder(site.folders, parentPath, trimmed, crypto.randomUUID());
          if (res.error) {
            get().toast('error', res.error);
            return site;
          }
          return { ...site, folders: res.folders };
        }),
      });
      touch();
    },

    renameSpFolderAction(siteId, folderPath, newName) {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const invalid = classifyFolderName(trimmed);
      if (invalid) {
        get().toast('error', `"${trimmed}" is not a valid SharePoint folder name`);
        return;
      }
      const s = get();
      let mappings = s.explicitMappings;
      set({
        sharePointSites: s.sharePointSites.map((site) => {
          if (site.id !== siteId) return site;
          const res = renameSpFolder(site.folders, folderPath, trimmed);
          if (res.error) {
            get().toast('error', res.error);
            return site;
          }
          mappings = remapAfterRename(mappings, siteId, folderPath, res.newPath);
          return { ...site, folders: res.folders };
        }),
        explicitMappings: mappings,
      });
      touch();
    },

    deleteSpFolderAction(siteId, folderPath) {
      const s = get();
      if (spFolderInUse(s.explicitMappings, siteId, folderPath)) {
        get().toast('error', 'Cannot delete — one or more folders are mapped here');
        return;
      }
      set({
        sharePointSites: s.sharePointSites.map((site) =>
          site.id === siteId ? { ...site, folders: deleteSpFolder(site.folders, folderPath) } : site
        ),
      });
      touch();
    },

    requestMap(localPath, localFolderId, spSiteId, spFolderPath) {
      const s = get();
      const cfg = s.techConfig;

      const depth = spFolderDepth(spFolderPath);
      if (depthStatus(depth, cfg) === 'block') {
        get().toast(
          'error',
          `Cannot map here — SharePoint destination exceeds maximum folder depth of ${cfg.depthBlockAt - 1}.`
        );
        return;
      }

      const existing = s.explicitMappings.find((m) => m.localPath === localPath);
      const next: PendingMap = { localPath, localFolderId, spSiteId, spFolderPath };
      if (existing) {
        const site = s.sharePointSites.find((x) => x.id === existing.spSiteId);
        const dest = site
          ? `${site.name}${existing.spFolderPath ? ' › ' + existing.spFolderPath.replace(/\//g, ' › ') : ''}`
          : 'its current destination';
        set({ pendingRemap: { ...next, replacesSiteName: dest } });
        return;
      }

      set({
        explicitMappings: setExplicitMapping(s.explicitMappings, {
          localFolderId,
          localPath,
          spSiteId,
          spFolderPath,
        }),
        acknowledgedFolders: acksWithout(localPath),
        destinationPickerFor: null,
      });
      touch();
    },

    confirmPendingRemap() {
      const p = get().pendingRemap;
      if (!p) return;
      set((s) => ({
        explicitMappings: setExplicitMapping(s.explicitMappings, {
          localFolderId: p.localFolderId,
          localPath: p.localPath,
          spSiteId: p.spSiteId,
          spFolderPath: p.spFolderPath,
        }),
        pendingRemap: null,
        destinationPickerFor: null,
      }));
      set({ acknowledgedFolders: acksWithout(p.localPath) });
      touch();
    },

    cancelPendingRemap() {
      set({ pendingRemap: null });
    },

    unmap(localPath) {
      set((s) => ({
        explicitMappings: removeExplicitMapping(s.explicitMappings, localPath),
      }));
      set({ acknowledgedFolders: acksWithout(localPath) });
      touch();
    },

    openDestinationPicker(localPath, localFolderId) {
      set({ destinationPickerFor: { localPath, localFolderId } });
    },

    closeDestinationPicker() {
      set({ destinationPickerFor: null });
    },

    toggleSkip(localPath) {
      set((s) => ({
        skippedFolders: s.skippedFolders.includes(localPath)
          ? s.skippedFolders.filter((p) => p !== localPath)
          : [...s.skippedFolders, localPath],
      }));
      // Skipping/unskipping reshapes the plan (splits create new warnings on
      // ANCESTORS) — every overlapping ack is stale now.
      set({ acknowledgedFolders: acksWithout(localPath) });
      touch();
    },

    toggleAcknowledged(kind, localPath) {
      const key = ackKey(kind, localPath);
      set((s) => ({
        acknowledgedFolders: s.acknowledgedFolders.includes(key)
          ? s.acknowledgedFolders.filter((p) => p !== key)
          : [...s.acknowledgedFolders, key],
      }));
      touch();
    },

    setScreen(screen) {
      set({ screen });
    },

    dismissBanner() {
      set({ resumeBanner: null });
    },

    toast(kind, message) {
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
      setTimeout(() => get().dismissToast(id), 5000);
    },

    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    async updateTechConfig(cfg, pinUpdate) {
      const res = await api().saveTechConfig(cfg, pinUpdate);
      if (res.ok) {
        // Re-read: the main process sanitises (clamps thresholds etc.).
        const fresh = await api().getTechConfig();
        set({ techConfig: fresh });
        get().toast('success', 'Technician settings saved');
        return true;
      }
      get().toast('error', `Could not save settings: ${res.error}`);
      return false;
    },
  };
});
