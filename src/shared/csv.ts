/**
 * SPMT-compatible CSV generation.
 *
 * One row per folder chosen by the migration plan (src/shared/migrationPlan.ts):
 * SPMT copies each source folder recursively, so a row is written for the
 * highest folder whose whole subtree lands in one place, not for every
 * resolved folder. Columns, in order:
 *
 *   Source, SourceDocLib, SourceSubFolder, TargetWeb, TargetDocLib, TargetSubFolder
 *
 * e.g.
 *
 *   \\SERVER\Accounting\AR,,,https://contoso.sharepoint.com/sites/Accounting,Documents,AR
 *
 * No header row is written: SPMT's documented bulk-upload format has none and
 * it validates every line as a migration task, so a header line would be
 * read as a task whose TargetWeb ("TargetWeb") is not a URL, blocking the
 * import. (Migration Manager documents headers as optional; SPMT does not.)
 *
 * Skipped folders' own files are omitted. Source paths are written exactly as
 * scanned (Rule 7) — no formula-prefix neutralisation is applied because this
 * file is consumed by SPMT, where an injected apostrophe would corrupt the
 * path. Open the HTML summary, not this CSV, in spreadsheet software.
 */

import type { DirectoryRoot, ResolvedMapping, SharePointSite } from './types';
import { siteUrl } from './slug';
import { planMigration } from './migrationPlan';

export function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function generateSpmtCsv(
  roots: DirectoryRoot[],
  resolved: ResolvedMapping[],
  sites: SharePointSite[],
  tenantDomain: string
): string {
  const { rows } = planMigration(roots, new Map(resolved.map((m) => [m.localPath, m])));
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const lines: string[] = [];

  for (const m of rows) {
    const site = sitesById.get(m.spSiteId);
    if (!site) continue;
    lines.push(
      [
        csvField(m.resolvedSourcePath),
        '', // SourceDocLib — file shares have no source library
        '', // SourceSubFolder
        csvField(siteUrl(tenantDomain, site.slug)),
        'Documents',
        csvField(m.spFolderPath),
      ].join(',')
    );
  }

  return lines.map((l) => `${l}\r\n`).join('');
}
