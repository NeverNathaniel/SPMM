/**
 * Left panel: local directory trees.
 *
 * Each folder row shows expand chevron, name, file count, ineligible-file
 * badge (expands inline detail), the destination color dot (split indicator
 * when descendants diverge), an inline destination label, a path-length badge
 * near limits, and a read-only file list disclosure. Rows are dnd-kit
 * draggables; right-click (or clicking the dot) opens Unmap / Remap.
 */

import { useState, type CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { DirectoryRoot, FolderNode, SharePointSite } from '../shared/types';
import { useAppStore } from '../store/useAppStore';
import { useResolved } from '../store/useResolved';
import { REASON_LABELS, reasonDetail } from '../shared/classify';
import type { ResolvedMapping } from '../shared/types';
import ContextMenu, { type MenuItem } from './ContextMenu';

const UNMAPPED_COLOR = '#94a3b8';

function destLabel(sites: SharePointSite[], siteId: string | null, spFolderPath: string | null): string {
  if (!siteId) return '';
  const site = sites.find((s) => s.id === siteId);
  if (!site) return '';
  const parts = spFolderPath ? spFolderPath.split('/') : [];
  return [site.name, ...parts].join(' › ');
}

interface RowProps {
  node: FolderNode;
  depth: number;
}

function FolderRow({ node, depth }: RowProps) {
  const sites = useAppStore((s) => s.sharePointSites);
  const expanded = useAppStore((s) => !!s.expanded[node.path]);
  const toggleExpanded = useAppStore((s) => s.toggleExpanded);
  const unmap = useAppStore((s) => s.unmap);
  const openPicker = useAppStore((s) => s.openDestinationPicker);
  const { byPath, mapStates } = useResolved();

  const [issuesOpen, setIssuesOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const mapState = mapStates.get(node.path) ?? {
    status: 'unmapped' as const,
    siteId: null,
    spFolderPath: null,
    split: false,
  };
  const resolved: ResolvedMapping | undefined = byPath.get(node.path);
  const site = mapState.siteId ? sites.find((s) => s.id === mapState.siteId) : null;
  const color = site?.color ?? UNMAPPED_COLOR;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag:${node.path}`,
    data: { localPath: node.path, localFolderId: node.id, name: node.name },
  });

  const issueCount = node.ineligibleFiles.length;
  const pathBadge =
    resolved && resolved.pathLengthStatus !== 'ok' ? (
      <span
        className={`text-[11px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
          resolved.pathLengthStatus === 'block'
            ? 'bg-red-100 text-red-700'
            : 'bg-amber-100 text-amber-700'
        }`}
        title="Worst-case SharePoint URL length using the longest filename in this folder"
      >
        {resolved.pathLengthStatus === 'block' ? '✖' : '⚠'} {resolved.worstCasePathLength} chars
      </span>
    ) : null;

  const menuItems: MenuItem[] = [
    {
      label: 'Remap to…',
      onClick: () => openPicker(node.path, node.id),
    },
    {
      label: 'Unmap',
      disabled: mapState.status !== 'explicit',
      onClick: () => unmap(node.path),
    },
    {
      label: filesOpen ? 'Hide files' : 'Show files',
      disabled: node.fileCount === 0,
      onClick: () => setFilesOpen((v) => !v),
    },
  ];

  // Group ineligible files by reason for the inline detail panel.
  const grouped = node.ineligibleFiles.reduce<Record<string, typeof node.ineligibleFiles>>(
    (acc, f) => {
      (acc[f.reason] ??= []).push(f);
      return acc;
    },
    {}
  );

  return (
    <div>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={`group flex items-center gap-1.5 py-1 pr-2 rounded hover:bg-slate-100 cursor-grab ${
          isDragging ? 'opacity-40' : ''
        }`}
        style={{ paddingLeft: depth * 18 + 6 }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(node.path);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`w-4 text-xs text-slate-400 ${node.children.length ? '' : 'invisible'}`}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
          aria-expanded={expanded}
        >
          {expanded ? '▼' : '▶'}
        </button>

        {node.hasIneligibleFolderName ? (
          <span title="Folder name is not valid in SharePoint — rename before migrating" className="text-red-600">
            ✖
          </span>
        ) : (
          <span>📁</span>
        )}

        <button
          className="text-sm truncate font-medium text-left"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(node.path);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={node.path}
        >
          {node.name}
        </button>

        <span className="text-xs text-slate-400 whitespace-nowrap">({node.fileCount})</span>

        {issueCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIssuesOpen((v) => !v);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium whitespace-nowrap hover:bg-amber-200"
          >
            ⚠ {issueCount} issue{issueCount > 1 ? 's' : ''}
          </button>
        )}

        {pathBadge}

        <span className="flex-1" />

        <span
          className="text-[11px] text-slate-500 truncate max-w-[14rem]"
          title={destLabel(sites, mapState.siteId, mapState.spFolderPath)}
        >
          {mapState.status === 'inherited' && resolved
            ? destLabel(sites, resolved.spSiteId, resolved.spFolderPath)
            : destLabel(sites, mapState.siteId, mapState.spFolderPath)}
          {mapState.status === 'inherited' && <span className="italic text-slate-400"> (inherited)</span>}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={mapState.status === 'unmapped' ? 'Unmapped — click to map' : 'Mapped — click for options'}
          className={`w-3 h-3 rounded-full shrink-0 ${mapState.split ? 'dot-split' : ''}`}
          style={
            mapState.split
              ? ({ '--dot-color': color } as CSSProperties)
              : { backgroundColor: mapState.status === 'unmapped' ? UNMAPPED_COLOR : color }
          }
        />
      </div>

      {issuesOpen && issueCount > 0 && (
        <div
          className="ml-2 my-1 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs"
          style={{ marginLeft: depth * 18 + 28 }}
        >
          {Object.entries(grouped).map(([reason, files]) => (
            <div key={reason} className="mb-1.5 last:mb-0">
              <div className="font-semibold text-amber-800">⚠ {REASON_LABELS[reason as keyof typeof REASON_LABELS]}</div>
              {files.map((f) => (
                <div key={f.filename} className="flex justify-between gap-4 pl-4 text-amber-900">
                  <span className="truncate">{f.filename}</span>
                  <span className="text-amber-600 whitespace-nowrap">{reasonDetail(f.filename, f.reason)}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="text-amber-600 mt-1">Fix these in Explorer before running SPMT.</div>
        </div>
      )}

      {filesOpen && node.files.length > 0 && (
        <div
          className="ml-2 my-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 max-h-48 overflow-y-auto"
          style={{ marginLeft: depth * 18 + 28 }}
        >
          {node.files.map((f) => (
            <div key={f} className="truncate">📄 {f}</div>
          ))}
          {node.filesTruncated && (
            <div className="italic text-slate-400">… and {node.fileCount - node.files.length} more</div>
          )}
        </div>
      )}

      {expanded &&
        node.children.map((child) => <FolderRow key={child.path} node={child} depth={depth + 1} />)}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}

function RootSection({ root }: { root: DirectoryRoot }) {
  const removeRoot = useAppStore((s) => s.removeRoot);
  const rescanRoot = useAppStore((s) => s.rescanRoot);
  const scanning = useAppStore((s) => s.scanning);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  return (
    <div className="mb-3">
      <div className="group flex items-center justify-between px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
        <span className="truncate" title={root.path}>
          {root.pathType === 'unc' ? '🖧' : '💻'} {root.path}
        </span>
        {confirmingRemove ? (
          <span className="flex gap-1 normal-case font-normal">
            <button className="text-red-600 hover:underline" onClick={() => removeRoot(root.id)}>
              Remove
            </button>
            <button className="hover:underline" onClick={() => setConfirmingRemove(false)}>
              Keep
            </button>
          </span>
        ) : (
          <span className="flex gap-2 normal-case font-normal">
            <button
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-blue-600 focus:opacity-100"
              title="Rescan this root — mappings for folders that still exist are kept"
              aria-label={`Rescan ${root.path}`}
              disabled={!!scanning}
              onClick={() => void rescanRoot(root.id)}
            >
              ⟳
            </button>
            <button
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-red-600 focus:opacity-100"
              title="Remove this root (mappings under it are removed too)"
              aria-label={`Remove ${root.path}`}
              onClick={() => setConfirmingRemove(true)}
            >
              ✕
            </button>
          </span>
        )}
      </div>
      <FolderRow node={root.tree} depth={0} />
    </div>
  );
}

export default function LocalPanel() {
  const roots = useAppStore((s) => s.roots);
  const scanning = useAppStore((s) => s.scanning);
  const addDirectory = useAppStore((s) => s.addDirectory);
  const cancelScan = useAppStore((s) => s.cancelScan);

  return (
    <div className="flex-1 min-w-0 card m-2 mr-1 p-3 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-600">Local Directories</h2>
      </div>

      {scanning && (
        <div className="flex items-center gap-2 rounded bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2 mb-2">
          <span className="min-w-0 flex-1">
            <span className="block">
              Scanning {scanning.rootPath}… {scanning.folderCount} folders found
            </span>
            {scanning.currentPath && (
              <span className="block truncate text-blue-400" title={scanning.currentPath}>
                {scanning.currentPath}
              </span>
            )}
          </span>
          <button className="btn-secondary !py-0.5 !px-2 whitespace-nowrap" onClick={cancelScan}>
            Cancel
          </button>
        </div>
      )}

      {roots.length === 0 && !scanning ? (
        <div className="text-center text-slate-400 text-sm mt-16 px-6">
          <div className="text-4xl mb-3">📁</div>
          <p className="mb-2">No directories loaded yet.</p>
          <p className="mb-4">
            Click <b>Add Directory</b> to scan a local or network folder, then drag folders onto a
            SharePoint destination on the right.
          </p>
          <button className="btn-primary" onClick={() => void addDirectory()}>
            📁 Add Directory
          </button>
        </div>
      ) : (
        roots.map((root) => <RootSection key={root.id} root={root} />)
      )}
    </div>
  );
}
