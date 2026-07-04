import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the safe action on open; restore focus to the opener on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-[28rem] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-base font-semibold mb-2">{title}</h3>
        <div className="text-sm text-slate-600 mb-5">{children}</div>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
