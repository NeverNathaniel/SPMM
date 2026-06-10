import type { ReactNode } from 'react';

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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="card w-[28rem] p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-2">{title}</h3>
        <div className="text-sm text-slate-600 mb-5">{children}</div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
