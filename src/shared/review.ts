/**
 * Review & Export gating logic.
 *
 * Hard blocks (cannot be acknowledged away): destination depth at/over the
 * block threshold, resolved path length over the block threshold (SPMT is
 * guaranteed to fail on these), ineligible *folder names* on migrating
 * folders, source conflicts from overlapping roots, and an unset/invalid
 * tenant domain.
 * Acknowledgeable: path length warnings (amber), ineligible files, and split
 * folders whose direct files no SPMT task will migrate.
 * Informational: depth warnings, unmapped folders, hidden items filtered at
 * scan time.
 */

import type { DirectoryRoot, FolderNode, ResolvedMapping, TechConfig } from './types';
import { DEFAULT_TECH_CONFIG } from './types';
import { ackKey } from './acks';
import { flattenTree } from './mappingEngine';
import { validateTenantDomain } from './slug';
import { isPathWithin, type SpmtPlan } from './spmtPlan';

export interface ReviewSummary {
  totalFolders: number;
  explicitCount: number;
  inheritedCount: number;
  unmappedFolders: FolderNode[];
  /** Folders with no destination because an ancestor is skipped (not "unmapped") */
  excludedBySkip: FolderNode[];
  skippedCount: number;
  /** % of folders with a resolved destination or excluded by a skip */
  progressPct: number;
  /** SPMT tasks the export will contain (maximal uniform subtrees) */
  taskCount: number;
  /** Hidden/system items filtered at scan time, informational */
  hiddenItemsSkipped: number;

  hardBlocks: ResolvedMapping[];
  pathWarnings: ResolvedMapping[]; // amber, need per-folder ack
  pathBlocks: ResolvedMapping[]; // red, hard block — guaranteed SPMT failure
  ineligibleFolders: FolderNode[]; // need per-folder-group ack
  depthWarnings: ResolvedMapping[]; // informational
  /** Split folders whose direct files no task migrates — need per-folder ack */
  splitFileWarnings: SpmtPlan['splitFileWarnings'];
  /** Same source resolving to two destinations (overlapping roots) — hard block */
  conflicts: SpmtPlan['conflicts'];
  /** Unset, placeholder, or malformed tenant domain — hard block */
  tenantDomainIssue: string | null;

  unacknowledgedPaths: string[];
  exportReady: boolean;
}

export function buildReviewSummary(
  roots: DirectoryRoot[],
  resolved: ResolvedMapping[],
  acknowledgedFolders: string[],
  config: TechConfig,
  plan: SpmtPlan
): ReviewSummary {
  const allFolders = roots.flatMap((r) => flattenTree(r.tree));
  const resolvedByPath = new Map(resolved.map((m) => [m.localPath, m]));
  const acked = new Set(acknowledgedFolders);

  const active = resolved.filter((m) => !m.skipped);
  const explicitCount = active.filter((m) => m.isExplicit).length;
  const inheritedCount = active.length - explicitCount;
  const skippedCount = resolved.length - active.length;

  // A folder with no destination whose ancestor is skipped is excluded from
  // the migration on purpose — reporting it as "unmapped" would contradict
  // the Skipped section and nag the user to map it.
  const skippedPaths = resolved.filter((m) => m.skipped).map((m) => m.localPath);
  const unresolved = allFolders.filter((f) => !resolvedByPath.has(f.path));
  const excludedBySkip = unresolved.filter((f) =>
    skippedPaths.some((sk) => f.path !== sk && isPathWithin(f.path, sk))
  );
  const excludedSet = new Set(excludedBySkip.map((f) => f.path));
  const unmappedFolders = unresolved.filter((f) => !excludedSet.has(f.path));
  const progressPct = allFolders.length
    ? Math.round(((resolved.length + excludedBySkip.length) / allFolders.length) * 100)
    : 0;
  const hiddenItemsSkipped = allFolders.reduce((n, f) => n + (f.hiddenItemsSkipped ?? 0), 0);

  const depthBlocks = active.filter((m) => m.depthStatus === 'block');
  const folderNameBlocks = active.filter((m) => m.hasIneligibleFolderName);
  const pathBlocks = active.filter((m) => m.pathLengthStatus === 'block');
  const seen = new Set<ResolvedMapping>();
  const hardBlocks = [...depthBlocks, ...folderNameBlocks, ...pathBlocks].filter((m) => {
    if (seen.has(m)) return false;
    seen.add(m);
    return true;
  });

  const pathWarnings = active.filter((m) => m.pathLengthStatus === 'warn');
  const depthWarnings = active.filter((m) => m.depthStatus === 'warn');

  const ineligibleFolders = allFolders.filter((f) => f.ineligibleFiles.length > 0);

  const tenantDomainIssue =
    config.tenantDomain === DEFAULT_TECH_CONFIG.tenantDomain
      ? `The tenant domain is still the "${DEFAULT_TECH_CONFIG.tenantDomain}" placeholder — set your real tenant in Settings.`
      : validateTenantDomain(config.tenantDomain);

  // Everything that demands a checkbox: amber path rows, folders with
  // ineligible files (only when the folder actually migrates), and split
  // folders whose direct files won't migrate. Keys are namespaced per
  // warning kind so an old ack of one kind can't satisfy another.
  const needsAck = new Set<string>();
  for (const m of pathWarnings) needsAck.add(ackKey('path', m.localPath));
  for (const f of ineligibleFolders) {
    const r = resolvedByPath.get(f.path);
    if (r && !r.skipped) needsAck.add(ackKey('inelig', f.path));
  }
  for (const w of plan.splitFileWarnings) needsAck.add(ackKey('split', w.localPath));

  const unacknowledgedPaths = [...needsAck].filter((p) => !acked.has(p));

  const exportReady =
    hardBlocks.length === 0 &&
    plan.conflicts.length === 0 &&
    tenantDomainIssue === null &&
    unacknowledgedPaths.length === 0 &&
    plan.tasks.length > 0;

  return {
    totalFolders: allFolders.length,
    explicitCount,
    inheritedCount,
    unmappedFolders,
    excludedBySkip,
    skippedCount,
    progressPct,
    taskCount: plan.tasks.length,
    hiddenItemsSkipped,
    hardBlocks,
    pathWarnings,
    pathBlocks,
    ineligibleFolders,
    depthWarnings,
    splitFileWarnings: plan.splitFileWarnings,
    conflicts: plan.conflicts,
    tenantDomainIssue,
    unacknowledgedPaths,
    exportReady,
  };
}
