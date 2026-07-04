/**
 * Right panel: SharePoint destination site cards.
 *
 * Each card renders the live merged preview of the site's structure under
 * Documents/: user-created folders (full drop targets with rename/delete and
 * [+ folder]) interleaved with the folders migration will create, derived
 * from the resolved mappings. Mapped local folders show as ⬅ chips on the
 * folder receiving their contents; inherited children render as read-only
 * "new" rows nested where they will land. The preview recomputes on every
 * mapping change via useResolved().
 *
 * Depth indicators follow the configured thresholds: amber at the warn depth,
 * red + disabled [+ folder] at the block depth. Created-by-migration rows
 * show a muted depth only — inherited rows grow deeper by design and are not
 * re-blocked.
 */

import { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { SharePointSite } from '../shared/types';
import { useAppStore } from '../store/useAppStore';
import { useResolved } from '../store/useResolved';
import { depthStatus } from '../shared/mappingEngine';
import { buildSitePreview, type PreviewNode, type PreviewSource } from '../shared/sitePreview';
import { siteUrl } from '../shared/slug';
import ContextMenu, { type MenuItem } from './ContextMenu';

/** ⬅ chips naming the local folders whose contents land in this folder. */
function SourceChips({ sources }: { sources: PreviewSource[] }) {
  return (
    <>
      {sources.map((s) => (
        <span
          key={s.localPath}
          className={`text-[11px] px-1.5 py-0.5 rounded bg-slate-100 whitespace-nowrap ${
            s.isExplicit ? 'text-slate-600' : 'text-slate-500 italic'
          }`}
          title={`Receives the contents of ${s.localPath}${s.isExplicit ? '' : ' (inherited)'}`}
        >
          ⬅ {s.localName}
        </span>
      ))}
    </>
  );
}

interface RowProps {
  site: SharePointSite;
  node: PreviewNode | null; // null = Documents/ root
  depth: number; // 0 for Documents/
  childNodes: PreviewNode[];
  sources: PreviewSource[];
}

function SpFolderRow({ site, node, depth, childNodes, sources }: RowProps) {
  const techConfig = useAppStore((s) => s.techConfig);
  const createSpFolder = useAppStore((s) => s.createSpFolder);
  const renameSpFolderAction = useAppStore((s) => s.renameSpFolderAction);
  const deleteSpFolderAction = useAppStore((s) => s.deleteSpFolderAction);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node?.folder?.name ?? '');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(true);

  const existing = !node || node.existing;
  const folder = node?.folder ?? null;
  const path = node?.path ?? '';

  const status = depthStatus(depth, techConfig);
  const blocked = status === 'block';
  const childBlocked = depthStatus(depth + 1, techConfig) === 'block';

  const { isOver, setNodeRef } = useDroppable({
    id: `drop:${site.id}:${path}`,
    data: { siteId: site.id, spFolderPath: path, depth, blocked },
    disabled: !existing, // created-by-migration rows are not drop targets
  });

  const submitAdd = () => {
    if (newName.trim()) createSpFolder(site.id, path, newName);
    setNewName('');
    setAdding(false);
  };

  const submitRename = () => {
    if (folder && renameValue.trim() && renameValue.trim() !== folder.name) {
      renameSpFolderAction(site.id, path, renameValue);
    }
    setRenaming(false);
  };

  const menuItems: MenuItem[] = folder
    ? [
        { label: 'Rename', onClick: () => { setRenameValue(folder.name); setRenaming(true); } },
        { label: 'Delete', danger: true, onClick: () => deleteSpFolderAction(site.id, path) },
      ]
    : [];

  const chevron = (
    <button
      onClick={() => setOpen((v) => !v)}
      className={`w-3 text-[10px] text-slate-400 ${childNodes.length ? '' : 'invisible'}`}
      title={open ? 'Collapse' : 'Expand'}
      aria-label={open ? 'Collapse' : 'Expand'}
      aria-expanded={open}
    >
      {open ? '▼' : '▶'}
    </button>
  );

  const row = existing ? (
    <div
      ref={setNodeRef}
      onContextMenu={(e) => {
        if (!folder) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`group flex items-center gap-1.5 py-1 pr-1 rounded text-sm transition-colors ${
        isOver
          ? blocked
            ? 'bg-red-100 ring-2 ring-red-400'
            : 'bg-blue-50 ring-2 ring-blue-400'
          : 'hover:bg-slate-50'
      }`}
      style={{ paddingLeft: depth * 16 + 8 }}
    >
      {chevron}
      <span>📁</span>
      {renaming ? (
        <input
          autoFocus
          className="input !py-0.5 !px-1.5 text-sm"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <span className="font-medium truncate">{folder ? folder.name : 'Documents'}{!folder && '/'}</span>
      )}

      <SourceChips sources={sources} />

      {depth > 0 && (
        <span
          className={`text-[11px] whitespace-nowrap ${
            status === 'block'
              ? 'text-red-600 font-semibold'
              : status === 'warn'
              ? 'text-amber-600 font-medium'
              : 'text-slate-400'
          }`}
          title={
            status === 'block'
              ? 'Exceeds the SharePoint folder depth limit — cannot receive mappings'
              : status === 'warn'
              ? 'Folders at this depth may cause migration reliability issues. Consider flattening.'
              : undefined
          }
        >
          {status === 'block' ? '✖' : status === 'warn' ? '⚠' : ''} depth {depth}
        </span>
      )}

      <span className="flex-1" />

      <button
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[11px] text-slate-500 border border-slate-300 rounded px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-30 whitespace-nowrap"
        disabled={childBlocked}
        title={
          childBlocked
            ? `Cannot create folders at depth ${depth + 1} — SharePoint destinations are limited to ${techConfig.depthBlockAt - 1} levels`
            : 'Create a subfolder'
        }
        onClick={() => setAdding(true)}
      >
        + folder
      </button>

      {folder && (
        <button
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[11px] text-slate-500 border border-slate-300 rounded px-1.5 py-0.5 hover:bg-slate-100 whitespace-nowrap"
          aria-label={`Options for ${folder.name}`}
          aria-haspopup="menu"
          title="Options"
          // Keep the mousedown from reaching ContextMenu's outside-click
          // listener, so clicking again toggles instead of reopening.
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu((m) => (m ? null : { x: r.left, y: r.bottom + 2 }));
          }}
        >
          ⋯
        </button>
      )}
    </div>
  ) : (
    <div
      className="flex items-center gap-1.5 py-1 pr-1 rounded text-sm"
      style={{ paddingLeft: depth * 16 + 8 }}
      title={
        sources.length
          ? `Will be created by migration from:\n${sources.map((s) => s.localPath).join('\n')}`
          : 'Created as a parent path for folders migrating beneath it'
      }
    >
      {chevron}
      <span className="opacity-60">📁</span>
      <span className="italic text-slate-600 truncate">{node!.name}</span>
      <span className="text-[10px] uppercase tracking-wide text-slate-400 border border-dashed border-slate-300 rounded px-1 whitespace-nowrap">
        new
      </span>
      {sources.length > 1 && (
        <span
          className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap"
          title={`${sources.length} local folders merge their contents here`}
        >
          merges {sources.length}
        </span>
      )}
      <span className="text-[11px] text-slate-400 whitespace-nowrap">depth {depth}</span>
      <span className="flex-1" />
    </div>
  );

  return (
    <div>
      {row}

      {adding && (
        <div className="flex gap-1 my-1" style={{ paddingLeft: (depth + 1) * 16 + 8 }}>
          <input
            autoFocus
            className="input !py-0.5 text-sm"
            placeholder="New folder name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAdd();
              if (e.key === 'Escape') setAdding(false);
            }}
            onBlur={() => (newName.trim() ? submitAdd() : setAdding(false))}
          />
        </div>
      )}

      {open &&
        childNodes.map((child) => (
          <SpFolderRow
            key={child.path}
            site={site}
            node={child}
            depth={depth + 1}
            childNodes={child.children}
            sources={child.sources}
          />
        ))}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}

