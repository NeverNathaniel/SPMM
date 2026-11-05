/**
 * Mapping rules engine.
 *
 * Implements the seven rules:
 *  1. Explicit mapping always wins.
 *  2. Unmapped descendants of a mapped folder inherit proportionally.
 *  3. An explicit child breaks the inheritance chain for its subtree.
 *  4. Remap replaces (UI confirms first) — replacement is just a new explicit
 *     mapping for the same path; inheritance is recomputed here.
 *  5. Unmap cascades: inherited mappings are derived, never stored, so
 *     removing an explicit mapping naturally removes everything that
 *     descended from it while preserving explicitly-mapped branches.
 *  6. Files follow folders — no file-level mappings exist in the model.
 *  7. Path type detection: UNC (\\server\share) and local (C:\) source paths
 *     are written to the CSV exactly as scanned; no conversion.
 *
 * Inherited mappings are recalculated from explicit mappings on every call,
 * which is also how session restore avoids stale chains.
 */

import type {
  DirectoryRoot,
  ExplicitMapping,
  FolderNode,
  PathType,
  ResolvedMapping,
  SharePointSite,
  TechConfig,
  ValidationStatus,
} from './types';
import { destinationUrl } from './slug';

export function detectPathType(path: string): PathType {
  return path.startsWith('\\\\') ? 'unc' : 'local';
}

