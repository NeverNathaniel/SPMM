/**
 * Derived state: resolved mappings + review summary.
 *
 * Computed once per relevant store change and shared through context so that
 * every tree row reads the same memoised result (resolution is O(folders);
 * recomputing it per row would make large trees quadratic).
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppStore } from './useAppStore';
import {
  buildFolderMapStates,
  flattenTree,
  resolveMappings,
  type FolderMapState,
} from '../shared/mappingEngine';
import { buildReviewSummary, type ReviewSummary } from '../shared/review';
import type { FolderNode, ResolvedMapping } from '../shared/types';

export interface ResolvedState {
  list: ResolvedMapping[];
  byPath: Map<string, ResolvedMapping>;
  /** Tree-UI state (explicit/inherited/unmapped + split) for every folder */
  mapStates: Map<string, FolderMapState>;
  /** Every scanned folder keyed by local path */
  nodesByPath: Map<string, FolderNode>;
  summary: ReviewSummary;
}

const ResolvedContext = createContext<ResolvedState | null>(null);

export function ResolvedProvider({ children }: { children: ReactNode }) {
  const roots = useAppStore((s) => s.roots);
  const sites = useAppStore((s) => s.sharePointSites);
  const explicitMappings = useAppStore((s) => s.explicitMappings);
  const skippedFolders = useAppStore((s) => s.skippedFolders);
  const acknowledgedFolders = useAppStore((s) => s.acknowledgedFolders);
  const techConfig = useAppStore((s) => s.techConfig);

  const value = useMemo<ResolvedState>(() => {
    const list = resolveMappings(
      roots,
      sites,
      explicitMappings,
      skippedFolders,
      acknowledgedFolders,
      techConfig
    );
    const byPath = new Map(list.map((m) => [m.localPath, m]));
    return {
      list,
      byPath,
      mapStates: buildFolderMapStates(roots, byPath),
      nodesByPath: new Map(roots.flatMap((r) => flattenTree(r.tree)).map((n) => [n.path, n])),
      summary: buildReviewSummary(roots, list, acknowledgedFolders),
    };
  }, [roots, sites, explicitMappings, skippedFolders, acknowledgedFolders, techConfig]);

  return <ResolvedContext.Provider value={value}>{children}</ResolvedContext.Provider>;
}

export function useResolved(): ResolvedState {
  const ctx = useContext(ResolvedContext);
  if (!ctx) throw new Error('useResolved must be used within ResolvedProvider');
  return ctx;
}
