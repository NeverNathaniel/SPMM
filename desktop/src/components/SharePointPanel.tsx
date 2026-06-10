/**
 * Right panel: SharePoint destination site cards.
 *
 * Every folder (including the always-present Documents/ root) is a dnd-kit
 * drop target. Depth indicators follow the configured thresholds: amber at
 * the warn depth, red + disabled [+ folder] at the block depth.
 */

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { SharePointSite, SPFolder } from '../shared/types';
import { useAppStore } from '../store/useAppStore';
import { depthStatus } from '../shared/mappingEngine';
import { siteUrl } from '../shared/slug';
import ContextMenu, { type MenuItem } from './ContextMenu';

interface DropRowProps {
  site: SharePointSite;
  folder: SPFolder | null; // null = Documents/ root
  path: string; // '' for Documents/
  depth: number; // 0 for Documents/
}

function SpFolderRow({ site, folder, path, depth }: DropRowProps) {
  const techConfig = useAppStore((s) => s.techConfig);
  const createSpFolder = useAppStore((s) => s.createSpFolder);
  const renameSpFolderAction = useAppStore((s) => s.renameSpFolderAction);
  const deleteSpFolderAction = useAppStore((s) => s.deleteSpFolderAction);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder?.name ?? '');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const status = depthStatus(depth, techConfig);
  const blocked = status === 'block';
  const childBlocked = depthStatus(depth + 1, techConfig) === 'block';

  const { isOver, setNodeRef } = useDroppable({
    id: `drop:${site.id}:${path}`,
    data: { siteId: site.id, spFolderPath: path, depth, blocked },
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

  return (
    <div>
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
          className="opacity-0 group-hover:opacity-100 text-[11px] text-slate-500 border border-slate-300 rounded px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-30 whitespace-nowrap"
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
      </div>

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

      {folder?.children.map((child) => (
        <SpFolderRow
          key={child.id}
          site={site}
          folder={child}
          path={`${path}/${child.name}`.replace(/^\//, '')}
          depth={depth + 1}
        />
      ))}

      {!folder &&
        site.folders.map((child) => (
          <SpFolderRow key={child.id} site={site} folder={child} path={child.name} depth={1} />
        ))}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}

function SiteCard({ site }: { site: SharePointSite }) {
  const tenantDomain = useAppStore((s) => s.techConfig.tenantDomain);
  const removeSite = useAppStore((s) => s.removeSite);
  const hasMappings = useAppStore((s) => s.explicitMappings.some((m) => m.spSiteId === site.id));

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
          title={hasMappings ? 'Unmap all folders from this site first' : 'Remove site'}
          onClick={() => removeSite(site.id)}
        >
          ✕
        </button>
      </div>
      <div className="p-2">
        <SpFolderRow site={site} folder={null} path="" depth={0} />
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
