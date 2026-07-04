/**
 * Screen 3 — Technician settings (⚙), optionally PIN-protected.
 * Saved settings go to the user-data directory; a deployment seed
 * (tech-config.json next to the executable / in resources) provides defaults.
 * The PIN itself never reaches this renderer — it is verified over IPC.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../electronApi';
import { validateTenantDomain } from '../shared/slug';
import type { TechConfig } from '../shared/types';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function TechSettings() {
  const techConfig = useAppStore((s) => s.techConfig);
  const updateTechConfig = useAppStore((s) => s.updateTechConfig);
  const setScreen = useAppStore((s) => s.setScreen);
  const toast = useAppStore((s) => s.toast);

  // null = still asking the main process whether a PIN exists.
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState(false);
  const [draft, setDraft] = useState<TechConfig>({ ...techConfig });
  const [newPin, setNewPin] = useState('');
  const [clearPin, setClearPin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api()
      .hasSettingsPin()
      .then((hasPin) => {
        if (!cancelled) setUnlocked(!hasPin);
      })
      .catch(() => {
        if (!cancelled) setUnlocked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof TechConfig>(key: K, value: TechConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const tryUnlock = async () => {
    if (await api().verifySettingsPin(pinEntry)) setUnlocked(true);
    else setPinError(true);
  };

  const save = async () => {
    const tenantIssue = validateTenantDomain(draft.tenantDomain);
    if (tenantIssue) {
      toast('error', tenantIssue);
      return;
    }
    if (draft.depthWarnAt >= draft.depthBlockAt) {
      toast('error', `Depth "warn at" (${draft.depthWarnAt}) must be below "block at" (${draft.depthBlockAt})`);
      return;
    }
    if (draft.pathWarnAt >= draft.pathBlockAt) {
      toast('error', `Path length "warn over" (${draft.pathWarnAt}) must be below "block over" (${draft.pathBlockAt})`);
      return;
    }
    const exportPath = draft.exportPathOverride.trim();
    if (exportPath && !/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(exportPath)) {
      toast('error', `Export path override must be an absolute path (got "${exportPath}")`);
      return;
    }
    const pinUpdate = clearPin ? '' : newPin.trim() || undefined;
    const ok = await updateTechConfig({ ...draft, exportPathOverride: exportPath }, pinUpdate);
    if (ok) {
      // Re-sync with the sanitized config (main clamps thresholds etc.).
      setDraft({ ...useAppStore.getState().techConfig });
      setNewPin('');
      setClearPin(false);
    }
  };

  if (unlocked === null) {
    return <div className="flex-1 flex items-center justify-center text-slate-400">Loading…</div>;
  }

  if (!unlocked) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="card p-6 w-80">
          <h3 className="text-base font-semibold mb-3">⚙ Technician Settings</h3>
          <input
            autoFocus
            type="password"
            className="input mb-2"
            placeholder="Enter PIN"
            aria-label="Settings PIN"
            value={pinEntry}
            onChange={(e) => {
              setPinEntry(e.target.value);
              setPinError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void tryUnlock();
            }}
          />
          {pinError && <p className="text-xs text-red-600 mb-2">Incorrect PIN</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setScreen('map')}>Back</button>
            <button className="btn-primary" onClick={() => void tryUnlock()}>
              Unlock
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tenantIssue = draft.tenantDomain ? validateTenantDomain(draft.tenantDomain) : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">⚙ Technician Settings</h2>
        <button className="btn-secondary" onClick={() => setScreen('map')}>← Back to mapping</button>
      </div>

      <div className="card p-5">
        <Field label="Tenant domain" hint="e.g. contoso.sharepoint.com — pre-set this and lock it for end users">
          <input className="input" value={draft.tenantDomain} onChange={(e) => set('tenantDomain', e.target.value.trim())} />
          {tenantIssue && <p className="text-[11px] text-red-600 mt-1">{tenantIssue}</p>}
        </Field>

        <Field label="">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.tenantLocked} onChange={(e) => set('tenantLocked', e.target.checked)} />
            Lock tenant domain for end users (shows a Request Change link instead)
          </label>
        </Field>

        <Field label="Support email" hint='Used by the "Request Change" tenant-domain link'>
          <input className="input" value={draft.supportEmail} onChange={(e) => set('supportEmail', e.target.value.trim())} />
        </Field>

        <Field
          label="Pre-seeded SharePoint sites"
          hint="One per line: Name or Name|Slug. These are created on first launch."
        >
          <textarea
            className="input h-24 font-mono text-xs"
            value={draft.preSeededSites.map((s) => (s.slug ? `${s.name}|${s.slug}` : s.name)).join('\n')}
            onChange={(e) =>
              set(
                'preSeededSites',
                e.target.value
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l) => {
                    const [name, slug] = l.split('|').map((p) => p.trim());
                    return slug ? { name, slug } : { name };
                  })
              )
            }
          />
        </Field>

        <Field label="Quick-add preset labels" hint="Comma-separated buttons in the Add Site modal">
          <input
            className="input"
            value={draft.quickAddPresets.join(', ')}
            onChange={(e) =>
              set(
                'quickAddPresets',
                e.target.value.split(',').map((p) => p.trim()).filter(Boolean)
              )
            }
          />
        </Field>

        <Field label="">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.allowUserAddSites}
              onChange={(e) => set('allowUserAddSites', e.target.checked)}
            />
            Allow user to add sites (untick to restrict to pre-seeded only)
          </label>
        </Field>

        <Field label="Export path override" hint="Absolute path; leave empty for %APPDATA%\MigrationMapper\exports">
          <input className="input" value={draft.exportPathOverride} onChange={(e) => set('exportPathOverride', e.target.value)} />
        </Field>

        <Field label="Session behavior">
          <select
            className="input"
            value={draft.sessionBehavior}
            onChange={(e) => set('sessionBehavior', e.target.value as TechConfig['sessionBehavior'])}
          >
            <option value="accumulate">Always accumulate roots</option>
            <option value="clear-on-load">Clear session on new directory load</option>
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Depth: warn at" hint="Default 2">
            <input
              type="number" min={1} className="input"
              value={draft.depthWarnAt}
              onChange={(e) => set('depthWarnAt', Math.max(1, Number(e.target.value) || 2))}
            />
          </Field>
          <Field label="Depth: block at" hint="Default 3 — must be above warn">
            <input
              type="number" min={2} className="input"
              value={draft.depthBlockAt}
              onChange={(e) => set('depthBlockAt', Math.max(2, Number(e.target.value) || 3))}
            />
          </Field>
          <Field label="Path length: warn over" hint="Default 256">
            <input
              type="number" min={50} className="input"
              value={draft.pathWarnAt}
              onChange={(e) => set('pathWarnAt', Number(e.target.value) || 256)}
            />
          </Field>
          <Field label="Path length: block over" hint="Default 400 (SharePoint URL limit) — must be above warn">
            <input
              type="number" min={100} className="input"
              value={draft.pathBlockAt}
              onChange={(e) => set('pathBlockAt', Number(e.target.value) || 400)}
            />
          </Field>
        </div>

        <Field
          label="Settings PIN"
          hint="Optional — protects this screen on the user's machine. Leave blank to keep the current PIN."
        >
          <div className="flex items-center gap-3">
            <input
              className="input flex-1"
              type="password"
              placeholder="New PIN"
              aria-label="New settings PIN"
              value={newPin}
              disabled={clearPin}
              onChange={(e) => setNewPin(e.target.value.trim())}
            />
            <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
              <input type="checkbox" checked={clearPin} onChange={(e) => setClearPin(e.target.checked)} />
              Remove PIN
            </label>
          </div>
        </Field>

        <Field label="Operator note" hint="Included in the HTML summary header">
          <input className="input" value={draft.operatorNote} onChange={(e) => set('operatorNote', e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => setDraft({ ...techConfig })}>Reset</button>
          <button className="btn-primary" onClick={() => void save()}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}
