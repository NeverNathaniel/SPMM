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

  // Arrow-key focus between enabled items (wrapping); Enter/Space activate via
  // native button behaviour. Opener regains focus on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const enabled = () =>
      Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    enabled()[0]?.focus();
    const nav = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const list = enabled();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      list[e.key === 'ArrowDown' ? (i + 1) % list.length : i <= 0 ? list.length - 1 : i - 1].focus();
    };
    window.addEventListener('keydown', nav);
    return () => {
      window.removeEventListener('keydown', nav);
      // Restore only if focus fell back to the body — a menu action may have
      // moved it deliberately (e.g. Rename focuses an inline input, which an
      // unconditional restore would blur and close instantly).
      if (document.activeElement === document.body || document.activeElement === null) {
        previous?.focus();
      }
    };
  }, []);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 card py-1 min-w-[11rem] text-sm"
      style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - items.length * 36 - 12) }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          disabled={item.disabled}
          aria-disabled={item.disabled || undefined}
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
