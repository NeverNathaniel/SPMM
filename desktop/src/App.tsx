/**
 * Root component: toolbar, screen router, DnD wiring between the local tree
 * and SharePoint drop targets, dialogs, toasts, resume banner, status bar.
 */

import { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useAppStore } from './store/useAppStore';
import { ResolvedProvider } from './store/useResolved';
import { hasElectron } from './electronApi';
import LocalPanel from './components/LocalPanel';
import SharePointPanel from './components/SharePointPanel';
import AddSiteModal from './components/AddSiteModal';
import DestinationPicker from './components/DestinationPicker';
import ConfirmDialog from './components/ConfirmDialog';
import ReviewScreen from './components/ReviewScreen';
import TechSettings from './components/TechSettings';
import StatusBar from './components/StatusBar';
import Toasts from './components/Toasts';

export default function App() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const init = useAppStore((s) => s.init);
  const initialized = useAppStore((s) => s.initialized);
  const addDirectory = useAppStore((s) => s.addDirectory);
  const allowAddSites = useAppStore((s) => s.techConfig.allowUserAddSites);
  const resumeBanner = useAppStore((s) => s.resumeBanner);
  const dismissBanner = useAppStore((s) => s.dismissBanner);
  const startFresh = useAppStore((s) => s.startFresh);
  const requestMap = useAppStore((s) => s.requestMap);
  const pendingRemap = useAppStore((s) => s.pendingRemap);
  const confirmPendingRemap = useAppStore((s) => s.confirmPendingRemap);
  const cancelPendingRemap = useAppStore((s) => s.cancelPendingRemap);
  const toast = useAppStore((s) => s.toast);

  const [showAddSite, setShowAddSite] = useState(false);
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    void init();
  }, [init]);

  if (!hasElectron()) {
    return (
      <div className="h-full flex items-center justify-center text-center p-8">
        <div className="card p-8 max-w-md">
          <h1 className="text-lg font-semibold mb-2">Migration Mapper</h1>
          <p className="text-sm text-slate-500">
            This window is running outside Electron, so file-system access is unavailable.
            Start the app with <code className="bg-slate-100 px-1 rounded">npm run dev</code> from the
            <code className="bg-slate-100 px-1 rounded ml-1">desktop/</code> directory.
          </p>
        </div>
      </div>
    );
  }

  if (!initialized) {
    return <div className="h-full flex items-center justify-center text-slate-400">Loading…</div>;
  }

  const onDragStart = (e: DragStartEvent) => {
    setDragLabel((e.active.data.current as { name?: string })?.name ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragLabel(null);
    const { active, over } = e;
    if (!over) return;
    const src = active.data.current as { localPath: string; localFolderId: string } | undefined;
    const dst = over.data.current as
      | { siteId: string; spFolderPath: string; depth: number; blocked: boolean }
      | undefined;
    if (!src || !dst) return;
    if (dst.blocked) {
      const blockAt = useAppStore.getState().techConfig.depthBlockAt;
      toast('error', `Cannot map here — SharePoint destination exceeds maximum folder depth of ${blockAt - 1}.`);
      return;
    }
    requestMap(src.localPath, src.localFolderId, dst.siteId, dst.spFolderPath);
  };

  return (
    <ResolvedProvider>
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-200">
        <span className="font-semibold text-sm mr-2">Migration Mapper</span>
        <button className="btn-secondary" onClick={() => void addDirectory()}>📁 Add Directory</button>
        {allowAddSites && (
          <button className="btn-secondary" onClick={() => setShowAddSite(true)}>+ Add SP Site</button>
        )}
        <button
          className={screen === 'review' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setScreen(screen === 'review' ? 'map' : 'review')}
        >
          Review &amp; Export
        </button>
        <span className="flex-1" />
        <button
          className="btn-secondary !px-2"
          title="Technician settings"
          onClick={() => setScreen(screen === 'settings' ? 'map' : 'settings')}
        >
          ⚙
        </button>
      </div>

      {/* Resume banner */}
      {resumeBanner && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-200 text-sm text-blue-800">
          <span className="flex-1">{resumeBanner}</span>
          <button className="btn-secondary !py-1 text-xs" onClick={() => void startFresh()}>
            Start Fresh
          </button>
          <button className="text-blue-400 hover:text-blue-700" onClick={dismissBanner}>✕</button>
        </div>
      )}

      {/* Screens */}
      {screen === 'map' && (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex-1 flex min-h-0">
            <LocalPanel />
            <SharePointPanel onAddSite={() => setShowAddSite(true)} />
          </div>
          <DragOverlay dropAnimation={null}>
            {dragLabel && (
              <div className="card px-3 py-1.5 text-sm font-medium shadow-lg bg-white/95">
                📁 {dragLabel}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
      {screen === 'review' && <ReviewScreen />}
      {screen === 'settings' && <TechSettings />}

      <StatusBar />

      {/* Dialogs */}
      {showAddSite && <AddSiteModal onClose={() => setShowAddSite(false)} />}
      <DestinationPicker />
      {pendingRemap && (
        <ConfirmDialog
          title="Replace existing mapping?"
          confirmLabel="Replace"
          danger
          onConfirm={confirmPendingRemap}
          onCancel={cancelPendingRemap}
        >
          <p>
            <span className="font-medium break-all">{pendingRemap.localPath}</span> is currently
            mapped to <span className="font-medium">{pendingRemap.replacesSiteName}</span>.
          </p>
          <p className="mt-2">
            Replacing it will recalculate inherited mappings for everything beneath this folder.
          </p>
        </ConfirmDialog>
      )}
      <Toasts />
    </div>
    </ResolvedProvider>
  );
}
