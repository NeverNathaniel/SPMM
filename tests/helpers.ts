import type {
  DirectoryRoot,
  FolderNode,
  SharePointSite,
  SPFolder,
  TechConfig,
} from '../src/shared/types';
import { DEFAULT_TECH_CONFIG } from '../src/shared/types';

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
    pathType: path.startsWith('\\\\') ? 'unc' : 'local',
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

export const CONFIG: TechConfig = { ...DEFAULT_TECH_CONFIG, tenantDomain: 'contoso.sharepoint.com' };
