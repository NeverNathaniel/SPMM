/**
 * SPMT-compatible CSV generation.
 *
 * Format (one row per resolved mapping, explicit + inherited — SPMT needs
 * every path spelled out). Columns, in order:
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
 * Skipped folders are omitted entirely. Source paths are written exactly as
 * scanned (Rule 7) — no formula-prefix neutralisation is applied because this
 * file is consumed by SPMT, where an injected apostrophe would corrupt the
 * path. Open the HTML summary, not this CSV, in spreadsheet software.
 */

import type { ResolvedMapping, SharePointSite } from './types';
import { siteUrl } from './slug';

export function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function generateSpmtCsv(
  mappings: ResolvedMapping[],
  sites: SharePointSite[],
  tenantDomain: string
): string {
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const lines: string[] = [];

  for (const m of mappings) {
    if (m.skipped) continue;
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
