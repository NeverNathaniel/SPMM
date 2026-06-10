import { describe, expect, it } from 'vitest';
import {
  depthStatus,
  detectPathType,
  folderMapState,
  resolveMappings,
  resolveMappingsByPath,
  spFolderDepth,
  worstCasePathLength,
} from '../src/shared/mappingEngine';
import type { ExplicitMapping } from '../src/shared/types';
import { CONFIG, folder, root, site, spFolder } from './helpers';

function mapping(localPath: string, localFolderId: string, spSiteId: string, spFolderPath: string): ExplicitMapping {
  return { localPath, localFolderId, spSiteId, spFolderPath };
}

// Tree:  C:\Acct
//          ├── AR
//          ├── AP
//          │     ├── Invoices
//          │     └── Archive
//          └── HR
const invoices = folder('C:\\Acct\\AP\\Invoices');
const archive = folder('C:\\Acct\\AP\\Archive');
const ap = folder('C:\\Acct\\AP', [invoices, archive]);
const ar = folder('C:\\Acct\\AR');
const hr = folder('C:\\Acct\\HR');
const acctTree = folder('C:\\Acct', [ar, ap, hr]);
const roots = [root('C:\\Acct', acctTree)];

const ops = site('Contoso Ops', 'Ops', [spFolder('Projects')]);
const hrSite = site('Contoso HR', 'HR', [spFolder('Payroll', [spFolder('2024')])]);
const sites = [ops, hrSite];

describe('Rule 2 — child inheritance', () => {
  it('unmapped descendants inherit proportionally', () => {
    const resolved = resolveMappingsByPath(
      roots, sites,
      [mapping(ap.path, ap.id, ops.id, 'Projects')],
      [], [], CONFIG
    );

    expect(resolved.get(ap.path)!.isExplicit).toBe(true);
    expect(resolved.get(ap.path)!.spFolderPath).toBe('Projects');

    const inv = resolved.get(invoices.path)!;
    expect(inv.isExplicit).toBe(false);
    expect(inv.spFolderPath).toBe('Projects/Invoices');
    expect(inv.resolvedTargetUrl).toBe(
      'https://contoso.sharepoint.com/sites/Ops/Documents/Projects/Invoices'
    );

    // Siblings outside the mapped subtree stay unmapped.
    expect(resolved.has(ar.path)).toBe(false);
    expect(resolved.has(acctTree.path)).toBe(false);
  });

  it('mapping to the Documents root inherits with no prefix', () => {
    const resolved = resolveMappingsByPath(
      roots, sites,
      [mapping(ap.path, ap.id, ops.id, '')],
      [], [], CONFIG
    );
    expect(resolved.get(invoices.path)!.spFolderPath).toBe('Invoices');
  });
});

describe('Rules 1 & 3 — explicit wins and breaks the chain', () => {
  it('explicit child redirects its own subtree', () => {
    const resolved = resolveMappingsByPath(
      roots, sites,
      [
        mapping(acctTree.path, acctTree.id, ops.id, 'Projects'),
        mapping(ap.path, ap.id, hrSite.id, 'Payroll'),
      ],
      [], [], CONFIG
    );

    // AP itself: explicit to HR/Payroll, not Ops/Projects/AP.
    const apResolved = resolved.get(ap.path)!;
    expect(apResolved.isExplicit).toBe(true);
    expect(apResolved.spSiteId).toBe(hrSite.id);

    // AP/Invoices inherits from AP (Rule 3), not from the root mapping.
    const inv = resolved.get(invoices.path)!;
    expect(inv.spSiteId).toBe(hrSite.id);
    expect(inv.spFolderPath).toBe('Payroll/Invoices');

    // AR still inherits from the root mapping.
    expect(resolved.get(ar.path)!.spSiteId).toBe(ops.id);
    expect(resolved.get(ar.path)!.spFolderPath).toBe('Projects/AR');
  });
});

describe('Rule 5 — unmap cascades but preserves explicit branches', () => {
  it('removing the parent mapping keeps the explicit child subtree', () => {
    const withBoth = [
      mapping(acctTree.path, acctTree.id, ops.id, 'Projects'),
      mapping(ap.path, ap.id, hrSite.id, 'Payroll'),
    ];
    const afterUnmap = withBoth.filter((m) => m.localPath !== acctTree.path);
    const resolved = resolveMappingsByPath(roots, sites, afterUnmap, [], [], CONFIG);

    expect(resolved.has(acctTree.path)).toBe(false);
    expect(resolved.has(ar.path)).toBe(false); // inherited from root → gone
    expect(resolved.get(ap.path)!.spSiteId).toBe(hrSite.id); // explicit → preserved
    expect(resolved.get(invoices.path)!.spFolderPath).toBe('Payroll/Invoices');
  });
});

