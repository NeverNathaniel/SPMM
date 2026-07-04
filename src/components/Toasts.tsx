import { useAppStore } from '../store/useAppStore';

const KIND_STYLES: Record<string, string> = {
  info: 'bg-slate-800 text-white',
  success: 'bg-green-600 text-white',
  warning: 'bg-amber-500 text-white',
  error: 'bg-red-600 text-white',
};

export default function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);

  // Always mounted (even when empty) — screen readers only announce changes
  // inside a live region that already existed.
  return (
    <div aria-live="polite" className="fixed bottom-12 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`${KIND_STYLES[t.kind]} rounded-lg px-4 py-2.5 text-sm shadow-lg flex items-start gap-3`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
