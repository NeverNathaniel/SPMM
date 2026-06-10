/**
 * SPMT-compatible CSV generation.
 *
 * Format (one row per resolved mapping, explicit + inherited — SPMT needs
 * every path spelled out):
 *
 *   Source,SourceDocLib,SourceSubFolder,TargetWeb,TargetDocLib,TargetSubFolder
 *   \\SERVER\Accounting\AR,,,https://contoso.sharepoint.com/sites/Accounting,Documents,AR
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

export const SPMT_HEADERS = [
  'Source',
  'SourceDocLib',
  'SourceSubFolder',
  'TargetWeb',
  'TargetDocLib',
  'TargetSubFolder',
] as const;

export function generateSpmtCsv(
  mappings: ResolvedMapping[],
  sites: SharePointSite[],
  tenantDomain: string
): string {
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const lines: string[] = [SPMT_HEADERS.join(',')];

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

  return lines.join('\r\n') + '\r\n';
}
