/**
 * SPMT-compatible CSV generation.
 *
 * One row per planned migration task (see spmtPlan.ts — each row is an
 * independent, fully recursive SPMT task):
 *
 *   \\SERVER\Accounting\AR,,,https://contoso.sharepoint.com/sites/Accounting,Documents,AR
 *
 * The SPMT bulk format has NO header row — SPMT treats every line as a task,
 * so a header line would be read as a migration of a folder named "Source".
 * TargetDocLib is the library's display name ("Documents"), matching
 * Microsoft's own samples.
 *
 * Source paths are written exactly as scanned (Rule 7) — no formula-prefix
 * neutralisation is applied because this file is consumed by SPMT, where an
 * injected apostrophe would corrupt the path. It is also written without a
 * UTF-8 BOM for the same reason: SPMT is the consumer, not Excel. Open the
 * HTML summary, not this CSV, in spreadsheet software.
 */

import type { SharePointSite } from './types';
import type { SpmtTask } from './spmtPlan';
import { siteUrl } from './slug';

export function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function generateSpmtCsv(
  tasks: SpmtTask[],
  sites: SharePointSite[],
  tenantDomain: string
): string {
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const lines: string[] = [];

  for (const t of tasks) {
    const site = sitesById.get(t.spSiteId);
    if (!site) continue;
    lines.push(
      [
        csvField(t.sourcePath),
        '', // SourceDocLib — file shares have no source library
        '', // SourceSubFolder
        csvField(siteUrl(tenantDomain, site.slug)),
        'Documents',
        csvField(t.spFolderPath),
      ].join(',')
    );
  }

  return lines.join('\r\n') + '\r\n';
}
