import { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 card py-1 min-w-[11rem] text-sm"
      style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - items.length * 36 - 12) }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          disabled={item.disabled}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`block w-full text-left px-3 py-1.5 hover:bg-slate-100 disabled:opacity-40 ${
            item.danger ? 'text-red-600' : ''
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
