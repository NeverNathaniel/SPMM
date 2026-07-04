import type {
  DirectoryRoot,
  FolderNode,
  SharePointSite,
  SPFolder,
  TechConfig,
} from '../src/shared/types';
import { DEFAULT_TECH_CONFIG } from '../src/shared/types';
import { detectPathType } from '../src/shared/mappingEngine';

let idCounter = 0;
const nextId = () => `id-${++idCounter}`;

export function folder(
  path: string,
  children: FolderNode[] = [],
  overrides: Partial<FolderNode> = {}
): FolderNode {
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  return {
    id: nextId(),
    path,
    name,
    fileCount: 0,
    longestFilename: '',
    longestFilenameLength: 0,
    ineligibleFiles: [],
    hasIneligibleFolderName: false,
    files: [],
    filesTruncated: false,
    children,
    ...overrides,
  };
}

export function root(path: string, tree: FolderNode): DirectoryRoot {
  return {
    id: nextId(),
    path,
    pathType: detectPathType(path),
    tree,
    scannedAt: new Date().toISOString(),
  };
}

export function spFolder(name: string, children: SPFolder[] = []): SPFolder {
  return { id: nextId(), name, children };
}

export function site(name: string, slug: string, folders: SPFolder[] = []): SharePointSite {
  return { id: nextId(), name, slug, color: '#2563eb', folders };
}

// A non-placeholder tenant — the contoso.sharepoint.com default hard-blocks export.
export const CONFIG: TechConfig = { ...DEFAULT_TECH_CONFIG, tenantDomain: 'fabrikam.sharepoint.com' };
