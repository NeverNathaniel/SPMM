/**
 * Migration plan: which folders become SPMT CSV rows.
 *
 * SPMT migrates a file-share source folder *recursively* — the folder's own
 * files plus every subfolder beneath it. So a row can only be written for a
 * folder whose entire subtree lands exactly where that recursive copy would
 * put it. Writing a row for every resolved folder (the old behaviour) made
 * SPMT migrate deep files once per ancestor row, ignore Skip on subfolders,
 * and copy re-mapped subfolders into their parent's destination as well.
 *
 * The rule, applied top-down from each root:
 *  - A folder is *uniform* when it is mapped, not skipped, and every
 *    descendant is mapped, not skipped, and lands at the parent's
 *    destination + its relative path (inherited, or explicitly mapped to the
 *    same place). A uniform folder gets one row and covers its subtree.
 *  - Otherwise no row is written for it and the rule is applied to each
 *    child instead.
 *  - A mapped, non-skipped folder that is *not* uniform but has files of its
 *    own is "stranded": SPMT can't send a folder's files without its
 *    subfolders, so those files are not in the CSV and must be handled
 *    separately (the review screen asks for acknowledgment).
 */

import type { DirectoryRoot, FolderNode, ResolvedMapping } from './types';

export interface StrandedFolder {
  node: FolderNode;
  mapping: ResolvedMapping;
}

export interface MigrationPlan {
  /** One per SPMT CSV row, in tree order */
  rows: ResolvedMapping[];
  /** Mapped folders whose own files can't be expressed as a CSV row */
  stranded: StrandedFolder[];
}

function joinSpPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/** SharePoint folder paths are case-insensitive. */
function sameSpPath(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function planMigration(
  roots: DirectoryRoot[],
  resolvedByPath: Map<string, ResolvedMapping>
): MigrationPlan {
  // Bottom-up: which folders' whole subtrees match a single recursive copy.
  const uniform = new Set<string>();
  const check = (node: FolderNode): boolean => {
    const r = resolvedByPath.get(node.path);
    let ok = !!r && !r.skipped;
    for (const child of node.children) {
      const childOk = check(child); // always recurse so every node is classified
      if (ok) {
        const cr = resolvedByPath.get(child.path)!; // childOk ⇒ resolved
        ok =
          childOk &&
          cr.spSiteId === r!.spSiteId &&
          sameSpPath(cr.spFolderPath, joinSpPath(r!.spFolderPath, child.name));
      }
    }
    if (ok) uniform.add(node.path);
    return ok;
  };

  // Top-down: emit the highest uniform folders; descend where trees diverge.
  const rows: ResolvedMapping[] = [];
  const stranded: StrandedFolder[] = [];
  const emit = (node: FolderNode): void => {
    const r = resolvedByPath.get(node.path);
    if (uniform.has(node.path)) {
      rows.push(r!);
      return;
    }
    if (r && !r.skipped && node.fileCount > 0) stranded.push({ node, mapping: r });
    for (const child of node.children) emit(child);
  };

  for (const root of roots) {
    check(root.tree);
    emit(root.tree);
  }
  return { rows, stranded };
}
