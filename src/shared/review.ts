/**
 * Review & Export gating logic.
 *
 * Hard blocks (cannot be acknowledged away): destination depth at/over the
 * block threshold, resolved path length over the block threshold, and
 * ineligible *folder names* on mapped folders.
 * Acknowledgeable: path length warnings (amber) and ineligible files.
 * Informational: depth warnings, unmapped folders.
 */

import type { DirectoryRoot, FolderNode, ResolvedMapping } from './types';
import { flattenTree } from './mappingEngine';

export interface ReviewSummary {
  totalFolders: number;
  explicitCount: number;
  inheritedCount: number;
  unmappedFolders: FolderNode[];
  skippedCount: number;
  /** % of folders with a resolved destination (skipped still count as resolved) */
  progressPct: number;

  hardBlocks: ResolvedMapping[];
  pathWarnings: ResolvedMapping[]; // amber, need per-folder ack
  pathBlocks: ResolvedMapping[]; // red, need per-folder ack (not a hard block — see below)
  ineligibleFolders: FolderNode[]; // need per-folder-group ack
  depthWarnings: ResolvedMapping[]; // informational

  unacknowledgedPaths: string[];
  exportReady: boolean;
}

/**
 * Per the plan: depth-block violations are hard blocks; path length > block
 * threshold requires acknowledgment and is flagged prominently (red) but the
 * plan's validation table says "> 400: acknowledgment required before
 * export"; the hard-block section lists "path > 400 chars". We treat
 * depth blocks and ineligible mapped folder names as restructure-only hard
 * blocks, and red path lengths as acknowledgeable-but-prominent, which
 * matches the more detailed validation table.
 */
export function buildReviewSummary(
  roots: DirectoryRoot[],
  resolved: ResolvedMapping[],
  acknowledgedFolders: string[]
): ReviewSummary {
  const allFolders = roots.flatMap((r) => flattenTree(r.tree));
  const resolvedByPath = new Map(resolved.map((m) => [m.localPath, m]));
  const acked = new Set(acknowledgedFolders);

  const active = resolved.filter((m) => !m.skipped);
  const explicitCount = active.filter((m) => m.isExplicit).length;
  const inheritedCount = active.length - explicitCount;
  const skippedCount = resolved.length - active.length;

  const unmappedFolders = allFolders.filter((f) => !resolvedByPath.has(f.path));
  const progressPct = allFolders.length
    ? Math.round((resolved.length / allFolders.length) * 100)
    : 0;

  const depthBlocks = active.filter((m) => m.depthStatus === 'block');
  const folderNameBlocks = active.filter((m) => m.hasIneligibleFolderName);
  const hardBlocks = [...depthBlocks, ...folderNameBlocks.filter((m) => !depthBlocks.includes(m))];

  const pathWarnings = active.filter((m) => m.pathLengthStatus === 'warn');
  const pathBlocks = active.filter((m) => m.pathLengthStatus === 'block');
  const depthWarnings = active.filter((m) => m.depthStatus === 'warn');

  const ineligibleFolders = allFolders.filter((f) => f.ineligibleFiles.length > 0);

  // Everything that demands a checkbox: amber/red path rows + folders with
  // ineligible files (only when the folder actually migrates).
  const needsAck = new Set<string>();
  for (const m of [...pathWarnings, ...pathBlocks]) needsAck.add(m.localPath);
  for (const f of ineligibleFolders) {
    if (resolvedByPath.get(f.path) && !resolvedByPath.get(f.path)!.skipped) needsAck.add(f.path);
  }

  const unacknowledgedPaths = [...needsAck].filter((p) => !acked.has(p));

  const exportReady =
    hardBlocks.length === 0 && unacknowledgedPaths.length === 0 && active.length > 0;

  return {
    totalFolders: allFolders.length,
    explicitCount,
    inheritedCount,
    unmappedFolders,
    skippedCount,
    progressPct,
    hardBlocks,
    pathWarnings,
    pathBlocks,
    ineligibleFolders,
    depthWarnings,
    unacknowledgedPaths,
    exportReady,
  };
}
