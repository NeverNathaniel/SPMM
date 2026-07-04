/**
 * Human-readable HTML migration summary.
 *
 * Self-contained (inline CSS), renders cleanly in any browser, printable.
 * Styling is carried over from the proven SPMM web-app report with sections
 * reorganised per the desktop plan: header, stats, per-site mapping tables,
 * path-length warnings, ineligible files, unmapped and skipped folders.
 */

import type {
  DirectoryRoot,
  FolderNode,
  ResolvedMapping,
  SharePointSite,
  TechConfig,
} from './types';
import { flattenTree } from './mappingEngine';
import { REASON_LABELS, reasonDetail } from './classify';
import { siteUrl } from './slug';
import type { ReviewSummary } from './review';
import type { SpmtPlan } from './spmtPlan';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface ReportInput {
  roots: DirectoryRoot[];
  sites: SharePointSite[];
  resolved: ResolvedMapping[];
  config: TechConfig;
  /** The same summary the Review screen shows — keeps the numbers identical */
  summary: ReviewSummary;
  /** The planned SPMT tasks the CSV contains */
  plan: SpmtPlan;
  exportedAt: Date;
}

export function generateHtmlReport(input: ReportInput): string {
  const { roots, sites, resolved, config, summary, plan, exportedAt } = input;

  const allFolders: FolderNode[] = roots.flatMap((r) => flattenTree(r.tree));
  const resolvedByPath = new Map(resolved.map((m) => [m.localPath, m]));
  const active = resolved.filter((m) => !m.skipped);
  const unmapped = summary.unmappedFolders;
  const skipped = resolved.filter((m) => m.skipped);
  const pathWarnings = active.filter((m) => m.pathLengthStatus !== 'ok');
  const ineligible = allFolders.filter((f) => f.ineligibleFiles.length > 0 || f.hasIneligibleFolderName);
  const ineligibleFileTotal = allFolders.reduce((n, f) => n + f.ineligibleFiles.length, 0);
  const flaggedFolderNameTotal = ineligible.filter((f) => f.hasIneligibleFolderName).length;
  const pct = summary.progressPct;

  const statBox = (value: string | number, label: string, cls = '') =>
    `<div class="stat-box ${cls}"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;

  // Mapping tables grouped by site
  const siteSections = sites
    .map((site) => {
      const rows = active
        .filter((m) => m.spSiteId === site.id)
        .sort((a, b) => a.resolvedSourcePath.localeCompare(b.resolvedSourcePath));
      if (rows.length === 0) return '';
      const body = rows
        .map(
          (m) => `<tr>
            <td>${esc(m.resolvedSourcePath)}</td>
            <td>${esc(m.resolvedTargetUrl)}</td>
            <td><span class="badge ${m.isExplicit ? 'badge-explicit' : 'badge-inherited'}">${m.isExplicit ? 'Explicit' : 'Inherited'}</span></td>
          </tr>`
        )
        .join('\n');
      return `<div class="card">
        <h2><span class="swatch" style="background:${esc(site.color)}"></span> ${esc(site.name)} <span class="muted">— ${esc(siteUrl(config.tenantDomain, site.slug))}</span></h2>
        <div class="table-container"><table>
          <thead><tr><th>Source Folder</th><th>Destination</th><th>Mapping</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
      </div>`;
    })
    .join('\n');

  const pathWarningSection = pathWarnings.length
    ? `<div class="card callout callout-amber">
        <h2>⚠ Path Length Warnings</h2>
        <p>${pathWarnings.length} destination path(s) approach or exceed SharePoint's ${config.pathBlockAt}-character URL limit (worst case uses the longest filename found in each folder).</p>
        <div class="table-container"><table>
          <thead><tr><th>Local Folder</th><th>Destination Path</th><th>Calculated Length</th><th>Status</th></tr></thead>
          <tbody>${pathWarnings
            .map(
              (m) => `<tr>
                <td>${esc(m.localPath)}</td>
                <td>${esc(m.resolvedTargetUrl)}</td>
                <td>${m.worstCasePathLength}</td>
                <td>${m.pathLengthStatus === 'block' ? '🚫 Over limit' : '⚠ Warning'}</td>
              </tr>`
            )
            .join('\n')}</tbody>
        </table></div>
      </div>`
    : '';

  const ineligibleRows = ineligible
    .flatMap((f) => {
      const rows: string[] = [];
      const dest = resolvedByPath.get(f.path);
      const destCell = dest ? esc(dest.resolvedTargetUrl) : '—';
      if (f.hasIneligibleFolderName) {
        rows.push(
          `<tr><td>${esc(f.path)}</td><td><em>(folder name)</em></td><td>Invalid folder name</td><td>${destCell}</td></tr>`
        );
      }
      for (const file of f.ineligibleFiles) {
        rows.push(
          `<tr><td>${esc(f.path)}</td><td>${esc(file.filename)}</td><td>${esc(
            `${REASON_LABELS[file.reason]} (${reasonDetail(file.filename, file.reason)})`
          )}</td><td>${destCell}</td></tr>`
        );
      }
      return rows;
    })
    .join('\n');

  const ineligibleSection = ineligible.length
    ? `<div class="card callout callout-amber">
        <h2>⚠ Ineligible Names</h2>
        <p>${ineligibleFileTotal} file(s) and ${flaggedFolderNameTotal} folder name(s) flagged as potentially ineligible. Review and fix these in Explorer before running SPMT.</p>
        <div class="table-container"><table>
          <thead><tr><th>Folder</th><th>File</th><th>Issue</th><th>Destination Path</th></tr></thead>
          <tbody>${ineligibleRows}</tbody>
        </table></div>
      </div>`
    : '';

  const unmappedSection = unmapped.length
    ? `<div class="card callout callout-yellow">
        <h2>📋 Unmapped Folders (${unmapped.length})</h2>
        <ul>${unmapped.map((f) => `<li>${esc(f.path)}</li>`).join('')}</ul>
      </div>`
    : '';

  const skippedSection = skipped.length
    ? `<div class="card callout callout-grey">
        <h2>Skipped Folders (${skipped.length})</h2>
        <p>These folders (and everything beneath them, unless a branch was explicitly re-mapped) are intentionally excluded from the migration — no SPMT task covers them.${
          summary.excludedBySkip.length
            ? ` ${summary.excludedBySkip.length} descendant folder(s) are excluded with them.`
            : ''
        }</p>
        <ul>${skipped.map((m) => `<li>${esc(m.localPath)}</li>`).join('')}</ul>
      </div>`
    : '';

  const splitFileSection = plan.splitFileWarnings.length
    ? `<div class="card callout callout-amber">
        <h2>⚠ Files Not Covered by Any Task</h2>
        <p>These folders were split into per-subfolder migration tasks (because a child is skipped or re-mapped elsewhere), and SPMT tasks cannot copy a folder's direct files without recursing. The files listed below must be moved manually or the mapping restructured.</p>
        <div class="table-container"><table>
          <thead><tr><th>Folder</th><th>Planned Destination</th><th>Direct Files Affected</th></tr></thead>
          <tbody>${plan.splitFileWarnings
            .map((w) => {
              const dest = resolvedByPath.get(w.localPath);
              return `<tr><td>${esc(w.localPath)}</td><td>${dest ? esc(dest.resolvedTargetUrl) : '—'}</td><td>${w.fileCount}</td></tr>`;
            })
            .join('\n')}</tbody>
        </table></div>
      </div>`
    : '';

  const hiddenNote = summary.hiddenItemsSkipped
    ? `<div class="card callout callout-grey">
        <h2>Hidden / System Items</h2>
        <p>${summary.hiddenItemsSkipped} hidden or system item(s) were filtered out at scan time and are not part of this plan. SPMT's recursive tasks may still migrate them unless they carry the hidden attribute on disk — spot-check for names like <code>.git</code> or <code>$RECYCLE.BIN</code> inside mapped folders before running SPMT.</p>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Migration Summary — ${esc(config.tenantDomain)}</title>
<style>
  :root { --primary:#0078d4; --secondary:#106ebe; --success:#107c10; --warning:#ff8c00; --error:#d13438; --bg:#f5f5f5; --card:#fff; --text:#323130; --border:#e1e1e1; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif; background:var(--bg); color:var(--text); line-height:1.6; padding:20px; }
  .container { max-width:1400px; margin:0 auto; }
  header { background:linear-gradient(135deg,var(--primary),var(--secondary)); color:#fff; padding:30px; border-radius:8px; margin-bottom:24px; }
  header h1 { font-size:26px; font-weight:600; margin-bottom:8px; }
  header .subtitle { opacity:.9; font-size:14px; }
  .card { background:var(--card); border-radius:8px; padding:24px; margin-bottom:24px; border:1px solid var(--border); box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .card h2 { font-size:18px; font-weight:600; color:var(--primary); margin-bottom:16px; padding-bottom:10px; border-bottom:2px solid var(--border); display:flex; align-items:center; gap:8px; }
  .muted { color:#888; font-weight:400; font-size:13px; }
  .swatch { display:inline-block; width:14px; height:14px; border-radius:4px; }
  .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:14px; }
  .stat-box { background:var(--bg); padding:18px; border-radius:8px; text-align:center; border-left:4px solid var(--primary); }
  .stat-box.success { border-left-color:var(--success); }
  .stat-box.warning { border-left-color:var(--warning); }
  .stat-value { font-size:30px; font-weight:700; }
  .stat-label { font-size:13px; color:#666; margin-top:4px; }
  .progress { background:#e6e6e6; border-radius:8px; height:14px; margin-top:16px; overflow:hidden; }
  .progress > div { background:var(--success); height:100%; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { background:var(--primary); color:#fff; padding:10px 14px; text-align:left; font-weight:600; position:sticky; top:0; }
  td { padding:9px 14px; border-bottom:1px solid var(--border); word-break:break-all; }
  tr:hover { background:#f8f8f8; }
  .table-container { max-height:520px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; }
  .badge { display:inline-block; padding:2px 10px; border-radius:12px; font-size:11px; font-weight:600; white-space:nowrap; }
  .badge-explicit { background:#dff6dd; color:var(--success); }
  .badge-inherited { background:#e8f1fb; color:var(--secondary); }
  .callout-amber { border-left:5px solid var(--warning); }
  .callout-yellow { border-left:5px solid #eab308; }
  .callout-grey { border-left:5px solid #9ca3af; }
  ul { padding-left:22px; font-size:13px; }
  footer { text-align:center; padding:18px; color:#666; font-size:12px; }
  @media print { body { background:#fff; padding:0; } .card { box-shadow:none; page-break-inside:avoid; } .table-container { max-height:none; } }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>SharePoint Migration Summary</h1>
    <div class="subtitle">Tenant: ${esc(config.tenantDomain)}</div>
    <div class="subtitle">Exported: ${esc(exportedAt.toLocaleString())}</div>
    ${config.operatorNote ? `<div class="subtitle">Note: ${esc(config.operatorNote)}</div>` : ''}
  </header>

  <div class="card">
    <h2>Overview</h2>
    <div class="stats-grid">
      ${statBox(roots.length, 'Directory Roots')}
      ${statBox(allFolders.length, 'Folders Scanned')}
      ${statBox(summary.explicitCount, 'Explicitly Mapped', 'success')}
      ${statBox(summary.inheritedCount, 'Inherited', 'success')}
      ${statBox(plan.tasks.length, 'SPMT Tasks', 'success')}
      ${statBox(unmapped.length, 'Unmapped', unmapped.length ? 'warning' : 'success')}
      ${statBox(skipped.length, 'Skipped')}
    </div>
    <div class="progress" title="${pct}% of folders have a resolved destination"><div style="width:${pct}%"></div></div>
    <p class="muted" style="margin-top:6px">${pct}% of folders have a resolved destination</p>
  </div>

  ${siteSections}
  ${pathWarningSection}
  ${splitFileSection}
  ${ineligibleSection}
  ${unmappedSection}
  ${skippedSection}
  ${hiddenNote}

  <footer>Generated by Migration Mapper — run the accompanying migration-mapping.csv through SPMT.</footer>
</div>
</body>
</html>`;
}
