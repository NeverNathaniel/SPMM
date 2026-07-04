import { useAppStore } from '../store/useAppStore';
import { useResolved } from '../store/useResolved';

export default function StatusBar() {
  const roots = useAppStore((s) => s.roots);
  const saveStatus = useAppStore((s) => s.saveStatus);
  const { summary } = useResolved();

  const mapped = summary.explicitCount + summary.inheritedCount;
  const saveLabel = {
    saved: 'Saved ✓',
    saving: 'Saving…',
    dirty: 'Unsaved changes…',
    error: 'Save failed ⚠',
  }[saveStatus];

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 text-xs text-slate-500 bg-white border-t border-slate-200">
      <span>{roots.length} root{roots.length === 1 ? '' : 's'} loaded</span>
      <span>·</span>
      <span>{summary.totalFolders} folders</span>
      <span>·</span>
      <span className="text-green-600">{mapped} mapped</span>
      <span>·</span>
      <span>{summary.taskCount} SPMT task{summary.taskCount === 1 ? '' : 's'}</span>
      <span>·</span>
      <span className={summary.unmappedFolders.length ? 'text-amber-600' : ''}>
        {summary.unmappedFolders.length} unmapped
      </span>
      {summary.skippedCount > 0 && (
        <>
          <span>·</span>
          <span>{summary.skippedCount} skipped</span>
        </>
      )}
      <span className="flex-1" />
      <span className={saveStatus === 'error' ? 'text-red-600' : ''}>{saveLabel}</span>
    </div>
  );
}
