/**
 * SPMT task planning.
 *
 * Every row in an SPMT bulk-migration CSV is an independent, FULLY RECURSIVE
 * migration task: SPMT copies everything under Source into the target, and
 * the format offers no per-folder exclusions. Emitting a row per resolved
 * folder (the obvious translation of the mapping model) is therefore wrong —
 * an ancestor's row would re-migrate explicitly remapped subtrees into the
 * ancestor's destination and would migrate "skipped" folders anyway.
 *
 * The planner instead emits one task per MAXIMAL UNIFORMLY MAPPED SUBTREE:
 * a folder whose entire subtree resolves to exactly the destinations its own
 * recursive task would produce (inherited descendants always do; explicit
 * descendants only when their destination coincides). Around any exception —
 * a skipped folder or a divergent explicit remap — the parent is split into
 * per-child tasks instead. Splitting has one SPMT-imposed cost: the split
 * parent's DIRECT files are not covered by any task, which is reported as a
 * warning the user must acknowledge (or restructure to avoid).
 */

import type { DirectoryRoot, FolderNode, ResolvedMapping } from './types';

export interface SpmtTask {
  sourcePath: string;
  spSiteId: string;
  /** Destination relative to Documents/, '' = Documents root */
  spFolderPath: string;
}

/** A split folder whose direct files no emitted task will migrate. */
export interface SplitFileWarning {
  localPath: string;
  spSiteId: string;
  spFolderPath: string;
  fileCount: number;
}

/** The same source folder resolving to two different destinations. */
export interface SourceConflict {
  sourcePath: string;
}

export interface SpmtPlan {
  tasks: SpmtTask[];
  splitFileWarnings: SplitFileWarning[];
  conflicts: SourceConflict[];
}

/** Windows paths compare case-insensitively; normalise separators too. */
function normPath(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

/** True when the paths are equal or one contains the other (Windows semantics). */
export function pathsOverlap(a: string, b: string): boolean {
  const na = normPath(a);
  const nb = normPath(b);
  return na === nb || na.startsWith(nb + '\\') || nb.startsWith(na + '\\');
}

/** True when `child` equals `parent` or lies beneath it (Windows semantics). */
export function isPathWithin(child: string, parent: string): boolean {
  const nc = normPath(child);
  const np = normPath(parent);
  return nc === np || nc.startsWith(np + '\\');
}

export function planSpmtTasks(
  roots: DirectoryRoot[],
  resolvedByPath: Map<string, ResolvedMapping>
): SpmtPlan {
  const rawTasks: SpmtTask[] = [];
  const splitFileWarnings: SplitFileWarning[] = [];

  // A node is "uniform" when its own recursive task would land every
  // descendant exactly where the plan says it belongs: every child resolved,
  // not skipped, on the same site, at dest/childName — and itself uniform.
  const uniform = new Map<string, boolean>();

  function computeUniform(node: FolderNode): void {
    for (const child of node.children) computeUniform(child);
    const r = resolvedByPath.get(node.path);
    if (!r || r.skipped) return;
    let ok = true;
    for (const child of node.children) {
      const rc = resolvedByPath.get(child.path);
      const expected = r.spFolderPath ? `${r.spFolderPath}/${child.name}` : child.name;
      if (
        !rc ||
        rc.skipped ||
        rc.spSiteId !== r.spSiteId ||
        rc.spFolderPath !== expected ||
        !uniform.get(child.path)
      ) {
        ok = false;
        break;
      }
    }
    uniform.set(node.path, ok);
  }

  function walkEmit(node: FolderNode): void {
    const r = resolvedByPath.get(node.path);
    if (!r || r.skipped) {
      // Unmapped or excluded — explicit mappings below re-root themselves.
      for (const child of node.children) walkEmit(child);
      return;
    }
    if (uniform.get(node.path)) {
      rawTasks.push({ sourcePath: node.path, spSiteId: r.spSiteId, spFolderPath: r.spFolderPath });
      return; // the recursive task covers the whole subtree
    }
    // Exception below: split into per-child tasks. The split parent's direct
    // files are not covered by any task — surface that.
    if (node.fileCount > 0) {
      splitFileWarnings.push({
        localPath: node.path,
        spSiteId: r.spSiteId,
        spFolderPath: r.spFolderPath,
        fileCount: node.fileCount,
      });
    }
    for (const child of node.children) walkEmit(child);
  }

  for (const root of roots) {
    computeUniform(root.tree);
    walkEmit(root.tree);
  }

  // Overlapping roots can cover the same disk folder twice. Exact duplicates
  // collapse; a source contained in another task's subtree is dropped when
  // the covering task already produces the same destination, and flagged as
  // a conflict (hard block) when it does not.
  const conflicts: SourceConflict[] = [];
  const bySource = new Map<string, SpmtTask>();
  for (const t of rawTasks) {
    const key = normPath(t.sourcePath);
    const prev = bySource.get(key);
    if (!prev) {
      bySource.set(key, t);
    } else if (prev.spSiteId !== t.spSiteId || prev.spFolderPath !== t.spFolderPath) {
      conflicts.push({ sourcePath: t.sourcePath });
    }
  }

  const sorted = [...bySource.entries()]
    .map(([key, task]) => ({ key, task }))
    .sort((a, b) => a.key.length - b.key.length || (a.key < b.key ? -1 : 1));
  const kept: { key: string; task: SpmtTask }[] = [];
  for (const cur of sorted) {
    // Nearest kept ancestor, if any (kept is length-ascending; search backwards).
    let cover: { key: string; task: SpmtTask } | undefined;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (cur.key.startsWith(kept[i].key + '\\')) {
        cover = kept[i];
        break;
      }
    }
    if (!cover) {
      kept.push(cur);
      continue;
    }
    const rel = cur.task.sourcePath
      .slice(cover.task.sourcePath.length)
      .split(/[\\/]+/)
      .filter(Boolean)
      .join('/');
    const expected = cover.task.spFolderPath ? `${cover.task.spFolderPath}/${rel}` : rel;
    if (cur.task.spSiteId === cover.task.spSiteId && cur.task.spFolderPath === expected) {
      continue; // already covered, consistently — redundant
    }
    conflicts.push({ sourcePath: cur.task.sourcePath });
    kept.push(cur); // keep it visible; conflicts block export anyway
  }

  // Overlapping roots (possible in sessions saved by older builds) visit the
  // same folder once per root — collapse duplicate warnings.
  const warningsByPath = new Map<string, SplitFileWarning>();
  for (const w of splitFileWarnings) {
    const key = normPath(w.localPath);
    const prev = warningsByPath.get(key);
    if (!prev || w.fileCount > prev.fileCount) warningsByPath.set(key, w);
  }

  return {
    tasks: kept.sort((a, b) => (a.key < b.key ? -1 : 1)).map((x) => x.task),
    splitFileWarnings: [...warningsByPath.values()],
    conflicts,
  };
}
