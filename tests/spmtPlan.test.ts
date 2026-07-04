import { describe, expect, it } from 'vitest';
import { planSpmtTasks } from '../src/shared/spmtPlan';
import { resolveMappingsByPath } from '../src/shared/mappingEngine';
import type { DirectoryRoot, ExplicitMapping, SharePointSite } from '../src/shared/types';
import { CONFIG, folder, root, site } from './helpers';

/**
 * Every SPMT CSV row is an independent, fully recursive migration task —
 * SPMT copies everything under Source into the target, with no per-folder
 * exclusions. The plan must therefore emit one task per maximal uniformly
 * mapped subtree, splitting around skips and divergent explicit remaps.
 */

function plan(
  roots: DirectoryRoot[],
  sites: SharePointSite[],
  mappings: ExplicitMapping[],
  skipped: string[] = []
) {
  const resolved = resolveMappingsByPath(roots, sites, mappings, skipped, [], CONFIG);
  return planSpmtTasks(roots, resolved);
}

function mapping(localPath: string, spSiteId: string, spFolderPath: string): ExplicitMapping {
  return { localPath, localFolderId: `f-${localPath}`, spSiteId, spFolderPath };
}

describe('planSpmtTasks', () => {
  const hr = site('Contoso HR', 'HR');
  const ops = site('Contoso Ops', 'Ops');

  it('emits a single recursive task for a uniformly mapped subtree', () => {
    const tree = folder('C:\\HR', [
      folder('C:\\HR\\Payroll', [folder('C:\\HR\\Payroll\\2024')]),
      folder('C:\\HR\\Benefits'),
    ]);
    const p = plan([root('C:\\HR', tree)], [hr], [mapping('C:\\HR', hr.id, '')]);

    expect(p.tasks).toEqual([{ sourcePath: 'C:\\HR', spSiteId: hr.id, spFolderPath: '' }]);
    expect(p.splitFileWarnings).toEqual([]);
    expect(p.conflicts).toEqual([]);
  });

  it('folds in an explicit child whose destination coincides with inheritance', () => {
    const payroll = folder('C:\\HR\\Payroll');
    const tree = folder('C:\\HR', [payroll]);
    const p = plan(
      [root('C:\\HR', tree)],
      [hr],
      [mapping('C:\\HR', hr.id, ''), mapping('C:\\HR\\Payroll', hr.id, 'Payroll')]
    );
    // The parent's recursive task already produces exactly this destination.
    expect(p.tasks).toEqual([{ sourcePath: 'C:\\HR', spSiteId: hr.id, spFolderPath: '' }]);
  });

  it('splits around a divergent explicit remap so nothing migrates twice', () => {
    const tree = folder('C:\\Acct', [
      folder('C:\\Acct\\AP', [folder('C:\\Acct\\AP\\Invoices')]),
      folder('C:\\Acct\\AR'),
    ]);
    const p = plan(
      [root('C:\\Acct', tree)],
      [hr, ops],
      [mapping('C:\\Acct', ops.id, 'Projects'), mapping('C:\\Acct\\AP', hr.id, 'Payroll')]
    );

    // No single task may cover C:\Acct (it would recursively copy AP into Ops).
    expect(p.tasks).toContainEqual({ sourcePath: 'C:\\Acct\\AP', spSiteId: hr.id, spFolderPath: 'Payroll' });
    expect(p.tasks).toContainEqual({ sourcePath: 'C:\\Acct\\AR', spSiteId: ops.id, spFolderPath: 'Projects/AR' });
    expect(p.tasks).toHaveLength(2);
  });

  it('warns when a split parent has direct files no task will migrate', () => {
    const tree = folder(
      'C:\\Acct',
      [folder('C:\\Acct\\AP')],
      { fileCount: 3, longestFilename: 'ledger.xlsx', longestFilenameLength: 11 }
    );
    const p = plan(
      [root('C:\\Acct', tree)],
      [hr, ops],
      [mapping('C:\\Acct', ops.id, ''), mapping('C:\\Acct\\AP', hr.id, '')]
    );

    expect(p.splitFileWarnings).toEqual([
      { localPath: 'C:\\Acct', spSiteId: ops.id, spFolderPath: '', fileCount: 3 },
    ]);
  });

  it('does not warn when a split parent has no direct files', () => {
    const tree = folder('C:\\Acct', [folder('C:\\Acct\\AP'), folder('C:\\Acct\\AR')]);
    const p = plan(
      [root('C:\\Acct', tree)],
      [hr, ops],
      [mapping('C:\\Acct', ops.id, ''), mapping('C:\\Acct\\AP', hr.id, '')]
    );
    expect(p.splitFileWarnings).toEqual([]);
    expect(p.tasks).toContainEqual({ sourcePath: 'C:\\Acct\\AR', spSiteId: ops.id, spFolderPath: 'AR' });
  });

  it('truly excludes a skipped folder and its descendants', () => {
    const tree = folder('C:\\HR', [
      folder('C:\\HR\\Payroll', [folder('C:\\HR\\Payroll\\2024')]),
      folder('C:\\HR\\Benefits'),
    ]);
    const p = plan(
      [root('C:\\HR', tree)],
      [hr],
      [mapping('C:\\HR', hr.id, '')],
      ['C:\\HR\\Payroll']
    );

    // The parent cannot be exported as one recursive task; Payroll (and its
    // subtree) must not be covered by any task.
    expect(p.tasks).toEqual([{ sourcePath: 'C:\\HR\\Benefits', spSiteId: hr.id, spFolderPath: 'Benefits' }]);
  });

  it('keeps an explicit mapping beneath a skipped ancestor', () => {
    const tree = folder('C:\\HR', [
      folder('C:\\HR\\Old', [folder('C:\\HR\\Old\\Keep')]),
    ]);
    const p = plan(
      [root('C:\\HR', tree)],
      [hr],
      [mapping('C:\\HR', hr.id, ''), mapping('C:\\HR\\Old\\Keep', hr.id, 'Archive')],
      ['C:\\HR\\Old']
    );

    expect(p.tasks).toEqual([
      { sourcePath: 'C:\\HR\\Old\\Keep', spSiteId: hr.id, spFolderPath: 'Archive' },
    ]);
  });

  it('skipping a mapping root with no mapped ancestor removes its whole subtree', () => {
    const tree = folder('C:\\HR', [folder('C:\\HR\\Payroll')]);
    const p = plan(
      [root('C:\\HR', tree)],
      [hr],
      [mapping('C:\\HR', hr.id, '')],
      ['C:\\HR']
    );
    expect(p.tasks).toEqual([]);
  });

  it('splits recursively when the exception is deep in the tree', () => {
    const tree = folder('C:\\A', [
      folder('C:\\A\\B', [
        folder('C:\\A\\B\\C', [folder('C:\\A\\B\\C\\D')]),
        folder('C:\\A\\B\\E'),
      ]),
      folder('C:\\A\\F'),
    ]);
    const p = plan(
      [root('C:\\A', tree)],
      [hr],
      [mapping('C:\\A', hr.id, '')],
      ['C:\\A\\B\\C\\D']
    );

    expect(p.tasks).toContainEqual({ sourcePath: 'C:\\A\\F', spSiteId: hr.id, spFolderPath: 'F' });
    expect(p.tasks).toContainEqual({ sourcePath: 'C:\\A\\B\\E', spSiteId: hr.id, spFolderPath: 'B/E' });
    // C itself is split (its child D is skipped) — no task may cover C or D.
    expect(p.tasks.some((t) => t.sourcePath === 'C:\\A' || t.sourcePath === 'C:\\A\\B')).toBe(false);
    expect(p.tasks.some((t) => t.sourcePath.includes('\\D'))).toBe(false);
  });

  it('dedupes identical tasks and reports conflicting ones from overlapping roots', () => {
    const treeA = folder('C:\\Share', [folder('C:\\Share\\HR')]);
    const treeB = folder('C:\\Share\\HR');
    const roots = [root('C:\\Share', treeA), root('C:\\Share\\HR', treeB)];

    // Same source mapped to two different destinations via the two roots.
    const p = plan(roots, [hr, ops], [
      mapping('C:\\Share', ops.id, ''),
      // resolveMappings keys explicit mappings by path, so this second entry
      // wins for the standalone root as well — build the conflict through a
      // divergent parent instead.
    ]);
    // The overlapping standalone root has no explicit mapping of its own here;
    // C:\Share's recursive task covers HR. Only one task expected.
    expect(p.tasks).toEqual([{ sourcePath: 'C:\\Share', spSiteId: ops.id, spFolderPath: '' }]);
    expect(p.conflicts).toEqual([]);
  });

  it('flags a conflict when the same source resolves to two destinations', () => {
    // Two roots that contain the same folder path, mapped divergently:
    // root A maps the parent (HR inherits Ops/HR), root B maps HR to HR site.
    const treeA = folder('C:\\Share', [folder('C:\\Share\\HR')]);
    const treeB = folder('C:\\Share\\HR');
    const roots = [root('C:\\Share', treeA), root('C:\\Share\\HR', treeB)];

    const p = plan(roots, [hr, ops], [
      mapping('C:\\Share', ops.id, 'Everything'),
      mapping('C:\\Share\\HR', hr.id, ''),
    ]);

    // C:\Share splits around its divergent HR child; HR gets its own task.
    // But HR appears in BOTH roots resolving to the same explicit destination,
    // so it dedupes — no conflict.
    expect(p.conflicts).toEqual([]);
    const hrTasks = p.tasks.filter((t) => t.sourcePath === 'C:\\Share\\HR');
    expect(hrTasks).toEqual([{ sourcePath: 'C:\\Share\\HR', spSiteId: hr.id, spFolderPath: '' }]);
  });

  it('emits nothing when nothing is mapped', () => {
    const p = plan([root('C:\\HR', folder('C:\\HR'))], [hr], []);
    expect(p.tasks).toEqual([]);
  });

  it('dedupes split-file warnings across overlapping roots (legacy sessions)', () => {
    // Overlapping roots are refused by the UI now, but sessions saved by
    // older builds can still contain them.
    const old = folder('C:\\Share\\HR\\Old');
    const hrA = folder('C:\\Share\\HR', [old], { fileCount: 5 });
    const treeA = folder('C:\\Share', [hrA]);
    const oldB = folder('C:\\Share\\HR\\Old');
    const treeB = folder('C:\\Share\\HR', [oldB], { fileCount: 5 });
    const roots = [root('C:\\Share', treeA), root('C:\\Share\\HR', treeB)];

    const p = plan(roots, [ops], [mapping('C:\\Share', ops.id, '')], ['C:\\Share\\HR\\Old']);
    const hrWarnings = p.splitFileWarnings.filter((w) => w.localPath === 'C:\\Share\\HR');
    expect(hrWarnings).toHaveLength(1);
  });
});
