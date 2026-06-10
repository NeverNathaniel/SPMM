/**
 * Immutable helpers for the SharePoint destination folder trees.
 * Folders are addressed by their path relative to Documents/ ('' = root).
 */

import type { ExplicitMapping, SPFolder } from './types';

export function findSpFolder(folders: SPFolder[], folderPath: string): SPFolder | null {
  if (!folderPath) return null;
  const [head, ...rest] = folderPath.split('/');
  const match = folders.find((f) => f.name === head);
  if (!match) return null;
  return rest.length ? findSpFolder(match.children, rest.join('/')) : match;
}

function mapAtPath(
  folders: SPFolder[],
  parentPath: string,
  fn: (siblings: SPFolder[]) => SPFolder[]
): SPFolder[] {
  if (!parentPath) return fn(folders);
  const [head, ...rest] = parentPath.split('/');
  return folders.map((f) =>
    f.name === head ? { ...f, children: mapAtPath(f.children, rest.join('/'), fn) } : f
  );
}

export function addSpFolder(
  folders: SPFolder[],
  parentPath: string,
  name: string,
  id: string
): { folders: SPFolder[]; error?: string } {
  const siblings = parentPath ? findSpFolder(folders, parentPath)?.children : folders;
  if (parentPath && !siblings) return { folders, error: 'Parent folder not found' };
  if ((siblings ?? folders).some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    return { folders, error: `A folder named "${name}" already exists here` };
  }
  return {
    folders: mapAtPath(folders, parentPath, (sib) => [...sib, { id, name, children: [] }]),
  };
}

export function renameSpFolder(
  folders: SPFolder[],
  folderPath: string,
  newName: string
): { folders: SPFolder[]; newPath: string; error?: string } {
  const segments = folderPath.split('/');
  const parentPath = segments.slice(0, -1).join('/');
  const oldName = segments[segments.length - 1];
  const siblings = parentPath ? findSpFolder(folders, parentPath)?.children ?? [] : folders;
  if (
    siblings.some((f) => f.name !== oldName && f.name.toLowerCase() === newName.toLowerCase())
  ) {
    return { folders, newPath: folderPath, error: `A folder named "${newName}" already exists here` };
  }
  const next = mapAtPath(folders, parentPath, (sib) =>
    sib.map((f) => (f.name === oldName ? { ...f, name: newName } : f))
  );
  const newPath = parentPath ? `${parentPath}/${newName}` : newName;
  return { folders: next, newPath };
}

export function deleteSpFolder(folders: SPFolder[], folderPath: string): SPFolder[] {
  const segments = folderPath.split('/');
  const parentPath = segments.slice(0, -1).join('/');
  const name = segments[segments.length - 1];
  return mapAtPath(folders, parentPath, (sib) => sib.filter((f) => f.name !== name));
}

/** True if any explicit mapping targets this folder or anything beneath it. */
export function spFolderInUse(
  mappings: ExplicitMapping[],
  siteId: string,
  folderPath: string
): boolean {
  return mappings.some(
    (m) =>
      m.spSiteId === siteId &&
      (m.spFolderPath === folderPath || m.spFolderPath.startsWith(`${folderPath}/`))
  );
}

/** Rewrite mapping destinations after an SP folder rename (live recalculation). */
export function remapAfterRename(
  mappings: ExplicitMapping[],
  siteId: string,
  oldPath: string,
  newPath: string
): ExplicitMapping[] {
  return mappings.map((m) => {
    if (m.spSiteId !== siteId) return m;
    if (m.spFolderPath === oldPath) return { ...m, spFolderPath: newPath };
    if (m.spFolderPath.startsWith(`${oldPath}/`)) {
      return { ...m, spFolderPath: newPath + m.spFolderPath.slice(oldPath.length) };
    }
    return m;
  });
}

export interface SpFolderEntry {
  path: string;
  depth: number; // 1-based relative to Documents/
  folder: SPFolder;
}

/** Flatten a site's folder tree into (path, depth) entries, depth-first. */
export function listSpFolders(folders: SPFolder[], prefix = '', depth = 1): SpFolderEntry[] {
  const out: SpFolderEntry[] = [];
  for (const f of folders) {
    const p = prefix ? `${prefix}/${f.name}` : f.name;
    out.push({ path: p, depth, folder: f });
    out.push(...listSpFolders(f.children, p, depth + 1));
  }
  return out;
}
