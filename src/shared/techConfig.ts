/**
 * Technician-config sanitisation.
 *
 * tech-config.json arrives from disk (hand-written or pre-baked), so nothing
 * about its shape can be trusted: unknown keys are dropped, wrongly-typed
 * values fall back to defaults, and thresholds are clamped into sane ranges
 * (warn strictly below block) so a bad config can't wedge the guardrails.
 */

import type { TechConfig } from './types';
import { DEFAULT_TECH_CONFIG } from './types';

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

function strArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
}

function seededSites(v: unknown): TechConfig['preSeededSites'] | null {
  if (!Array.isArray(v)) return null;
  const out: TechConfig['preSeededSites'] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue;
    const name = (item as { name?: unknown }).name;
    const slug = (item as { slug?: unknown }).slug;
    if (typeof name !== 'string' || !name.trim()) continue;
    out.push(typeof slug === 'string' && slug.trim() ? { name: name.trim(), slug: slug.trim() } : { name: name.trim() });
  }
  return out;
}

/** Merge one or more partial configs (later wins) over defaults, safely. */
export function sanitizeTechConfig(...layers: unknown[]): TechConfig {
  const cfg: TechConfig = { ...DEFAULT_TECH_CONFIG, preSeededSites: [], quickAddPresets: [...DEFAULT_TECH_CONFIG.quickAddPresets] };
  for (const layer of layers) {
    if (typeof layer !== 'object' || layer === null) continue;
    const raw = layer as Record<string, unknown>;
    cfg.tenantDomain = str(raw.tenantDomain, cfg.tenantDomain).trim();
    cfg.tenantLocked = bool(raw.tenantLocked, cfg.tenantLocked);
    cfg.supportEmail = str(raw.supportEmail, cfg.supportEmail).trim();
    cfg.preSeededSites = seededSites(raw.preSeededSites) ?? cfg.preSeededSites;
    cfg.quickAddPresets = strArray(raw.quickAddPresets) ?? cfg.quickAddPresets;
    cfg.allowUserAddSites = bool(raw.allowUserAddSites, cfg.allowUserAddSites);
    cfg.exportPathOverride = str(raw.exportPathOverride, cfg.exportPathOverride).trim();
    cfg.sessionBehavior =
      raw.sessionBehavior === 'clear-on-load' || raw.sessionBehavior === 'accumulate'
        ? raw.sessionBehavior
        : cfg.sessionBehavior;
    cfg.depthWarnAt = int(raw.depthWarnAt, cfg.depthWarnAt, 1, 50);
    cfg.depthBlockAt = int(raw.depthBlockAt, cfg.depthBlockAt, 2, 50);
    cfg.pathWarnAt = int(raw.pathWarnAt, cfg.pathWarnAt, 50, 4000);
    cfg.pathBlockAt = int(raw.pathBlockAt, cfg.pathBlockAt, 100, 4000);
    cfg.settingsPin = str(raw.settingsPin, cfg.settingsPin).trim();
    cfg.operatorNote = str(raw.operatorNote, cfg.operatorNote);
  }
  // Warn thresholds must sit strictly below their block thresholds.
  if (cfg.depthWarnAt >= cfg.depthBlockAt) cfg.depthWarnAt = cfg.depthBlockAt - 1;
  if (cfg.pathWarnAt >= cfg.pathBlockAt) cfg.pathWarnAt = cfg.pathBlockAt - 1;
  return cfg;
}