/** Windows-style comparison key: separators unified, no trailing slash, case-folded. */
function pathKey(p: string): string {
  const unified = p.replace(/\//g, '\\');
  const trimmed = unified.length > 3 ? unified.replace(/\\+$/, '') : unified; // keep "C:\\"
  return trimmed.toLowerCase();
}

/**
 * True when two scan roots are the same folder or one contains the other.
 * Overlapping roots would put the same folder in two trees, producing
 * duplicate CSV rows (the same source migrated twice) and colliding
 * path-keyed mappings. Windows paths are case-insensitive.
 */
export function rootsOverlap(a: string, b: string): boolean {
  const ka = pathKey(a);
  const kb = pathKey(b);
  if (ka === kb) return true;
  const within = (inner: string, outer: string) =>
    inner.startsWith(outer.endsWith('\\') ? outer : `${outer}\\`);
  return within(ka, kb) || within(kb, ka);
}

export function spFolderDepth(spFolderPath: string): number {
  if (!spFolderPath) return 0; // Documents/ root
  return spFolderPath.split('/').filter(Boolean).length;
}

export function depthStatus(depth: number, config: TechConfig): ValidationStatus {
  if (depth >= config.depthBlockAt) return 'block';
  if (depth >= config.depthWarnAt) return 'warn';
  return 'ok';
}

export function pathLengthStatus(length: number, config: TechConfig): ValidationStatus {
  if (length > config.pathBlockAt) return 'block';
  if (length > config.pathWarnAt) return 'warn';
  return 'ok';
}

/**
 * Worst-case resolved SharePoint URL length for a file inside the mapped
 * folder, using the longest filename captured at scan time.
 */
export function worstCasePathLength(
  tenantDomain: string,
  slug: string,
  spFolderPath: string,
  longestFilename: string
): number {
  const base = destinationUrl(tenantDomain, slug, spFolderPath);
  // Folders with no files still count the trailing slash position.
  return base.length + 1 + longestFilename.length;
}

interface ResolveContext {
  sitesById: Map<string, SharePointSite>;
  explicitByPath: Map<string, ExplicitMapping>;
  skipped: Set<string>;
  acknowledged: Set<string>;
  config: TechConfig;
}

/**
 * Resolve all mappings (explicit + inherited) across every root.
 * Returns one entry per folder that has a resolved destination.
 */
export function resolveMappings(
  roots: DirectoryRoot[],
  sites: SharePointSite[],
  explicitMappings: ExplicitMapping[],
  skippedFolders: string[],
  acknowledgedFolders: string[],
  config: TechConfig
): ResolvedMapping[] {
  const ctx: ResolveContext = {
    sitesById: new Map(sites.map((s) => [s.id, s])),
    explicitByPath: new Map(explicitMappings.map((m) => [m.localPath, m])),
    skipped: new Set(skippedFolders),
    acknowledged: new Set(acknowledgedFolders),
    config,
  };

  const out: ResolvedMapping[] = [];
  for (const root of roots) {
    walk(root.tree, null, ctx, out);
  }
  return out;
}

interface InheritedFrom {
  mapping: ExplicitMapping;
  /** spFolderPath of the destination accumulated down the tree */
  spFolderPath: string;
}

function walk(
  node: FolderNode,
  inherited: InheritedFrom | null,
  ctx: ResolveContext,
  out: ResolvedMapping[]
): void {
  const explicit = ctx.explicitByPath.get(node.path);
  let next: InheritedFrom | null = null;

  if (explicit && ctx.sitesById.has(explicit.spSiteId)) {
    // Rules 1 & 3: explicit wins and starts a new inheritance chain.
    out.push(buildResolved(node, explicit, explicit.spFolderPath, true, ctx));
    next = { mapping: explicit, spFolderPath: explicit.spFolderPath };
  } else if (inherited) {
    // Rule 2: inherit proportionally — append this folder's name.
    const childSpPath = inherited.spFolderPath
      ? `${inherited.spFolderPath}/${node.name}`
      : node.name;
    out.push(buildResolved(node, inherited.mapping, childSpPath, false, ctx));
    next = { mapping: inherited.mapping, spFolderPath: childSpPath };
  }

  for (const child of node.children) {
    walk(child, next, ctx, out);
  }
}

function buildResolved(
  node: FolderNode,
  source: ExplicitMapping,
  spFolderPath: string,
  isExplicit: boolean,
  ctx: ResolveContext
): ResolvedMapping {
  const site = ctx.sitesById.get(source.spSiteId)!;
  const depth = spFolderDepth(spFolderPath);
  const length = worstCasePathLength(
    ctx.config.tenantDomain,
    site.slug,
    spFolderPath,
    node.longestFilename
  );

  return {
    localFolderId: node.id,
    localPath: node.path,
    spSiteId: site.id,
    spFolderPath,
    isExplicit,
    resolvedSourcePath: node.path, // Rule 7: UNC/local preserved as-is
    resolvedTargetUrl: destinationUrl(ctx.config.tenantDomain, site.slug, spFolderPath),
    worstCasePathLength: length,
    pathLengthStatus: pathLengthStatus(length, ctx.config),
    spDestinationDepth: depth,
    // Depth gating applies to the folder the user explicitly dropped onto;
    // inherited rows necessarily grow deeper and are not re-blocked.
    depthStatus: isExplicit ? depthStatus(depth, ctx.config) : 'ok',
    ineligibleFileCount: node.ineligibleFiles.length,
    hasIneligibleFolderName: node.hasIneligibleFolderName,
    acknowledged: ctx.acknowledged.has(node.path),
    skipped: ctx.skipped.has(node.path),
  };
}

/** Convenience map keyed by local path. */
export function resolveMappingsByPath(
  ...args: Parameters<typeof resolveMappings>
): Map<string, ResolvedMapping> {
  return new Map(resolveMappings(...args).map((m) => [m.localPath, m]));
}

/**
 * Apply an explicit mapping (Rules 1 & 4). Returns the new mappings array;
 * replacing an existing mapping for the same path is allowed here — the UI
 * is responsible for the "Replace this mapping?" confirmation.
 */
export function setExplicitMapping(
  mappings: ExplicitMapping[],
  next: ExplicitMapping
): ExplicitMapping[] {
  return [...mappings.filter((m) => m.localPath !== next.localPath), next];
}

/** Remove the explicit mapping for a path (Rule 5 — cascade is derived). */
export function removeExplicitMapping(
  mappings: ExplicitMapping[],
  localPath: string
): ExplicitMapping[] {
  return mappings.filter((m) => m.localPath !== localPath);
}

/**
 * All folder nodes of a tree, flattened depth-first (pre-order).
 * Iterative: spreading a large subtree into push() (or recursing per level
 * with array copies) overflows the call stack on file shares with 100k+
 * folders.
 */
export function flattenTree(node: FolderNode): FolderNode[] {
  const out: FolderNode[] = [];
  const stack: FolderNode[] = [node];
  while (stack.length) {
    const n = stack.pop()!;
    out.push(n);
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return out;
}

export function countFolders(roots: DirectoryRoot[]): number {
  return roots.reduce((n, r) => n + flattenTree(r.tree).length, 0);
}

/**
 * Mapping state of a folder for the tree UI:
 * - 'explicit' / 'inherited' / 'unmapped' for the folder itself
 * - plus whether its descendants are a mix of mapped and unmapped
 *   (drives the split indicator).
 */
export interface FolderMapState {
  status: 'explicit' | 'inherited' | 'unmapped';
  siteId: string | null;
  spFolderPath: string | null;
  /** True when some but not all descendants have a resolved destination */
  split: boolean;
}

interface DescendantCounts {
  total: number;
  mapped: number;
  explicit: number;
}

function stateFrom(
  own: ResolvedMapping | undefined,
  { total, mapped, explicit }: DescendantCounts
): FolderMapState {
  if (!own) return { status: 'unmapped', siteId: null, spFolderPath: null, split: mapped > 0 };
  const split = total > 0 && ((mapped > 0 && mapped < total) || explicit > 0);
  return {
    status: own.isExplicit ? 'explicit' : 'inherited',
    siteId: own.spSiteId,
    spFolderPath: own.spFolderPath,
    split,
  };
}

/** Map state of a single folder. O(subtree) — prefer buildFolderMapStates for whole trees. */
export function folderMapState(
  node: FolderNode,
  resolved: Map<string, ResolvedMapping>
): FolderMapState {
  const counts: DescendantCounts = { total: 0, mapped: 0, explicit: 0 };
  for (const d of flattenTree(node).slice(1)) {
    counts.total++;
    const r = resolved.get(d.path);
    if (r) {
      counts.mapped++;
      if (r.isExplicit) counts.explicit++;
    }
  }
  return stateFrom(resolved.get(node.path), counts);
}

/**
 * Map state for every folder of every root in a single post-order pass, so
 * the tree UI doesn't re-walk each row's subtree (quadratic on large trees).
 */
export function buildFolderMapStates(
  roots: DirectoryRoot[],
  resolved: Map<string, ResolvedMapping>
): Map<string, FolderMapState> {
  const out = new Map<string, FolderMapState>();
  const visit = (node: FolderNode): DescendantCounts => {
    const counts: DescendantCounts = { total: 0, mapped: 0, explicit: 0 };
    for (const child of node.children) {
      const c = visit(child);
      const r = resolved.get(child.path);
      counts.total += c.total + 1;
      counts.mapped += c.mapped + (r ? 1 : 0);
      counts.explicit += c.explicit + (r?.isExplicit ? 1 : 0);
    }
    out.set(node.path, stateFrom(resolved.get(node.path), counts));
    return counts;
  };
  for (const root of roots) visit(root.tree);
  return out;
}
