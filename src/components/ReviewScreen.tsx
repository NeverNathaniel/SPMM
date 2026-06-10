/**
 * Screen 2 — Review & Export.
 *
 * Five sections in order: hard blocks, path length warnings (per-folder ack),
 * ineligible files (per-folder-group ack), depth warnings (informational),
 * unmapped folders (Map Now / Skip). Export unlocks only when no hard blocks
 * remain and every acknowledgment box is checked.
 */

import { useState, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useResolved } from '../store/useResolved';
import { generateSpmtCsv } from '../shared/csv';
import { generateHtmlReport } from '../shared/htmlReport';
import { REASON_LABELS } from '../shared/classify';
import { api } from '../electronApi';
import type { ExportResult, FolderNode } from '../shared/types';

function SectionCard({
  tone,
  title,
  children,
}: {
  tone: 'red' | 'amber' | 'yellow' | 'blue' | 'plain';
  title: string;
  children: ReactNode;
}) {
  const border = {
    red: 'border-l-4 border-l-red-500',
    amber: 'border-l-4 border-l-amber-500',
    yellow: 'border-l-4 border-l-yellow-400',
    blue: 'border-l-4 border-l-blue-400',
    plain: '',
  }[tone];
  return (
    <div className={`card p-4 mb-4 ${border}`}>
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

export default function ReviewScreen() {
  const sites = useAppStore((s) => s.sharePointSites);
  const techConfig = useAppStore((s) => s.techConfig);
  const acknowledged = useAppStore((s) => s.acknowledgedFolders);
  const skipped = useAppStore((s) => s.skippedFolders);
  const toggleAcknowledged = useAppStore((s) => s.toggleAcknowledged);
  const toggleSkip = useAppStore((s) => s.toggleSkip);
  const openPicker = useAppStore((s) => s.openDestinationPicker);
  const setScreen = useAppStore((s) => s.setScreen);
  const toast = useAppStore((s) => s.toast);
  const roots = useAppStore((s) => s.roots);

  const { list, byPath, summary } = useResolved();
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exporting, setExporting] = useState(false);

  const ackedSet = new Set(acknowledged);

  const doExport = async () => {
    setExporting(true);
    try {
      const csv = generateSpmtCsv(list, sites, techConfig.tenantDomain);
      const html = generateHtmlReport({
        roots,
        sites,
        resolved: list,
        config: techConfig,
        exportedAt: new Date(),
      });
      const result = await api().exportFiles({
        csv,
        html,
        exportPathOverride: techConfig.exportPathOverride || undefined,
      });
      setExportResult(result);
      if (result.ok) {
        toast('success', 'Export complete — session retained');
      } else {
        toast('error', `Export failed: ${result.error}`);
      }
    } finally {
      setExporting(false);
    }
  };

  // Folders with ineligible files that will actually migrate (need ack).
  const ineligibleMigrating: FolderNode[] = summary.ineligibleFolders.filter((f) => {
    const m = byPath.get(f.path);
    return m && !m.skipped;
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Review &amp; Export</h2>
        <button className="btn-secondary" onClick={() => setScreen('map')}>← Back to mapping</button>
      </div>

      {/* Progress summary */}
      <div className="card p-4 mb-4">
        <div className="grid grid-cols-5 gap-3 text-center mb-3">
          {[
            [summary.totalFolders, 'Folders scanned'],
            [summary.explicitCount, 'Explicitly mapped'],
            [summary.inheritedCount, 'Inherited'],
            [summary.unmappedFolders.length, 'Unmapped'],
            [summary.skippedCount, 'Skipped'],
          ].map(([v, label]) => (
            <div key={label as string}>
              <div className="text-2xl font-bold">{v}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>
        <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${summary.progressPct}%` }} />
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {summary.progressPct}% of folders have a resolved destination
        </div>
      </div>

      {/* 1 — Hard blocks */}
      {summary.hardBlocks.length > 0 && (
        <SectionCard tone="red" title={`🚫 Hard Blocks (${summary.hardBlocks.length}) — must be restructured before export unlocks`}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-3">Local folder</th>
                <th className="py-1 pr-3">Destination</th>
                <th className="py-1">Problem</th>
              </tr>
            </thead>
            <tbody>
              {summary.hardBlocks.map((m) => (
                <tr key={m.localPath} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 break-all">{m.localPath}</td>
                  <td className="py-1.5 pr-3 break-all">{m.resolvedTargetUrl}</td>
                  <td className="py-1.5 text-red-600">
                    {m.depthStatus === 'block'
                      ? `Destination depth ${m.spDestinationDepth} exceeds the limit`
                      : 'Folder name is invalid in SharePoint — rename it in Explorer'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}

      {/* 2 — Path length */}
      {(summary.pathWarnings.length > 0 || summary.pathBlocks.length > 0) && (
        <SectionCard
          tone="amber"
          title={`⚠ Path Length Warnings (${summary.pathWarnings.length + summary.pathBlocks.length}) — acknowledge each folder to proceed`}
        >
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-2">Ack</th>
                <th className="py-1 pr-3">Local folder</th>
                <th className="py-1 pr-3">Destination path</th>
                <th className="py-1 pr-3">Longest filename</th>
                <th className="py-1 pr-3">Length</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...summary.pathBlocks, ...summary.pathWarnings].map((m) => {
                const node = roots
                  .flatMap((r) => [r.tree, ...flattenForLookup(r.tree)])
                  .find((n) => n.path === m.localPath);
                return (
                  <tr key={m.localPath} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        checked={ackedSet.has(m.localPath)}
                        onChange={() => toggleAcknowledged(m.localPath)}
                      />
                    </td>
                    <td className="py-1.5 pr-3 break-all">{m.localPath}</td>
                    <td className="py-1.5 pr-3 break-all">{m.resolvedTargetUrl}</td>
                    <td className="py-1.5 pr-3 break-all">{node?.longestFilename || '—'}</td>
                    <td className="py-1.5 pr-3">{m.worstCasePathLength}</td>
                    <td className={`py-1.5 font-medium ${m.pathLengthStatus === 'block' ? 'text-red-600' : 'text-amber-600'}`}>
                      {m.pathLengthStatus === 'block' ? `✖ over ${techConfig.pathBlockAt}` : '⚠ warning'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      )}

      {/* 3 — Ineligible files */}
      {ineligibleMigrating.length > 0 && (
        <SectionCard
          tone="amber"
          title={`⚠ Ineligible Files — acknowledge each folder group to proceed`}
        >
          {ineligibleMigrating.map((f) => (
            <div key={f.path} className="border-t border-slate-100 first:border-t-0 py-2">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={ackedSet.has(f.path)}
                  onChange={() => toggleAcknowledged(f.path)}
                />
                <span className="break-all">{f.path}</span>
                <span className="text-slate-400">({f.ineligibleFiles.length} file{f.ineligibleFiles.length > 1 ? 's' : ''})</span>
              </label>
              <table className="w-full text-xs mt-1 ml-6">
                <tbody>
                  {f.ineligibleFiles.map((file) => (
                    <tr key={file.filename}>
                      <td className="py-0.5 pr-3 break-all">{file.filename}</td>
                      <td className="py-0.5 text-slate-500">{REASON_LABELS[file.reason]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </SectionCard>
      )}

      {/* 4 — Depth warnings (informational) */}
      {summary.depthWarnings.length > 0 && (
        <SectionCard tone="yellow" title={`⚠ Depth Warnings (${summary.depthWarnings.length}) — informational only`}>
          <ul className="text-xs space-y-1">
            {summary.depthWarnings.map((m) => (
              <li key={m.localPath} className="break-all">
                {m.localPath} → {m.resolvedTargetUrl}{' '}
                <span className="text-amber-600">(depth {m.spDestinationDepth} — consider flattening)</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* 5 — Unmapped folders */}
      {summary.unmappedFolders.length > 0 && (
        <SectionCard tone="blue" title={`📋 Unmapped Folders (${summary.unmappedFolders.length})`}>
          <ul className="text-xs space-y-1 max-h-64 overflow-y-auto">
            {summary.unmappedFolders.map((f) => (
              <li key={f.path} className="flex items-center gap-2">
                <span className="break-all flex-1">{f.path}</span>
                <button
                  className="text-blue-600 hover:underline whitespace-nowrap"
                  onClick={() => openPicker(f.path, f.id)}
                >
                  Map Now
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-400 mt-2">
            Unmapped folders are simply omitted from the CSV — no acknowledgment needed.
          </p>
        </SectionCard>
      )}

      {/* Mapping preview */}
      <SectionCard tone="plain" title="Full Mapping Preview">
        {sites.map((site) => {
          const rows = list.filter((m) => m.spSiteId === site.id && !m.skipped);
          if (!rows.length) return null;
          return (
            <div key={site.id} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 text-xs font-semibold mb-1">
                <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: site.color }} />
                {site.name} ({rows.length})
              </div>
              <div className="max-h-56 overflow-y-auto border border-slate-100 rounded">
                <table className="w-full text-xs">
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.localPath} className="border-t border-slate-50 first:border-t-0">
                        <td className="py-1 px-2 break-all w-[45%]">{m.resolvedSourcePath}</td>
                        <td className="py-1 px-1 text-slate-300">→</td>
                        <td className="py-1 px-2 break-all">{m.resolvedTargetUrl}</td>
                        <td className="py-1 px-2 whitespace-nowrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${m.isExplicit ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}`}>
                            {m.isExplicit ? 'explicit' : 'inherited'}
                          </span>
                        </td>
                        <td className="py-1 px-2">
                          <button
                            className="text-[11px] text-slate-400 hover:text-slate-600 hover:underline"
                            onClick={() => toggleSkip(m.localPath)}
                          >
                            {skipped.includes(m.localPath) ? 'Unskip' : 'Skip'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {list.filter((m) => !m.skipped).length === 0 && (
          <p className="text-sm text-slate-400">Nothing mapped yet.</p>
        )}
      </SectionCard>

      {/* Export */}
      <div className="card p-4 mb-8 flex items-center gap-3">
        <button
          className="btn-primary"
          disabled={!summary.exportReady || exporting}
          onClick={() => void doExport()}
          title={
            summary.exportReady
              ? 'Write migration-mapping.csv and migration-summary.html'
              : summary.hardBlocks.length
              ? 'Resolve hard blocks first'
              : summary.unacknowledgedPaths.length
              ? `${summary.unacknowledgedPaths.length} acknowledgment(s) outstanding`
              : 'Map at least one folder first'
          }
        >
          {exporting ? 'Exporting…' : '⬇ Export Migration Files'}
        </button>
        {!summary.exportReady && (
          <span className="text-xs text-slate-500">
            {summary.hardBlocks.length > 0 && `${summary.hardBlocks.length} hard block(s). `}
            {summary.unacknowledgedPaths.length > 0 && `${summary.unacknowledgedPaths.length} unacknowledged warning(s). `}
            {summary.hardBlocks.length === 0 && summary.unacknowledgedPaths.length === 0 && 'Map at least one folder.'}
          </span>
        )}
        {exportResult?.ok && (
          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            <span className="break-all">Exported to {exportResult.exportDir}</span>
            <button
              className="btn-secondary !py-0.5 !px-2 text-xs whitespace-nowrap"
              onClick={() => void api().copyToClipboard(exportResult.exportDir!)}
            >
              Copy Path
            </button>
            <button
              className="btn-secondary !py-0.5 !px-2 text-xs whitespace-nowrap"
              onClick={() => void api().showInFolder(exportResult.csvPath!)}
            >
              Show in Folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function flattenForLookup(node: FolderNode): FolderNode[] {
  const out: FolderNode[] = [];
  for (const c of node.children) {
    out.push(c, ...flattenForLookup(c));
  }
  return out;
}
