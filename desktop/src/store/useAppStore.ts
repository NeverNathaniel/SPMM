/**
 * Application store (Zustand).
 *
 * Persisted slices (roots, sites, explicit mappings, skip/ack lists) are
 * auto-saved to session.json through the Electron bridge with a 2s debounce.
 * Inherited mappings and validation are always derived — never stored — so
 * session restore can't produce stale chains.
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
import { nextSiteColor } from '../shared/colors';
import { slugFromSiteName } from '../shared/slug';
import {
  removeExplicitMapping,
  setExplicitMapping,
  spFolderDepth,
  depthStatus,
} from '../shared/mappingEngine';
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
  scanning: { rootPath: string; folderCount: number } | null;
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
  lastSavedAt: string | null;
  resumeBanner: string | null;
  toasts: Toast[];
  pendingRemap: PendingMap | null;
  destinationPickerFor: { localPath: string; localFolderId: string } | null;

  // lifecycle
  init(): Promise<void>;
  startFresh(): Promise<void>;

  // directories
  addDirectory(): Promise<void>;
  removeRoot(rootId: string): void;
  toggleExpanded(path: string): void;

  // sites & SP folders
  addSite(name: string, slug?: string): void;
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
  toggleAcknowledged(localPath: string): void;

  // misc UI
  setScreen(screen: Screen): void;
  dismissBanner(): void;
  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;
  updateTechConfig(cfg: TechConfig): Promise<void>;
}

let toastId = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppStore>((set, get) => {
  /** Debounced (2s) session auto-save of the persisted slices. */
  function touch() {
    set({ saveStatus: 'dirty' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const s = get();
      const session: SessionState = {
        roots: s.roots,
        sharePointSites: s.sharePointSites,
        explicitMappings: s.explicitMappings,
        skippedFolders: s.skippedFolders,
        acknowledgedFolders: s.acknowledgedFolders,
        savedAt: new Date().toISOString(),
      };
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
      acknowledgedFolders: s.acknowledgedFolders.filter((p) => valid.has(p)),
    };
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
      const cfg = await api().getTechConfig();
      const session = await api().loadSession();

      let sites: SharePointSite[] = session?.sharePointSites ?? [];
      // Pre-seeded sites load on first launch (no prior session).
      if (!session && cfg.preSeededSites.length) {
        const used: string[] = [];
        sites = cfg.preSeededSites.map((p) => {
          const color = nextSiteColor(used);
          used.push(color);
          return {
            id: crypto.randomUUID(),
            name: p.name,
            slug: p.slug || slugFromSiteName(p.name),
            color,
            folders: [],
          };
        });
      }

      // Auto-expand the first 2 levels of each restored tree.
      const expanded: Record<string, boolean> = {};
      for (const root of session?.roots ?? []) {
        expanded[root.tree.path] = true;
        for (const child of root.tree.children) expanded[child.path] = true;
      }

      set({
        techConfig: cfg,
        roots: session?.roots ?? [],
        sharePointSites: sites,
        explicitMappings: session?.explicitMappings ?? [],
        skippedFolders: session?.skippedFolders ?? [],
        acknowledgedFolders: session?.acknowledgedFolders ?? [],
        expanded,
        lastSavedAt: session?.savedAt ?? null,
        resumeBanner: session
          ? `Resuming previous session — last saved ${new Date(session.savedAt).toLocaleString()}`
          : null,
        initialized: true,
      });
      if (!session && sites.length) touch();
    },

    async startFresh() {
      await api().clearSession();
      const cfg = get().techConfig;
      set({
        roots: [],
        sharePointSites: [],
        explicitMappings: [],
        skippedFolders: [],
        acknowledgedFolders: [],
        expanded: {},
        resumeBanner: null,
        screen: 'map',
      });
      // Re-seed configured sites after a reset, same as first launch.
      if (cfg.preSeededSites.length) {
        const used: string[] = [];
        set({
          sharePointSites: cfg.preSeededSites.map((p) => {
            const color = nextSiteColor(used);
            used.push(color);
            return {
              id: crypto.randomUUID(),
              name: p.name,
              slug: p.slug || slugFromSiteName(p.name),
              color,
              folders: [],
            };
          }),
        });
      }
      touch();
    },

    async addDirectory() {
      const picked = await api().pickDirectory();
      if (!picked.length) return;

      for (const dir of picked) {
        const s = get();
        if (s.roots.some((r) => r.path === dir)) {
          get().toast('warning', `${dir} is already loaded`);
          continue;
        }
        if (s.techConfig.sessionBehavior === 'clear-on-load' && s.roots.length) {
          set({ roots: [], explicitMappings: [], skippedFolders: [], acknowledgedFolders: [] });
        }
        set({ scanning: { rootPath: dir, folderCount: 0 } });
        const off = api().onScanProgress((p) => {
          if (p.rootPath === dir) set({ scanning: { rootPath: dir, folderCount: p.folderCount } });
        });
        try {
          const result = await api().scanDirectory(dir);
          if (result.ok && result.root) {
            const expanded = { ...get().expanded, [result.root.tree.path]: true };
            for (const child of result.root.tree.children) expanded[child.path] = true;
            set({ roots: [...get().roots, result.root], expanded });
            get().toast('success', `Scanned ${dir}`);
            touch();
          } else {
            get().toast('error', `Scan failed: ${result.error}`);
          }
        } finally {
          off();
          set({ scanning: null });
        }
      }
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
        get().toast('error', 'Site name is required');
        return;
      }
      if (s.sharePointSites.some((x) => x.slug.toLowerCase() === finalSlug.toLowerCase())) {
        get().toast('error', `A site with URL /sites/${finalSlug} already exists`);
        return;
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
      touch();
    },

    cancelPendingRemap() {
      set({ pendingRemap: null });
    },

    unmap(localPath) {
      set((s) => ({ explicitMappings: removeExplicitMapping(s.explicitMappings, localPath) }));
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
      touch();
    },

    toggleAcknowledged(localPath) {
      set((s) => ({
        acknowledgedFolders: s.acknowledgedFolders.includes(localPath)
          ? s.acknowledgedFolders.filter((p) => p !== localPath)
          : [...s.acknowledgedFolders, localPath],
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

    async updateTechConfig(cfg) {
      const res = await api().saveTechConfig(cfg);
      if (res.ok) {
        set({ techConfig: cfg });
        get().toast('success', 'Technician settings saved');
      } else {
        get().toast('error', `Could not save settings: ${res.error}`);
      }
    },
  };
});
