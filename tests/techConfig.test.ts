import { describe, expect, it } from 'vitest';
import { sanitizeTechConfig } from '../src/shared/techConfig';
import { DEFAULT_TECH_CONFIG } from '../src/shared/types';

describe('sanitizeTechConfig', () => {
  it('returns defaults for garbage input', () => {
    expect(sanitizeTechConfig(null)).toEqual(DEFAULT_TECH_CONFIG);
    expect(sanitizeTechConfig('not an object')).toEqual(DEFAULT_TECH_CONFIG);
    expect(sanitizeTechConfig(42, undefined, [])).toEqual(DEFAULT_TECH_CONFIG);
  });

  it('keeps well-typed values and layers later configs over earlier ones', () => {
    const cfg = sanitizeTechConfig(
      { tenantDomain: 'seed.sharepoint.com', depthBlockAt: 4 },
      { tenantDomain: 'saved.sharepoint.com' }
    );
    expect(cfg.tenantDomain).toBe('saved.sharepoint.com');
    expect(cfg.depthBlockAt).toBe(4);
  });

  it('drops wrongly-typed values instead of propagating them', () => {
    const cfg = sanitizeTechConfig({
      tenantDomain: 123,
      tenantLocked: 'yes',
      quickAddPresets: 'HR,IT',
      preSeededSites: [{ slug: 'NoName' }, { name: 'Valid' }, 'junk'],
      depthWarnAt: 'high',
    });
    expect(cfg.tenantDomain).toBe(DEFAULT_TECH_CONFIG.tenantDomain);
    expect(cfg.tenantLocked).toBe(false);
    expect(cfg.quickAddPresets).toEqual(DEFAULT_TECH_CONFIG.quickAddPresets);
    expect(cfg.preSeededSites).toEqual([{ name: 'Valid' }]);
    expect(cfg.depthWarnAt).toBe(DEFAULT_TECH_CONFIG.depthWarnAt);
  });

  it('does not let unknown keys through (no prototype-pollution style smuggling)', () => {
    const cfg = sanitizeTechConfig(JSON.parse('{"__proto__": {"polluted": true}, "extra": 1}'));
    expect(Object.keys(cfg).sort()).toEqual(Object.keys(DEFAULT_TECH_CONFIG).sort());
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('clamps thresholds and forces warn strictly below block', () => {
    const cfg = sanitizeTechConfig({ depthWarnAt: 10, depthBlockAt: 3, pathWarnAt: 999, pathBlockAt: 400 });
    expect(cfg.depthWarnAt).toBe(2);
    expect(cfg.depthBlockAt).toBe(3);
    expect(cfg.pathWarnAt).toBe(399);
    expect(cfg.pathBlockAt).toBe(400);
  });

  it('clamps out-of-range numbers', () => {
    const cfg = sanitizeTechConfig({ depthBlockAt: 9999, pathBlockAt: -5 });
    expect(cfg.depthBlockAt).toBe(50);
    expect(cfg.pathBlockAt).toBe(100);
  });
});