function SiteCard({ site }: { site: SharePointSite }) {
  const tenantDomain = useAppStore((s) => s.techConfig.tenantDomain);
  const removeSite = useAppStore((s) => s.removeSite);
  const hasMappings = useAppStore((s) => s.explicitMappings.some((m) => m.spSiteId === site.id));
  const { list } = useResolved();

  // Recomputed on every mapping/skip/folder change — this is what keeps the
  // card's structure preview live.
  const preview = useMemo(() => buildSitePreview(site, list), [site, list]);

  return (
    <div className="card mb-3 overflow-hidden" style={{ borderTop: `3px solid ${site.color}` }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <span className="w-3.5 h-3.5 rounded shrink-0" style={{ backgroundColor: site.color }} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{site.name}</div>
          <div className="text-[11px] text-slate-400 truncate" title={siteUrl(tenantDomain, site.slug)}>
            {siteUrl(tenantDomain, site.slug)}
          </div>
        </div>
        <button
          className="text-slate-300 hover:text-red-600 disabled:hover:text-slate-300 disabled:opacity-40"
          disabled={hasMappings}
          aria-label={`Remove ${site.name}`}
          title={hasMappings ? 'Unmap all folders from this site first' : 'Remove site'}
          onClick={() => removeSite(site.id)}
        >
          ✕
        </button>
      </div>
      <div className="p-2">
        <SpFolderRow
          site={site}
          node={null}
          depth={0}
          childNodes={preview.children}
          sources={preview.rootSources}
        />
      </div>
    </div>
  );
}

export default function SharePointPanel({ onAddSite }: { onAddSite: () => void }) {
  const sites = useAppStore((s) => s.sharePointSites);
  const allowAdd = useAppStore((s) => s.techConfig.allowUserAddSites);

  return (
    <div className="flex-1 min-w-0 m-2 ml-1 overflow-y-auto p-1">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-sm font-semibold text-slate-600">SharePoint Destinations</h2>
      </div>

      {sites.length === 0 ? (
        <div className="text-center text-slate-400 text-sm mt-16 px-6">
          <div className="text-4xl mb-3">🟦</div>
          <p className="mb-4">
            No SharePoint sites yet. Add a site, create folders under <b>Documents/</b>, then drag
            local folders onto them.
          </p>
          {allowAdd && (
            <button className="btn-primary" onClick={onAddSite}>+ Add SP Site</button>
          )}
        </div>
      ) : (
        sites.map((site) => <SiteCard key={site.id} site={site} />)
      )}
    </div>
  );
}
