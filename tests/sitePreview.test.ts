import { describe, expect, it } from 'vitest';
import { resolveMappings } from '../src/shared/mappingEngine';
import { buildSitePreview, type PreviewNode } from '../src/shared/sitePreview';
import type { ExplicitMapping } from '../src/shared/types';
import { CONFIG, folder, root, site, spFolder } from './helpers';

function mapping(localPath: string, localFolderId: string, spSiteId: string, spFolderPath: string): ExplicitMapping {
  return { localPath, localFolderId, spSiteId, spFolderPath };
}

// Tree:  C:\Acct
//          ├── AR
//          │     ├── 2024
//          │     │     └── Q1
//          │     └── 2023
//          ├── AP
//          │     ├── 2024
//          │     └── Archive
//          └── reports
const q1 = folder('C:\\Acct\\AR\\2024\\Q1');
const ar2024 = folder('C:\\Acct\\AR\\2024', [q1]);
const ar2023 = folder('C:\\Acct\\AR\\2023');
const ar = folder('C:\\Acct\\AR', [ar2024, ar2023]);
const ap2024 = folder('C:\\Acct\\AP\\2024');
const apArchive = folder('C:\\Acct\\AP\\Archive');
const ap = folder('C:\\Acct\\AP', [ap2024, apArchive]);
const reports = folder('C:\\Acct\\reports');
const acctTree = folder('C:\\Acct', [ar, ap, reports]);
const roots = [root('C:\\Acct', acctTree)];

const ops = site('Contoso Ops', 'Ops', [spFolder('Projects'), spFolder('Templates')]);
const hrSite = site('Contoso HR', 'HR', [spFolder('Payroll', [spFolder('2024')])]);
const caseSite = site('Contoso Case', 'Case', [spFolder('Reports')]);
const sites = [ops, hrSite, caseSite];

function resolve(mappings: ExplicitMapping[], skipped: string[] = []) {
  return resolveMappings(roots, sites, mappings, skipped, [], CONFIG);
}

function names(nodes: PreviewNode[]): string[] {
  return nodes.map((n) => n.name);
}

function child(nodes: PreviewNode[], name: string): PreviewNode {
  const match = nodes.find((n) => n.name === name);
  if (!match) throw new Error(`no preview node named ${name} in [${names(nodes)}]`);
  return match;
}

describe('buildSitePreview — no mappings', () => {
  it('mirrors the existing folder tree with no sources', () => {
    const preview = buildSitePreview(ops, resolve([]));
    expect(preview.rootSources).toEqual([]);
    expect(names(preview.children)).toEqual(['Projects', 'Templates']);
    for (const node of preview.children) {
      expect(node.existing).toBe(true);
      expect(node.folder).not.toBeNull();
      expect(node.sources).toEqual([]);
      expect(node.children).toEqual([]);
    }
    expect(child(preview.children, 'Projects').path).toBe('Projects');
  });
});

describe('buildSitePreview — mapping to the Documents root', () => {
  it('lists the source on the root and nests ghost children at the top level', () => {
    const preview = buildSitePreview(ops, resolve([mapping(ar.path, ar.id, ops.id, '')]));

    expect(preview.rootSources).toEqual([
      { localPath: ar.path, localName: 'AR', isExplicit: true },
    ]);

    // Existing folders keep their order; ghosts append alphabetically.
    expect(names(preview.children)).toEqual(['Projects', 'Templates', '2023', '2024']);

    const ghost2024 = child(preview.children, '2024');
    expect(ghost2024.existing).toBe(false);
    expect(ghost2024.folder).toBeNull();
    expect(ghost2024.path).toBe('2024');
    expect(ghost2024.sources).toEqual([
      { localPath: ar2024.path, localName: '2024', isExplicit: false },
    ]);

    // Grandchildren nest under their ghost parent.
    expect(names(ghost2024.children)).toEqual(['Q1']);
    expect(child(ghost2024.children, 'Q1').path).toBe('2024/Q1');
    expect(child(ghost2024.children, 'Q1').existing).toBe(false);
  });
});

describe('buildSitePreview — mapping to an existing folder', () => {
  it('attaches the source to that folder and nests ghost children beneath it', () => {
    const preview = buildSitePreview(ops, resolve([mapping(ap.path, ap.id, ops.id, 'Projects')]));

    expect(preview.rootSources).toEqual([]);
    const projects = child(preview.children, 'Projects');
    expect(projects.existing).toBe(true);
    expect(projects.sources).toEqual([
      { localPath: ap.path, localName: 'AP', isExplicit: true },
    ]);
    expect(names(projects.children)).toEqual(['2024', 'Archive']);
    expect(child(projects.children, 'Archive').path).toBe('Projects/Archive');

    // The sibling existing folder is untouched.
    expect(child(preview.children, 'Templates').sources).toEqual([]);
    expect(child(preview.children, 'Templates').children).toEqual([]);
  });
});