describe('Rule 7 — path type detection', () => {
  it('detects UNC vs local and preserves the path verbatim', () => {
    expect(detectPathType('\\\\SERVER\\Share')).toBe('unc');
    expect(detectPathType('C:\\HR')).toBe('local');

    const uncTree = folder('\\\\SRV\\Share\\HR');
    const resolved = resolveMappings(
      [root('\\\\SRV\\Share\\HR', uncTree)],
      sites,
      [mapping(uncTree.path, uncTree.id, hrSite.id, 'Payroll')],
      [], [], CONFIG
    );
    expect(resolved[0].resolvedSourcePath).toBe('\\\\SRV\\Share\\HR');
  });
});

describe('depth & path-length validation', () => {
  it('computes destination depth relative to Documents/', () => {
    expect(spFolderDepth('')).toBe(0);
    expect(spFolderDepth('HR')).toBe(1);
    expect(spFolderDepth('HR/Payroll/2024')).toBe(3);
  });

  it('applies the warn/block thresholds', () => {
    expect(depthStatus(1, CONFIG)).toBe('ok');
    expect(depthStatus(2, CONFIG)).toBe('warn');
    expect(depthStatus(3, CONFIG)).toBe('block');
    expect(depthStatus(4, CONFIG)).toBe('block');
  });

  it('calculates the worst-case path from the longest filename', () => {
    const len = worstCasePathLength('contoso.sharepoint.com', 'HR', 'Payroll', 'report.docx');
    expect(len).toBe('https://contoso.sharepoint.com/sites/HR/Documents/Payroll/report.docx'.length);
  });

  it('flags path length status on resolved mappings', () => {
    const longName = 'x'.repeat(380) + '.docx';
    const deep = folder('C:\\Acct\\Deep', [], {
      longestFilename: longName,
      longestFilenameLength: longName.length,
    });
    const tree = folder('C:\\AcctL', [deep]);
    const resolved = resolveMappingsByPath(
      [root('C:\\AcctL', tree)],
      sites,
      [mapping(deep.path, deep.id, hrSite.id, 'Payroll')],
      [], [], CONFIG
    );
    expect(resolved.get(deep.path)!.pathLengthStatus).toBe('block');
  });

  it('only explicit mappings carry depth status (inherited rows grow deeper by design)', () => {
    const resolved = resolveMappingsByPath(
      roots, sites,
      [mapping(ap.path, ap.id, hrSite.id, 'Payroll/2024')],
      [], [], CONFIG
    );
    expect(resolved.get(ap.path)!.depthStatus).toBe('warn'); // depth 2
    expect(resolved.get(invoices.path)!.spDestinationDepth).toBe(3);
    expect(resolved.get(invoices.path)!.depthStatus).toBe('ok');
  });
});

describe('folderMapState (tree UI)', () => {
  it('reports split when only part of a subtree is mapped', () => {
    const resolved = resolveMappingsByPath(
      roots, sites,
      [mapping(ar.path, ar.id, ops.id, '')],
      [], [], CONFIG
    );
    const state = folderMapState(acctTree, resolved);
    expect(state.status).toBe('unmapped');
    expect(state.split).toBe(true);
  });

  it('reports inherited status for descendants', () => {
    const resolved = resolveMappingsByPath(
      roots, sites,
      [mapping(ap.path, ap.id, ops.id, '')],
      [], [], CONFIG
    );
    expect(folderMapState(invoices, resolved).status).toBe('inherited');
    expect(folderMapState(ap, resolved).status).toBe('explicit');
  });
});

describe('skip and acknowledgment passthrough', () => {
  it('marks skipped and acknowledged folders on resolved mappings', () => {
    const resolved = resolveMappingsByPath(
      roots, sites,
      [mapping(ap.path, ap.id, ops.id, 'Projects')],
      [archive.path],
      [invoices.path],
      CONFIG
    );
    expect(resolved.get(archive.path)!.skipped).toBe(true);
    expect(resolved.get(invoices.path)!.acknowledged).toBe(true);
  });
});
