/**
 * Ineligible file / folder name detection for SharePoint migration.
 *
 * Rules follow the SPMT guidance for SharePoint Online: invalid characters,
 * reserved device names, leading/trailing whitespace or periods, and
 * temp/lock files that should never be migrated.
 */

import type { IneligibleFile, IneligibleReason } from './types';

// '/' and '\' can't occur in a single path segment on Windows but are kept so
// the rule also catches names arriving from session files or manual input.
export const INVALID_CHARS = /[#%&*:<>?/\\{|}~"]/;
export const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
export const LEADING_TRAILING = /^[ .]|[ .]$/; // starts/ends with space or period
export const TEMP_FILES = /^~\$|\.tmp$|^\.DS_Store$|^thumbs\.db$|^desktop\.ini$/i;

export function classifyFile(filename: string): IneligibleReason | null {
  // Temp/lock detection first: "~$Report.docx" would otherwise never reach
  // the temp rule, and the actionable advice for the user differs (delete vs rename).
  if (TEMP_FILES.test(filename)) return 'temp-lock-file';
  if (INVALID_CHARS.test(filename)) return 'invalid-chars';
  if (RESERVED_NAMES.test(filename)) return 'reserved-name';
  if (LEADING_TRAILING.test(filename)) return 'leading-trailing';
  return null;
}

/** Folder names follow the same character rules but the temp rule doesn't apply. */
export function classifyFolderName(name: string): IneligibleReason | null {
  if (INVALID_CHARS.test(name)) return 'invalid-chars';
  if (RESERVED_NAMES.test(name)) return 'reserved-name';
  if (LEADING_TRAILING.test(name)) return 'leading-trailing';
  return null;
}

export function classifyFiles(filenames: string[]): IneligibleFile[] {
  const out: IneligibleFile[] = [];
  for (const filename of filenames) {
    const reason = classifyFile(filename);
    if (reason) out.push({ filename, reason });
  }
  return out;
}

export const REASON_LABELS: Record<IneligibleReason, string> = {
  'invalid-chars': 'Invalid characters',
  'reserved-name': 'Reserved name',
  'leading-trailing': 'Leading/trailing space or period',
  'temp-lock-file': 'Temp / lock file',
};

/** Human-readable detail, e.g. `contains #` for invalid characters. */
export function reasonDetail(filename: string, reason: IneligibleReason): string {
  if (reason === 'invalid-chars') {
    const m = filename.match(new RegExp(INVALID_CHARS.source, 'g'));
    if (m) return `contains ${[...new Set(m)].join(' ')}`;
  }
  if (reason === 'leading-trailing') return 'starts or ends with a space/period';
  if (reason === 'reserved-name') return 'reserved Windows device name';
  if (reason === 'temp-lock-file') return 'temporary or lock file';
  return '';
}

/**
 * Names that are filtered out entirely at scan time — hidden/system folders
 * never appear in the tree. (Windows hidden *attributes* are not readable via
 * Node's fs API, so detection is name-based.)
 */
const HIDDEN_SYSTEM_DIRS = new Set(
  [
    '$recycle.bin',
    'system volume information',
    'recovery',
    '$windows.~bt',
    '$windows.~ws',
    'config.msi',
    'msocache',
  ].map((s) => s.toLowerCase())
);

export function isHiddenOrSystemDir(name: string): boolean {
  if (name.startsWith('.')) return true;
  if (name.startsWith('$')) return true;
  return HIDDEN_SYSTEM_DIRS.has(name.toLowerCase());
}

export function isHiddenFile(name: string): boolean {
  return name.startsWith('.') && !TEMP_FILES.test(name);
}
