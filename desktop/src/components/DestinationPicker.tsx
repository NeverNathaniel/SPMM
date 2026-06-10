/**
 * Modal destination picker, used by "Remap to…" / "Map Now".
 * Lists every site with Documents/ and its folder tree; depth-blocked
 * destinations are shown disabled.
 */

import { useAppStore } from '../store/useAppStore';
import { depthStatus } from '../shared/mappingEngine';
import { listSpFolders } from '../shared/spFolders';

export default function DestinationPicker() {
  const target = useAppStore((s) => s.destinationPickerFor);
  const sites = useAppStore((s) => s.sharePointSites);
  const techConfig = useAppStore((s) => s.techConfig);
  const requestMap = useAppStore((s) => s.requestMap);
  const close = useAppStore((s) => s.closeDestinationPicker);

  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={close}>
      <div className="card w-[30rem] max-h-[70vh] flex flex-col p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">Choose destination</h3>
        <p className="text-xs text-slate-500 mb-3 truncate" title={target.localPath}>
          for {target.localPath}
        </p>

        <div className="overflow-y-auto flex-1 -mx-1 px-1">
          {sites.length === 0 && (
            <p className="text-sm text-slate-400">No SharePoint sites configured yet.</p>
          )}
          {sites.map((site) => (
            <div key={site.id} className="mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold mb-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: site.color }} />
                {site.name}
              </div>
              <button
                className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-blue-50"
                style={{ paddingLeft: 16 }}
                onClick={() => requestMap(target.localPath, target.localFolderId, site.id, '')}
              >
                📁 Documents/
              </button>
              {listSpFolders(site.folders).map(({ path, depth }) => {
                const blocked = depthStatus(depth, techConfig) === 'block';
                const warn = depthStatus(depth, techConfig) === 'warn';
                return (
                  <button
                    key={path}
                    disabled={blocked}
                    className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ paddingLeft: 16 + depth * 16 }}
                    title={blocked ? 'Exceeds the SharePoint folder depth limit' : undefined}
                    onClick={() => requestMap(target.localPath, target.localFolderId, site.id, path)}
                  >
                    📁 {path.split('/').pop()}
                    {warn && <span className="text-amber-600 text-xs"> ⚠</span>}
                    {blocked && <span className="text-red-600 text-xs"> ✖</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-3">
          <button className="btn-secondary" onClick={close}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
