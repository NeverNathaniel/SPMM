/**
 * Derived state: resolved mappings + SPMT plan + review summary.
 *
 * Computed once per relevant store change and shared through context so that
 * every tree row reads the same memoised result (resolution is O(folders);
 * recomputing it per row would make large trees quadratic).
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppStore } from './useAppStore';
import {
  buildFolderMapStates,
  resolveMappings,
  type FolderMapState,
} from '../shared/mappingEngine';
import { planSpmtTasks, type SpmtPlan } from '../shared/spmtPlan';
import { buildReviewSummary, type ReviewSummary } from '../shared/review';
import type { ResolvedMapping } from '../shared/types';

export interface ResolvedState {
  list: ResolvedMapping[];
  byPath: Map<string, ResolvedMapping>;
  mapStates: Map<string, FolderMapState>;
  plan: SpmtPlan;
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
    const plan = planSpmtTasks(roots, byPath);
    return {
      list,
      byPath,
      mapStates: buildFolderMapStates(roots, byPath),
      plan,
      summary: buildReviewSummary(roots, list, acknowledgedFolders, techConfig, plan),
    };
  }, [roots, sites, explicitMappings, skippedFolders, acknowledgedFolders, techConfig]);

  return <ResolvedContext.Provider value={value}>{children}</ResolvedContext.Provider>;
}

export function useResolved(): ResolvedState {
  const ctx = useContext(ResolvedContext);
  if (!ctx) throw new Error('useResolved must be used within ResolvedProvider');
  return ctx;
}
