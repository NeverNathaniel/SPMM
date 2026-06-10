import { describe, expect, it } from 'vitest';
import { buildReviewSummary } from '../src/shared/review';
import { resolveMappings } from '../src/shared/mappingEngine';
import { CONFIG, folder, root, site, spFolder } from './helpers';
import type { ExplicitMapping } from '../src/shared/types';

const hrSite = site('Contoso HR', 'HR', [
  spFolder('Payroll', [spFolder('2024', [spFolder('Archive')])]),
]);

function build(mappings: ExplicitMapping[], skipped: string[] = [], acked: string[] = [], extras?: Parameters<typeof folder>[2]) {
  const child = folder('C:\\HR\\Payroll', [], extras ?? {});
  const tree = folder('C:\\HR', [child]);
  const roots = [root('C:\\HR', tree)];
  const resolved = resolveMappings(roots, [hrSite], mappings, skipped, acked, CONFIG);
  return { roots, child, resolved, summary: buildReviewSummary(roots, resolved, acked) };
}

describe('buildReviewSummary', () => {
  it('blocks export when nothing is mapped', () => {
    const { summary } = build([]);
    expect(summary.exportReady).toBe(false);
    expect(summary.unmappedFolders.length).toBe(2);
  });

  it('is ready with a clean explicit mapping', () => {
    const { child, summary } = build([
      { localPath: child0Path(), localFolderId: 'x', spSiteId: hrSite.id, spFolderPath: 'Payroll' },
    ]);
    void child;
    expect(summary.hardBlocks).toHaveLength(0);
    expect(summary.exportReady).toBe(true);
    expect(summary.depthWarnings).toHaveLength(0);
  });

  it('flags depth warnings at the warn threshold without blocking export', () => {
    const { summary } = build([
      { localPath: child0Path(), localFolderId: 'x', spSiteId: hrSite.id, spFolderPath: 'Payroll/2024' },
    ]);
    expect(summary.depthWarnings).toHaveLength(1);
    expect(summary.exportReady).toBe(true);
  });

  it('hard-blocks destinations at the block depth', () => {
    const { summary } = build([
      { localPath: child0Path(), localFolderId: 'x', spSiteId: hrSite.id, spFolderPath: 'Payroll/2024/Archive' },
    ]);
    expect(summary.hardBlocks).toHaveLength(1);
    expect(summary.exportReady).toBe(false);
  });

  it('requires acknowledgment for path-length warnings, then unlocks', () => {
    const longName = 'x'.repeat(230) + '.docx'; // pushes past warn (256), not block (400)
    const un = build(
      [{ localPath: child0Path(), localFolderId: 'x', spSiteId: hrSite.id, spFolderPath: 'Payroll' }],
      [], [],
      { longestFilename: longName, longestFilenameLength: longName.length }
    );
    expect(un.summary.pathWarnings).toHaveLength(1);
    expect(un.summary.exportReady).toBe(false);

    const acked = build(
      [{ localPath: child0Path(), localFolderId: 'x', spSiteId: hrSite.id, spFolderPath: 'Payroll' }],
      [], [child0Path()],
      { longestFilename: longName, longestFilenameLength: longName.length }
    );
    expect(acked.summary.exportReady).toBe(true);
  });

  it('requires acknowledgment for ineligible files on migrating folders', () => {
    const extras = { ineligibleFiles: [{ filename: 'a#b.txt', reason: 'invalid-chars' as const }] };
    const un = build(
      [{ localPath: child0Path(), localFolderId: 'x', spSiteId: hrSite.id, spFolderPath: 'Payroll' }],
      [], [], extras
    );
    expect(un.summary.exportReady).toBe(false);
    expect(un.summary.unacknowledgedPaths).toEqual([child0Path()]);

    const acked = build(
      [{ localPath: child0Path(), localFolderId: 'x', spSiteId: hrSite.id, spFolderPath: 'Payroll' }],
      [], [child0Path()], extras
    );
    expect(acked.summary.exportReady).toBe(true);
  });

  it('hard-blocks mapped folders with ineligible folder names', () => {
    const { summary } = build(
      [{ localPath: child0Path(), localFolderId: 'x', spSiteId: hrSite.id, spFolderPath: 'Payroll' }],
      [], [],
      { hasIneligibleFolderName: true }
    );
    expect(summary.hardBlocks).toHaveLength(1);
    expect(summary.exportReady).toBe(false);
  });
});

function child0Path() {
  return 'C:\\HR\\Payroll';
}
