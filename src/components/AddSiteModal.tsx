import { useEffect, useId, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { slugFromSiteName, siteUrl } from '../shared/slug';
import { api } from '../electronApi';

export default function AddSiteModal({ onClose }: { onClose: () => void }) {
  const techConfig = useAppStore((s) => s.techConfig);
  const addSite = useAppStore((s) => s.addSite);

  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  // What addSite receives is always what the user sees: the typed slug, or —
  // when the field is empty — the auto-slug shown as its placeholder.
  const autoSlug = slugFromSiteName(name);
  const effectiveSlug = slug || autoSlug;

  // Focus the name field on open; restore focus to the opener on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const submit = (siteName: string, siteSlug?: string) => {
    if (!siteName.trim()) return;
    // addSite returns false on rejection (it already toasts) — keep the modal
    // open so the input isn't lost.
    if (addSite(siteName, siteSlug)) onClose();
  };

  const requestChange = () => {
    const subject = encodeURIComponent('Tenant domain change request — Migration Mapper');
    const body = encodeURIComponent(
      `Current tenant domain: ${techConfig.tenantDomain}\nRequested change:\n`
    );
    void api().openExternal(`mailto:${techConfig.supportEmail}?subject=${subject}&body=${body}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-[30rem] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-base font-semibold mb-4">Add SharePoint Site</h3>

        <label className="block text-xs font-medium text-slate-500 mb-1">Tenant domain</label>
        <div className="flex items-center gap-2 mb-3">
          <input className="input bg-slate-50" value={techConfig.tenantDomain} readOnly disabled />
          {techConfig.tenantLocked && techConfig.supportEmail && (
            <button className="text-xs text-blue-600 hover:underline whitespace-nowrap" onClick={requestChange}>
              Request Change
            </button>
          )}
        </div>

        <label className="block text-xs font-medium text-slate-500 mb-1">Site name</label>
        <input
          ref={nameRef}
          className="input mb-3"
          placeholder="e.g. Contoso HR"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit(name, effectiveSlug)}
        />

        <label className="block text-xs font-medium text-slate-500 mb-1">URL slug</label>
        <input
          className="input mb-1"
          placeholder={autoSlug || 'Auto-generated from the site name'}
          value={slug}
          onChange={(e) => setSlug(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))}
        />
        <div className="text-[11px] text-slate-400 mb-4 truncate">
          {effectiveSlug ? siteUrl(techConfig.tenantDomain, effectiveSlug) : ' '}
        </div>

        {techConfig.quickAddPresets.length > 0 && (
          <>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Quick add</div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {techConfig.quickAddPresets.map((preset) => (
                <button
                  key={preset}
                  className="btn-secondary !py-1 !px-2.5 text-xs"
                  onClick={() => submit(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!name.trim() || !effectiveSlug} onClick={() => submit(name, effectiveSlug)}>
            Add Site
          </button>
        </div>
      </div>
    </div>
  );
}
