import { describe, expect, it } from 'vitest';
import { ackKey } from '../src/shared/acks';
import { buildReviewSummary } from '../src/shared/review';
import { resolveMappings } from '../src/shared/mappingEngine';
import { planSpmtTasks } from '../src/shared/spmtPlan';
import { CONFIG, folder, root, site, spFolder } from './helpers';
import { DEFAULT_TECH_CONFIG, type ExplicitMapping, type TechConfig } from '../src/shared/types';

const hrSite = site('Contoso HR', 'HR', [
  spFolder('Payroll', [spFolder('2024', [spFolder('Archive')])]),
]);

function build(
  mappings: ExplicitMapping[],
  skipped: string[] = [],
  acked: string[] = [],
  extras?: Parameters<typeof folder>[2],
  config: TechConfig = CONFIG
) {
  const child = folder('C:\\HR\\Payroll', [], extras ?? {});
  const tree = folder('C:\\HR', [child]);
  const roots = [root('C:\\HR', tree)];
  const resolved = resolveMappings(roots, [hrSite], mappings, skipped, acked, config);
  const plan = planSpmtTasks(roots, new Map(resolved.map((m) => [m.localPath, m])));
  return {
    roots,
    child,
    resolved,
    plan,
    summary: buildReviewSummary(roots, resolved, acked, config, plan),
  };
}

const CHILD = 'C:\\HR\\Payroll';
const payrollMapping = { localPath: CHILD, localFolderId: 'x', spSiteId: hrSite.id, spFolderPath: 'Payroll' };

