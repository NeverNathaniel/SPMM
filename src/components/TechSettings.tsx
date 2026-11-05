/**
 * Screen 3 — Technician settings (⚙), optionally PIN-protected.
 * Saved to tech-config.json in the install directory so settings survive
 * user-level session resets and can be pre-baked into the installer.
 */

import { useState, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { TechConfig } from '../shared/types';

const formatSites = (sites: TechConfig['preSeededSites']) =>
  sites.map((s) => (s.slug ? `${s.name}|${s.slug}` : s.name)).join('\n');

const parseSites = (text: string): TechConfig['preSeededSites'] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, slug] = l.split('|').map((p) => p.trim());
      return slug ? { name, slug } : { name };
    })
    .filter((s) => s.name);

const parsePresets = (text: string): string[] =>
  text.split(',').map((p) => p.trim()).filter(Boolean);

/** Returns a user-facing problem with the threshold settings, or null. */
function thresholdError(cfg: TechConfig): string | null {
  if (cfg.depthWarnAt >= cfg.depthBlockAt) return 'Depth "warn at" must be lower than "block at".';
  if (cfg.pathWarnAt >= cfg.pathBlockAt) return 'Path length "warn over" must be lower than "block over".';
  return null;
}

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

  const [unlocked, setUnlocked] = useState(!techConfig.settingsPin);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState(false);
  const [draft, setDraft] = useState<TechConfig>({ ...techConfig });
  // List fields are edited as raw text and parsed on save. Deriving the input
  // value from the parsed list would strip a just-typed newline or comma,
  // making it impossible to type a second entry.
  const [sitesText, setSitesText] = useState(formatSites(techConfig.preSeededSites));
  const [presetsText, setPresetsText] = useState(techConfig.quickAddPresets.join(', '));

  const save = () => {
    const next: TechConfig = {
      ...draft,
      preSeededSites: parseSites(sitesText),
      quickAddPresets: parsePresets(presetsText),
    };
    const problem = thresholdError(next);
    if (problem) {
      useAppStore.getState().toast('error', problem);
      return;
    }
    void updateTechConfig(next);
  };

  const reset = () => {
    setDraft({ ...techConfig });
    setSitesText(formatSites(techConfig.preSeededSites));
    setPresetsText(techConfig.quickAddPresets.join(', '));
  };

  const set = <K extends keyof TechConfig>(key: K, value: TechConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

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
            value={pinEntry}
            onChange={(e) => {
              setPinEntry(e.target.value);
              setPinError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (pinEntry === techConfig.settingsPin) setUnlocked(true);
                else setPinError(true);
              }
            }}
          />
          {pinError && <p className="text-xs text-red-600 mb-2">Incorrect PIN</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setScreen('map')}>Back</button>
            <button
              className="btn-primary"
              onClick={() => (pinEntry === techConfig.settingsPin ? setUnlocked(true) : setPinError(true))}
            >
              Unlock
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">⚙ Technician Settings</h2>
        <button className="btn-secondary" onClick={() => setScreen('map')}>← Back to mapping</button>
      </div>

      <div className="card p-5">
        <Field label="Tenant domain" hint="e.g. contoso.sharepoint.com — pre-set this and lock it for end users">
          <input className="input" value={draft.tenantDomain} onChange={(e) => set('tenantDomain', e.target.value.trim())} />
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
            value={sitesText}
            onChange={(e) => setSitesText(e.target.value)}
          />
        </Field>

        <Field label="Quick-add preset labels" hint="Comma-separated buttons in the Add Site modal">
          <input
            className="input"
            value={presetsText}
            onChange={(e) => setPresetsText(e.target.value)}
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

        <Field label="Export path override" hint="Leave empty for %APPDATA%\MigrationMapper\exports">
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
          <Field label="Depth: block at" hint="Default 3">
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
          <Field label="Path length: block over" hint="Default 400 (SharePoint URL limit)">
            <input
              type="number" min={100} className="input"
              value={draft.pathBlockAt}
              onChange={(e) => set('pathBlockAt', Number(e.target.value) || 400)}
            />
          </Field>
        </div>

        <Field label="Settings PIN" hint="Optional — protects this screen on the user's machine">
          <input className="input" value={draft.settingsPin} onChange={(e) => set('settingsPin', e.target.value.trim())} />
        </Field>

        <Field label="Operator note" hint="Included in the HTML summary header">
          <input className="input" value={draft.operatorNote} onChange={(e) => set('operatorNote', e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={reset}>Reset</button>
          <button className="btn-primary" onClick={save}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}
