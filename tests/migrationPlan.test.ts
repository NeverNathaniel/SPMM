import { describe, expect, it } from 'vitest';
import { resolveMappingsByPath } from '../src/shared/mappingEngine';
import { planMigration } from '../src/shared/migrationPlan';
import type { ExplicitMapping, FolderNode } from '../src/shared/types';
import { CONFIG, folder, root, site } from './helpers';

/*
 * \\FS\Accounting
 * ├── AP
 * │   ├── Invoices
 * │   │   └── 2023
 * │   └── Archive
 * └── AR
 */
const y2023 = folder('\\\\FS\\Accounting\\AP\\Invoices\\2023');
const invoices = folder('\\\\FS\\Accounting\\AP\\Invoices', [y2023]);
const archive = folder('\\\\FS\\Accounting\\AP\\Archive');
const ap = folder('\\\\FS\\Accounting\\AP', [invoices, archive]);
const ar = folder('\\\\FS\\Accounting\\AR');
const accounting = folder('\\\\FS\\Accounting', [ap, ar]);
const roots = [root(accounting.path, accounting)];

const finance = site('Finance', 'Finance');
const collections = site('Collections', 'Collections');
const sites = [finance, collections];

const map = (node: FolderNode, siteId: string, spFolderPath: string): ExplicitMapping => ({
  localPath: node.path,
  localFolderId: node.id,
  spSiteId: siteId,
  spFolderPath,
});

function plan(explicit: ExplicitMapping[], skipped: string[] = [], r = roots) {
  return planMigration(r, resolveMappingsByPath(r, sites, explicit, skipped, [], CONFIG));
}

const rowPaths = (p: ReturnType<typeof plan>) => p.rows.map((m) => [m.localPath, m.spFolderPath]);

describe('planMigration', () => {
  it('writes a single row for a fully inherited tree', () => {
    const p = plan([map(accounting, finance.id, '')]);
    expect(rowPaths(p)).toEqual([[accounting.path, '']]);
    expect(p.stranded).toEqual([]);
  });

  it('splits around a skipped and a re-mapped subfolder (folders without own files)', () => {
    const p = plan([map(accounting, finance.id, ''), map(ar, collections.id, '')], [archive.path]);
    // Archive is excluded, AR goes only to Collections, nothing is copied twice.
    expect(rowPaths(p)).toEqual([
      [invoices.path, 'AP/Invoices'],
      [ar.path, ''],
    ]);
    expect(p.rows.find((m) => m.localPath === ar.path)!.spSiteId).toBe(collections.id);
    expect(p.stranded).toEqual([]);
  });

  it('reports folders whose own files cannot be expressed as a row', () => {
    const withFiles = (n: FolderNode, fileCount: number): FolderNode => ({ ...n, fileCount });
    const ap2 = withFiles(folder(ap.path, [invoices, archive]), 3);
    const acc2 = withFiles(folder(accounting.path, [ap2, ar]), 2);
    const r = [root(acc2.path, acc2)];
    const p = plan([map(acc2, finance.id, ''), map(ar, collections.id, '')], [archive.path], r);

    expect(rowPaths(p)).toEqual([
      [invoices.path, 'AP/Invoices'],
      [ar.path, ''],
    ]);
    expect(p.stranded.map((s) => [s.node.path, s.node.fileCount])).toEqual([
      [acc2.path, 2],
      [ap2.path, 3],
    ]);
  });

  it('does not strand files of a skipped folder — skipping excludes them on purpose', () => {
    const ap2 = { ...folder(ap.path, [invoices, archive]), fileCount: 5 };
    const r = [root(ap2.path, ap2)];
    const p = plan([map(ap2, finance.id, 'AP')], [ap2.path], r);
    expect(rowPaths(p)).toEqual([
      [invoices.path, 'AP/Invoices'],
      [archive.path, 'AP/Archive'],
    ]);
    expect(p.stranded).toEqual([]);
  });

  it('treats an explicit mapping to the inherited location as uniform (case-insensitive)', () => {
    const p = plan([map(accounting, finance.id, ''), map(ap, finance.id, 'ap')]);
    expect(rowPaths(p)).toEqual([[accounting.path, '']]);
  });

  it('writes nothing for unmapped trees and maps nested explicit folders on their own', () => {
    expect(plan([]).rows).toEqual([]);
    const p = plan([map(invoices, finance.id, 'Inv')]);
    expect(rowPaths(p)).toEqual([[invoices.path, 'Inv']]);
  });
});
