/**
 * Shared data model for Migration Mapper.
 *
 * These types are used by the Electron main process (scanner, persistence,
 * export) and the renderer (UI, mapping engine). Keep this module free of
 * Node and DOM imports so it can be consumed everywhere.
 */

export type PathType = 'local' | 'unc';

export type IneligibleReason =
  | 'invalid-chars'
  | 'reserved-name'
  | 'leading-trailing'
  | 'temp-lock-file';

export interface IneligibleFile {
  filename: string;
  reason: IneligibleReason;
}

export interface FolderNode {
  id: string;
  /** Full absolute path, e.g. C:\Accounting\AR or \\SERVER\Share\AR */
  path: string;
  name: string;
  /** Direct children only */
  fileCount: number;
  /** Longest filename found directly in this folder, captured at scan time */
  longestFilename: string;
  longestFilenameLength: number;
  ineligibleFiles: IneligibleFile[];
  hasIneligibleFolderName: boolean;
  /** Direct file names for the read-only disclosure list (capped at scan time) */
  files: string[];
  /** True when `files` was truncated against fileCount */
  filesTruncated: boolean;
  children: FolderNode[];
}

export interface DirectoryRoot {
  id: string;
  /** C:\Accounting or \\SERVER\Share */
  path: string;
  pathType: PathType;
  tree: FolderNode;
  scannedAt: string; // ISO timestamp
}

export interface SPFolder {
  id: string;
  name: string;
  children: SPFolder[];
}

export interface SharePointSite {
  id: string;
  name: string;
  /** URL slug under /sites/, e.g. "ContosoHR" */
  slug: string;
  /** Hex color auto-assigned from the accessible palette */
  color: string;
  /** Children of the implicit Documents/ root */
  folders: SPFolder[];
}

export interface ExplicitMapping {
  localFolderId: string;
  localPath: string;
  spSiteId: string;
  /** Relative to Documents/, '' = Documents root, e.g. "Payroll/2024" */
  spFolderPath: string;
}

export type ValidationStatus = 'ok' | 'warn' | 'block';

/** Derived at runtime by the mapping engine; never persisted. */
export interface ResolvedMapping extends ExplicitMapping {
  isExplicit: boolean;
  /** Source path formatted for the SPMT CSV (UNC and local preserved as-is) */
  resolvedSourcePath: string;
  /** Full https URL of the destination folder */
  resolvedTargetUrl: string;
  worstCasePathLength: number;
  pathLengthStatus: ValidationStatus;
  /** Depth of the destination folder relative to Documents/ (0 = Documents) */
  spDestinationDepth: number;
  depthStatus: ValidationStatus;
  ineligibleFileCount: number;
  hasIneligibleFolderName: boolean;
  acknowledged: boolean;
  skipped: boolean;
}

export interface TechConfig {
  tenantDomain: string;
  tenantLocked: boolean;
  supportEmail: string;
  /** Sites created on first launch */
  preSeededSites: { name: string; slug?: string }[];
  quickAddPresets: string[];
  allowUserAddSites: boolean;
  /** Optional override for the export directory */
  exportPathOverride: string;
  /** 'accumulate' keeps prior roots when adding new ones */
  sessionBehavior: 'accumulate' | 'clear-on-load';
  depthWarnAt: number; // default 2
  depthBlockAt: number; // default 3
  pathWarnAt: number; // default 256
  pathBlockAt: number; // default 400
  /** Optional local PIN protecting the technician settings screen */
  settingsPin: string;
  /** Free-text operator note included in the HTML summary header */
  operatorNote: string;
}

export const DEFAULT_TECH_CONFIG: TechConfig = {
  tenantDomain: 'contoso.sharepoint.com',
  tenantLocked: false,
  supportEmail: '',
  preSeededSites: [],
  quickAddPresets: ['HR', 'Accounting', 'Operations', 'IT', 'Legal', 'Finance'],
  allowUserAddSites: true,
  exportPathOverride: '',
  sessionBehavior: 'accumulate',
  depthWarnAt: 2,
  depthBlockAt: 3,
  pathWarnAt: 256,
  pathBlockAt: 400,
  settingsPin: '',
  operatorNote: '',
};

/** Everything persisted to session.json. */
export interface SessionState {
  roots: DirectoryRoot[];
  sharePointSites: SharePointSite[];
  explicitMappings: ExplicitMapping[];
  /** Local paths the user marked Skip on the review screen */
  skippedFolders: string[];
  /** Local paths whose warnings the user has acknowledged */
  acknowledgedFolders: string[];
  savedAt: string; // ISO timestamp
}

export interface ScanProgress {
  rootPath: string;
  folderCount: number;
  currentPath: string;
}

export interface ScanResult {
  ok: boolean;
  root?: DirectoryRoot;
  error?: string;
  /** True when the scan was cancelled (or superseded) rather than failing */
  cancelled?: boolean;
}

export interface ExportResult {
  ok: boolean;
  exportDir?: string;
  csvPath?: string;
  htmlPath?: string;
  error?: string;
}
