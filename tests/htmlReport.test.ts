import { describe, expect, it } from 'vitest';
import { generateHtmlReport } from '../src/shared/htmlReport';
import { resolveMappings } from '../src/shared/mappingEngine';
import { buildReviewSummary } from '../src/shared/review';
import { planSpmtTasks } from '../src/shared/spmtPlan';
import { slugFromSiteName } from '../src/shared/slug';
import { CONFIG, folder, root, site, spFolder } from './helpers';

describe('slugFromSiteName', () => {
  it('strips spaces and invalid characters, preserving casing per word', () => {
    expect(slugFromSiteName('Contoso HR')).toBe('ContosoHR');
    expect(slugFromSiteName('ops & projects')).toBe('OpsProjects');
    expect(slugFromSiteName('  finance  ')).toBe('Finance');
  });
});

describe('generateHtmlReport', () => {
  it('produces a self-contained report with all sections and escapes HTML', () => {
    const bad = folder('C:\\HR\\<Payroll>', [], {
      ineligibleFiles: [{ filename: 'a#b<script>.txt', reason: 'invalid-chars' }],
    });
    const unmappedChild = folder('C:\\HR\\Unmapped');
    const tree = folder('C:\\HR', [bad, unmappedChild]);
    const roots = [root('C:\\HR', tree)];
    const hrSite = site('Contoso HR', 'HR', [spFolder('Payroll')]);

    const resolved = resolveMappings(
      roots,
      [hrSite],
      [{ localPath: bad.path, localFolderId: bad.id, spSiteId: hrSite.id, spFolderPath: 'Payroll' }],
      [], [], CONFIG
    );
    const plan = planSpmtTasks(roots, new Map(resolved.map((m) => [m.localPath, m])));
    const summary = buildReviewSummary(roots, resolved, [], CONFIG, plan);

    const html = generateHtmlReport({
      roots,
      sites: [hrSite],
      resolved,
      config: { ...CONFIG, operatorNote: 'Reviewed by tech' },
      summary,
      plan,
      exportedAt: new Date('2026-06-10T12:00:00'),
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Contoso HR');
    expect(html).toContain('Ineligible Names');
    expect(html).toContain('Unmapped Folders');
    expect(html).toContain('Reviewed by tech');
    expect(html).toContain('SPMT Tasks');
    // Escaping: raw <script> from a filename must never appear unescaped.
    expect(html).not.toContain('<script>.txt');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows the same progress percentage as the review summary', () => {
    const child = folder('C:\\HR\\Payroll');
    const tree = folder('C:\\HR', [child]);
    const roots = [root('C:\\HR', tree)];
    const hrSite = site('Contoso HR', 'HR');
    const resolved = resolveMappings(
      roots,
      [hrSite],
      [{ localPath: child.path, localFolderId: child.id, spSiteId: hrSite.id, spFolderPath: '' }],
      [], [], CONFIG
    );
    const plan = planSpmtTasks(roots, new Map(resolved.map((m) => [m.localPath, m])));
    const summary = buildReviewSummary(roots, resolved, [], CONFIG, plan);

    const html = generateHtmlReport({
      roots, sites: [hrSite], resolved, config: CONFIG, summary, plan,
      exportedAt: new Date('2026-06-10T12:00:00'),
    });
    expect(html).toContain(`${summary.progressPct}% of folders have a resolved destination`);
  });
});