describe('buildSitePreview — rule 3 chain breaks', () => {
  it('an explicitly remapped child appears in the other site, not the parent site', () => {
    const resolved = resolve([
      mapping(ar.path, ar.id, ops.id, 'Projects'),
      mapping(ar2024.path, ar2024.id, hrSite.id, 'Payroll'),
    ]);

    // Parent site: only the still-inherited child remains.
    const opsPreview = buildSitePreview(ops, resolved);
    const projects = child(opsPreview.children, 'Projects');
    expect(names(projects.children)).toEqual(['2023']);

    // Other site: explicit source on Payroll, its child inherits beneath.
    const hrPreview = buildSitePreview(hrSite, resolved);
    const payroll = child(hrPreview.children, 'Payroll');
    expect(payroll.sources).toEqual([
      { localPath: ar2024.path, localName: '2024', isExplicit: true },
    ]);
    expect(names(payroll.children)).toEqual(['2024', 'Q1']);
    expect(child(payroll.children, 'Q1').existing).toBe(false);
    expect(child(payroll.children, '2024').existing).toBe(true);
  });
});

describe('buildSitePreview — merges', () => {
  it('same-named children from different mappings merge into one node with both sources', () => {
    const preview = buildSitePreview(
      ops,
      resolve([
        mapping(ar.path, ar.id, ops.id, 'Projects'),
        mapping(ap.path, ap.id, ops.id, 'Projects'),
      ])
    );

    const projects = child(preview.children, 'Projects');
    expect(projects.sources).toEqual([
      { localPath: ar.path, localName: 'AR', isExplicit: true },
      { localPath: ap.path, localName: 'AP', isExplicit: true },
    ]);

    // AR\2024 and AP\2024 both land at Projects/2024 — one node, two sources.
    expect(names(projects.children)).toEqual(['2023', '2024', 'Archive']);
    const merged = child(projects.children, '2024');
    expect(merged.sources).toHaveLength(2);
    expect(merged.sources.map((s) => s.localPath).sort()).toEqual(
      [ap2024.path, ar2024.path].sort()
    );
  });

  it('inherited folders that already exist in the site merge into the existing node', () => {
    const preview = buildSitePreview(
      hrSite,
      resolve([mapping(ar.path, ar.id, hrSite.id, 'Payroll')])
    );

    const payroll = child(preview.children, 'Payroll');
    // No duplicate "2024": the inherited folder lands on the user-created one.
    expect(names(payroll.children)).toEqual(['2024', '2023']);
    const existing2024 = child(payroll.children, '2024');
    expect(existing2024.existing).toBe(true);
    expect(existing2024.folder).not.toBeNull();
    expect(existing2024.sources).toEqual([
      { localPath: ar2024.path, localName: '2024', isExplicit: false },
    ]);
  });

  it('matches existing folders case-insensitively, like SharePoint does', () => {
    const preview = buildSitePreview(
      caseSite,
      resolve([mapping(acctTree.path, acctTree.id, caseSite.id, '')])
    );

    // Local "reports" merges into the existing "Reports" folder.
    const top = names(preview.children);
    expect(top.filter((n) => n.toLowerCase() === 'reports')).toEqual(['Reports']);
    expect(child(preview.children, 'Reports').existing).toBe(true);
    expect(child(preview.children, 'Reports').sources).toEqual([
      { localPath: reports.path, localName: 'reports', isExplicit: false },
    ]);
  });
});

describe('buildSitePreview — skipped folders', () => {
  it('omits skipped branches entirely (skip cascades — SPMT tasks are recursive)', () => {
    const preview = buildSitePreview(
      ops,
      resolve([mapping(ar.path, ar.id, ops.id, 'Projects')], [ar2024.path, ar2023.path])
    );

    const projects = child(preview.children, 'Projects');
    // Both 2024 (with its Q1 subtree) and 2023 leave the plan — a skipped
    // folder cannot be carved out of a recursive migration, so nothing
    // beneath it migrates either.
    expect(names(projects.children)).toEqual([]);
    expect(projects.sources).toEqual([
      { localPath: ar.path, localName: 'AR', isExplicit: true },
    ]);
  });

  it('an explicit mapping beneath a skipped ancestor still appears at its own destination', () => {
    const preview = buildSitePreview(
      ops,
      resolve(
        [
          mapping(ar.path, ar.id, ops.id, 'Projects'),
          mapping(q1.path, q1.id, ops.id, 'Templates'),
        ],
        [ar2024.path]
      )
    );

    // Q1 re-roots itself under Templates even though its parent 2024 is skipped.
    const templates = child(preview.children, 'Templates');
    expect(templates.sources).toEqual([
      { localPath: q1.path, localName: 'Q1', isExplicit: true },
    ]);
    // 2023 still inherits, but nothing ghosts through the skipped 2024.
    expect(names(child(preview.children, 'Projects').children)).toEqual(['2023']);
  });
});
