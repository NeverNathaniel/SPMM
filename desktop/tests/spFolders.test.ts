import { describe, expect, it } from 'vitest';
import {
  addSpFolder,
  deleteSpFolder,
  findSpFolder,
  listSpFolders,
  remapAfterRename,
  renameSpFolder,
  spFolderInUse,
} from '../src/shared/spFolders';
import { spFolder } from './helpers';
import type { ExplicitMapping } from '../src/shared/types';

const folders = [spFolder('HR', [spFolder('Payroll', [spFolder('2024')])]), spFolder('Ops')];

describe('findSpFolder / listSpFolders', () => {
  it('navigates by path', () => {
    expect(findSpFolder(folders, 'HR/Payroll')?.name).toBe('Payroll');
    expect(findSpFolder(folders, 'HR/Missing')).toBeNull();
  });

  it('lists folders with 1-based depth', () => {
    const entries = listSpFolders(folders);
    expect(entries.map((e) => [e.path, e.depth])).toEqual([
      ['HR', 1],
      ['HR/Payroll', 2],
      ['HR/Payroll/2024', 3],
      ['Ops', 1],
    ]);
  });
});

describe('addSpFolder', () => {
  it('adds under a parent immutably', () => {
    const res = addSpFolder(folders, 'Ops', 'Projects', 'new-id');
    expect(res.error).toBeUndefined();
    expect(findSpFolder(res.folders, 'Ops/Projects')?.name).toBe('Projects');
    expect(findSpFolder(folders, 'Ops/Projects')).toBeNull(); // original untouched
  });

  it('rejects duplicate sibling names case-insensitively', () => {
    const res = addSpFolder(folders, '', 'hr', 'x');
    expect(res.error).toContain('already exists');
  });
});

describe('renameSpFolder + remapAfterRename', () => {
  it('renames and rewrites mapping destinations beneath it', () => {
    const res = renameSpFolder(folders, 'HR/Payroll', 'Pay');
    expect(res.newPath).toBe('HR/Pay');
    expect(findSpFolder(res.folders, 'HR/Pay/2024')).not.toBeNull();

    const mappings: ExplicitMapping[] = [
      { localPath: 'C:\\a', localFolderId: '1', spSiteId: 's1', spFolderPath: 'HR/Payroll' },
      { localPath: 'C:\\b', localFolderId: '2', spSiteId: 's1', spFolderPath: 'HR/Payroll/2024' },
      { localPath: 'C:\\c', localFolderId: '3', spSiteId: 's2', spFolderPath: 'HR/Payroll' },
    ];
    const remapped = remapAfterRename(mappings, 's1', 'HR/Payroll', 'HR/Pay');
    expect(remapped[0].spFolderPath).toBe('HR/Pay');
    expect(remapped[1].spFolderPath).toBe('HR/Pay/2024');
    expect(remapped[2].spFolderPath).toBe('HR/Payroll'); // other site untouched
  });
});

describe('deleteSpFolder / spFolderInUse', () => {
  it('detects mappings referencing the folder or its descendants', () => {
    const mappings: ExplicitMapping[] = [
      { localPath: 'C:\\a', localFolderId: '1', spSiteId: 's1', spFolderPath: 'HR/Payroll/2024' },
    ];
    expect(spFolderInUse(mappings, 's1', 'HR')).toBe(true);
    expect(spFolderInUse(mappings, 's1', 'Ops')).toBe(false);
    expect(spFolderInUse(mappings, 's2', 'HR')).toBe(false);
  });

  it('removes a subtree', () => {
    const next = deleteSpFolder(folders, 'HR/Payroll');
    expect(findSpFolder(next, 'HR/Payroll')).toBeNull();
    expect(findSpFolder(next, 'HR')).not.toBeNull();
  });
});
