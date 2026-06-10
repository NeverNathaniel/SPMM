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

  it('emits one row per resolved mapping with SPMT columns', () => {
    const resolved = resolveMappings(
      roots,
      [hrSite],
      [{ localPath: payroll.path, localFolderId: payroll.id, spSiteId: hrSite.id, spFolderPath: 'Payroll' }],
      [], [], CONFIG
    );
    const csv = generateSpmtCsv(resolved, [hrSite], CONFIG.tenantDomain);
    const lines = csv.trim().split('\r\n');

    expect(lines[0]).toBe('Source,SourceDocLib,SourceSubFolder,TargetWeb,TargetDocLib,TargetSubFolder');
    expect(lines[1]).toBe(
      'C:\\HR\\Payroll,,,https://contoso.sharepoint.com/sites/HR,Documents,Payroll'
    );
    // Inherited row is spelled out explicitly for SPMT.
    expect(lines[2]).toBe(
      'C:\\HR\\Payroll\\2024,,,https://contoso.sharepoint.com/sites/HR,Documents,Payroll/2024'
    );
  });

  it('omits skipped folders entirely', () => {
    const resolved = resolveMappings(
      roots,
      [hrSite],
      [{ localPath: payroll.path, localFolderId: payroll.id, spSiteId: hrSite.id, spFolderPath: 'Payroll' }],
      ['C:\\HR\\Payroll\\2024'],
      [],
      CONFIG
    );
    const csv = generateSpmtCsv(resolved, [hrSite], CONFIG.tenantDomain);
    expect(csv).not.toContain('2024');
  });

  it('preserves UNC source paths as-is', () => {
    const uncTree = folder('\\\\SERVER\\Accounting\\AR');
    const resolved = resolveMappings(
      [root('\\\\SERVER\\Accounting\\AR', uncTree)],
      [hrSite],
      [{ localPath: uncTree.path, localFolderId: uncTree.id, spSiteId: hrSite.id, spFolderPath: '' }],
      [], [], CONFIG
    );
    const csv = generateSpmtCsv(resolved, [hrSite], CONFIG.tenantDomain);
    expect(csv).toContain('\\\\SERVER\\Accounting\\AR,,,');
  });
});