describe('buildReviewSummary', () => {
  it('blocks export when nothing is mapped', () => {
    const { summary } = build([]);
    expect(summary.exportReady).toBe(false);
    expect(summary.unmappedFolders.length).toBe(2);
  });

  it('is ready with a clean explicit mapping', () => {
    const { summary } = build([payrollMapping]);
    expect(summary.hardBlocks).toHaveLength(0);
    expect(summary.tenantDomainIssue).toBeNull();
    expect(summary.exportReady).toBe(true);
    expect(summary.depthWarnings).toHaveLength(0);
    expect(summary.taskCount).toBe(1);
  });

  it('flags depth warnings at the warn threshold without blocking export', () => {
    const { summary } = build([{ ...payrollMapping, spFolderPath: 'Payroll/2024' }]);
    expect(summary.depthWarnings).toHaveLength(1);
    expect(summary.exportReady).toBe(true);
  });

  it('hard-blocks destinations at the block depth', () => {
    const { summary } = build([{ ...payrollMapping, spFolderPath: 'Payroll/2024/Archive' }]);
    expect(summary.hardBlocks).toHaveLength(1);
    expect(summary.exportReady).toBe(false);
  });

  it('requires acknowledgment for path-length warnings, then unlocks', () => {
    const longName = 'x'.repeat(230) + '.docx'; // pushes past warn (256), not block (400)
    const extras = { longestFilename: longName, longestFilenameLength: longName.length };
    const un = build([payrollMapping], [], [], extras);
    expect(un.summary.pathWarnings).toHaveLength(1);
    expect(un.summary.exportReady).toBe(false);

    const acked = build([payrollMapping], [], [ackKey('path', CHILD)], extras);
    expect(acked.summary.exportReady).toBe(true);
  });

  it('hard-blocks paths over the block threshold — acknowledgment cannot unlock them', () => {
    const longName = 'x'.repeat(380) + '.docx'; // past the 400 block with the URL prefix
    const extras = { longestFilename: longName, longestFilenameLength: longName.length };
    const un = build([payrollMapping], [], [], extras);
    expect(un.summary.pathBlocks).toHaveLength(1);
    expect(un.summary.hardBlocks).toContainEqual(un.summary.pathBlocks[0]);
    expect(un.summary.exportReady).toBe(false);

    // SPMT is guaranteed to fail on these — an ack must NOT unlock export.
    const acked = build([payrollMapping], [], [ackKey('path', CHILD)], extras);
    expect(acked.summary.exportReady).toBe(false);
  });

  it('requires acknowledgment for ineligible files on migrating folders', () => {
    const extras = { ineligibleFiles: [{ filename: 'a:b.txt', reason: 'invalid-chars' as const }] };
    const un = build([payrollMapping], [], [], extras);
    expect(un.summary.exportReady).toBe(false);
    expect(un.summary.unacknowledgedPaths).toEqual([ackKey('inelig', CHILD)]);

    const acked = build([payrollMapping], [], [ackKey('inelig', CHILD)], extras);
    expect(acked.summary.exportReady).toBe(true);
  });

  it('an ack of one warning kind does not satisfy another kind on the same path', () => {
    // Path-length warning acked, but the folder ALSO has ineligible files —
    // the inelig ack must still be demanded.
    const longName = 'x'.repeat(230) + '.docx';
    const extras = {
      longestFilename: longName,
      longestFilenameLength: longName.length,
      ineligibleFiles: [{ filename: 'a:b.txt', reason: 'invalid-chars' as const }],
    };
    const { summary } = build([payrollMapping], [], [ackKey('path', CHILD)], extras);
    expect(summary.unacknowledgedPaths).toEqual([ackKey('inelig', CHILD)]);
    expect(summary.exportReady).toBe(false);
  });

  it('does not demand acknowledgment for ineligible files on skipped folders', () => {
    const extras = { ineligibleFiles: [{ filename: 'a:b.txt', reason: 'invalid-chars' as const }] };
    // Skipping the flagged folder removes it from the plan → nothing to ack,
    // but nothing mapped either, so export stays blocked for emptiness.
    const { summary } = build([payrollMapping], [CHILD], [], extras);
    expect(summary.unacknowledgedPaths).toEqual([]);
    expect(summary.taskCount).toBe(0);
    expect(summary.exportReady).toBe(false);
  });

  it('hard-blocks mapped folders with ineligible folder names', () => {
    const { summary } = build([payrollMapping], [], [], { hasIneligibleFolderName: true });
    expect(summary.hardBlocks).toHaveLength(1);
    expect(summary.exportReady).toBe(false);
  });

  it('skipping a folder with an ineligible name clears the hard block', () => {
    const { summary } = build([payrollMapping], [CHILD], [], { hasIneligibleFolderName: true });
    expect(summary.hardBlocks).toHaveLength(0);
  });

  it('requires acknowledgment for split folders whose direct files no task migrates', () => {
    const sub = folder('C:\\HR\\Payroll\\2024');
    const child = folder('C:\\HR\\Payroll', [sub], { fileCount: 4 });
    const tree = folder('C:\\HR', [child]);
    const roots = [root('C:\\HR', tree)];
    const mappings = [payrollMapping];
    const skipped = ['C:\\HR\\Payroll\\2024'];
    const resolved = resolveMappings(roots, [hrSite], mappings, skipped, [], CONFIG);
    const plan = planSpmtTasks(roots, new Map(resolved.map((m) => [m.localPath, m])));

    const un = buildReviewSummary(roots, resolved, [], CONFIG, plan);
    expect(un.splitFileWarnings).toEqual([
      { localPath: CHILD, spSiteId: hrSite.id, spFolderPath: 'Payroll', fileCount: 4 },
    ]);
    expect(un.exportReady).toBe(false);

    // A stale ack of a DIFFERENT kind on the same path must not satisfy the
    // split warning (that would bypass the files-not-migrating gate).
    const staleKind = buildReviewSummary(roots, resolved, [ackKey('path', CHILD)], CONFIG, plan);
    expect(staleKind.unacknowledgedPaths).toEqual([ackKey('split', CHILD)]);

    const acked = buildReviewSummary(roots, resolved, [ackKey('split', CHILD)], CONFIG, plan);
    // The split leaves no tasks here (only child was skipped, parent has no
    // other children) — still blocked, but for emptiness, not the ack.
    expect(acked.unacknowledgedPaths).toEqual([]);
  });

  it('reports skip-excluded descendants separately from unmapped folders', () => {
    const grandchild = folder('C:\\HR\\Payroll\\2024\\Q1');
    const sub = folder('C:\\HR\\Payroll\\2024', [grandchild]);
    const child = folder('C:\\HR\\Payroll', [sub]);
    const tree = folder('C:\\HR', [child]);
    const roots = [root('C:\\HR', tree)];
    const skipped = ['C:\\HR\\Payroll'];
    const resolved = resolveMappings(roots, [hrSite], [payrollMapping], skipped, [], CONFIG);
    const plan = planSpmtTasks(roots, new Map(resolved.map((m) => [m.localPath, m])));
    const summary = buildReviewSummary(roots, resolved, [], CONFIG, plan);

    // 2024 and Q1 are excluded because their ancestor is skipped — they are
    // not "unmapped" (which would nag the user to map them).
    expect(summary.excludedBySkip.map((f) => f.path)).toEqual([
      'C:\\HR\\Payroll\\2024',
      'C:\\HR\\Payroll\\2024\\Q1',
    ]);
    expect(summary.unmappedFolders.map((f) => f.path)).toEqual(['C:\\HR']);
    // Progress: 4 folders total, 1 resolved (skipped Payroll) + 2 excluded.
    expect(summary.progressPct).toBe(75);
  });

  it('hard-blocks the placeholder tenant domain', () => {
    const { summary } = build([payrollMapping], [], [], {}, { ...DEFAULT_TECH_CONFIG });
    expect(summary.tenantDomainIssue).toContain('placeholder');
    expect(summary.exportReady).toBe(false);
  });

  it('hard-blocks a malformed tenant domain', () => {
    const { summary } = build([payrollMapping], [], [], {}, {
      ...CONFIG,
      tenantDomain: 'https://fabrikam.sharepoint.com/sites/x',
    });
    expect(summary.tenantDomainIssue).not.toBeNull();
    expect(summary.exportReady).toBe(false);
  });
});
