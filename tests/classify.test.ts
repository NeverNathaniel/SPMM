import { describe, expect, it } from 'vitest';
import {
  classifyFile,
  classifyFolderName,
  isHiddenFile,
  isHiddenOrSystemDir,
  reasonDetail,
} from '../src/shared/classify';

describe('classifyFile', () => {
  it('flags invalid characters', () => {
    expect(classifyFile('Report #Final.docx')).toBe('invalid-chars');
    expect(classifyFile('Budget & Forecast.xlsx')).toBe('invalid-chars');
    expect(classifyFile('50%.txt')).toBe('invalid-chars');
    expect(classifyFile('a:b.txt')).toBe('invalid-chars');
    expect(classifyFile('pipe|name.txt')).toBe('invalid-chars');
  });

  it('flags reserved device names', () => {
    expect(classifyFile('CON.txt')).toBe('reserved-name');
    expect(classifyFile('con')).toBe('reserved-name');
    expect(classifyFile('LPT1.doc')).toBe('reserved-name');
    expect(classifyFile('COM9')).toBe('reserved-name');
    expect(classifyFile('CONSOLE.txt')).toBeNull(); // only exact device names
  });

  it('flags leading/trailing space or period', () => {
    expect(classifyFile(' leading.txt')).toBe('leading-trailing');
    expect(classifyFile('trailing.txt ')).toBe('leading-trailing');
    expect(classifyFile('ends-with-period.')).toBe('leading-trailing');
  });

  it('flags temp/lock files before other rules', () => {
    expect(classifyFile('~$Report Final.docx')).toBe('temp-lock-file');
    expect(classifyFile('build.tmp')).toBe('temp-lock-file');
    expect(classifyFile('.DS_Store')).toBe('temp-lock-file');
    expect(classifyFile('Thumbs.db')).toBe('temp-lock-file');
  });

  it('passes clean names', () => {
    expect(classifyFile('Quarterly Report 2024.docx')).toBeNull();
    expect(classifyFile('photo (1).jpg')).toBeNull();
  });
});

describe('classifyFolderName', () => {
  it('applies the same character rules', () => {
    expect(classifyFolderName('A&B')).toBe('invalid-chars');
    expect(classifyFolderName('Archive ')).toBe('leading-trailing');
    expect(classifyFolderName('Payroll')).toBeNull();
  });
});

describe('hidden/system filtering', () => {
  it('filters hidden and Windows system dirs', () => {
    expect(isHiddenOrSystemDir('.git')).toBe(true);
    expect(isHiddenOrSystemDir('$RECYCLE.BIN')).toBe(true);
    expect(isHiddenOrSystemDir('System Volume Information')).toBe(true);
    expect(isHiddenOrSystemDir('Accounting')).toBe(false);
  });

  it('filters dotfiles but keeps .DS_Store classifiable', () => {
    expect(isHiddenFile('.gitignore')).toBe(true);
    expect(isHiddenFile('.DS_Store')).toBe(false); // surfaces as temp-lock instead
    expect(isHiddenFile('notes.txt')).toBe(false);
  });
});

describe('reasonDetail', () => {
  it('lists the offending characters', () => {
    expect(reasonDetail('Report #Final.docx', 'invalid-chars')).toBe('contains #');
    expect(reasonDetail('a#b&c.txt', 'invalid-chars')).toBe('contains # &');
  });
});
