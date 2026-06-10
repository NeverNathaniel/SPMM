/**
 * Live destination-structure preview for a SharePoint site card.
 *
 * Merges a site's user-created folder tree with the folders that migration
 * will create, derived from the resolved mappings: an explicit mapping pours
 * a local folder's contents into its target folder, and every inherited
 * descendant becomes a new folder nested beneath it. Skipped folders are
 * excluded exactly as they are from the SPMT CSV, but path segments still
 * needed by an exported descendant remain (as sourceless created folders).
 */

import type { ResolvedMapping, SharePointSite, SPFolder } from './types';

export interface PreviewSource {
  localPath: string;
  localName: string;
  isExplicit: boolean;
}

export interface PreviewNode {
  name: string;
  /** Path relative to Documents/ */
  path: string;
  /** True when backed by a user-created SPFolder; false = created by migration */
  existing: boolean;
  folder: SPFolder | null;
  /** Local folders whose contents land directly in this folder */
  sources: PreviewSource[];
  children: PreviewNode[];
}

export interface SitePreview {
  /** Local folders mapped straight onto Documents/ */
  rootSources: PreviewSource[];
  children: PreviewNode[];
}

function localBasename(localPath: string): string {
  return localPath.split(/[\\/]/).filter(Boolean).pop() ?? localPath;
}

function fromSpFolder(folder: SPFolder, prefix: string): PreviewNode {
  const path = prefix ? `${prefix}/${folder.name}` : folder.name;
  return {
    name: folder.name,
    path,
    existing: true,
    folder,
    sources: [],
    children: folder.children.map((c) => fromSpFolder(c, path)),
  };
}

/** Existing folders keep their order; created folders follow, alphabetically. */
function sortChildren(nodes: PreviewNode[]): void {
  nodes.sort((a, b) => {
    if (a.existing !== b.existing) return a.existing ? -1 : 1;
    return a.existing ? 0 : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  for (const node of nodes) sortChildren(node.children);
}

export function buildSitePreview(
  site: SharePointSite,
  resolved: ResolvedMapping[]
): SitePreview {
  const rootSources: PreviewSource[] = [];
  const children = site.folders.map((f) => fromSpFolder(f, ''));

  for (const m of resolved) {
    if (m.spSiteId !== site.id || m.skipped) continue;
    const source: PreviewSource = {
      localPath: m.localPath,
      localName: localBasename(m.localPath),
      isExplicit: m.isExplicit,
    };
    if (!m.spFolderPath) {
      rootSources.push(source);
      continue;
    }

    // Walk (and create where missing) the destination path. SharePoint folder
    // names are case-insensitive, so merge accordingly.
    let siblings = children;
    let node: PreviewNode | undefined;
    let path = '';
    for (const segment of m.spFolderPath.split('/')) {
      path = path ? `${path}/${segment}` : segment;
      node = siblings.find((n) => n.name.toLowerCase() === segment.toLowerCase());
      if (!node) {
        node = { name: segment, path, existing: false, folder: null, sources: [], children: [] };
        siblings.push(node);
      }
      siblings = node.children;
    }
    node!.sources.push(source);
  }

  sortChildren(children);
  return { rootSources, children };
}
