import { describe, expect, it } from 'vitest';
import { csvField, generateSpmtCsv } from '../src/shared/csv';
import { resolveMappings } from '../src/shared/mappingEngine';
import { CONFIG, folder, root, site, spFolder } from './helpers';

describe('csvField', () => {
  it('quotes fields containing commas and quotes', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('generateSpmtCsv', () => {
  const payroll = folder('C:\\HR\\Payroll', [folder('C:\\HR\\Payroll\\2024')]);
  const tree = folder('C:\\HR', [payroll]);
  const roots = [root('C:\\HR', tree)];
  const hrSite = site('Contoso HR', 'HR', [spFolder('Payroll')]);
  const payrollMapping = {
    localPath: payroll.path,
    localFolderId: payroll.id,
    spSiteId: hrSite.id,
    spFolderPath: 'Payroll',
  };

  it('writes one row per uniformly mapped subtree, with SPMT columns and no header', () => {
    const resolved = resolveMappings(roots, [hrSite], [payrollMapping], [], [], CONFIG);
    const csv = generateSpmtCsv(roots, resolved, [hrSite], CONFIG.tenantDomain);
    // SPMT copies Payroll recursively, so 2024 is covered by this one row.
    expect(csv).toBe('C:\\HR\\Payroll,,,https://contoso.sharepoint.com/sites/HR,Documents,Payroll\r\n');
  });

  it('splits into child rows when a subfolder is skipped', () => {
    const other = folder('C:\\HR\\Payroll\\2023');
    const p = folder('C:\\HR\\Payroll', [other, folder('C:\\HR\\Payroll\\2024')]);
    const r = [root('C:\\HR', folder('C:\\HR', [p]))];
    const resolved = resolveMappings(
      r,
      [hrSite],
      [{ ...payrollMapping, localPath: p.path, localFolderId: p.id }],
      ['C:\\HR\\Payroll\\2024'],
      [],
      CONFIG
    );
    const csv = generateSpmtCsv(r, resolved, [hrSite], CONFIG.tenantDomain);
    expect(csv).toBe(
      'C:\\HR\\Payroll\\2023,,,https://contoso.sharepoint.com/sites/HR,Documents,Payroll/2023\r\n'
    );
  });

  it('preserves UNC source paths as-is', () => {
    const uncTree = folder('\\\\SERVER\\Accounting\\AR');
    const uncRoots = [root('\\\\SERVER\\Accounting\\AR', uncTree)];
    const resolved = resolveMappings(
      uncRoots,
      [hrSite],
      [{ localPath: uncTree.path, localFolderId: uncTree.id, spSiteId: hrSite.id, spFolderPath: '' }],
      [], [], CONFIG
    );
    const csv = generateSpmtCsv(uncRoots, resolved, [hrSite], CONFIG.tenantDomain);
    expect(csv).toContain('\\\\SERVER\\Accounting\\AR,,,');
  });

  it('produces an empty file when nothing migrates', () => {
    expect(generateSpmtCsv(roots, [], [hrSite], CONFIG.tenantDomain)).toBe('');
  });
});
