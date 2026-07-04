import { describe, expect, it } from 'vitest';
import { csvField, generateSpmtCsv } from '../src/shared/csv';
import { resolveMappingsByPath } from '../src/shared/mappingEngine';
import { planSpmtTasks } from '../src/shared/spmtPlan';
import type { DirectoryRoot, ExplicitMapping } from '../src/shared/types';
import { CONFIG, folder, root, site, spFolder } from './helpers';

describe('csvField', () => {
  it('quotes fields containing commas, quotes, and newlines', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\r\nbreak')).toBe('"line\r\nbreak"');
  });
});

function csvFor(roots: DirectoryRoot[], mappings: ExplicitMapping[], skipped: string[] = []) {
  const hrSite = sites[0];
  const resolved = resolveMappingsByPath(roots, [hrSite], mappings, skipped, [], CONFIG);
  const plan = planSpmtTasks(roots, resolved);
  return generateSpmtCsv(plan.tasks, [hrSite], CONFIG.tenantDomain);
}

const sites = [site('Contoso HR', 'HR', [spFolder('Payroll')])];

describe('generateSpmtCsv', () => {
  const y2024 = folder('C:\\HR\\Payroll\\2024');
  const payroll = folder('C:\\HR\\Payroll', [y2024]);
  const tree = folder('C:\\HR', [payroll]);
  const roots = [root('C:\\HR', tree)];

  it('emits no header row (SPMT treats every line as a task) and one row per recursive task', () => {
    const csv = csvFor(roots, [
      { localPath: payroll.path, localFolderId: payroll.id, spSiteId: sites[0].id, spFolderPath: 'Payroll' },
    ]);
    const lines = csv.trim().split('\r\n');

    // A single recursive task covers the uniformly-mapped subtree — SPMT
    // recreates 2024 beneath it on its own; a second row would re-upload it.
    expect(lines).toEqual([
      'C:\\HR\\Payroll,,,https://fabrikam.sharepoint.com/sites/HR,Documents,Payroll',
    ]);
  });

  it('ends with CRLF', () => {
    const csv = csvFor(roots, [
      { localPath: payroll.path, localFolderId: payroll.id, spSiteId: sites[0].id, spFolderPath: 'Payroll' },
    ]);
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('quotes source paths containing commas end-to-end', () => {
    const comma = folder('C:\\HR\\Payroll, old');
    const t = folder('C:\\HR', [comma]);
    const r = [root('C:\\HR', t)];
    const csv = csvFor(r, [
      { localPath: comma.path, localFolderId: comma.id, spSiteId: sites[0].id, spFolderPath: 'Payroll' },
    ]);
    expect(csv).toContain('"C:\\HR\\Payroll, old",,,');
  });

  it('omits skipped branches entirely', () => {
    const csv = csvFor(
      roots,
      [{ localPath: payroll.path, localFolderId: payroll.id, spSiteId: sites[0].id, spFolderPath: 'Payroll' }],
      ['C:\\HR\\Payroll\\2024']
    );
    expect(csv).not.toContain('2024');
  });

  it('preserves UNC source paths as-is', () => {
    const uncTree = folder('\\\\SERVER\\Accounting\\AR');
    const csv = csvFor(
      [root('\\\\SERVER\\Accounting\\AR', uncTree)],
      [{ localPath: uncTree.path, localFolderId: uncTree.id, spSiteId: sites[0].id, spFolderPath: '' }]
    );
    expect(csv).toContain('\\\\SERVER\\Accounting\\AR,,,');
  });

  it('drops tasks whose site no longer exists', () => {
    const resolved = resolveMappingsByPath(
      roots,
      sites,
      [{ localPath: payroll.path, localFolderId: payroll.id, spSiteId: sites[0].id, spFolderPath: 'Payroll' }],
      [],
      [],
      CONFIG
    );
    const plan = planSpmtTasks(roots, resolved);
    const csv = generateSpmtCsv(plan.tasks, [], CONFIG.tenantDomain);
    expect(csv.trim()).toBe('');
  });
});
